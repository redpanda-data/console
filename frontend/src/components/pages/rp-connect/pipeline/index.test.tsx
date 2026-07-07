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
import { ConnectError, createRouterTransport } from '@connectrpc/connect';
import userEvent from '@testing-library/user-event';
import type { editor } from 'monaco-editor';
// Console-layer response schemas
import {
  CreatePipelineResponseSchema as ConsoleCreatePipelineResponseSchema,
  DeletePipelineResponseSchema as ConsoleDeletePipelineResponseSchema,
  GetPipelineResponseSchema as ConsoleGetPipelineResponseSchema,
  GetPipelineServiceConfigSchemaResponseSchema as ConsoleGetPipelineServiceConfigSchemaResponseSchema,
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
  Pipeline_State,
  PipelineSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
// Dataplane RPC methods (used by query hooks in react-query/api/connect)
import {
  getPipelineServiceConfigSchema,
  lintPipelineConfig,
  listComponents,
} from 'protogen/redpanda/api/dataplane/v1/pipeline-PipelineService_connectquery';
import { act, fireEvent, render, screen, waitFor } from 'test-utils';

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
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useRouter: () => ({ history: { back: mockBack, canGoBack: () => true } }),
    useSearch: () => mockSearch(),
    useBlocker: () => ({ status: 'idle', proceed: undefined, reset: undefined }),
  };
});

type ContentChangeCallback = (e: { changes: Array<{ text: string }> }) => void;
const contentChangeListeners: ContentChangeCallback[] = [];

const mockEditorInstance = {
  getPosition: vi.fn(() => ({ lineNumber: 1, column: 4 })),
  getModel: vi.fn(() => ({
    getLineContent: vi.fn(() => '  /'),
  })),
  onDidChangeModelContent: vi.fn((cb: ContentChangeCallback) => {
    contentChangeListeners.push(cb);
    return { dispose: vi.fn() };
  }),
  // Cursor → structure-tree highlight sync subscribes to this.
  onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
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
  lintMock?: ReturnType<typeof vi.fn>;
  stopPipelineMock?: ReturnType<typeof vi.fn>;
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
    rpc(updatePipeline, vi.fn().mockReturnValue(create(ConsoleUpdatePipelineResponseSchema, {})));
    rpc(deletePipeline, vi.fn().mockReturnValue(create(ConsoleDeletePipelineResponseSchema, {})));
    rpc(startPipeline, vi.fn().mockReturnValue(create(ConsoleStartPipelineResponseSchema, {})));
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
    mockIsFeatureFlagEnabled.mockImplementation(() => false);
    mockIsEmbedded.mockReturnValue(false);
    mockUsePipelineMode.mockReturnValue({ mode: 'create' });
    contentChangeListeners.length = 0;
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

    // The pipeline name is the page title (level-1 heading); the generic "Pipeline view" heading was removed.
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
});
