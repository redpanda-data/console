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

// 1. Mock usePipelineMode
const mockUsePipelineMode = vi.fn(() => ({ mode: 'create' as const }));
vi.mock('../utils/use-pipeline-mode', () => ({
  usePipelineMode: (...args: unknown[]) => mockUsePipelineMode(...args),
}));

// 2. Mock config — hoist isFeatureFlagEnabled so we can control it per-test
const mockIsFeatureFlagEnabled = vi.fn((_flag: string) => false);
vi.mock('config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('config')>();
  return {
    ...actual,
    isFeatureFlagEnabled: (...args: unknown[]) => mockIsFeatureFlagEnabled(...(args as [string])),
    isEmbedded: vi.fn(() => false),
    isServerless: vi.fn(() => false),
  };
});

// 3. Mock TanStack Router hooks
const mockNavigate = vi.fn();
const mockBack = vi.fn();
const mockSearch = vi.fn(() => ({}));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useRouter: () => ({ history: { back: mockBack } }),
    useSearch: () => mockSearch(),
  };
});

// 4. Mock YamlEditor
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
  executeEdits: vi.fn(),
  focus: vi.fn(),
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

// 5. Mock complex sub-components that are irrelevant to our tests
vi.mock('./pipeline-flow-diagram', () => ({ PipelineFlowDiagram: () => null }));
vi.mock('./pipeline-throughput-card', () => ({ PipelineThroughputCard: () => null }));
vi.mock('../onboarding/add-connectors-card', () => ({ AddConnectorsCard: () => null }));
vi.mock('../pipelines-details', () => ({ LogsTab: () => <div data-testid="logs-tab" /> }));
vi.mock('components/ui/connect/log-explorer', () => ({ LogExplorer: () => <div data-testid="log-explorer" /> }));
const mockConnectorWizardProps = vi.fn();
vi.mock('./connector-wizard', () => ({
  ConnectorWizard: (props: Record<string, unknown>) => {
    mockConnectorWizardProps(props);
    return null;
  },
}));

// 6. Mock PipelineCommandMenu to render a simple testable version
// The real component needs secrets/topics/users RPCs which are complex to mock
// Includes variant prop to distinguish dialog vs popover instances
vi.mock('./pipeline-command-menu', async () => ({
  PipelineCommandMenu: (props: { open: boolean; onOpenChange: (open: boolean) => void; variant?: string }) => {
    if (!props.open) {
      return null;
    }
    const label = props.variant === 'popover' ? 'Slash Menu' : 'Command Menu';
    return (
      <div data-testid={props.variant === 'popover' ? 'slash-menu' : 'command-menu'} role="dialog">
        <span>{label}</span>
        <button onClick={() => props.onOpenChange(false)} type="button">
          Close
        </button>
      </div>
    );
  },
}));

// 7. Mock Zustand stores
vi.mock('state/onboarding-wizard-store', () => ({
  useOnboardingYamlContentStore: Object.assign(
    vi.fn(() => ''),
    {
      getState: () => ({ setYamlContent: vi.fn(), yamlContent: '' }),
    }
  ),
  useOnboardingWizardDataStore: Object.assign(
    vi.fn(() => ({ hasHydrated: true })),
    {
      getState: () => ({ setWizardData: vi.fn() }),
    }
  ),
  useOnboardingUserDataStore: Object.assign(
    vi.fn(() => ({})),
    {
      getState: () => ({ reset: vi.fn() }),
    }
  ),
  getWizardConnectionData: () => ({ input: undefined, output: undefined }),
}));

// Import the component under test AFTER all mocks are set up
import PipelinePage from '.';

