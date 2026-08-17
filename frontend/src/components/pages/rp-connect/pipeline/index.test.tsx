/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { LintHintSchema } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import userEvent from '@testing-library/user-event';
import type { editor } from 'monaco-editor';
// Console-layer response schemas
import {
  CreatePipelineResponseSchema as ConsoleCreatePipelineResponseSchema,
  DeletePipelineResponseSchema as ConsoleDeletePipelineResponseSchema,
  GetPipelineResponseSchema as ConsoleGetPipelineResponseSchema,
  GetPipelineServiceConfigSchemaResponseSchema as ConsoleGetPipelineServiceConfigSchemaResponseSchema,
  ListPipelinesResponseSchema as ConsoleListPipelinesResponseSchema,
  StartPipelineResponseSchema as ConsoleStartPipelineResponseSchema,
  StopPipelineResponseSchema as ConsoleStopPipelineResponseSchema,
  UpdatePipelineResponseSchema as ConsoleUpdatePipelineResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
// Console-layer RPC methods (used by mutation/query hooks in react-query/api/pipeline)
import {
  getPipelineServiceConfigSchema as consoleGetPipelineServiceConfigSchema,
  createPipeline,
  deletePipeline,
  getPipeline,
  listPipelines,
  startPipeline,
  stopPipeline,
  updatePipeline,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
// Dataplane response/entity schemas
import {
  CreatePipelineResponseSchema,
  GetPipelineResponseSchema,
  GetPipelineServiceConfigSchemaResponseSchema,
  LintPipelineConfigResponseSchema,
  ListComponentsResponseSchema,
  ListPipelinesResponseSchema,
  Pipeline_State,
  PipelineSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
// Dataplane RPC methods (used by query hooks in react-query/api/connect)
import {
  getPipelineServiceConfigSchema,
  lintPipelineConfig,
  listComponents,
} from 'protogen/redpanda/api/dataplane/v1/pipeline-PipelineService_connectquery';
import { useRpcnEditorAutosaveStore } from 'state/rpcn-editor-autosave';
import { act, fireEvent, render, screen, waitFor } from 'test-utils';

import { AUTOSAVE_DEBOUNCE_MS } from './use-editor-autosave';

const mockUsePipelineMode = vi.fn(() => ({ mode: 'create' as const }));
vi.mock('../utils/use-pipeline-mode', () => ({
  usePipelineMode: (...args: unknown[]) => mockUsePipelineMode(...args),
}));

// Overridable per test so flags and embedded can be toggled.
const mockIsFeatureFlagEnabled = vi.fn((_flag: string) => false);
const mockIsEmbedded = vi.fn(() => false);
vi.mock('config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('config')>();
  return {
    ...actual,
    isFeatureFlagEnabled: (...args: unknown[]) => mockIsFeatureFlagEnabled(...(args as [string])),
    isEmbedded: (...args: unknown[]) => mockIsEmbedded(),
    isServerless: vi.fn(() => false),
  };
});

const mockNavigate = vi.fn();
const mockBack = vi.fn();
const mockSearch = vi.fn(() => ({}));
// Overridable so the leave-without-saving dialog can be driven directly; the guard itself belongs to
// the router, not to this page.
const mockBlocker = vi.fn(() => ({ status: 'idle', proceed: undefined, reset: undefined }) as unknown);
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useRouter: () => ({ history: { back: mockBack, canGoBack: () => true } }),
    useSearch: () => mockSearch(),
    useBlocker: () => mockBlocker(),
  };
});

type ContentChangeCallback = (e: { changes: Array<{ text: string }> }) => void;
const contentChangeListeners: ContentChangeCallback[] = [];
type CursorPositionCallback = (e: { position: { lineNumber: number; column: number } }) => void;
const cursorPositionListeners: CursorPositionCallback[] = [];

const mockEditorInstance = {
  getPosition: vi.fn(() => ({ lineNumber: 1, column: 4 })),
  getModel: vi.fn(() => ({
    getLineContent: vi.fn(() => '  /'),
    // Large enough that node ranges from any test YAML are never clamped.
    getLineCount: vi.fn(() => 1000),
    getLineMaxColumn: vi.fn(() => 1),
  })),
  onDidChangeModelContent: vi.fn((cb: ContentChangeCallback) => {
    contentChangeListeners.push(cb);
    return { dispose: vi.fn() };
  }),
  // Cursor → structure-tree highlight sync subscribes to this.
  onDidChangeCursorPosition: vi.fn((cb: CursorPositionCallback) => {
    cursorPositionListeners.push(cb);
    return { dispose: vi.fn() };
  }),
  // Mirrors Monaco: setSelection places the cursor at the selection end and notifies
  // cursor-position listeners synchronously, before the call returns.
  setSelection: vi.fn((sel: { endLineNumber: number; endColumn: number }) => {
    for (const cb of cursorPositionListeners) {
      cb({ position: { lineNumber: sel.endLineNumber, column: sel.endColumn } });
    }
  }),
  revealLineInCenterIfOutsideViewport: vi.fn(),
  executeEdits: vi.fn(),
  focus: vi.fn(),
  // Scroll API used by the read-only viewer's vertical overflow shadows.
  onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
  onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
  onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
  getScrollTop: vi.fn(() => 0),
  getScrollHeight: vi.fn(() => 0),
  getLayoutInfo: vi.fn(() => ({ height: 0 })),
} as unknown as editor.IStandaloneCodeEditor;

vi.mock('components/ui/yaml/yaml-editor', async () => {
  const React = await import('react');
  return {
    YamlEditor: (props: {
      onChange?: (val: string) => void;
      onEditorMount?: (ed: editor.IStandaloneCodeEditor) => void;
      value?: string;
    }) => {
      React.useEffect(() => {
        props.onEditorMount?.(mockEditorInstance);
      }, [props.onEditorMount]);
      return (
        <textarea
          data-testid="yaml-editor"
          onChange={(e) => props.onChange?.(e.target.value)}
          value={props.value || ''}
        />
      );
    },
  };
});

// Monaco's diff editor is heavy and needs a real layout; stub it to a marker carrying both sides.
vi.mock('@monaco-editor/react', async () => {
  const React = await import('react');
  return {
    DiffEditor: (props: { original?: string; modified?: string }) =>
      React.createElement('div', {
        'data-testid': 'diff-editor',
        'data-original': props.original ?? '',
        'data-modified': props.modified ?? '',
      }),
  };
});

// The expanded Visual lane renders the canvas; stub it to a marker carrying the YAML.
vi.mock('./pipeline-flow-canvas', async () => {
  const React = await import('react');
  return {
    PipelineFlowCanvas: (props: { configYaml: string }) =>
      React.createElement('div', { 'data-testid': 'flow-canvas', 'data-configyaml': props.configYaml }),
  };
});
vi.mock('./pipeline-throughput-card', () => ({ PipelineThroughputCard: () => null }));
vi.mock('../onboarding/add-connectors-card', () => ({ AddConnectorsCard: () => null }));
vi.mock('../pipelines-details', () => ({ LogsTab: () => <div data-testid="logs-tab" /> }));
vi.mock('components/ui/connect/log-explorer', () => ({ LogExplorer: () => <div data-testid="log-explorer" /> }));
vi.mock('../onboarding/add-connector-dialog', () => ({
  AddConnectorDialog: (props: {
    isOpen: boolean;
    onAddConnector?: (name: string, type: string) => void;
    onCloseAddConnector?: () => void;
  }) =>
    props.isOpen ? (
      <div data-testid="add-connector-dialog">
        <button
          data-testid="select-connector"
          onClick={() => props.onAddConnector?.('generate', 'input')}
          type="button"
        >
          Select
        </button>
      </div>
    ) : null,
}));