function createTransport(overrides?: {
  getPipelineMock?: ReturnType<typeof vi.fn>;
  createPipelineMock?: ReturnType<typeof vi.fn>;
  lintMock?: ReturnType<typeof vi.fn>;
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
    rpc(stopPipeline, vi.fn().mockReturnValue(create(ConsoleStopPipelineResponseSchema, {})));
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

describe('PipelinePage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockBack.mockClear();
    mockSearch.mockReturnValue({});
    mockConnectorWizardProps.mockClear();
    mockIsFeatureFlagEnabled.mockImplementation(() => false);
    mockUsePipelineMode.mockReturnValue({ mode: 'create' });
    contentChangeListeners.length = 0;
  });

  // ── Lint panel (molecule gap — LintHintList has no own tests) ───────

  it('displays lint warnings from the backend as the user types YAML', async () => {
    const lintMock = vi.fn().mockReturnValue(
      create(LintPipelineConfigResponseSchema, {
        lintHints: [create(LintHintSchema, { line: 1, column: 1, hint: 'response lint warning' })],
      })
    );

    render(<PipelinePage />, { transport: createTransport({ lintMock }) });

    // Type YAML content to trigger the lint query (it fires on debounced yaml content)
    const yamlEditor = screen.getByTestId('yaml-editor');
    act(() => {
      fireEvent.change(yamlEditor, { target: { value: 'input:\n  stdin: {}' } });
    });

    // Wait for debounced lint response to appear
    // LintHintList renders hints via SimpleCodeBlock with format "Line N, Col N: hint"
    await waitFor(() => {
      expect(screen.getByText('Line 1, Col 1: response lint warning')).toBeInTheDocument();
    });
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
    await waitFor(() => {
      expect(screen.getByText('general config warning')).toBeInTheDocument();
    });
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

    // Both hints should appear
    await waitFor(() => {
      expect(screen.getByText('Line 1, Col 1: first warning')).toBeInTheDocument();
      expect(screen.getByText('Line 2, Col 1: second warning')).toBeInTheDocument();
    });

    // The "Lint issues" heading should be present
    expect(screen.getByText('Lint issues')).toBeInTheDocument();
  });

  // ── Creating a pipeline ─────────────────────────────────────────────

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

    // EditableText with defaultEditing starts in edit mode — use placeholder to find the input
    const nameInput = screen.getByPlaceholderText('Pipeline name');
    await user.clear(nameInput);
    await user.type(nameInput, 'my-pipeline');
    // Tab to commit the EditableText value (fires onChange -> handleNameChange -> form.setValue)
    await user.tab();

    // Set YAML via the textarea mock
    const yamlEditor = screen.getByTestId('yaml-editor');
    fireEvent.change(yamlEditor, { target: { value: 'input:\n  generate:\n    mapping: root = "hello"' } });

    // Click Save
    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(createPipelineMock).toHaveBeenCalled();
    });

    // Verify the request contains our YAML content
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

    // Fill in name (min 3 chars for validation)
    const nameInput = screen.getByPlaceholderText('Pipeline name');
    await user.clear(nameInput);
    await user.type(nameInput, 'my-pipeline');
    await user.tab();

    // Set YAML and click Save
    const yamlEditor = screen.getByTestId('yaml-editor');
    fireEvent.change(yamlEditor, { target: { value: 'input:\n  stdin: {}' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: '/rp-connect/new-pipeline' }));
    });
  });

  it('shows both save errors and real-time lint warnings when a save fails', async () => {
    const user = userEvent.setup();

    // Lint mock returns a response lint hint
    const lintMock = vi.fn().mockReturnValue(
      create(LintPipelineConfigResponseSchema, {
        lintHints: [create(LintHintSchema, { line: 3, column: 1, hint: 'response warning' })],
      })
    );

    // Create mock throws ConnectError
    const createPipelineMock = vi.fn().mockImplementation(() => {
      throw new ConnectError('invalid config');
    });

    render(<PipelinePage />, { transport: createTransport({ createPipelineMock, lintMock }) });

    // Fill in name
    const nameInput = screen.getByPlaceholderText('Pipeline name');
    await user.clear(nameInput);
    await user.type(nameInput, 'my-pipeline');
    await user.tab();

    // Set YAML (triggers lint query which returns response warning)
    const yamlEditor = screen.getByTestId('yaml-editor');
    fireEvent.change(yamlEditor, { target: { value: 'input:\n  bad_config: {}' } });

    // Wait for the response lint hint to appear
    await waitFor(() => {
      expect(screen.getByText('Line 3, Col 1: response warning')).toBeInTheDocument();
    });

    // Click Save to trigger the error
    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    // After error, both the error hint from extractLintHintsFromError AND the response hint should be visible
    await waitFor(() => {
      // Error hint from extractLintHintsFromError (generic case: "[code] message")
      expect(screen.getByText(/invalid config/)).toBeInTheDocument();
    });

    // Response hint should still be present
    expect(screen.getByText('Line 3, Col 1: response warning')).toBeInTheDocument();
  });

  it('editing YAML after a failed save clears the stale error messages', async () => {
    const user = userEvent.setup();

    // Lint mock returns no response hints
    const lintMock = vi.fn().mockReturnValue(create(LintPipelineConfigResponseSchema, { lintHints: [] }));

    // Create mock throws ConnectError
    const createPipelineMock = vi.fn().mockImplementation(() => {
      throw new ConnectError('invalid config');
    });

    render(<PipelinePage />, { transport: createTransport({ createPipelineMock, lintMock }) });

    // Fill in name
    const nameInput = screen.getByPlaceholderText('Pipeline name');
    await user.clear(nameInput);
    await user.type(nameInput, 'my-pipeline');
    await user.tab();

    // Set YAML
    const yamlEditor = screen.getByTestId('yaml-editor');
    fireEvent.change(yamlEditor, { target: { value: 'input:\n  bad: {}' } });

    // Click Save to trigger the error
    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    // Error hint should appear
    await waitFor(() => {
      expect(screen.getByText(/invalid config/)).toBeInTheDocument();
    });

    // Now edit the YAML — handleYamlChange calls setErrorLintHints({}) (H1 fix)
    fireEvent.change(yamlEditor, { target: { value: 'input:\n  fixed: {}' } });

    // Error hint should be cleared; with no response hints either, we see "No issues found"
    await waitFor(() => {
      expect(screen.queryByText(/invalid config/)).not.toBeInTheDocument();
    });
  });

  // ── Viewing a pipeline ──────────────────────────────────────────────

  it('leaving the view page navigates back to the pipeline list', async () => {
    const user = userEvent.setup();
    mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });

    render(<PipelinePage />, { transport: createTransport() });

    // Wait for the view mode toolbar to load
    await waitFor(() => {
      expect(screen.getByText('Edit pipeline')).toBeInTheDocument();
    });

    // The back button is the first button in the view toolbar
    const allButtons = screen.getAllByRole('button');
    const backButton = allButtons[0];
    await user.click(backButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: '/connect-clusters' }));
    });
  });

  // ── Command menu ───────────────────────────────────────────────────

  it('pressing Cmd+Shift+P opens the variable insert menu', async () => {
    render(<PipelinePage />, { transport: createTransport() });

    // Dispatch keyboard event for Cmd+Shift+P
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'p',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
        })
      );
    });

    // The mocked PipelineCommandMenu renders "Command Menu" text when open
    await waitFor(() => {
      expect(screen.getByText('Command Menu')).toBeInTheDocument();
    });
  });

  it('typing / in the editor dismisses an open command menu to avoid overlap', async () => {
    // Enable the slash command feature flag for this test
    mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enableConnectSlashMenu');

    render(<PipelinePage />, { transport: createTransport() });

    // Wait for the editor mock to mount and the useSlashCommand hook to subscribe
    await waitFor(() => {
      expect(contentChangeListeners.length).toBeGreaterThan(0);
    });

    // First open the command menu via Cmd+Shift+P
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'p',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
        })
      );
    });

    // Verify command menu is open
    await waitFor(() => {
      expect(screen.getByText('Command Menu')).toBeInTheDocument();
    });

    // Simulate a slash trigger via the mock editor's content change listener.
    // The useSlashCommand hook subscribes to onDidChangeModelContent.
    // When a '/' is detected, detectSlashTrigger checks getPosition() + getModel().getLineContent().
    // Our mock returns position {lineNumber:1, column:4} and lineContent '  /' which means
    // slashColumn=3, charBefore=' ' (whitespace) → valid trigger position.
    // The hook then calls onOpen (handleSlashOpen) which sets isCommandMenuOpen to false.
    act(() => {
      for (const cb of contentChangeListeners) {
        cb({ changes: [{ text: '/' }] });
      }
    });

    // The command dialog should now be closed
    await waitFor(() => {
      expect(screen.queryByText('Command Menu')).not.toBeInTheDocument();
    });
  });

  // ── Feature flags and mode routing ──────────────────────────────────

  describe('feature flags and mode routing', () => {
    it('shows a slash-command tip banner when the feature is enabled', async () => {
      mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enableConnectSlashMenu');

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => {
        expect(screen.getByText(/Tip: use/)).toBeInTheDocument();
        expect(screen.getByText(/to insert variables/)).toBeInTheDocument();
      });
    });

    it('hides the slash-command tip banner when the feature is disabled', async () => {
      // Default: all flags return false
      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => {
        expect(screen.getByTestId('yaml-editor')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Tip: use/)).not.toBeInTheDocument();
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

      // In edit mode, defaultEditing is false so EditableText renders as a button showing the name
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Test Pipeline' })).toBeInTheDocument();
      });

      // The yaml editor textarea should be populated with the pipeline's configYaml
      const yamlEditor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
      await waitFor(() => {
        expect(yamlEditor.value).toBe('input:\n  stdin: {}\noutput:\n  stdout: {}');
      });
    });

    it('serverless onboarding with a Redpanda connector auto-opens the setup wizard', async () => {
      mockSearch.mockReturnValue({ serverless: 'true' });

      // Override the wizard data store to return redpanda input data
      const { useOnboardingWizardDataStore } = await import('state/onboarding-wizard-store');
      const originalImpl = useOnboardingWizardDataStore.getMockImplementation?.() ?? (() => ({ hasHydrated: true }));
      (useOnboardingWizardDataStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector: (state: Record<string, unknown>) => unknown) =>
          selector({
            hasHydrated: true,
            input: { connectionName: 'redpanda', connectionType: 'input' },
            output: undefined,
          })
      );

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => {
        expect(mockConnectorWizardProps).toHaveBeenCalledWith(
          expect.objectContaining({
            autoOpenRedpandaSetup: { connectionName: 'redpanda', connectionType: 'input' },
          })
        );
      });

      // Restore original implementation
      (useOnboardingWizardDataStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(originalImpl);
    });

    it('standard mode does not auto-open the connector setup wizard', async () => {
      // Default: search returns {} (no serverless flag)
      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => {
        expect(mockConnectorWizardProps).toHaveBeenCalledWith(
          expect.objectContaining({
            autoOpenRedpandaSetup: undefined,
          })
        );
      });
    });
  });
});