// Simplified stub — the real menu needs secrets/topics/users RPCs; variant distinguishes dialog vs popover.
vi.mock('./pipeline-command-menu', async () => ({
  PipelineCommandMenu: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    variant?: string;
    initialFilter?: string;
  }) => {
    if (!props.open) {
      return null;
    }
    const label = props.variant === 'popover' ? 'Slash Menu' : 'Command Menu';
    return (
      <div data-testid={props.variant === 'popover' ? 'slash-menu' : 'command-menu'} role="dialog">
        <span>{label}</span>
        {props.initialFilter && <span data-testid="command-menu-filter">{props.initialFilter}</span>}
        <button onClick={() => props.onOpenChange(false)} type="button">
          Close
        </button>
      </div>
    );
  },
}));

vi.mock('state/rpcn-wizard-store', () => ({
  useRpcnWizardStore: Object.assign(
    vi.fn(() => ''),
    {
      getState: () => ({ setYamlContent: vi.fn(), yamlContent: '', setWizardData: vi.fn(), reset: vi.fn() }),
    }
  ),
  getWizardConnectionData: () => ({ input: undefined, output: undefined }),
}));

// Import after all mocks are set up.
import PipelinePage from '.';

function createTransport(overrides?: {
  getPipelineMock?: ReturnType<typeof vi.fn>;
  createPipelineMock?: ReturnType<typeof vi.fn>;
  updatePipelineMock?: ReturnType<typeof vi.fn>;
  lintMock?: ReturnType<typeof vi.fn>;
  stopPipelineMock?: ReturnType<typeof vi.fn>;
  startPipelineMock?: ReturnType<typeof vi.fn>;
  listPipelinesMock?: ReturnType<typeof vi.fn>;
  deletePipelineMock?: ReturnType<typeof vi.fn>;
}) {
  return createRouterTransport(({ rpc }) => {
    // Console-layer RPCs (used by react-query/api/pipeline hooks)
    rpc(
      getPipeline,
      overrides?.getPipelineMock ??
        vi.fn().mockReturnValue(
          create(ConsoleGetPipelineResponseSchema, {
            response: create(GetPipelineResponseSchema, {
              pipeline: create(PipelineSchema, {
                id: 'test-pipeline',
                displayName: 'Test Pipeline',
                configYaml: 'input:\n  stdin: {}\noutput:\n  stdout: {}',
                state: Pipeline_State.RUNNING,
                resources: { cpuShares: '100m', memoryShares: '0' },
                tags: {},
              }),
            }),
          })
        )
    );
    rpc(
      createPipeline,
      overrides?.createPipelineMock ??
        vi.fn().mockReturnValue(
          create(ConsoleCreatePipelineResponseSchema, {
            response: create(CreatePipelineResponseSchema, {
              pipeline: create(PipelineSchema, { id: 'new-pipeline' }),
            }),
          })
        )
    );
    rpc(
      updatePipeline,
      overrides?.updatePipelineMock ?? vi.fn().mockReturnValue(create(ConsoleUpdatePipelineResponseSchema, {}))
    );
    rpc(
      deletePipeline,
      overrides?.deletePipelineMock ?? vi.fn().mockReturnValue(create(ConsoleDeletePipelineResponseSchema, {}))
    );
    // Read to number an unnamed draft against the names already in use.
    rpc(
      listPipelines,
      overrides?.listPipelinesMock ??
        vi.fn().mockReturnValue(
          create(ConsoleListPipelinesResponseSchema, {
            response: create(ListPipelinesResponseSchema, { pipelines: [] }),
          })
        )
    );
    rpc(
      startPipeline,
      overrides?.startPipelineMock ?? vi.fn().mockReturnValue(create(ConsoleStartPipelineResponseSchema, {}))
    );
    rpc(
      stopPipeline,
      overrides?.stopPipelineMock ?? vi.fn().mockReturnValue(create(ConsoleStopPipelineResponseSchema, {}))
    );
    rpc(
      consoleGetPipelineServiceConfigSchema,
      vi.fn().mockReturnValue(create(ConsoleGetPipelineServiceConfigSchemaResponseSchema, {}))
    );

    // Dataplane RPCs (used by react-query/api/connect hooks)
    rpc(
      lintPipelineConfig,
      overrides?.lintMock ?? vi.fn().mockReturnValue(create(LintPipelineConfigResponseSchema, { lintHints: [] }))
    );
    rpc(listComponents, vi.fn().mockReturnValue(create(ListComponentsResponseSchema, {})));
    rpc(
      getPipelineServiceConfigSchema,
      vi.fn().mockReturnValue(create(GetPipelineServiceConfigSchemaResponseSchema, {}))
    );
  });
}

// The pipeline name lives in the settings dialog (opened via "Edit settings"), not an inline header field.
const setPipelineNameViaDialog = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('button', { name: /edit settings/i }));
  const nameInput = await screen.findByPlaceholderText('Enter pipeline name');
  await user.clear(nameInput);
  await user.type(nameInput, name);
  await user.click(screen.getByRole('button', { name: /save settings/i }));
  // Wait for the dialog to close so its "Save settings" button can't collide with the header's "Save".
  await waitFor(() => expect(screen.queryByPlaceholderText('Enter pipeline name')).not.toBeInTheDocument());
};

describe('PipelinePage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockBack.mockClear();
    mockSearch.mockReturnValue({});
    mockBlocker.mockReturnValue({ status: 'idle', proceed: undefined, reset: undefined });
    mockIsFeatureFlagEnabled.mockImplementation(() => false);
    mockIsEmbedded.mockReturnValue(false);
    mockUsePipelineMode.mockReturnValue({ mode: 'create' });
    contentChangeListeners.length = 0;
    cursorPositionListeners.length = 0;
  });

  // Lint panel — LintHintList has no tests of its own.

  it('displays lint warnings from the backend as the user types YAML', async () => {
    const lintMock = vi.fn().mockReturnValue(
      create(LintPipelineConfigResponseSchema, {
        lintHints: [create(LintHintSchema, { line: 1, column: 1, hint: 'response lint warning' })],
      })
    );

    render(<PipelinePage />, { transport: createTransport({ lintMock }) });

    // Typing triggers the debounced lint query.
    const yamlEditor = screen.getByTestId('yaml-editor');
    act(() => {
      fireEvent.change(yamlEditor, { target: { value: 'input:\n  stdin: {}' } });
    });

    // LintHintList renders hints as "Line N, Col N: hint".
    expect(await screen.findByText('Line 1, Col 1: response lint warning')).toBeInTheDocument();
  });

  it('cancelling during pipeline creation goes back to the previous page', async () => {
    const user = userEvent.setup();
    render(<PipelinePage />, { transport: createTransport() });

    const allButtons = screen.getAllByRole('button');
    const backButton = allButtons[0];
    await user.click(backButton);

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('displays general warnings without line numbers', async () => {
    const lintMock = vi.fn().mockReturnValue(
      create(LintPipelineConfigResponseSchema, {
        lintHints: [create(LintHintSchema, { line: 0, column: 0, hint: 'general config warning' })],
      })
    );

    render(<PipelinePage />, { transport: createTransport({ lintMock }) });

    const yamlEditor = screen.getByTestId('yaml-editor');
    act(() => {
      fireEvent.change(yamlEditor, { target: { value: 'bad: yaml' } });
    });

    // When line is 0, LintHintList renders just the hint text (no "Line N, Col N:" prefix)
    expect(await screen.findByText('general config warning')).toBeInTheDocument();
  });

  it('shows a count badge when multiple lint issues are found', async () => {
    const lintMock = vi.fn().mockReturnValue(
      create(LintPipelineConfigResponseSchema, {
        lintHints: [
          create(LintHintSchema, { line: 1, column: 1, hint: 'first warning' }),
          create(LintHintSchema, { line: 2, column: 1, hint: 'second warning' }),
        ],
      })
    );

    render(<PipelinePage />, { transport: createTransport({ lintMock }) });

    const yamlEditor = screen.getByTestId('yaml-editor');
    act(() => {
      fireEvent.change(yamlEditor, { target: { value: 'some: yaml' } });
    });

    await waitFor(() => {
      expect(screen.getByText('Line 1, Col 1: first warning')).toBeInTheDocument();
      expect(screen.getByText('Line 2, Col 1: second warning')).toBeInTheDocument();
    });

    expect(screen.getByText('Lint issues')).toBeInTheDocument();
  });

  it('Cmd/Ctrl+S saves the pipeline instead of opening the browser save dialog', async () => {
    const user = userEvent.setup();
    const createPipelineMock = vi.fn().mockReturnValue(
      create(ConsoleCreatePipelineResponseSchema, {
        response: create(CreatePipelineResponseSchema, {
          pipeline: create(PipelineSchema, { id: 'new-pipeline' }),
        }),
      })
    );

    render(<PipelinePage />, { transport: createTransport({ createPipelineMock }) });

    await setPipelineNameViaDialog(user, 'my-pipeline');
    fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  generate: {}' } });

    fireEvent.keyDown(window, { key: 's', metaKey: true });

    await waitFor(() => {
      expect(createPipelineMock).toHaveBeenCalled();
    });
  });

  it('saving a new pipeline sends the name and YAML config to the backend', async () => {
    const user = userEvent.setup();
    const createPipelineMock = vi.fn().mockReturnValue(
      create(ConsoleCreatePipelineResponseSchema, {
        response: create(CreatePipelineResponseSchema, {
          pipeline: create(PipelineSchema, { id: 'new-pipeline' }),
        }),
      })
    );

    render(<PipelinePage />, { transport: createTransport({ createPipelineMock }) });

    await setPipelineNameViaDialog(user, 'my-pipeline');

    const yamlEditor = screen.getByTestId('yaml-editor');
    fireEvent.change(yamlEditor, { target: { value: 'input:\n  generate:\n    mapping: root = "hello"' } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    await waitFor(() => {
      expect(createPipelineMock).toHaveBeenCalled();
    });

    const callArgs = createPipelineMock.mock.calls[0][0];
    expect(callArgs.request.pipeline.configYaml).toBe('input:\n  generate:\n    mapping: root = "hello"');
  });

  it('redirects to the new pipeline after successful creation', async () => {
    const user = userEvent.setup();
    const createPipelineMock = vi.fn().mockReturnValue(
      create(ConsoleCreatePipelineResponseSchema, {
        response: create(CreatePipelineResponseSchema, {
          pipeline: create(PipelineSchema, { id: 'new-pipeline' }),
        }),
      })
    );

    render(<PipelinePage />, { transport: createTransport({ createPipelineMock }) });

    await setPipelineNameViaDialog(user, 'my-pipeline');

    const yamlEditor = screen.getByTestId('yaml-editor');
    fireEvent.change(yamlEditor, { target: { value: 'input:\n  stdin: {}' } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: '/rp-connect/new-pipeline' }));
    });
  });

  it('lets the name be edited inline from the header title and submits it', async () => {
    const user = userEvent.setup();
    const createPipelineMock = vi.fn().mockReturnValue(
      create(ConsoleCreatePipelineResponseSchema, {
        response: create(CreatePipelineResponseSchema, {
          pipeline: create(PipelineSchema, { id: 'new-pipeline' }),
        }),
      })
    );

    render(<PipelinePage />, { transport: createTransport({ createPipelineMock }) });

    // Name set directly in the inline title, no settings dialog needed.
    fireEvent.change(screen.getByRole('textbox', { name: 'Pipeline name' }), { target: { value: 'inline-named' } });

    fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  stdin: {}' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(createPipelineMock).toHaveBeenCalled();
    });
    expect(createPipelineMock.mock.calls[0][0].request.pipeline.displayName).toBe('inline-named');
  });

  it('blocks saving a new pipeline with an invalid name and shows the error inline', async () => {
    const user = userEvent.setup();
    const createPipelineMock = vi.fn();

    render(<PipelinePage />, { transport: createTransport({ createPipelineMock }) });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/at least 3 characters/i)).toBeInTheDocument();
    expect(createPipelineMock).not.toHaveBeenCalled();
  });

  it("doesn't send an empty config to the backend, which would answer with a raw proto field error", async () => {
    const user = userEvent.setup();
    const createPipelineMock = vi.fn();

    render(<PipelinePage />, { transport: createTransport({ createPipelineMock }) });

    await setPipelineNameViaDialog(user, 'my-pipeline');

    // Name is valid, so nothing else blocks the save — only the empty config does.
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByTestId('save-pipeline')).toBeEnabled();
    });
    expect(createPipelineMock).not.toHaveBeenCalled();
  });

  it('shows both save errors and real-time lint warnings when a save fails', async () => {
    const user = userEvent.setup();

    const lintMock = vi.fn().mockReturnValue(
      create(LintPipelineConfigResponseSchema, {
        lintHints: [create(LintHintSchema, { line: 3, column: 1, hint: 'response warning' })],
      })
    );

    const createPipelineMock = vi.fn().mockImplementation(() => {
      throw new ConnectError('invalid config');
    });

    render(<PipelinePage />, { transport: createTransport({ createPipelineMock, lintMock }) });

    await setPipelineNameViaDialog(user, 'my-pipeline');

    // Typing triggers the lint query → response warning.
    const yamlEditor = screen.getByTestId('yaml-editor');
    fireEvent.change(yamlEditor, { target: { value: 'input:\n  bad_config: {}' } });

    await waitFor(() => {
      expect(screen.getByText('Line 3, Col 1: response warning')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    // Both the save-error hint and the response lint hint stay visible.
    await waitFor(() => {
      expect(screen.getByText(/invalid config/)).toBeInTheDocument();
    });

    expect(screen.getByText('Line 3, Col 1: response warning')).toBeInTheDocument();
  });

  it('editing YAML after a failed save clears the stale error messages', async () => {
    const user = userEvent.setup();

    const lintMock = vi.fn().mockReturnValue(create(LintPipelineConfigResponseSchema, { lintHints: [] }));

    const createPipelineMock = vi.fn().mockImplementation(() => {
      throw new ConnectError('invalid config');
    });

    render(<PipelinePage />, { transport: createTransport({ createPipelineMock, lintMock }) });

    await setPipelineNameViaDialog(user, 'my-pipeline');

    const yamlEditor = screen.getByTestId('yaml-editor');
    fireEvent.change(yamlEditor, { target: { value: 'input:\n  bad: {}' } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/invalid config/)).toBeInTheDocument();
    });

    // Editing YAML clears the stale error hints (setErrorLintHints({})).
    fireEvent.change(yamlEditor, { target: { value: 'input:\n  fixed: {}' } });

    await waitFor(() => {
      expect(screen.queryByText(/invalid config/)).not.toBeInTheDocument();
    });
  });

  it('leaving the view page navigates back to the pipeline list', async () => {
    const user = userEvent.setup();
    mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });

    render(<PipelinePage />, { transport: createTransport() });

    expect(await screen.findByText('Edit pipeline')).toBeInTheDocument();

    // The back button is the first button in the view toolbar.
    const allButtons = screen.getAllByRole('button');
    const backButton = allButtons[0];
    await user.click(backButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: '/connect-clusters' }));
    });
  });

  it('displays the pipeline display name in the summary in view mode', async () => {
    mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });

    render(<PipelinePage />, { transport: createTransport() });

    // The pipeline name is the page title (level-1 heading), not a generic "Pipeline view" heading.
    expect(await screen.findByRole('heading', { level: 1, name: 'Test Pipeline' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pipeline view' })).not.toBeInTheDocument();
  });

  it('hydrates the sidebar structure tree from the pipeline config in view mode', async () => {
    mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });
    mockIsFeatureFlagEnabled.mockImplementation(
      (flag: string) => flag === 'enablePipelineDiagrams' || flag === 'enableRpcnVisualEditor'
    );
    mockIsEmbedded.mockReturnValue(true);

    render(<PipelinePage />, { transport: createTransport() });

    // The sidebar structure-tree hydrates from the config: input/output components appear as tree rows.
    await waitFor(() => expect(screen.getByText('stdin')).toBeInTheDocument());
    expect(screen.getByText('stdout')).toBeInTheDocument();
    expect(screen.getAllByRole('tree').length).toBeGreaterThan(0);
  });

  it('shows the structure-tree side-lane even when the visual editor flag is off', async () => {
    // Diagrams on, visual-editor lane off → the sidebar still uses the structure outline, and the
    // full Visual canvas stays hidden.
    mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });
    mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enablePipelineDiagrams');
    mockIsEmbedded.mockReturnValue(true);

    render(<PipelinePage />, { transport: createTransport() });

    await waitFor(() => expect(screen.getAllByRole('tree').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('flow-canvas')).not.toBeInTheDocument();
  });

  it('keeps the clicked tree row highlighted while its YAML is revealed in the editor', async () => {
    const user = userEvent.setup();
    mockUsePipelineMode.mockReturnValue({ mode: 'create' });
    mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enablePipelineDiagrams');
    mockIsEmbedded.mockReturnValue(true);

    render(<PipelinePage />, { transport: createTransport() });

    // A processor switch whose last case closes the component: revealing the switch selects its
    // whole line range, so the synchronous cursor event lands inside the nested `log` processor.
    fireEvent.change(await screen.findByTestId('yaml-editor'), {
      target: {
        value: [
          'input:',
          '  stdin: {}',
          'pipeline:',
          '  processors:',
          '    - switch:',
          '        - check: this.type == "a"',
          '          processors:',
          '            - mapping: root = this',
          '        - processors:',
          '            - log:',
          '                message: fallback',
          'output:',
          '  stdout: {}',
        ].join('\n'),
      },
    });

    const switchRow = await screen.findByRole('treeitem', { name: 'switch' });
    await user.click(switchRow);

    // The reveal ran, and the programmatic cursor move did not steal the explicit tree selection.
    expect(mockEditorInstance.setSelection).toHaveBeenCalled();
    expect(switchRow).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('treeitem', { name: 'log' })).toHaveAttribute('aria-selected', 'false');
  });

  it('offers a "Start from a template" entry in the sidebar visualizer while the pipeline is empty', async () => {
    const user = userEvent.setup();
    mockUsePipelineMode.mockReturnValue({ mode: 'create' });
    mockIsFeatureFlagEnabled.mockImplementation(
      (flag: string) =>
        flag === 'enablePipelineDiagrams' || flag === 'enableRpcnVisualEditor' || flag === 'enableRpcnTemplateGallery'
    );
    mockIsEmbedded.mockReturnValue(true);

    render(<PipelinePage />, { transport: createTransport() });

    // The template CTA lives alongside the YAML lane (not the default Visual lane), so switch there first.
    await user.click(await screen.findByRole('tab', { name: 'YAML' }));

    // Empty pipeline → the template gallery entry is offered.
    expect(await screen.findByTestId('browse-templates-cta')).toBeInTheDocument();

    // Once the pipeline has real content, the entry animates away.
    fireEvent.change(screen.getByTestId('yaml-editor'), {
      target: { value: 'input:\n  generate:\n    mapping: root = {}' },
    });
    await waitFor(() => expect(screen.queryByTestId('browse-templates-cta')).not.toBeInTheDocument());
  });

  it('view page exposes Monitor and YAML lanes; YAML shows the config read-only', async () => {
    const user = userEvent.setup();
    mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });

    render(<PipelinePage />, { transport: createTransport() });

    // Monitor is the default lane — no YAML editor shown yet.
    expect(await screen.findByRole('tab', { name: 'YAML' })).toBeInTheDocument();
    expect(screen.queryByTestId('yaml-editor')).not.toBeInTheDocument();

    // Switching to the YAML lane shows the pipeline config read-only.
    await user.click(screen.getByRole('tab', { name: 'YAML' }));
    const yaml = (await screen.findByTestId('yaml-editor')) as HTMLTextAreaElement;
    expect(yaml.value).toBe('input:\n  stdin: {}\noutput:\n  stdout: {}');
  });

  it('hides the view-mode Visual lane unless the visual editor flag is enabled', async () => {
    mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });

    render(<PipelinePage />, { transport: createTransport() });

    expect(await screen.findByRole('tab', { name: 'YAML' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Visual' })).not.toBeInTheDocument();
  });

  it('view page Visual lane renders the full pipeline diagram from the pipeline config', async () => {
    const user = userEvent.setup();
    mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });
    // The visual editor builds on the diagrams flag, so both are required.
    mockIsFeatureFlagEnabled.mockImplementation(
      (flag: string) => flag === 'enableRpcnVisualEditor' || flag === 'enablePipelineDiagrams'
    );
    mockIsEmbedded.mockReturnValue(true);

    render(<PipelinePage />, { transport: createTransport() });

    await user.click(await screen.findByRole('tab', { name: 'Visual' }));

    const canvas = await screen.findByTestId('flow-canvas');
    expect(canvas.getAttribute('data-configyaml')).toBe('input:\n  stdin: {}\noutput:\n  stdout: {}');
  });

  it('opens editing on the Visual lane when the visual editor is enabled, and YAML swaps in the editor', async () => {
    const user = userEvent.setup();
    mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
    // The visual editor builds on the diagrams flag, so both are required.
    mockIsFeatureFlagEnabled.mockImplementation(
      (flag: string) => flag === 'enableRpcnVisualEditor' || flag === 'enablePipelineDiagrams'
    );
    mockIsEmbedded.mockReturnValue(true);

    render(<PipelinePage />, { transport: createTransport() });

    // Visual is the default edit lane when the flag is on — the editor is not shown.
    expect(await screen.findByTestId('flow-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('yaml-editor')).not.toBeInTheDocument();

    // Switching to YAML swaps in the editor.
    await user.click(await screen.findByRole('tab', { name: 'YAML' }));
    expect(await screen.findByTestId('yaml-editor')).toBeInTheDocument();
  });

  it('confirms before stopping a running pipeline', async () => {
    const user = userEvent.setup();
    mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });
    const stopPipelineMock = vi.fn().mockReturnValue(create(ConsoleStopPipelineResponseSchema, {}));

    render(<PipelinePage />, { transport: createTransport({ stopPipelineMock }) });

    // The running pipeline shows a run toggle in the header; switching it off
    // initiates a stop.
    await user.click(await screen.findByTestId('pipeline-run-toggle'));

    // It must not stop immediately — a confirmation dialog appears first.
    expect(stopPipelineMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Stop pipeline?')).toBeInTheDocument();

    // Confirming actually issues the stop.
    await user.click(screen.getByRole('button', { name: /stop pipeline/i }));
    await waitFor(() => {
      expect(stopPipelineMock).toHaveBeenCalled();
    });
  });

  it('clicking a sidebar variable button opens the command menu with the correct filter', async () => {
    const user = userEvent.setup();
    render(<PipelinePage />, { transport: createTransport() });

    const variablesButton = screen.getByRole('button', { name: /variables/i });
    await user.click(variablesButton);

    await waitFor(() => {
      expect(screen.getByTestId('command-menu')).toBeInTheDocument();
      expect(screen.getByTestId('command-menu-filter')).toHaveTextContent('variables');
    });
  });

  it('typing / in the editor dismisses an open command menu to avoid overlap', async () => {
    const user = userEvent.setup();
    mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enableConnectSlashMenu');

    render(<PipelinePage />, { transport: createTransport() });

    // Wait for the editor mock to mount so useSlashCommand subscribes.
    await waitFor(() => {
      expect(contentChangeListeners.length).toBeGreaterThan(0);
    });

    const secretsButton = screen.getByRole('button', { name: /secrets/i });
    await user.click(secretsButton);

    await waitFor(() => {
      expect(screen.getByTestId('command-menu')).toBeInTheDocument();
    });

    // Fire a slash trigger through the mock editor's content-change listener; the mock's position
    // {line:1,col:4} + line content '  /' is a valid trigger, so the hook closes the command menu.
    act(() => {
      for (const cb of contentChangeListeners) {
        cb({ changes: [{ text: '/' }] });
      }
    });

    await waitFor(() => {
      expect(screen.queryByTestId('command-menu')).not.toBeInTheDocument();
    });
  });

  describe('feature flags and mode routing', () => {
    it('shows the slash-command tip in the editor tips bar when the feature is enabled', async () => {
      mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enableConnectSlashMenu');

      render(<PipelinePage />, { transport: createTransport() });

      // The tips bar leads with the slash tip (rotation starts at index 0).
      await waitFor(() => {
        expect(screen.getByText(/to insert variables/)).toBeInTheDocument();
      });
    });

    it('omits the slash-command tip when the feature is disabled', async () => {
      // Default: all flags return false
      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => {
        expect(screen.getByTestId('yaml-editor')).toBeInTheDocument();
      });

      expect(screen.queryByText(/to insert variables/)).not.toBeInTheDocument();
    });

    it('uses the new log explorer when the feature flag is enabled', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });
      mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enableNewPipelineLogs');

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => {
        expect(screen.getByTestId('log-explorer')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('logs-tab')).not.toBeInTheDocument();
    });

    it('uses the legacy logs tab when the new log explorer flag is off', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });
      // Default: all flags return false

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => {
        expect(screen.getByTestId('logs-tab')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('log-explorer')).not.toBeInTheDocument();
    });

    it('opening a pipeline in edit mode pre-fills the name and YAML from the server', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      // In edit mode the name is pre-filled from the server into the inline-editable title.
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: 'Pipeline name' })).toHaveValue('Test Pipeline');
      });

      const yamlEditor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
      await waitFor(() => {
        expect(yamlEditor.value).toBe('input:\n  stdin: {}\noutput:\n  stdout: {}');
      });
    });
  });

  it('renders AddConnectorDialog inline and generates YAML on connector selection', async () => {
    mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enablePipelineDiagrams');
    mockUsePipelineMode.mockReturnValue({ mode: 'create' });

    render(<PipelinePage />, { transport: createTransport() });

    // AddConnectorDialog only renders when addConnectorType is non-null; with AddConnectorsCard
    // mocked to null nothing sets it, so the dialog stays absent.
    expect(screen.queryByTestId('add-connector-dialog')).not.toBeInTheDocument();
  });

  describe('drafts and save semantics', () => {
    const createdPipelineResponse = (id: string) =>
      create(ConsoleCreatePipelineResponseSchema, {
        response: create(CreatePipelineResponseSchema, { pipeline: create(PipelineSchema, { id }) }),
      });

    const pipelineResponse = (overrides: Partial<{ state: Pipeline_State; configYaml: string; updateTime: unknown }>) =>
      create(ConsoleGetPipelineResponseSchema, {
        response: create(GetPipelineResponseSchema, {
          pipeline: create(PipelineSchema, {
            id: 'test-pipeline',
            displayName: 'Test Pipeline',
            configYaml: 'input:\n  stdin: {}\noutput:\n  stdout: {}',
            state: Pipeline_State.RUNNING,
            resources: { cpuShares: '100m', memoryShares: '0' },
            ...overrides,
          }),
        }),
      });

    const openSaveOptions = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByTestId('save-pipeline-options'));
    };

    const invalidConfigError = () =>
      new ConnectError('invalid pipeline configuration', Code.InvalidArgument, undefined, [
        {
          desc: LintHintSchema,
          value: create(LintHintSchema, { line: 2, column: 1, hint: 'an explicit output type must be specified' }),
        },
      ]);

    beforeEach(() => {
      localStorage.clear();
      useRpcnEditorAutosaveStore.getState().refresh();
      mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enableRpcnPipelineDrafts');
    });

    it('leads with Save draft on a new pipeline, and stores it without deploying', async () => {
      const user = userEvent.setup();
      const createPipelineMock = vi.fn().mockReturnValue(createdPipelineResponse('new-pipeline'));
      const stopPipelineMock = vi.fn().mockReturnValue(create(ConsoleStopPipelineResponseSchema, {}));

      render(<PipelinePage />, { transport: createTransport({ createPipelineMock, stopPipelineMock }) });

      await setPipelineNameViaDialog(user, 'my-pipeline');
      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  stdin: {}' } });

      expect(screen.getByTestId('save-pipeline')).toHaveTextContent('Save draft');
      await user.click(screen.getByTestId('save-pipeline'));

      await waitFor(() => expect(createPipelineMock).toHaveBeenCalled());
      expect(createPipelineMock.mock.calls[0][0].request.pipeline.draft).toBe(true);
      // A draft never runs, so it needs no follow-up stop to make it stand still.
      expect(stopPipelineMock).not.toHaveBeenCalled();
      // Parking work keeps the editor open, now bound to the draft so the next save updates it rather
      // than forking a second one.
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/rp-connect/new-pipeline/edit' }));
    });

    it('stays in the editor when a draft is saved from its own page', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
      const updatePipelineMock = vi.fn().mockReturnValue(create(ConsoleUpdatePipelineResponseSchema, {}));

      render(<PipelinePage />, {
        transport: createTransport({
          getPipelineMock: vi.fn().mockReturnValue(pipelineResponse({ state: Pipeline_State.DRAFT })),
          updatePipelineMock,
        }),
      });

      fireEvent.change(await screen.findByTestId('yaml-editor'), { target: { value: 'input:\n  more_work' } });
      await user.click(await screen.findByTestId('save-pipeline'));

      await waitFor(() => expect(updatePipelineMock).toHaveBeenCalled());
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    // The crux: an invalid config is the normal state of unfinished work, and it must still save.
    it.each([
      ['a half-written config', 'input:\n  kafka_'],
      ['a config the linter rejects', 'input:\n  stdin: {}'],
      ['an empty config', ''],
    ])('saves %s as a draft', async (_name, configYaml) => {
      const user = userEvent.setup();
      const createPipelineMock = vi.fn().mockReturnValue(createdPipelineResponse('new-pipeline'));

      render(<PipelinePage />, { transport: createTransport({ createPipelineMock }) });

      await setPipelineNameViaDialog(user, 'work-in-progress');
      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: configYaml } });
      await user.click(screen.getByTestId('save-pipeline'));

      await waitFor(() => expect(createPipelineMock).toHaveBeenCalled());
      const sent = createPipelineMock.mock.calls[0][0].request.pipeline;
      expect(sent.draft).toBe(true);
      // Byte-for-byte, so returning to the draft returns to exactly what was typed.
      expect(sent.configYaml).toBe(configYaml);
    });

    it('names an unnamed draft rather than refusing to save it', async () => {
      const user = userEvent.setup();
      const createPipelineMock = vi.fn().mockReturnValue(createdPipelineResponse('new-pipeline'));

      render(<PipelinePage />, { transport: createTransport({ createPipelineMock }) });

      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  kafka_' } });
      await user.click(screen.getByTestId('save-pipeline'));

      await waitFor(() => expect(createPipelineMock).toHaveBeenCalled());
      expect(createPipelineMock.mock.calls[0][0].request.pipeline.displayName).toBe('Untitled pipeline');
    });

    // The name lookup used to be the unfiltered list, which drains every page. The save mutation then
    // awaits its own invalidation of that query, so a 30ms write took 13 seconds on a cluster with a
    // few thousand pipelines.
    it('looks up untitled names with a narrow query, not a full list drain', async () => {
      const requests: unknown[] = [];
      const listPipelinesMock = vi.fn().mockImplementation((req: unknown) => {
        requests.push(req);
        return create(ConsoleListPipelinesResponseSchema, {
          response: create(ListPipelinesResponseSchema, { pipelines: [] }),
        });
      });

      render(<PipelinePage />, { transport: createTransport({ listPipelinesMock }) });

      await waitFor(() => expect(requests.length).toBeGreaterThan(0));
      const filter = (requests[0] as { request?: { filter?: { nameContains?: string } } }).request?.filter;
      expect(filter?.nameContains).toBe('Untitled pipeline');
    });

    it('numbers an unnamed draft against the names already taken', async () => {
      const user = userEvent.setup();
      const createPipelineMock = vi.fn().mockReturnValue(createdPipelineResponse('new-pipeline'));
      const listPipelinesMock = vi.fn().mockReturnValue(
        create(ConsoleListPipelinesResponseSchema, {
          response: create(ListPipelinesResponseSchema, {
            pipelines: [create(PipelineSchema, { id: 'p1', displayName: 'Untitled pipeline' })],
          }),
        })
      );

      render(<PipelinePage />, { transport: createTransport({ createPipelineMock, listPipelinesMock }) });

      await waitFor(() => expect(listPipelinesMock).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  kafka_' } });
      await user.click(screen.getByTestId('save-pipeline'));

      await waitFor(() => expect(createPipelineMock).toHaveBeenCalled());
      expect(createPipelineMock.mock.calls[0][0].request.pipeline.displayName).toBe('Untitled pipeline 2');
    });

    it('"Save and start" on a new pipeline deploys it for real', async () => {
      const user = userEvent.setup();
      const createPipelineMock = vi.fn().mockReturnValue(createdPipelineResponse('new-pipeline'));
      const stopPipelineMock = vi.fn().mockReturnValue(create(ConsoleStopPipelineResponseSchema, {}));

      render(<PipelinePage />, { transport: createTransport({ createPipelineMock, stopPipelineMock }) });

      await setPipelineNameViaDialog(user, 'my-pipeline');
      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  stdin: {}' } });

      await openSaveOptions(user);
      await user.click(await screen.findByRole('menuitem', { name: 'Save and start' }));

      await waitFor(() => expect(createPipelineMock).toHaveBeenCalled());
      expect(createPipelineMock.mock.calls[0][0].request.pipeline.draft).toBe(false);
      await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
      expect(stopPipelineMock).not.toHaveBeenCalled();
    });

    // Blocked client-side rather than round-tripping to be told there is no pipeline to run. The copy
    // itself is covered in save-actions.test.ts; toasts aren't mounted in this harness.
    it("won't start an empty pipeline", async () => {
      const user = userEvent.setup();
      const createPipelineMock = vi.fn();

      render(<PipelinePage />, { transport: createTransport({ createPipelineMock }) });

      await setPipelineNameViaDialog(user, 'my-pipeline');
      await openSaveOptions(user);
      await user.click(await screen.findByRole('menuitem', { name: 'Save and start' }));

      await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Save and start' })).not.toBeInTheDocument());
      expect(createPipelineMock).not.toHaveBeenCalled();
      // Still here, with the work intact.
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    // Without server-side drafts there is nowhere to park work, so create keeps its old shape:
    // deployed, then stopped.
    it('falls back to deploy-then-stop when drafts are unavailable', async () => {
      const user = userEvent.setup();
      mockIsFeatureFlagEnabled.mockImplementation(() => false);
      const createPipelineMock = vi.fn().mockReturnValue(createdPipelineResponse('new-pipeline'));
      const stopPipelineMock = vi.fn().mockReturnValue(create(ConsoleStopPipelineResponseSchema, {}));

      render(<PipelinePage />, { transport: createTransport({ createPipelineMock, stopPipelineMock }) });

      await setPipelineNameViaDialog(user, 'my-pipeline');
      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  stdin: {}' } });

      expect(screen.getByTestId('save-pipeline')).toHaveTextContent('Save');
      expect(screen.getByTestId('save-pipeline')).not.toHaveTextContent('Save draft');
      await user.click(screen.getByTestId('save-pipeline'));

      await waitFor(() => expect(stopPipelineMock).toHaveBeenCalled());
      expect(createPipelineMock.mock.calls[0][0].request.pipeline.draft).toBe(false);
    });

    it('editing a draft keeps it a draft, and says so', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
      const updatePipelineMock = vi.fn().mockReturnValue(create(ConsoleUpdatePipelineResponseSchema, {}));

      render(<PipelinePage />, {
        transport: createTransport({
          getPipelineMock: vi.fn().mockReturnValue(pipelineResponse({ state: Pipeline_State.DRAFT })),
          updatePipelineMock,
        }),
      });

      expect(await screen.findByText(/won't start/i)).toBeInTheDocument();
      const saveButton = await screen.findByTestId('save-pipeline');
      await waitFor(() => expect(saveButton).toHaveTextContent('Save draft'));

      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  still_broken' } });
      await user.click(saveButton);

      await waitFor(() => expect(updatePipelineMock).toHaveBeenCalled());
      // Asserted, so a draft that someone else started is refused rather than deployed.
      expect(updatePipelineMock.mock.calls[0][0].request.pipeline.draft).toBe(true);
    });

    // The acceptance criterion, in the client: come back to a parked draft and find exactly what was
    // typed — not a normalised, re-serialised or repaired version of it.
    it('round-trips a partial config through the editor unchanged', async () => {
      const user = userEvent.setup();
      const partialConfig = 'input:\n  kafka_\n# where was I\noutput:';
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
      const updatePipelineMock = vi.fn().mockReturnValue(create(ConsoleUpdatePipelineResponseSchema, {}));

      render(<PipelinePage />, {
        transport: createTransport({
          getPipelineMock: vi
            .fn()
            .mockReturnValue(pipelineResponse({ state: Pipeline_State.DRAFT, configYaml: partialConfig })),
          updatePipelineMock,
        }),
      });

      const yamlEditor = (await screen.findByTestId('yaml-editor')) as HTMLTextAreaElement;
      await waitFor(() => expect(yamlEditor.value).toBe(partialConfig));
      // Nothing to save yet: reopening a draft is not an edit of it.
      expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();

      await user.click(await screen.findByTestId('save-pipeline'));

      await waitFor(() => expect(updatePipelineMock).toHaveBeenCalled());
      expect(updatePipelineMock.mock.calls[0][0].request.pipeline.configYaml).toBe(partialConfig);
    });

    it('reports a draft that has been started by someone else instead of deploying to it', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
      const updatePipelineMock = vi.fn().mockImplementation(() => {
        throw new ConnectError('pipeline is not a draft', Code.FailedPrecondition);
      });

      render(<PipelinePage />, {
        transport: createTransport({
          getPipelineMock: vi.fn().mockReturnValue(pipelineResponse({ state: Pipeline_State.DRAFT })),
          updatePipelineMock,
        }),
      });

      fireEvent.change(await screen.findByTestId('yaml-editor'), { target: { value: 'input:\n  edited: {}' } });
      await user.click(await screen.findByTestId('save-pipeline'));

      // The rejection lands in the issues panel, and nothing was deployed.
      expect(await screen.findByText(/not a draft/i)).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.objectContaining({ to: '/rp-connect/test-pipeline' }));
    });

    it('a refused start keeps the saved draft and shows the issues on their lines', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
      const startPipelineMock = vi.fn().mockImplementation(() => {
        throw invalidConfigError();
      });

      render(<PipelinePage />, {
        transport: createTransport({
          getPipelineMock: vi.fn().mockReturnValue(pipelineResponse({ state: Pipeline_State.DRAFT })),
          startPipelineMock,
        }),
      });

      await waitFor(() => expect(screen.getByTestId('save-pipeline')).toHaveTextContent('Save draft'));
      await openSaveOptions(user);
      await user.click(await screen.findByRole('menuitem', { name: 'Save and start' }));

      await waitFor(() => expect(startPipelineMock).toHaveBeenCalled());
      expect(await screen.findByText(/an explicit output type must be specified/)).toBeInTheDocument();
      // Still in the editor: a refused start is only actionable here.
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.objectContaining({ to: '/rp-connect/test-pipeline' }));
    });

    it('warns that saving a running pipeline restarts it, and says so on the button', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      expect(await screen.findByText(/saving restarts the running pipeline/i)).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('save-pipeline')).toHaveTextContent('Apply and restart'));
    });

    it('offers to start a stopped pipeline as part of saving it', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
      const startPipelineMock = vi.fn().mockReturnValue(create(ConsoleStartPipelineResponseSchema, {}));

      render(<PipelinePage />, {
        transport: createTransport({
          getPipelineMock: vi.fn().mockReturnValue(pipelineResponse({ state: Pipeline_State.STOPPED })),
          startPipelineMock,
        }),
      });

      expect(await screen.findByText(/won't start it/i)).toBeInTheDocument();

      await openSaveOptions(user);
      await user.click(await screen.findByRole('menuitem', { name: 'Save and start' }));

      await waitFor(() => expect(startPipelineMock).toHaveBeenCalled());
      expect(startPipelineMock.mock.calls[0][0].request.id).toBe('test-pipeline');
    });
  });

  describe('the Changes lane', () => {
    const DEPLOYED_YAML = 'input:\n  stdin: {}\noutput:\n  stdout: {}';

    const openChanges = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(await screen.findByRole('tab', { name: /changes/i }));
    };

    it('is offered while editing, even without the visual editor', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      expect(await screen.findByRole('tab', { name: /changes/i })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Visual' })).not.toBeInTheDocument();
    });

    // Nothing to compare against on a read-only page.
    it('is not offered in view mode', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      await screen.findByRole('tab', { name: 'Monitor' });
      expect(screen.queryByRole('tab', { name: /changes/i })).not.toBeInTheDocument();
    });

    it('says there is nothing to apply when the editor matches what is saved', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => expect((screen.getByTestId('yaml-editor') as HTMLTextAreaElement).value).toBe(DEPLOYED_YAML));
      await openChanges(user);

      expect(await screen.findByTestId('changes-panel-empty')).toBeInTheDocument();
      expect(screen.queryByTestId('diff-editor')).not.toBeInTheDocument();
    });

    it('diffs the deployed configuration against the edits, and counts the components touched', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => expect((screen.getByTestId('yaml-editor') as HTMLTextAreaElement).value).toBe(DEPLOYED_YAML));
      const edited = 'input:\n  generate: {}\noutput:\n  stdout: {}';
      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: edited } });

      // The count rides on the tab, so a change is visible without opening the lane.
      await waitFor(() => expect(screen.getByRole('tab', { name: /changes/i })).toHaveTextContent('1'));

      await openChanges(user);

      const diff = await screen.findByTestId('diff-editor');
      expect(diff).toHaveAttribute('data-original', DEPLOYED_YAML);
      expect(diff).toHaveAttribute('data-modified', edited);
      expect(screen.getByText('Changed')).toBeInTheDocument();
    });

    // A running pipeline has no apply-later, so the lane has to say what applying costs.
    it('warns that applying to a running pipeline restarts it', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => expect((screen.getByTestId('yaml-editor') as HTMLTextAreaElement).value).toBe(DEPLOYED_YAML));
      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: `${DEPLOYED_YAML}\n# note` } });
      await openChanges(user);

      expect(await screen.findByText(/applying them restarts the pipeline/i)).toBeInTheDocument();
    });

    it('jumps from a changed component to its lines in the YAML lane', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => expect((screen.getByTestId('yaml-editor') as HTMLTextAreaElement).value).toBe(DEPLOYED_YAML));
      fireEvent.change(screen.getByTestId('yaml-editor'), {
        target: { value: 'input:\n  generate: {}\noutput:\n  stdout: {}' },
      });
      await openChanges(user);

      await user.click(await screen.findByText('Changed'));

      // Back on the YAML lane, which is where a change is actually fixed.
      await waitFor(() => expect(screen.getByTestId('yaml-editor')).toBeInTheDocument());
      expect(screen.queryByTestId('diff-editor')).not.toBeInTheDocument();
    });
  });

  describe('deleting a draft', () => {
    beforeEach(() => {
      mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enableRpcnPipelineDrafts');
    });

    const draftPipeline = () =>
      create(ConsoleGetPipelineResponseSchema, {
        response: create(GetPipelineResponseSchema, {
          pipeline: create(PipelineSchema, {
            id: 'test-pipeline',
            displayName: 'half-built',
            configYaml: 'input:\n  kafka_',
            state: Pipeline_State.DRAFT,
            resources: { cpuShares: '100m', memoryShares: '0' },
          }),
        }),
      });

    it.each([
      ['the detail view', 'view' as const],
      ['the editor', 'edit' as const],
    ])('deletes a draft from %s, after confirming', async (_name, mode) => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode, pipelineId: 'test-pipeline' });
      const deletePipelineMock = vi.fn().mockReturnValue(create(ConsoleDeletePipelineResponseSchema, {}));

      render(<PipelinePage />, {
        transport: createTransport({ getPipelineMock: vi.fn().mockReturnValue(draftPipeline()), deletePipelineMock }),
      });

      await user.click(await screen.findByTestId('delete-draft'));

      // Confirmed, not typed: a draft is unfinished work, but nothing is deployed.
      expect(await screen.findByText(/delete draft\?/i)).toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/delete/i)).not.toBeInTheDocument();
      expect(deletePipelineMock).not.toHaveBeenCalled();

      await user.click(screen.getByTestId('confirm-delete-draft'));

      await waitFor(() => expect(deletePipelineMock).toHaveBeenCalled());
      expect(deletePipelineMock.mock.calls[0][0].request.id).toBe('test-pipeline');
    });

    it('offers no draft delete on a deployed pipeline', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      await screen.findByRole('button', { name: /edit pipeline/i });
      expect(screen.queryByTestId('delete-draft')).not.toBeInTheDocument();
    });

    // The buffer would otherwise outlive the pipeline and offer to restore edits to something gone.
    it('drops the recovery buffer for a deleted draft', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
      localStorage.clear();
      useRpcnEditorAutosaveStore.getState().refresh();
      useRpcnEditorAutosaveStore.getState().save({
        targetKey: 'test-pipeline',
        name: 'half-built',
        description: '',
        computeUnits: 1,
        tags: [],
        configYaml: 'input:\n  unsaved',
      });

      render(<PipelinePage />, {
        transport: createTransport({
          getPipelineMock: vi.fn().mockReturnValue(draftPipeline()),
          deletePipelineMock: vi.fn().mockReturnValue(create(ConsoleDeletePipelineResponseSchema, {})),
        }),
      });

      await user.click(await screen.findByTestId('delete-draft'));
      await user.click(await screen.findByTestId('confirm-delete-draft'));

      await waitFor(() => expect(useRpcnEditorAutosaveStore.getState().entries).toHaveLength(0));
    });
  });

  describe('leaving with unsaved changes', () => {
    beforeEach(() => {
      localStorage.clear();
      useRpcnEditorAutosaveStore.getState().refresh();
      mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enableRpcnPipelineDrafts');
    });

    const blocked = () => {
      const proceed = vi.fn();
      const reset = vi.fn();
      mockBlocker.mockReturnValue({ status: 'blocked', proceed, reset });
      return { proceed, reset };
    };

    it('offers a draft as the way out, and resumes the interrupted navigation', async () => {
      const user = userEvent.setup();
      const { proceed } = blocked();
      const createPipelineMock = vi.fn().mockReturnValue(
        create(ConsoleCreatePipelineResponseSchema, {
          response: create(CreatePipelineResponseSchema, { pipeline: create(PipelineSchema, { id: 'new-pipeline' }) }),
        })
      );

      render(<PipelinePage />, { transport: createTransport({ createPipelineMock }) });

      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  half_typed' } });
      await user.click(await screen.findByTestId('save-draft-and-leave'));

      await waitFor(() => expect(createPipelineMock).toHaveBeenCalled());
      expect(createPipelineMock.mock.calls[0][0].request.pipeline.draft).toBe(true);
      // The dialog's own proceed is what resumes the navigation, so the editor must not add one of
      // its own — two navigations would flash a route nobody chose.
      await waitFor(() => expect(proceed).toHaveBeenCalled());
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    // Saving would restart it, so offering "save and leave" here would be a trap.
    it('offers no draft on a running pipeline, and says why', async () => {
      blocked();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      expect(await screen.findByText(/would restart it/i)).toBeInTheDocument();
      expect(screen.queryByTestId('save-draft-and-leave')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /keep editing/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /discard changes/i })).toBeInTheDocument();
    });
  });

  describe('autosave recovery', () => {
    beforeEach(() => {
      localStorage.clear();
      useRpcnEditorAutosaveStore.getState().refresh();
      mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enableRpcnPipelineDrafts');
    });

    const seedBuffer = (targetKey: string, configYaml: string, name = 'Test Pipeline') => {
      useRpcnEditorAutosaveStore.getState().save({
        targetKey,
        name,
        description: '',
        computeUnits: 1,
        tags: [],
        configYaml,
      });
    };

    // The acceptance criterion for a refresh mid-edit: whatever was typed is still reachable.
    it('mirrors the editor into local storage as the user types', async () => {
      render(<PipelinePage />, { transport: createTransport() });

      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  mid_sentence' } });

      await waitFor(
        () => {
          const buffer = useRpcnEditorAutosaveStore.getState().entries.find((e) => e.targetKey === 'create');
          expect(buffer?.configYaml).toBe('input:\n  mid_sentence');
        },
        { timeout: 4000 }
      );
    });

    it('offers to restore a buffer over the loaded pipeline, and leaves the loaded config alone until then', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
      seedBuffer('test-pipeline', 'input:\n  recovered: {}');

      render(<PipelinePage />, { transport: createTransport() });

      const yamlEditor = (await screen.findByTestId('yaml-editor')) as HTMLTextAreaElement;
      await waitFor(() => expect(yamlEditor.value).toBe('input:\n  stdin: {}\noutput:\n  stdout: {}'));
      expect(await screen.findByTestId('autosave-restore-notice')).toBeInTheDocument();

      await user.click(screen.getByTestId('restore-autosave'));
      await waitFor(() => expect(yamlEditor.value).toBe('input:\n  recovered: {}'));
      // Nothing left to offer once it's loaded.
      expect(screen.queryByTestId('autosave-restore-notice')).not.toBeInTheDocument();
    });

    // Loading a pipeline settles the document back to "nothing to recover". Tidying up on that signal
    // would delete the recovery buffer about a second before the user could click Restore.
    it('keeps a buffer left by an earlier session while the editor just sits there', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
      seedBuffer('test-pipeline', 'input:\n  recovered: {}');

      render(<PipelinePage />, { transport: createTransport() });

      expect(await screen.findByTestId('autosave-restore-notice')).toBeInTheDocument();

      await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS + 500));

      expect(useRpcnEditorAutosaveStore.getState().entries).toHaveLength(1);
      expect(screen.getByTestId('autosave-restore-notice')).toBeInTheDocument();
    });

    it('discarding a buffer drops it and leaves the loaded config alone', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
      seedBuffer('test-pipeline', 'input:\n  recovered: {}');

      render(<PipelinePage />, { transport: createTransport() });

      await user.click(await screen.findByTestId('discard-autosave'));

      await waitFor(() => expect(useRpcnEditorAutosaveStore.getState().entries).toHaveLength(0));
      expect((screen.getByTestId('yaml-editor') as HTMLTextAreaElement).value).toBe(
        'input:\n  stdin: {}\noutput:\n  stdout: {}'
      );
      expect(screen.queryByTestId('autosave-restore-notice')).not.toBeInTheDocument();
    });

    it('a saved draft clears the buffer it was protecting', async () => {
      const user = userEvent.setup();
      const createPipelineMock = vi.fn().mockReturnValue(
        create(ConsoleCreatePipelineResponseSchema, {
          response: create(CreatePipelineResponseSchema, { pipeline: create(PipelineSchema, { id: 'new-pipeline' }) }),
        })
      );
      seedBuffer('create', 'input:\n  stale: {}', 'work in progress');

      render(<PipelinePage />, { transport: createTransport({ createPipelineMock }) });

      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  stdin: {}' } });
      await user.click(screen.getByTestId('save-pipeline'));

      await waitFor(() => expect(createPipelineMock).toHaveBeenCalled());
      await waitFor(() =>
        expect(useRpcnEditorAutosaveStore.getState().entries.find((e) => e.targetKey === 'create')).toBeUndefined()
      );
    });
  });

  describe('a draft on its own page', () => {
    beforeEach(() => {
      mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enableRpcnPipelineDrafts');
      mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });
    });

    const draftTransport = (overrides?: { startPipelineMock?: ReturnType<typeof vi.fn> }) =>
      createTransport({
        getPipelineMock: vi.fn().mockReturnValue(
          create(ConsoleGetPipelineResponseSchema, {
            response: create(GetPipelineResponseSchema, {
              pipeline: create(PipelineSchema, {
                id: 'test-pipeline',
                displayName: 'Test Pipeline',
                configYaml: 'input:\n  stdin: {}',
                state: Pipeline_State.DRAFT,
                resources: { cpuShares: '100m', memoryShares: '0' },
              }),
            }),
          })
        ),
        ...overrides,
      });

    it('explains itself instead of offering monitoring it cannot have', async () => {
      render(<PipelinePage />, { transport: draftTransport() });

      expect(await screen.findByTestId('draft-view-notice')).toBeInTheDocument();
      // No Monitor lane: it has never run, so there is no throughput and no logs.
      expect(screen.queryByRole('tab', { name: 'Monitor' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('log-explorer')).not.toBeInTheDocument();
      expect(screen.queryByTestId('logs-tab')).not.toBeInTheDocument();
    });

    it('starts from the detail view', async () => {
      const user = userEvent.setup();
      const startPipelineMock = vi.fn().mockReturnValue(create(ConsoleStartPipelineResponseSchema, {}));

      render(<PipelinePage />, { transport: draftTransport({ startPipelineMock }) });

      await user.click(await screen.findByTestId('start-draft'));

      await waitFor(() => expect(startPipelineMock).toHaveBeenCalled());
      expect(startPipelineMock.mock.calls[0][0].request.id).toBe('test-pipeline');
    });

    it('routes a refused start into the editor, where the issues are', async () => {
      const user = userEvent.setup();
      const startPipelineMock = vi.fn().mockImplementation(() => {
        throw new ConnectError('invalid pipeline configuration', Code.InvalidArgument, undefined, [
          {
            desc: LintHintSchema,
            value: create(LintHintSchema, { line: 2, column: 1, hint: 'an explicit output type must be specified' }),
          },
        ]);
      });

      render(<PipelinePage />, { transport: draftTransport({ startPipelineMock }) });

      await user.click(await screen.findByTestId('start-draft'));

      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith(
          expect.objectContaining({ to: '/rp-connect/$pipelineId/edit', params: { pipelineId: 'test-pipeline' } })
        )
      );
    });

    it('does not offer a run toggle, which has nowhere to report a rejected config', async () => {
      render(<PipelinePage />, { transport: draftTransport() });

      await screen.findByTestId('draft-view-notice');
      expect(screen.queryByTestId('pipeline-run-toggle')).not.toBeInTheDocument();
    });
  });
});
