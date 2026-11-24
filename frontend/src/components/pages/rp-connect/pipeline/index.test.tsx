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
import { create, type DescMethodUnary, type MessageInitShape, type MessageShape } from '@bufbuild/protobuf';
import { timestampFromMs } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError, type ConnectRouter, createRouterTransport, type MethodImpl } from '@connectrpc/connect';
import type { Monaco } from '@monaco-editor/react';
import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';
import { focusManager } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { config, type FeatureFlagKey } from 'config';
import type { editor } from 'monaco-editor';
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
import {
  ComponentStatus,
  CreatePipelineResponseSchema,
  GetPipelineResponseSchema,
  GetPipelineServiceConfigSchemaResponseSchema,
  LintPipelineConfigResponseSchema,
  ListComponentsResponseSchema,
  ListPipelinesResponseSchema,
  Pipeline_State,
  PipelineSchema,
  UpdatePipelineResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  getPipelineServiceConfigSchema,
  lintPipelineConfig,
  listComponents,
} from 'protogen/redpanda/api/dataplane/v1/pipeline-PipelineService_connectquery';
import * as React from 'react';
import { toast } from 'sonner';
import { rpcnEditorAutosave, useRpcnEditorAutosaveStore } from 'state/rpcn-editor-autosave';
import { useRpcnWizardStore } from 'state/rpcn-wizard-store';
import { act, fireEvent, render, screen, waitFor } from 'test-utils';

import {
  DRAFT_UNSUPPORTED_MESSAGE,
  DRAFT_UNSUPPORTED_STOPPED_MESSAGE,
  DRAFT_UPDATE_UNSUPPORTED_MESSAGE,
} from './draft-copy';
import { MISSING_SERVICE_ACCOUNT_MESSAGE, NO_LONGER_DRAFT_MESSAGE } from './save-actions';
import { AUTOSAVE_DEBOUNCE_MS } from './use-editor-autosave';
import { takeStartLintHints } from './use-start-draft';
import type { usePipelineMode } from '../utils/use-pipeline-mode';
import PipelinePage from '.';

const mockUsePipelineMode = rs.fn<typeof usePipelineMode>(() => ({ mode: 'create' }));
rs.mock('../utils/use-pipeline-mode', () => ({
  usePipelineMode: () => mockUsePipelineMode(),
}));

const initialConfig = { featureFlags: config.featureFlags, jwt: config.jwt, isServerless: config.isServerless };

function enableFeatures(...enabled: FeatureFlagKey[]) {
  for (const flag of enabled) {
    config.featureFlags[flag] = true;
  }
}

const mockNavigate = rs.fn();
const mockBack = rs.fn();
const mockSearch = rs.fn(() => ({}));
// Overridable so the leave-without-saving dialog can be driven directly; the guard itself belongs to
// the router, not to this page. The options are passed through so a test can ask the page's own
// `shouldBlockFn` whether it would block, which is the only honest way to test the guard here.
type BlockerOptions = { shouldBlockFn: () => boolean };
const mockBlocker = rs.fn(
  (_options?: BlockerOptions) =>
    ({
      status: 'idle',
      proceed: undefined,
      reset: undefined,
    }) as unknown
);
const lastShouldBlockFn = () =>
  (mockBlocker.mock.calls.at(-1)?.[0] as BlockerOptions | undefined)?.shouldBlockFn ?? (() => false);
rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useRouter: () => ({ history: { back: mockBack, canGoBack: () => true } }),
    useSearch: () => mockSearch(),
    useBlocker: (options: BlockerOptions) => mockBlocker(options),
  };
});

type ContentChangeCallback = (e: { changes: Array<{ text: string }> }) => void;
const contentChangeListeners: ContentChangeCallback[] = [];
type CursorPositionCallback = (e: { position: { lineNumber: number; column: number } }) => void;
const cursorPositionListeners: CursorPositionCallback[] = [];

const mockEditorInstance = {
  getPosition: rs.fn(() => ({ lineNumber: 1, column: 4 })),
  getModel: rs.fn(() => ({
    getLineContent: rs.fn(() => '  /'),
    getLineCount: rs.fn(() => 1000),
    getLineMaxColumn: rs.fn(() => 1),
  })),
  onDidChangeModelContent: rs.fn((cb: ContentChangeCallback) => {
    contentChangeListeners.push(cb);
    return { dispose: rs.fn() };
  }),
  onDidChangeCursorPosition: rs.fn((cb: CursorPositionCallback) => {
    cursorPositionListeners.push(cb);
    return { dispose: rs.fn() };
  }),
  // Mirrors Monaco: setSelection places the cursor at the selection end and notifies
  // cursor-position listeners synchronously, before the call returns.
  setSelection: rs.fn((sel: { endLineNumber: number; endColumn: number }) => {
    for (const cb of cursorPositionListeners) {
      cb({ position: { lineNumber: sel.endLineNumber, column: sel.endColumn } });
    }
  }),
  revealLineInCenterIfOutsideViewport: rs.fn(),
  setPosition: rs.fn(),
  revealLine: rs.fn(),
  executeEdits: rs.fn(),
  focus: rs.fn(),
  onDidScrollChange: rs.fn(() => ({ dispose: rs.fn() })),
  onDidContentSizeChange: rs.fn(() => ({ dispose: rs.fn() })),
  onDidLayoutChange: rs.fn(() => ({ dispose: rs.fn() })),
  getScrollTop: rs.fn(() => 0),
  getScrollHeight: rs.fn(() => 0),
  getLayoutInfo: rs.fn(() => ({ height: 0 })),
} as unknown as editor.IStandaloneCodeEditor;

const mockMonaco = {
  MarkerSeverity: { Warning: 4 },
  editor: { setModelMarkers: rs.fn() },
} as unknown as Monaco;

function MockYamlEditor(props: {
  onChange?: (val: string) => void;
  onEditorMount?: (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  value?: string;
}) {
  React.useEffect(() => {
    props.onEditorMount?.(mockEditorInstance, mockMonaco);
  }, [props.onEditorMount]);
  return (
    <textarea data-testid="yaml-editor" onChange={(e) => props.onChange?.(e.target.value)} value={props.value || ''} />
  );
}

rs.mock('components/ui/yaml/yaml-editor', () => ({
  ...rs.requireActual<typeof import('components/ui/yaml/yaml-editor')>('components/ui/yaml/yaml-editor'),
  YamlEditor: MockYamlEditor,
}));

// Monaco's diff editor is heavy and needs a real layout; stub it to a marker carrying both sides.
function MockDiffEditor(props: { original?: string; modified?: string }) {
  return React.createElement('div', {
    'data-testid': 'diff-editor',
    'data-original': props.original ?? '',
    'data-modified': props.modified ?? '',
  });
}

rs.mock('components/misc/monaco-editor', () => ({
  DiffEditor: MockDiffEditor,
}));

// The expanded Visual lane renders the canvas; stub it to a marker carrying the YAML, with the
// node's "Add user" action for each section's `redpanda` component.
function MockPipelineFlowCanvas(props: {
  configYaml: string;
  onAddSasl?: (section: string, componentName: string) => void;
}) {
  return React.createElement(
    'div',
    {
      'data-testid': 'flow-canvas',
      'data-configyaml': props.configYaml,
    },
    ['input', 'output'].map((section) =>
      React.createElement('button', {
        'data-testid': `add-user-${section}`,
        key: section,
        onClick: () => props.onAddSasl?.(section, 'redpanda'),
        type: 'button',
      })
    )
  );
}

rs.mock('./pipeline-flow-canvas', () => ({
  PipelineFlowCanvas: MockPipelineFlowCanvas,
}));
const userStep: { submission: unknown; props: Record<string, unknown> } = { submission: undefined, props: {} };
function MockAddUserStep({ ref, ...props }: Record<string, unknown> & { ref?: React.Ref<unknown> }) {
  userStep.props = props;
  React.useImperativeHandle(ref, () => ({
    triggerSubmit: async () => ({ success: true, data: userStep.submission }),
    isPending: false,
  }));
  return React.createElement('div', { 'data-testid': 'add-user-step' });
}

rs.mock('../onboarding/add-user-step', () => ({ AddUserStep: MockAddUserStep }));

function MockPipelineThroughputCard() {
  return null;
}

rs.mock('./pipeline-throughput-card', () => ({ PipelineThroughputCard: MockPipelineThroughputCard }));

// Counted, not just queried: mounting is what fires the logs and throughput requests.
const logsTabRenders = { count: 0 };
function MockLogsTab() {
  logsTabRenders.count += 1;
  return <div data-testid="logs-tab" />;
}

rs.mock('../pipelines-details', () => ({
  LogsTab: MockLogsTab,
}));
function MockLogExplorer() {
  return <div data-testid="log-explorer" />;
}

rs.mock('components/ui/connect/log-explorer', () => ({ LogExplorer: MockLogExplorer }));

// Simplified stub — the real menu needs secrets/topics/users RPCs; variant distinguishes dialog vs popover.
function MockPipelineCommandMenu(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: string;
  initialFilter?: string;
}) {
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
}

rs.mock('./pipeline-command-menu', () => ({
  PipelineCommandMenu: MockPipelineCommandMenu,
}));

// What a draft-capable backend returns: the console backend drops `create_time` when it predates drafts.
const DRAFT_ERA_PIPELINE = create(PipelineSchema, {
  id: 'existing',
  displayName: 'Existing pipeline',
  createTime: timestampFromMs(1_700_000_000_000),
});

const listPipelinesResponse = (pipelines: ReturnType<typeof create<typeof PipelineSchema>>[]) =>
  create(ConsoleListPipelinesResponseSchema, { response: create(ListPipelinesResponseSchema, { pipelines }) });

/** Answers the create page's draft-support sample with a draft-era pipeline; name lookups go to `lookup`. */
const routeNameLookups = (lookup: MethodImpl<typeof listPipelines>) => {
  const handler: MethodImpl<typeof listPipelines> = (request, context) =>
    request.request?.filter?.nameContains ? lookup(request, context) : listPipelinesResponse([DRAFT_ERA_PIPELINE]);
  return handler;
};

type RequestFor<M extends DescMethodUnary> = MessageShape<M['input']>;

type TransportOverrides = {
  getPipelineHandler?: MethodImpl<typeof getPipeline>;
  createPipelineHandler?: MethodImpl<typeof createPipeline>;
  updatePipelineHandler?: MethodImpl<typeof updatePipeline>;
  lintHandler?: MethodImpl<typeof lintPipelineConfig>;
  listComponentsHandler?: MethodImpl<typeof listComponents>;
  stopPipelineHandler?: MethodImpl<typeof stopPipeline>;
  startPipelineHandler?: MethodImpl<typeof startPipeline>;
  listPipelinesHandler?: MethodImpl<typeof listPipelines>;
  deletePipelineHandler?: MethodImpl<typeof deletePipeline>;
};

const emptyPipelineRequests = () => ({
  createPipeline: [] as RequestFor<typeof createPipeline>[],
  updatePipeline: [] as RequestFor<typeof updatePipeline>[],
  deletePipeline: [] as RequestFor<typeof deletePipeline>[],
  getPipeline: [] as RequestFor<typeof getPipeline>[],
  listPipelines: [] as RequestFor<typeof listPipelines>[],
  startPipeline: [] as RequestFor<typeof startPipeline>[],
  stopPipeline: [] as RequestFor<typeof stopPipeline>[],
});

let pipelineRequests = emptyPipelineRequests();

function routeConsoleRpcs(
  { rpc }: ConnectRouter,
  requests: ReturnType<typeof emptyPipelineRequests>,
  overrides: TransportOverrides = {}
) {
  rpc(getPipeline, (request, context) => {
    requests.getPipeline.push(request);
    return overrides.getPipelineHandler?.(request, context) ?? pipelineResponse({});
  });
  rpc(createPipeline, (request, context) => {
    requests.createPipeline.push(request);
    return (
      overrides.createPipelineHandler?.(request, context) ??
      createdPipelineResponse('new-pipeline', Pipeline_State.UNSPECIFIED)
    );
  });
  rpc(updatePipeline, (request, context) => {
    requests.updatePipeline.push(request);
    return overrides.updatePipelineHandler?.(request, context) ?? create(ConsoleUpdatePipelineResponseSchema, {});
  });
  rpc(deletePipeline, (request, context) => {
    requests.deletePipeline.push(request);
    return overrides.deletePipelineHandler?.(request, context) ?? create(ConsoleDeletePipelineResponseSchema, {});
  });
  rpc(listPipelines, (request, context) => {
    requests.listPipelines.push(request);
    return overrides.listPipelinesHandler?.(request, context) ?? listPipelinesResponse([DRAFT_ERA_PIPELINE]);
  });
  rpc(startPipeline, (request, context) => {
    requests.startPipeline.push(request);
    return overrides.startPipelineHandler?.(request, context) ?? create(ConsoleStartPipelineResponseSchema, {});
  });
  rpc(stopPipeline, (request, context) => {
    requests.stopPipeline.push(request);
    return overrides.stopPipelineHandler?.(request, context) ?? create(ConsoleStopPipelineResponseSchema, {});
  });
  rpc(consoleGetPipelineServiceConfigSchema, () => create(ConsoleGetPipelineServiceConfigSchemaResponseSchema, {}));
}

function routeDataplaneRpcs({ rpc }: ConnectRouter, overrides: TransportOverrides = {}) {
  rpc(lintPipelineConfig, overrides.lintHandler ?? (() => create(LintPipelineConfigResponseSchema, {})));
  rpc(listComponents, overrides.listComponentsHandler ?? (() => create(ListComponentsResponseSchema, {})));
  rpc(getPipelineServiceConfigSchema, () => create(GetPipelineServiceConfigSchemaResponseSchema, {}));
}

function createTransport(overrides?: TransportOverrides) {
  const requests = pipelineRequests;
  return createRouterTransport((router) => {
    routeConsoleRpcs(router, requests, overrides);
    routeDataplaneRpcs(router, overrides);
  });
}

const secretRef = (secretName: string, key: string) => `\${secrets.${secretName}.${key}}`;

/** Logs its output in with the pipeline's service account, which the YAML itself doesn't carry. */
const SERVICE_ACCOUNT_LOGIN_YAML =
  'input:\n  stdin: {}\noutput:\n  redpanda:\n    topic: orders\n    sasl:\n      - mechanism: REDPANDA_CLOUD_SERVICE_ACCOUNT\n';

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

const setPipelineNameViaDialog = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('button', { name: /edit settings/iu }));
  const nameInput = await screen.findByPlaceholderText('Enter pipeline name');
  await user.clear(nameInput);
  await user.type(nameInput, name);
  await user.click(screen.getByRole('button', { name: /save settings/iu }));
  // Wait for the dialog to close so its "Save settings" button can't collide with the header's "Save".
  await waitFor(() => expect(screen.queryByPlaceholderText('Enter pipeline name')).not.toBeInTheDocument());
};

const REDPANDA_OUTPUT_YAML = 'input:\n  stdin: {}\noutput:\n  redpanda:\n    topic: orders\n';

const editablePipeline =
  (
    configYaml: string,
    overrides: { tags?: Record<string, string>; serviceAccount?: { clientId: string; clientSecret: string } } = {}
  ) =>
  () =>
    create(ConsoleGetPipelineResponseSchema, {
      response: create(GetPipelineResponseSchema, {
        pipeline: create(PipelineSchema, {
          id: 'test-pipeline',
          displayName: 'Test Pipeline',
          configYaml,
          state: Pipeline_State.STOPPED,
          resources: { cpuShares: '100m', memoryShares: '0' },
          tags: {},
          ...overrides,
        }),
      }),
    });

const addServiceAccountToOutput = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByTestId('add-user-output'));
  await submitServiceAccountLogin(user);
};

// What CreatePipeline answers with. The state is not incidental: the editor trusts the response
// over the flag it sent. Defaults to what a drafts-capable server returns.
const createdPipelineResponse = (id: string, state: Pipeline_State = Pipeline_State.DRAFT) =>
  create(ConsoleCreatePipelineResponseSchema, {
    response: create(CreatePipelineResponseSchema, { pipeline: create(PipelineSchema, { id, state }) }),
  });

const pipelineResponse = (
  overrides: Pick<MessageInitShape<typeof PipelineSchema>, 'state' | 'configYaml' | 'updateTime'>
) =>
  create(ConsoleGetPipelineResponseSchema, {
    response: create(GetPipelineResponseSchema, {
      pipeline: create(PipelineSchema, {
        id: 'test-pipeline',
        displayName: 'Test Pipeline',
        configYaml: 'input:\n  stdin: {}\noutput:\n  stdout: {}',
        state: Pipeline_State.RUNNING,
        resources: { cpuShares: '100m', memoryShares: '0' },
        tags: {},
        ...overrides,
      }),
    }),
  });

const invalidConfigError = () =>
  new ConnectError('invalid pipeline configuration', Code.InvalidArgument, undefined, [
    {
      desc: LintHintSchema,
      value: create(LintHintSchema, { line: 2, column: 1, hint: 'an explicit output type must be specified' }),
    },
  ]);

const DEPLOYED_YAML = 'input:\n  stdin: {}\noutput:\n  stdout: {}';

const openChanges = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('tab', { name: /unsaved changes/iu }));
};

const seedBuffer = (
  targetKey: string,
  configYaml: string,
  name = 'Test Pipeline',
  basedOnUpdateTime: number | null = null
) => {
  useRpcnEditorAutosaveStore.getState().save({
    targetKey,
    name,
    description: '',
    computeUnits: 1,
    tags: [],
    configYaml,
    basedOnUpdateTime,
  });
};

const pipelineAt = (updateTimeMs: number) =>
  create(ConsoleGetPipelineResponseSchema, {
    response: create(GetPipelineResponseSchema, {
      pipeline: create(PipelineSchema, {
        id: 'test-pipeline',
        displayName: 'Test Pipeline',
        configYaml: 'input:\n  stdin: {}\noutput:\n  stdout: {}',
        state: Pipeline_State.RUNNING,
        resources: { cpuShares: '100m', memoryShares: '0' },
        tags: {},
        updateTime: timestampFromMs(updateTimeMs),
      }),
    }),
  });

const transportWithUpdateTime = (updateTimeMs: number) =>
  createTransport({ getPipelineHandler: () => pipelineAt(updateTimeMs) });

const draftTransport = ({
  configYaml = 'input:\n  stdin: {}',
  ...overrides
}: {
  startPipelineHandler?: MethodImpl<typeof startPipeline>;
  configYaml?: string;
} = {}) =>
  createTransport({
    getPipelineHandler: () =>
      create(ConsoleGetPipelineResponseSchema, {
        response: create(GetPipelineResponseSchema, {
          pipeline: create(PipelineSchema, {
            id: 'test-pipeline',
            displayName: 'Test Pipeline',
            configYaml,
            state: Pipeline_State.DRAFT,
            resources: { cpuShares: '100m', memoryShares: '0' },
          }),
        }),
      }),
    ...overrides,
  });

const confirmStart = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByTestId('start-draft'));
  await user.click(await screen.findByTestId('confirm-start-draft'));
};

type UserSession = ReturnType<typeof userEvent.setup>;

function resetRouterMocks() {
  mockNavigate.mockClear();
  mockBack.mockClear();
  mockSearch.mockReturnValue({});
  mockBlocker.mockReturnValue({ status: 'idle', proceed: undefined, reset: undefined });
}

function resetPageEnvironment() {
  config.featureFlags = { ...initialConfig.featureFlags };
  for (const key of Object.keys(config.featureFlags) as FeatureFlagKey[]) {
    config.featureFlags[key] = false;
  }
  config.jwt = undefined;
  config.isServerless = false;
  useRpcnWizardStore.getState().reset();
  mockUsePipelineMode.mockReturnValue({ mode: 'create' });
  contentChangeListeners.length = 0;
  cursorPositionListeners.length = 0;
}

function resetPipelinePageMocks() {
  resetRouterMocks();
  resetPageEnvironment();
  pipelineRequests = emptyPipelineRequests();
}

afterEach(() => {
  toast.dismiss();
  Object.assign(config, initialConfig);
  useRpcnWizardStore.getState().reset();
});

function renderPipelinePage(mode: 'create' | 'edit' | 'view', overrides?: TransportOverrides) {
  mockUsePipelineMode.mockReturnValue(mode === 'create' ? { mode } : { mode, pipelineId: 'test-pipeline' });
  const user = userEvent.setup();
  return { user, ...render(<PipelinePage />, { transport: createTransport(overrides) }) };
}

function renderPipelineFromWizard(overrides?: TransportOverrides) {
  useRpcnWizardStore.getState().setYamlContent({ yamlContent: DEPLOYED_YAML });
  return renderPipelinePage('create', overrides);
}

const rerenderInMode = (rerender: (ui: React.ReactElement) => void, mode: 'edit' | 'view') => {
  mockUsePipelineMode.mockReturnValue({ mode, pipelineId: 'test-pipeline' });
  rerender(<PipelinePage />);
};

const typeConfig = (configYaml: string) =>
  fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: configYaml } });

const nameAndConfigure = async (user: UserSession, name: string, configYaml: string) => {
  await setPipelineNameViaDialog(user, name);
  typeConfig(configYaml);
};

const replaceLoadedConfig = async (next: string, loaded = DEPLOYED_YAML) => {
  await waitFor(() => expect((screen.getByTestId('yaml-editor') as HTMLTextAreaElement).value).toBe(loaded));
  typeConfig(next);
};

const saveAndCapturePipeline = async (user: UserSession, operation: 'createPipeline' | 'updatePipeline') => {
  await user.click(await screen.findByTestId('save-pipeline'));
  const sent = await waitFor(() => {
    const pipeline = pipelineRequests[operation][0]?.request?.pipeline;
    expect(pipeline).toBeDefined();
    return pipeline;
  });
  if (!sent) {
    throw new Error('Save request has no pipeline');
  }
  return sent;
};

const chooseSaveAndStart = async (user: UserSession) => {
  await user.click(screen.getByTestId('save-pipeline-options'));
  await user.click(await screen.findByRole('menuitem', { name: 'Save and start' }));
};

const toastMessages = (severity: 'error' | 'warning' | 'success') =>
  toast.getToasts().flatMap((entry) => ('type' in entry && entry.type === severity ? [entry.title] : []));

const expectToastInsteadOfSuccess = async (severity: 'error' | 'warning', expected: unknown) => {
  await waitFor(() => expect(toastMessages(severity)).toContainEqual(expected));
  expect(toastMessages('success')).toHaveLength(0);
};

const deployingCreate = (
  id = 'new-pipeline',
  stopPipelineHandler = () => create(ConsoleStopPipelineResponseSchema, {})
) => ({
  createPipelineHandler: () => createdPipelineResponse(id, Pipeline_State.STARTING),
  stopPipelineHandler,
});

function deferredUpdatePipeline() {
  let release: (() => void) | undefined;
  const updatePipelineHandler = () =>
    new Promise<MessageShape<typeof ConsoleUpdatePipelineResponseSchema>>((resolve) => {
      release = () => resolve(create(ConsoleUpdatePipelineResponseSchema, {}));
    });
  return { updatePipelineHandler, releaseUpdate: () => release?.() };
}

async function renameWhileSaveInFlight(state: Pipeline_State) {
  const { updatePipelineHandler, releaseUpdate } = deferredUpdatePipeline();
  const { user } = renderPipelinePage('edit', {
    getPipelineHandler: () => pipelineResponse({ state }),
    updatePipelineHandler,
  });
  const title = await screen.findByRole('textbox', { name: 'Pipeline name' });
  fireEvent.change(title, { target: { value: 'submitted-name' } });
  const sent = await saveAndCapturePipeline(user, 'updatePipeline');
  fireEvent.change(title, { target: { value: 'newer-unsaved-name' } });
  releaseUpdate();
  return { sent, title };
}

function renderCreatePageAwaitingDraftSample() {
  let answer: (() => void) | undefined;
  const listPipelinesHandler = () =>
    new Promise<MessageShape<typeof ConsoleListPipelinesResponseSchema>>((resolve) => {
      answer = () => resolve(listPipelinesResponse([DRAFT_ERA_PIPELINE]));
    });
  const createPipelineHandler = () => createdPipelineResponse('new-pipeline');
  const { user } = renderPipelinePage('create', { listPipelinesHandler, createPipelineHandler });
  return { user, answerSample: () => answer?.() };
}

function recordedNameLookups() {
  const requests: RequestFor<typeof listPipelines>[] = [];
  const listPipelinesHandler = routeNameLookups((req) => {
    requests.push(req);
    return listPipelinesResponse([]);
  });
  return { listPipelinesHandler, requests };
}

/** An untitled-name lookup held in flight until `releaseLookup` is called; the draft-support sample still answers. */
function pendingNameLookups() {
  let release: (() => void) | undefined;
  const listPipelinesHandler = routeNameLookups(
    () =>
      new Promise<MessageShape<typeof ConsoleListPipelinesResponseSchema>>((resolve) => {
        release = () => resolve(listPipelinesResponse([]));
      })
  );
  return { listPipelinesHandler, releaseLookup: () => release?.() };
}

async function refetchPipelineOnFocus() {
  focusManager.setFocused(false);
  focusManager.setFocused(true);
  try {
    await waitFor(() => expect(pipelineRequests.getPipeline.length).toBeGreaterThanOrEqual(2));
  } finally {
    focusManager.setFocused(undefined);
  }
}

const autosaveEntry = (targetKey: string) =>
  useRpcnEditorAutosaveStore.getState().entries.find((e) => e.targetKey === targetKey);

const openAddUserDialog = async (user: UserSession, section: 'input' | 'output') => {
  await user.click(await screen.findByTestId(`add-user-${section}`));
  await screen.findByTestId('add-user-step');
};

const submitServiceAccountLogin = async (user: UserSession) => {
  await user.click(await screen.findByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(screen.getByTestId('flow-canvas').getAttribute('data-configyaml')).toContain(
      'REDPANDA_CLOUD_SERVICE_ACCOUNT'
    )
  );
};

describe('the PipelinePage', () => {
  beforeEach(resetPipelinePageMocks);

  describe('lint panel', () => {
    it('lists deprecated components under the lint issues and marks them in the editor', async () => {
      const listComponentsHandler = () =>
        create(ListComponentsResponseSchema, {
          components: {
            inputs: [
              { name: 'kafka_franz', status: ComponentStatus.DEPRECATED },
              { name: 'redpanda', status: ComponentStatus.STABLE },
            ],
          },
        });
      render(<PipelinePage />, { transport: createTransport({ listComponentsHandler }) });

      act(() => {
        fireEvent.change(screen.getByTestId('yaml-editor'), {
          target: { value: 'input:\n  kafka_franz:\n    topics: [a]\noutput:\n  drop: {}' },
        });
      });

      expect(await screen.findByTestId('deprecated-component-list')).toHaveTextContent(
        'Line 2: kafka_franz is deprecated. Use the redpanda input instead.'
      );
      expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledWith(expect.anything(), 'rpcn-deprecation', [
        expect.objectContaining({ startLineNumber: 2, severity: 4, message: expect.stringContaining('redpanda') }),
      ]);
    });

    it('displays lint warnings from the backend as the user types YAML', async () => {
      const lintHandler = () =>
        create(LintPipelineConfigResponseSchema, {
          lintHints: [create(LintHintSchema, { line: 1, column: 1, hint: 'response lint warning' })],
        });

      render(<PipelinePage />, { transport: createTransport({ lintHandler }) });

      const yamlEditor = screen.getByTestId('yaml-editor');
      act(() => {
        fireEvent.change(yamlEditor, { target: { value: 'input:\n  stdin: {}' } });
      });

      expect(await screen.findByText('Line 1, Col 1: response lint warning')).toBeInTheDocument();
    });

    it('displays general warnings without line numbers', async () => {
      const lintHandler = () =>
        create(LintPipelineConfigResponseSchema, {
          lintHints: [create(LintHintSchema, { line: 0, column: 0, hint: 'general config warning' })],
        });

      render(<PipelinePage />, { transport: createTransport({ lintHandler }) });

      const yamlEditor = screen.getByTestId('yaml-editor');
      act(() => {
        fireEvent.change(yamlEditor, { target: { value: 'bad: yaml' } });
      });

      expect(await screen.findByText('general config warning')).toBeInTheDocument();
    });

    it('shows a count badge when multiple lint issues are found', async () => {
      const lintHandler = () =>
        create(LintPipelineConfigResponseSchema, {
          lintHints: [
            create(LintHintSchema, { line: 1, column: 1, hint: 'first warning' }),
            create(LintHintSchema, { line: 2, column: 1, hint: 'second warning' }),
          ],
        });

      render(<PipelinePage />, { transport: createTransport({ lintHandler }) });

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

    it('shows both save errors and real-time lint warnings when a save fails', async () => {
      const user = userEvent.setup();

      const lintHandler = () =>
        create(LintPipelineConfigResponseSchema, {
          lintHints: [create(LintHintSchema, { line: 3, column: 1, hint: 'response warning' })],
        });

      const createPipelineHandler = () => {
        throw new ConnectError('invalid config');
      };

      render(<PipelinePage />, { transport: createTransport({ createPipelineHandler, lintHandler }) });

      await setPipelineNameViaDialog(user, 'my-pipeline');

      typeConfig('input:\n  bad_config: {}');

      await waitFor(() => {
        expect(screen.getByText('Line 3, Col 1: response warning')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(screen.getByText(/invalid config/u)).toBeInTheDocument();
      });

      expect(screen.getByText('Line 3, Col 1: response warning')).toBeInTheDocument();
    });

    it('editing YAML after a failed save clears the stale error messages', async () => {
      const user = userEvent.setup();

      const lintHandler = () => create(LintPipelineConfigResponseSchema, { lintHints: [] });

      const createPipelineHandler = () => {
        throw new ConnectError('invalid config');
      };

      render(<PipelinePage />, { transport: createTransport({ createPipelineHandler, lintHandler }) });

      await nameAndConfigure(user, 'my-pipeline', 'input:\n  bad: {}');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(screen.getByText(/invalid config/u)).toBeInTheDocument();
      });

      typeConfig('input:\n  fixed: {}');

      await waitFor(() => {
        expect(screen.queryByText(/invalid config/u)).not.toBeInTheDocument();
      });
    });
  });

  describe('creating a pipeline', () => {
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

    it('cmd/Ctrl+S saves the pipeline instead of opening the browser save dialog', async () => {
      const user = userEvent.setup();

      render(<PipelinePage />, { transport: createTransport() });

      await setPipelineNameViaDialog(user, 'my-pipeline');
      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  generate: {}' } });

      fireEvent.keyDown(window, { key: 's', metaKey: true });

      await waitFor(() => {
        expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0);
      });
    });

    it('saving a new pipeline sends the name and YAML config to the backend', async () => {
      const user = userEvent.setup();

      render(<PipelinePage />, { transport: createTransport() });

      await nameAndConfigure(user, 'my-pipeline', 'input:\n  generate:\n    mapping: root = "hello"');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0);
      });

      expect(pipelineRequests.createPipeline[0]?.request?.pipeline).toMatchObject({
        displayName: 'my-pipeline',
        configYaml: 'input:\n  generate:\n    mapping: root = "hello"',
      });
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/rp-connect/new-pipeline' }));
    });

    it('lets the name be edited inline from the header title and submits it', async () => {
      const user = userEvent.setup();

      render(<PipelinePage />, { transport: createTransport() });

      fireEvent.change(screen.getByRole('textbox', { name: 'Pipeline name' }), { target: { value: 'inline-named' } });

      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  stdin: {}' } });
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0);
      });
      expect(pipelineRequests.createPipeline[0]?.request?.pipeline?.displayName).toBe('inline-named');
    });

    it('blocks saving a new pipeline with an invalid name and shows the error inline', async () => {
      const user = userEvent.setup();

      render(<PipelinePage />, { transport: createTransport() });

      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText(/at least 3 characters/iu)).toBeInTheDocument();
      expect(pipelineRequests.createPipeline).toHaveLength(0);
    });

    it("doesn't send an empty config to the backend, which would answer with a raw proto field error", async () => {
      const user = userEvent.setup();

      render(<PipelinePage />, { transport: createTransport() });

      await setPipelineNameViaDialog(user, 'my-pipeline');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(screen.getByTestId('save-pipeline')).toBeEnabled();
      });
      expect(pipelineRequests.createPipeline).toHaveLength(0);
    });
  });

  describe('view mode', () => {
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

      expect(await screen.findByRole('heading', { level: 1, name: 'Test Pipeline' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Pipeline view' })).not.toBeInTheDocument();
    });

    it('hydrates the sidebar structure tree from the pipeline config in view mode', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });
      enableFeatures('enablePipelineDiagrams', 'enableRpcnVisualEditor');
      config.jwt = 'embedded-test-session';

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => expect(screen.getByText('stdin')).toBeInTheDocument());
      expect(screen.getByText('stdout')).toBeInTheDocument();
      expect(screen.getAllByRole('tree').length).toBeGreaterThan(0);
    });

    it('shows the structure-tree side-lane even when the visual editor flag is off', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });
      enableFeatures('enablePipelineDiagrams');
      config.jwt = 'embedded-test-session';

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => expect(screen.getAllByRole('tree').length).toBeGreaterThan(0));
      expect(screen.queryByTestId('flow-canvas')).not.toBeInTheDocument();
    });

    it('view page exposes Monitor and YAML lanes; YAML shows the config read-only', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      expect(await screen.findByRole('tab', { name: 'YAML' })).toBeInTheDocument();
      expect(screen.queryByTestId('yaml-editor')).not.toBeInTheDocument();

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
      enableFeatures('enableRpcnVisualEditor', 'enablePipelineDiagrams');
      config.jwt = 'embedded-test-session';

      render(<PipelinePage />, { transport: createTransport() });

      await user.click(await screen.findByRole('tab', { name: 'Visual' }));

      const canvas = await screen.findByTestId('flow-canvas');
      expect(canvas.getAttribute('data-configyaml')).toBe('input:\n  stdin: {}\noutput:\n  stdout: {}');
    });

    it('confirms before stopping a running pipeline', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      await user.click(await screen.findByTestId('pipeline-stop'));

      expect(pipelineRequests.stopPipeline).toHaveLength(0);
      expect(await screen.findByText('Stop pipeline?')).toBeInTheDocument();

      await user.click(screen.getByTestId('confirm-stop-pipeline'));
      await waitFor(() => {
        expect(pipelineRequests.stopPipeline.length).toBeGreaterThan(0);
      });
    });
  });

  describe('sidebar and editor lanes', () => {
    it('restores and updates the existing fullscreen preference', async () => {
      localStorage.setItem('rp-pipeline-editor-mode', 'full');
      try {
        const { user } = renderPipelinePage('create');
        await user.click(await screen.findByRole('button', { name: 'Exit fullscreen' }));
        expect(localStorage.getItem('rp-pipeline-editor-mode')).toBe('boxed');
        await user.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
        expect(localStorage.getItem('rp-pipeline-editor-mode')).toBe('full');
      } finally {
        localStorage.removeItem('rp-pipeline-editor-mode');
      }
    });

    it('keeps the clicked tree row highlighted while its YAML is revealed in the editor', async () => {
      enableFeatures('enablePipelineDiagrams');
      config.jwt = 'embedded-test-session';

      const { user } = renderPipelinePage('create');

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

      expect(mockEditorInstance.setSelection).toHaveBeenCalled();
      expect(switchRow).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('treeitem', { name: 'log' })).toHaveAttribute('aria-selected', 'false');
    });

    it('offers a "Start from a template" entry in the sidebar visualizer while the pipeline is empty', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'create' });
      enableFeatures('enablePipelineDiagrams', 'enableRpcnVisualEditor', 'enableRpcnTemplateGallery');
      config.jwt = 'embedded-test-session';

      render(<PipelinePage />, { transport: createTransport() });

      // The template CTA lives alongside the YAML lane (not the default Visual lane), so switch there first.
      await user.click(await screen.findByRole('tab', { name: 'YAML' }));

      expect(await screen.findByTestId('browse-templates-cta')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('yaml-editor'), {
        target: { value: 'input:\n  generate:\n    mapping: root = {}' },
      });
      await waitFor(() => expect(screen.queryByTestId('browse-templates-cta')).not.toBeInTheDocument());
    });

    it('opens editing on the Visual lane when the visual editor is enabled, and YAML swaps in the editor', async () => {
      const user = userEvent.setup();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
      enableFeatures('enableRpcnVisualEditor', 'enablePipelineDiagrams');
      config.jwt = 'embedded-test-session';

      render(<PipelinePage />, { transport: createTransport() });

      expect(await screen.findByTestId('flow-canvas')).toBeInTheDocument();
      expect(screen.queryByTestId('yaml-editor')).not.toBeInTheDocument();

      await user.click(await screen.findByRole('tab', { name: 'YAML' }));
      expect(await screen.findByTestId('yaml-editor')).toBeInTheDocument();
    });

    it('clicking a sidebar variable button opens the command menu with the correct filter', async () => {
      const user = userEvent.setup();
      render(<PipelinePage />, { transport: createTransport() });

      const variablesButton = screen.getByRole('button', { name: /variables/iu });
      await user.click(variablesButton);

      await waitFor(() => {
        expect(screen.getByTestId('command-menu')).toBeInTheDocument();
        expect(screen.getByTestId('command-menu-filter')).toHaveTextContent('variables');
      });
    });

    it('typing / in the editor dismisses an open command menu to avoid overlap', async () => {
      const user = userEvent.setup();
      enableFeatures('enableConnectSlashMenu');

      render(<PipelinePage />, { transport: createTransport() });

      // Wait for the editor mock to mount so useSlashCommand subscribes.
      await waitFor(() => {
        expect(contentChangeListeners.length).toBeGreaterThan(0);
      });

      const secretsButton = screen.getByRole('button', { name: /secrets/iu });
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
  });

  describe('feature flags and mode routing', () => {
    it('shows the slash-command tip in the editor tips bar when the feature is enabled', async () => {
      enableFeatures('enableConnectSlashMenu');

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => {
        expect(screen.getByText(/to insert variables/u)).toBeInTheDocument();
      });
    });

    it('omits the slash-command tip when the feature is disabled', async () => {
      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => {
        expect(screen.getByTestId('yaml-editor')).toBeInTheDocument();
      });

      expect(screen.queryByText(/to insert variables/u)).not.toBeInTheDocument();
    });

    it('uses the new log explorer when the feature flag is enabled', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });
      enableFeatures('enableNewPipelineLogs');

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => {
        expect(screen.getByTestId('log-explorer')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('logs-tab')).not.toBeInTheDocument();
    });

    it('uses the legacy logs tab when the new log explorer flag is off', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => {
        expect(screen.getByTestId('logs-tab')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('log-explorer')).not.toBeInTheDocument();
    });

    it('opening a pipeline in edit mode pre-fills the name and YAML from the server', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: 'Pipeline name' })).toHaveValue('Test Pipeline');
      });

      const yamlEditor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
      await waitFor(() => {
        expect(yamlEditor.value).toBe('input:\n  stdin: {}\noutput:\n  stdout: {}');
      });
    });
  });

  // The node's Add user action writes the component's login into the YAML; whatever that login needs
  // outside the YAML has to reach the save as well.
  describe('add user quick action', () => {
    beforeEach(() => {
      enableFeatures('enableRpcnVisualEditor', 'enablePipelineDiagrams');
      config.jwt = 'embedded-test-session';
      userStep.props = {};
      userStep.submission = {
        authMethod: 'service-account',
        serviceAccountName: 'orders-sa',
        serviceAccountId: 'sa-123',
        serviceAccountSecretName: 'ORDERS_SA',
      };
    });

    describe('the service account it attaches', () => {
      // Connect's service-account login uses the pipeline's account, so without it the component
      // cannot authenticate at all.
      it('attaches the service account it created to the pipeline being edited', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, {
          transport: createTransport({ getPipelineHandler: editablePipeline(REDPANDA_OUTPUT_YAML) }),
        });

        await addServiceAccountToOutput(user);
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.updatePipeline.length).toBeGreaterThan(0));
        const sent = pipelineRequests.updatePipeline[0]?.request?.pipeline;
        expect(sent?.serviceAccount).toMatchObject({
          clientId: secretRef('ORDERS_SA', 'client_id'),
          clientSecret: secretRef('ORDERS_SA', 'client_secret'),
        });
        expect(sent?.tags).toMatchObject({ rp_cloud_service_account_id: 'sa-123', rp_cloud_secret_id: 'ORDERS_SA' });
      });

      // The save already read the account, so the edits it leaves behind must carry the new one.
      it('keeps an account attached during an in-flight save recoverable', async () => {
        const { updatePipelineHandler, releaseUpdate } = deferredUpdatePipeline();
        const { user } = renderPipelinePage('edit', {
          getPipelineHandler: editablePipeline(REDPANDA_OUTPUT_YAML),
          updatePipelineHandler,
        });

        await user.click(await screen.findByTestId('save-pipeline'));
        await waitFor(() => expect(pipelineRequests.updatePipeline.length).toBeGreaterThan(0));
        await addServiceAccountToOutput(user);
        releaseUpdate();

        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/rp-connect/test-pipeline' }));
        expect(autosaveEntry('test-pipeline')?.serviceAccount).toEqual({
          serviceAccountId: 'sa-123',
          secretName: 'ORDERS_SA',
        });
      });

      it("keeps the pipeline's own service account rather than creating another", async () => {
        const existingLogin = {
          serviceAccount: {
            clientId: secretRef('EXISTING_SA', 'client_id'),
            clientSecret: secretRef('EXISTING_SA', 'client_secret'),
          },
          tags: { rp_cloud_service_account_id: 'sa-existing', rp_cloud_secret_id: 'EXISTING_SA' },
        };
        userStep.submission = { authMethod: 'service-account', existing: true };

        const { user } = renderPipelinePage('edit', {
          getPipelineHandler: editablePipeline(REDPANDA_OUTPUT_YAML, existingLogin),
        });

        await openAddUserDialog(user, 'output');
        expect(userStep.props.hasServiceAccount).toBe(true);
        await submitServiceAccountLogin(user);

        const sent = await saveAndCapturePipeline(user, 'updatePipeline');
        expect(sent?.serviceAccount).toMatchObject(existingLogin.serviceAccount);
        expect(sent.tags).toMatchObject(existingLogin.tags);
      });

      it('offers the account it attached to the next component', async () => {
        const { user } = renderPipelinePage('edit', { getPipelineHandler: editablePipeline(REDPANDA_OUTPUT_YAML) });

        await openAddUserDialog(user, 'output');
        expect(userStep.props.hasServiceAccount).toBe(false);
        await user.click(screen.getByRole('button', { name: 'Add' }));
        await waitFor(() => expect(screen.queryByTestId('add-user-step')).not.toBeInTheDocument());

        await openAddUserDialog(user, 'input');
        expect(userStep.props.hasServiceAccount).toBe(true);
      });

      // The YAML only names the login mechanism, so recovering it without the account restores a
      // config that can't log in.
      it('keeps the account it attached in the recovery buffer', async () => {
        const user = userEvent.setup();
        localStorage.clear();
        useRpcnEditorAutosaveStore.getState().refresh();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, {
          transport: createTransport({ getPipelineHandler: editablePipeline(REDPANDA_OUTPUT_YAML) }),
        });

        await addServiceAccountToOutput(user);
        await waitFor(
          () =>
            expect(rpcnEditorAutosave.get('test-pipeline')?.serviceAccount).toEqual({
              serviceAccountId: 'sa-123',
              secretName: 'ORDERS_SA',
            }),
          { timeout: AUTOSAVE_DEBOUNCE_MS + 2000 }
        );
      });

      it("won't deploy a config that logs in with a service account the pipeline doesn't have", async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, {
          transport: createTransport({
            getPipelineHandler: editablePipeline(SERVICE_ACCOUNT_LOGIN_YAML),
          }),
        });

        await screen.findByTestId('flow-canvas');
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(toastMessages('error')).toContainEqual(MISSING_SERVICE_ACCOUNT_MESSAGE));
        expect(pipelineRequests.updatePipeline).toHaveLength(0);
      });

      it('attaches the service account it created to a new pipeline', async () => {
        const createPipelineHandler = () => createdPipelineResponse('new-pipeline', Pipeline_State.STOPPED);
        const { user } = renderPipelinePage('create', { createPipelineHandler });

        await setPipelineNameViaDialog(user, 'orders');
        await user.click(await screen.findByRole('tab', { name: 'YAML' }));
        fireEvent.change(await screen.findByTestId('yaml-editor'), { target: { value: REDPANDA_OUTPUT_YAML } });
        await user.click(screen.getByRole('tab', { name: 'Visual' }));
        await addServiceAccountToOutput(user);

        const sent = await saveAndCapturePipeline(user, 'createPipeline');
        expect(sent?.serviceAccount).toMatchObject({ clientId: secretRef('ORDERS_SA', 'client_id') });
        expect(sent?.tags).toMatchObject({ rp_cloud_service_account_id: 'sa-123', rp_cloud_secret_id: 'ORDERS_SA' });
      });
    });

    describe('the topic and consumer group it grants', () => {
      // A user added before its topic gets no topic ACL, and adding the topic later grants nothing.
      it.each([
        ['has no topic yet', 'output:\n  redpanda: {}\n', true],
        ['already names its topic', REDPANDA_OUTPUT_YAML, false],
      ])('warns about topic access only when the component %s', async (_case, configYaml, warns) => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, { transport: createTransport({ getPipelineHandler: editablePipeline(configYaml) }) });

        await user.click(await screen.findByTestId('add-user-output'));
        await screen.findByTestId('add-user-step');
        expect(Boolean(screen.queryByText('No topic yet'))).toBe(warns);
        expect(userStep.props.topicAccess).toBe('write');
      });

      it('starts the dialog from the consumer group the input reads with', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, {
          transport: createTransport({
            getPipelineHandler: editablePipeline(
              'input:\n  redpanda:\n    topics: [orders]\n    consumer_group: orders-readers\noutput:\n  stdout: {}\n'
            ),
          }),
        });

        await user.click(await screen.findByTestId('add-user-input'));
        await screen.findByTestId('add-user-step');
        expect(userStep.props).toMatchObject({
          defaultConsumerGroup: 'orders-readers',
          showConsumerGroupFields: true,
          topicAccess: 'read',
          pipelineName: 'Test Pipeline',
        });
      });

      it('reads as the consumer group the dialog granted', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
        userStep.submission = { username: 'orders-reader', saslMechanism: 'SCRAM-SHA-256', consumerGroup: 'orders-v2' };

        render(<PipelinePage />, {
          transport: createTransport({
            getPipelineHandler: editablePipeline(
              'input:\n  redpanda:\n    topics: [orders]\n    consumer_group: orders-readers\noutput:\n  stdout: {}\n'
            ),
          }),
        });

        await user.click(await screen.findByTestId('add-user-input'));
        await user.click(await screen.findByRole('button', { name: 'Add' }));

        await waitFor(() =>
          expect(screen.getByTestId('flow-canvas').getAttribute('data-configyaml')).toContain(
            'consumer_group: orders-v2'
          )
        );
      });
    });
  });
});

describe('pipelinePage saving and recovering work', () => {
  beforeEach(resetPipelinePageMocks);

  describe('drafts and save semantics', () => {
    beforeEach(() => {
      localStorage.clear();
      useRpcnEditorAutosaveStore.getState().refresh();
      enableFeatures('enableRpcnPipelineDrafts');
    });

    // Unset egress leaves the stored gateways alone, so a save that never touched them must not send one.
    it("keeps the pipeline's egress gateways on a save that doesn't change them", async () => {
      const getPipelineHandler = () =>
        create(ConsoleGetPipelineResponseSchema, {
          response: create(GetPipelineResponseSchema, {
            pipeline: create(PipelineSchema, {
              id: 'test-pipeline',
              displayName: 'Test Pipeline',
              configYaml: DEPLOYED_YAML,
              state: Pipeline_State.STOPPED,
              resources: { cpuShares: '100m', memoryShares: '0' },
              egress: { gatewayRefs: [{ id: 'dbpir6fk67oc73abpae0' }] },
            }),
          }),
        });
      const { user } = renderPipelinePage('edit', { getPipelineHandler });

      await replaceLoadedConfig('input:\n  stdin: {}\noutput:\n  drop: {}\n');
      const sent = await saveAndCapturePipeline(user, 'updatePipeline');

      expect(sent.egress).toBeUndefined();
    });

    // BYOC infers its gateway refs from the config, so a save without the picker must never send egress,
    // even when restored work names different gateways from the stored ones.
    it('never sends egress from a save without the egress gateway picker', async () => {
      const getPipelineHandler = () =>
        create(ConsoleGetPipelineResponseSchema, {
          response: create(GetPipelineResponseSchema, {
            pipeline: create(PipelineSchema, {
              id: 'test-pipeline',
              displayName: 'Test Pipeline',
              configYaml: DEPLOYED_YAML,
              state: Pipeline_State.STOPPED,
              resources: { cpuShares: '100m', memoryShares: '0' },
              egress: { gatewayRefs: [{ id: 'dbpir6fk67oc73abpae0' }] },
            }),
          }),
        });
      useRpcnEditorAutosaveStore.getState().save({
        targetKey: 'test-pipeline',
        name: 'Test Pipeline',
        description: '',
        computeUnits: 1,
        tags: [],
        configYaml: 'input:\n  stdin: {}\noutput:\n  drop: {}\n',
        egressGatewayIds: [],
      });
      const { user } = renderPipelinePage('edit', { getPipelineHandler });

      await user.click(await screen.findByTestId('restore-autosave'));
      const sent = await saveAndCapturePipeline(user, 'updatePipeline');

      expect(sent.egress).toBeUndefined();
    });

    describe('whether a draft is offered', () => {
      it('leads with Save draft on a new pipeline, and stores it without deploying', async () => {
        const createPipelineHandler = () => createdPipelineResponse('new-pipeline');
        const { user } = renderPipelinePage('create', { createPipelineHandler });

        await nameAndConfigure(user, 'my-pipeline', 'input:\n  stdin: {}');

        expect(screen.getByTestId('save-pipeline')).toHaveTextContent('Save draft');
        const sent = await saveAndCapturePipeline(user, 'createPipeline');

        expect(sent.draft).toBe(true);
        expect(pipelineRequests.stopPipeline).toHaveLength(0);
        // Parking work keeps the editor open, now bound to the draft so the next save updates it rather
        // than forking a second one.
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/rp-connect/new-pipeline/edit' }));
      });

      it("saves a draft that logs in with a service account the pipeline doesn't have yet", async () => {
        const createPipelineHandler = () => createdPipelineResponse('new-pipeline');
        const { user } = renderPipelinePage('create', { createPipelineHandler });

        await nameAndConfigure(user, 'my-pipeline', SERVICE_ACCOUNT_LOGIN_YAML);

        await chooseSaveAndStart(user);
        await waitFor(() => expect(toastMessages('error')).toContainEqual(MISSING_SERVICE_ACCOUNT_MESSAGE));
        expect(pipelineRequests.createPipeline).toHaveLength(0);

        const sent = await saveAndCapturePipeline(user, 'createPipeline');
        expect(sent.draft).toBe(true);
      });

      // A console backend that predates drafts drops `draft` on the way in and `create_time` on the way
      // out, so a pipeline without the latter means a draft save would deploy.
      it('offers no draft when the console backend predates drafts', async () => {
        const user = userEvent.setup();
        const listPipelinesHandler = () =>
          listPipelinesResponse([create(PipelineSchema, { id: 'p1', displayName: 'Old pipeline' })]);

        render(<PipelinePage />, { transport: createTransport({ listPipelinesHandler }) });

        await setPipelineNameViaDialog(user, 'my-pipeline');
        await waitFor(() => expect(pipelineRequests.listPipelines.length).toBeGreaterThan(0));
        expect(screen.getByTestId('save-pipeline')).toHaveTextContent(/^Save$/u);
      });

      // A brand-new cluster has no pipeline to lend an answer, and hiding drafts there would hide them
      // from every first pipeline.
      it('offers a draft on a cluster with no pipelines yet', async () => {
        const user = userEvent.setup();
        const listPipelinesHandler = () => listPipelinesResponse([]);

        render(<PipelinePage />, { transport: createTransport({ listPipelinesHandler }) });

        await setPipelineNameViaDialog(user, 'my-pipeline');
        await waitFor(() => expect(screen.getByTestId('save-pipeline')).toHaveTextContent('Save draft'));
      });

      // Unknown support must not turn the primary save into one that deploys.
      it('offers a draft when the sample fails', async () => {
        const user = userEvent.setup();
        const listPipelinesHandler = () => {
          throw new ConnectError('unavailable', Code.Unavailable);
        };

        render(<PipelinePage />, { transport: createTransport({ listPipelinesHandler }) });

        await setPipelineNameViaDialog(user, 'my-pipeline');
        await waitFor(() => expect(screen.getByTestId('save-pipeline')).toHaveTextContent('Save draft'), {
          timeout: 5000,
        });
      });

      // Until the sample answers, the primary save would deploy, so a quick click or ⌘S has to wait.
      it('holds save until it knows whether the cluster can store drafts', async () => {
        const { user, answerSample } = renderCreatePageAwaitingDraftSample();

        await nameAndConfigure(user, 'my-pipeline', 'input:\n  generate: {}');
        await waitFor(() => expect(pipelineRequests.listPipelines.length).toBeGreaterThan(0));
        expect(screen.getByTestId('save-pipeline')).toBeDisabled();
        fireEvent.keyDown(window, { key: 's', metaKey: true });

        answerSample();
        await waitFor(() => expect(screen.getByTestId('save-pipeline')).toBeEnabled());
        expect(screen.getByTestId('save-pipeline')).toHaveTextContent('Save draft');
        expect(pipelineRequests.createPipeline).toHaveLength(0);
      });
    });

    describe('a create that comes back deployed', () => {
      // The flag can be on before the API that understands it has rolled out, in which case `draft` is
      // dropped in transit and the pipeline deploys for real. Never report that as a parked draft, and
      // do not leave the deployment running on the strength of a toast the user may not read.
      it('stops a create that came back deployed instead of drafted', async () => {
        const { createPipelineHandler, stopPipelineHandler } = deployingCreate();
        const { user } = renderPipelinePage('create', { createPipelineHandler, stopPipelineHandler });

        await nameAndConfigure(user, 'my-pipeline', 'input:\n  stdin: {}');
        const sent = await saveAndCapturePipeline(user, 'createPipeline');

        expect(sent.draft).toBe(true);
        await waitFor(() => expect(pipelineRequests.stopPipeline.length).toBeGreaterThan(0));
        expect(pipelineRequests.stopPipeline[0]?.request?.id).toBe('new-pipeline');
        await expectToastInsteadOfSuccess('error', DRAFT_UNSUPPORTED_STOPPED_MESSAGE);
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/rp-connect/new-pipeline' }));
        expect(mockNavigate).not.toHaveBeenCalledWith({ to: '/rp-connect/new-pipeline/edit' });
      });

      // Nothing else can park it, so the copy has to hand the job back to the user.
      it('tells the user to stop it when the follow-up stop fails', async () => {
        const { createPipelineHandler, stopPipelineHandler } = deployingCreate('new-pipeline', () => {
          throw new ConnectError('nope', Code.Unavailable);
        });
        const { user } = renderPipelinePage('create', { createPipelineHandler, stopPipelineHandler });

        await nameAndConfigure(user, 'my-pipeline', 'input:\n  stdin: {}');
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.stopPipeline.length).toBeGreaterThan(0));
        await expectToastInsteadOfSuccess('error', DRAFT_UNSUPPORTED_MESSAGE);
      });

      // No id to aim the stop at, so it never runs — the copy must not claim the deployment was parked.
      it('does not claim it stopped a deployment it could not address', async () => {
        const { createPipelineHandler, stopPipelineHandler } = deployingCreate('');
        const { user } = renderPipelinePage('create', { createPipelineHandler, stopPipelineHandler });

        await nameAndConfigure(user, 'my-pipeline', 'input:\n  stdin: {}');
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0));
        expect(pipelineRequests.stopPipeline).toHaveLength(0);
        await expectToastInsteadOfSuccess('error', DRAFT_UNSUPPORTED_MESSAGE);
      });
    });

    describe('saving from the editor', () => {
      it('stays in the editor when a draft is saved from its own page', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, {
          transport: createTransport({
            getPipelineHandler: () => pipelineResponse({ state: Pipeline_State.DRAFT }),
          }),
        });

        fireEvent.change(await screen.findByTestId('yaml-editor'), { target: { value: 'input:\n  more_work' } });
        await user.click(await screen.findByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.updatePipeline.length).toBeGreaterThan(0));
        expect(mockNavigate).not.toHaveBeenCalled();
      });

      // The settings stay editable while the request is in flight, so what is on screen when it
      // resolves can hold an edit the request never carried.
      it('keeps a setting typed while the save was in flight unsaved', async () => {
        const { sent, title } = await renameWhileSaveInFlight(Pipeline_State.DRAFT);
        expect(sent.displayName).toBe('submitted-name');

        await waitFor(() => expect(toastMessages('success').length).toBeGreaterThan(0));
        expect(title).toHaveValue('newer-unsaved-name');
        await waitFor(() => expect(lastShouldBlockFn()()).toBe(true));
        expect(autosaveEntry('test-pipeline')?.name).toBe('newer-unsaved-name');
      });

      // A save that navigates unmounts the editor, so the debounced write never runs and the edit has
      // to be stored as part of the save itself.
      it('keeps an in-flight settings edit recoverable when the save navigates away', async () => {
        await renameWhileSaveInFlight(Pipeline_State.STOPPED);

        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/rp-connect/test-pipeline' }));
        expect(autosaveEntry('test-pipeline')?.name).toBe('newer-unsaved-name');
      });
    });

    describe('parking unfinished work', () => {
      it.each([
        ['a half-written config', 'input:\n  kafka_'],
        ['a config the linter rejects', 'input:\n  stdin: {}'],
        ['an empty config', ''],
      ])('saves %s as a draft', async (_name, configYaml) => {
        const user = userEvent.setup();
        const createPipelineHandler = () => createdPipelineResponse('new-pipeline');

        render(<PipelinePage />, { transport: createTransport({ createPipelineHandler }) });

        await setPipelineNameViaDialog(user, 'work-in-progress');
        fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: configYaml } });
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0));
        const sent = pipelineRequests.createPipeline[0]?.request?.pipeline;
        expect(sent?.draft).toBe(true);
        expect(sent?.configYaml).toBe(configYaml);
      });

      // "Save draft" is the primary button, so a curious click lands on it. Parking an untouched page
      // would spend one of the cluster's pipeline slots on nothing, and there is no work to protect.
      it('refuses to park a create page with nothing on it, and says what would make it savable', async () => {
        const user = userEvent.setup();
        const createPipelineHandler = () => createdPipelineResponse('new-pipeline');

        render(<PipelinePage />, { transport: createTransport({ createPipelineHandler }) });

        fireEvent.change(await screen.findByTestId('yaml-editor'), { target: { value: '' } });
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() =>
          expect(toastMessages('error')).toContainEqual(expect.stringMatching(/nothing to save yet/iu))
        );
        expect(toastMessages('error')).toContainEqual(expect.stringMatching(/add a name or some configuration/iu));
        expect(pipelineRequests.createPipeline).toHaveLength(0);
      });

      it('parks a named draft with no configuration at all', async () => {
        const user = userEvent.setup();
        const createPipelineHandler = () => createdPipelineResponse('new-pipeline');

        render(<PipelinePage />, { transport: createTransport({ createPipelineHandler }) });

        fireEvent.change(await screen.findByTestId('yaml-editor'), { target: { value: '' } });
        fireEvent.change(screen.getByLabelText('Pipeline name'), { target: { value: 'orders v2 idea' } });
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0));
        expect(pipelineRequests.createPipeline[0]?.request?.pipeline?.displayName).toBe('orders v2 idea');
      });

      it('names an unnamed draft rather than refusing to save it', async () => {
        const user = userEvent.setup();
        const createPipelineHandler = () => createdPipelineResponse('new-pipeline');

        render(<PipelinePage />, { transport: createTransport({ createPipelineHandler }) });

        fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  kafka_' } });
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0));
        expect(pipelineRequests.createPipeline[0]?.request?.pipeline?.displayName).toBe('Untitled pipeline');
      });

      // Narrow, and at save time rather than on mount: the unfiltered list drains every page, and as a
      // query this lookup would share the list's one cache entry (the input never reaches the query key,
      // see `useListPipelinesQuery`) and replace the list with its filtered result.
      it('looks up untitled names only when saving, with a narrow request', async () => {
        const createPipelineHandler = () => createdPipelineResponse('new-pipeline');
        const { listPipelinesHandler, requests } = recordedNameLookups();
        const { user } = renderPipelinePage('create', { createPipelineHandler, listPipelinesHandler });

        fireEvent.change(await screen.findByTestId('yaml-editor'), { target: { value: 'input:\n  kafka_' } });
        expect(requests).toHaveLength(0);

        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(requests.length).toBeGreaterThan(0));
        const dataplaneRequest = requests[0]?.request;
        expect(dataplaneRequest?.filter).toMatchObject({ nameContains: 'Untitled pipeline', includeDrafts: true });
        expect(dataplaneRequest?.pageSize).toBe(100);
      });

      it('numbers an unnamed draft against the names already taken', async () => {
        const user = userEvent.setup();
        const createPipelineHandler = () => createdPipelineResponse('new-pipeline');
        const listPipelinesHandler = routeNameLookups(() =>
          listPipelinesResponse([create(PipelineSchema, { id: 'p1', displayName: 'Untitled pipeline' })])
        );

        render(<PipelinePage />, { transport: createTransport({ createPipelineHandler, listPipelinesHandler }) });

        fireEvent.change(await screen.findByTestId('yaml-editor'), { target: { value: 'input:\n  kafka_' } });
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0));
        expect(pipelineRequests.createPipeline[0]?.request?.pipeline?.displayName).toBe('Untitled pipeline 2');
      });

      // The lookup runs before any mutation is pending, so nothing else marks the button busy.
      it('shows the save as busy while the untitled name is being looked up', async () => {
        const { listPipelinesHandler, releaseLookup } = pendingNameLookups();
        const createPipelineHandler = () => createdPipelineResponse('new-pipeline');
        const { user } = renderPipelinePage('create', { createPipelineHandler, listPipelinesHandler });

        fireEvent.change(await screen.findByTestId('yaml-editor'), { target: { value: 'input:\n  kafka_' } });
        const saveButton = screen.getByTestId('save-pipeline');
        await user.click(saveButton);

        await waitFor(() => expect(saveButton).toBeDisabled());
        expect(pipelineRequests.createPipeline).toHaveLength(0);

        releaseLookup();
        await waitFor(() => expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0));
      });

      // Numbering is a nicety; duplicate display names are legal. Losing the work is not an option.
      it('still saves the draft when the name lookup fails', async () => {
        const user = userEvent.setup();
        const createPipelineHandler = () => createdPipelineResponse('new-pipeline');
        const listPipelinesHandler = routeNameLookups(() => {
          throw new ConnectError('list unavailable', Code.Unavailable);
        });

        render(<PipelinePage />, { transport: createTransport({ createPipelineHandler, listPipelinesHandler }) });

        fireEvent.change(await screen.findByTestId('yaml-editor'), { target: { value: 'input:\n  kafka_' } });
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0));
        expect(pipelineRequests.createPipeline[0]?.request?.pipeline?.displayName).toBe('Untitled pipeline');
      });
    });

    describe('saving and starting', () => {
      it('"Save and start" on a new pipeline deploys it for real', async () => {
        const { createPipelineHandler, stopPipelineHandler } = deployingCreate();
        const { user } = renderPipelinePage('create', { createPipelineHandler, stopPipelineHandler });

        await nameAndConfigure(user, 'my-pipeline', 'input:\n  stdin: {}');

        await chooseSaveAndStart(user);

        await waitFor(() => expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0));
        expect(pipelineRequests.createPipeline[0]?.request?.pipeline?.draft).toBe(false);
        await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
        expect(pipelineRequests.stopPipeline).toHaveLength(0);
      });

      // Blocked client-side rather than round-tripping to be told there is no pipeline to run. The copy
      // itself is covered in save-actions.test.ts; toasts aren't mounted in this harness.
      it("won't start an empty pipeline", async () => {
        const user = userEvent.setup();

        render(<PipelinePage />, { transport: createTransport() });

        await setPipelineNameViaDialog(user, 'my-pipeline');
        await chooseSaveAndStart(user);

        await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Save and start' })).not.toBeInTheDocument());
        expect(pipelineRequests.createPipeline).toHaveLength(0);
        expect(mockNavigate).not.toHaveBeenCalled();
      });

      it('says on the button that saving a running pipeline restarts it', async () => {
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, { transport: createTransport() });

        await waitFor(() => expect(screen.getByTestId('save-pipeline')).toHaveTextContent('Apply and restart'));
      });

      it('offers to start a stopped pipeline as part of saving it', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, {
          transport: createTransport({
            getPipelineHandler: () => pipelineResponse({ state: Pipeline_State.STOPPED }),
          }),
        });

        await screen.findByTestId('save-pipeline-options');

        await chooseSaveAndStart(user);

        await waitFor(() => expect(pipelineRequests.startPipeline.length).toBeGreaterThan(0));
        expect(pipelineRequests.startPipeline[0]?.request?.id).toBe('test-pipeline');
      });
    });

    describe('without server-side drafts', () => {
      // Without server-side drafts there is nowhere to park work, so create keeps its old shape:
      // deployed, then stopped.
      it('falls back to deploy-then-stop when drafts are unavailable', async () => {
        config.featureFlags.enableRpcnPipelineDrafts = false;
        const { createPipelineHandler, stopPipelineHandler } = deployingCreate();
        const { user } = renderPipelinePage('create', { createPipelineHandler, stopPipelineHandler });

        await nameAndConfigure(user, 'my-pipeline', 'input:\n  stdin: {}');

        expect(screen.getByTestId('save-pipeline')).toHaveTextContent('Save');
        expect(screen.getByTestId('save-pipeline')).not.toHaveTextContent('Save draft');
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.stopPipeline.length).toBeGreaterThan(0));
        expect(pipelineRequests.createPipeline[0]?.request?.pipeline?.draft).toBe(false);
      });

      // Nothing to aim a stop at, so the deployment stands and the copy must say so.
      it('does not claim a create it could never stop is parked', async () => {
        config.featureFlags.enableRpcnPipelineDrafts = false;
        const { createPipelineHandler, stopPipelineHandler } = deployingCreate('');
        const { user } = renderPipelinePage('create', { createPipelineHandler, stopPipelineHandler });

        await nameAndConfigure(user, 'my-pipeline', 'input:\n  stdin: {}');
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(toastMessages('warning')).toContainEqual(expect.stringMatching(/may be running/iu)));
        expect(pipelineRequests.stopPipeline).toHaveLength(0);
        expect(toastMessages('success')).toHaveLength(0);
      });

      it('does not claim success when the pipeline it created could not be stopped', async () => {
        config.featureFlags.enableRpcnPipelineDrafts = false;
        const { createPipelineHandler, stopPipelineHandler } = deployingCreate('new-pipeline', () => {
          throw new ConnectError('pipeline is not running', Code.Internal);
        });
        const { user } = renderPipelinePage('create', { createPipelineHandler, stopPipelineHandler });

        await nameAndConfigure(user, 'my-pipeline', 'input:\n  stdin: {}');
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.stopPipeline.length).toBeGreaterThan(0));
        await expectToastInsteadOfSuccess('warning', expect.stringMatching(/may be running/iu));
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/rp-connect/new-pipeline' }));
      });
    });

    describe('editing a draft', () => {
      it('editing a draft keeps it a draft, and says so', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, {
          transport: createTransport({
            getPipelineHandler: () => pipelineResponse({ state: Pipeline_State.DRAFT }),
          }),
        });

        const saveButton = await screen.findByTestId('save-pipeline');
        await waitFor(() => expect(saveButton).toHaveTextContent('Save draft'));

        fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  still_broken' } });
        await user.click(saveButton);

        await waitFor(() => expect(pipelineRequests.updatePipeline.length).toBeGreaterThan(0));
        expect(pipelineRequests.updatePipeline[0]?.request?.pipeline?.draft).toBe(true);
      });

      it('reports a draft update that came back deployed, and hands over to the pipeline page', async () => {
        const updatePipelineHandler = () =>
          create(ConsoleUpdatePipelineResponseSchema, {
            response: create(UpdatePipelineResponseSchema, {
              pipeline: create(PipelineSchema, { id: 'test-pipeline', state: Pipeline_State.STOPPED }),
            }),
          });
        const { user } = renderPipelinePage('edit', {
          getPipelineHandler: () => pipelineResponse({ state: Pipeline_State.DRAFT }),
          updatePipelineHandler,
        });

        const saveButton = await screen.findByTestId('save-pipeline');
        await waitFor(() => expect(saveButton).toHaveTextContent('Save draft'));
        typeConfig('input:\n  edited: {}');
        await user.click(saveButton);

        await expectToastInsteadOfSuccess('error', DRAFT_UPDATE_UNSUPPORTED_MESSAGE);
        // Not a draft any more, so the editor's next save would deploy too.
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/rp-connect/test-pipeline' }));
      });

      it('round-trips a partial config through the editor unchanged', async () => {
        const partialConfig = 'input:\n  kafka_\n# where was I\noutput:';
        const { user } = renderPipelinePage('edit', {
          getPipelineHandler: () => pipelineResponse({ state: Pipeline_State.DRAFT, configYaml: partialConfig }),
        });

        const yamlEditor = (await screen.findByTestId('yaml-editor')) as HTMLTextAreaElement;
        await waitFor(() => expect(yamlEditor.value).toBe(partialConfig));
        // Nothing to save yet: reopening a draft is not an edit of it. Scoped to the status pill — the
        // lane tab is called "Unsaved changes" whether or not there are any.
        expect(screen.queryByText('Unsaved changes', { selector: '[role="status"]' })).not.toBeInTheDocument();

        await user.click(await screen.findByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.updatePipeline.length).toBeGreaterThan(0));
        expect(pipelineRequests.updatePipeline[0]?.request?.pipeline?.configYaml).toBe(partialConfig);
      });

      it('reports a draft that has been started by someone else instead of deploying to it', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
        const updatePipelineHandler = () => {
          throw new ConnectError('pipeline is not a draft', Code.FailedPrecondition);
        };

        render(<PipelinePage />, {
          transport: createTransport({
            getPipelineHandler: () => pipelineResponse({ state: Pipeline_State.DRAFT }),
            updatePipelineHandler,
          }),
        });

        fireEvent.change(await screen.findByTestId('yaml-editor'), { target: { value: 'input:\n  edited: {}' } });
        await user.click(await screen.findByTestId('save-pipeline'));

        expect(await screen.findByText(/not a draft/iu)).toBeInTheDocument();
        expect(toastMessages('error')).toContainEqual(NO_LONGER_DRAFT_MESSAGE);
        expect(mockNavigate).not.toHaveBeenCalledWith(expect.objectContaining({ to: '/rp-connect/test-pipeline' }));
      });

      it('does not blame drafts for a failed precondition on a pipeline that is not one', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
        const updatePipelineHandler = () => {
          throw new ConnectError('pipeline is suspended', Code.FailedPrecondition);
        };

        render(<PipelinePage />, {
          transport: createTransport({
            getPipelineHandler: () => pipelineResponse({ state: Pipeline_State.STOPPED }),
            updatePipelineHandler,
          }),
        });

        fireEvent.change(await screen.findByTestId('yaml-editor'), { target: { value: 'input:\n  edited: {}' } });
        await user.click(await screen.findByTestId('save-pipeline'));

        // Only a draft save asserts `draft`, so only a draft save can be refused for that reason. Saying
        // otherwise would send the user looking for a teammate who started something.
        await waitFor(() => expect(toastMessages('error').length).toBeGreaterThan(0));
        expect(toastMessages('error')).not.toContainEqual(NO_LONGER_DRAFT_MESSAGE);
        expect(toastMessages('error')).toContainEqual(expect.stringMatching(/suspended/iu));
      });

      it('a refused start keeps the saved draft and shows the issues on their lines', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
        const startPipelineHandler = () => {
          throw invalidConfigError();
        };

        render(<PipelinePage />, {
          transport: createTransport({
            getPipelineHandler: () => pipelineResponse({ state: Pipeline_State.DRAFT }),
            startPipelineHandler,
          }),
        });

        await waitFor(() => expect(screen.getByTestId('save-pipeline')).toHaveTextContent('Save draft'));
        await chooseSaveAndStart(user);

        await waitFor(() => expect(pipelineRequests.startPipeline.length).toBeGreaterThan(0));
        expect(await screen.findByText(/an explicit output type must be specified/u)).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalledWith(expect.objectContaining({ to: '/rp-connect/test-pipeline' }));
      });
    });
  });

  describe('the Unsaved changes lane', () => {
    beforeEach(() => {
      localStorage.clear();
      useRpcnEditorAutosaveStore.getState().refresh();
    });

    describe('when it is offered', () => {
      it('is offered while editing, even without the visual editor', async () => {
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, { transport: createTransport() });

        expect(await screen.findByRole('tab', { name: /unsaved changes/iu })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Visual' })).not.toBeInTheDocument();
      });

      it('is not offered in view mode', async () => {
        mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, { transport: createTransport() });

        await screen.findByRole('tab', { name: 'Monitor' });
        expect(screen.queryByRole('tab', { name: /unsaved changes/iu })).not.toBeInTheDocument();
      });

      // Nothing is saved on the create page, so every component would be listed as "Added" and the count
      // would only restate how big the document is.
      it('is not offered while creating', async () => {
        render(<PipelinePage />, { transport: createTransport() });

        expect(await screen.findByRole('tab', { name: 'YAML' })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /unsaved changes/iu })).not.toBeInTheDocument();
      });

      it('is disabled while the editor matches what is saved', async () => {
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, { transport: createTransport() });

        await waitFor(() =>
          expect((screen.getByTestId('yaml-editor') as HTMLTextAreaElement).value).toBe(DEPLOYED_YAML)
        );
        expect(screen.getByRole('tab', { name: /unsaved changes/iu })).toHaveAttribute('aria-disabled', 'true');

        fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: `${DEPLOYED_YAML}\n# note` } });

        await waitFor(() =>
          expect(screen.getByRole('tab', { name: /unsaved changes/iu })).not.toHaveAttribute('aria-disabled', 'true')
        );
      });

      it('returns to the YAML lane once the edits are saved', async () => {
        const { user } = renderPipelinePage('edit', {
          getPipelineHandler: () =>
            create(ConsoleGetPipelineResponseSchema, {
              response: create(GetPipelineResponseSchema, {
                pipeline: create(PipelineSchema, {
                  id: 'test-pipeline',
                  displayName: 'Test Pipeline',
                  configYaml: DEPLOYED_YAML,
                  state: Pipeline_State.DRAFT,
                }),
              }),
            }),
        });

        await replaceLoadedConfig(`${DEPLOYED_YAML}\n# note`);
        await openChanges(user);
        expect(await screen.findByTestId('diff-editor')).toBeInTheDocument();

        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.updatePipeline.length).toBeGreaterThan(0));
        expect(await screen.findByTestId('yaml-editor')).toBeInTheDocument();
        expect(screen.queryByTestId('diff-editor')).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /unsaved changes/iu })).toHaveAttribute('aria-disabled', 'true');
      });
    });

    describe('what it shows', () => {
      it('diffs the deployed configuration against the edits, and counts the components touched', async () => {
        const { user } = renderPipelinePage('edit');

        const edited = 'input:\n  generate: {}\noutput:\n  stdout: {}';
        await replaceLoadedConfig(edited);

        await waitFor(() => expect(screen.getByRole('tab', { name: /changes/iu })).toHaveTextContent('1'));

        await openChanges(user);

        const diff = await screen.findByTestId('diff-editor');
        expect(diff).toHaveAttribute('data-original', DEPLOYED_YAML);
        expect(diff).toHaveAttribute('data-modified', edited);
        expect(screen.getByText('Changed')).toBeInTheDocument();
      });

      it('counts and itemises a settings-only change', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, { transport: createTransport() });

        await waitFor(() =>
          expect((screen.getByTestId('yaml-editor') as HTMLTextAreaElement).value).toBe(DEPLOYED_YAML)
        );
        fireEvent.change(screen.getByLabelText('Pipeline name'), { target: { value: 'Renamed pipeline' } });

        await waitFor(() => expect(screen.getByRole('tab', { name: /unsaved changes/iu })).toHaveTextContent('1'));
        await openChanges(user);

        expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
        expect(screen.getByText('Test Pipeline → Renamed pipeline')).toBeInTheDocument();
        expect(screen.queryByTestId('changes-panel-empty')).not.toBeInTheDocument();
      });

      it('warns that applying to a running pipeline restarts it', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, { transport: createTransport() });

        await waitFor(() =>
          expect((screen.getByTestId('yaml-editor') as HTMLTextAreaElement).value).toBe(DEPLOYED_YAML)
        );
        fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: `${DEPLOYED_YAML}\n# note` } });
        await openChanges(user);

        expect(await screen.findByTestId('changes-impact')).toHaveTextContent(/applying them restarts the pipeline/iu);
      });

      // A comment-only edit changes no component, and the diff should then take the full width rather
      // than sit beside an empty column with a heading over it.
      it('drops the component column when nothing component-level changed', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, { transport: createTransport() });

        await waitFor(() =>
          expect((screen.getByTestId('yaml-editor') as HTMLTextAreaElement).value).toBe(DEPLOYED_YAML)
        );
        fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: `${DEPLOYED_YAML}\n# just a note` } });
        await openChanges(user);

        expect(await screen.findByTestId('diff-editor')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Components' })).not.toBeInTheDocument();
      });

      it('heads the component column when something did change', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, { transport: createTransport() });

        await waitFor(() =>
          expect((screen.getByTestId('yaml-editor') as HTMLTextAreaElement).value).toBe(DEPLOYED_YAML)
        );
        fireEvent.change(screen.getByTestId('yaml-editor'), {
          target: { value: 'input:\n  generate: {}\noutput:\n  stdout: {}' },
        });
        await openChanges(user);

        expect(await screen.findByRole('heading', { name: 'Components' })).toBeInTheDocument();
      });

      // The diff drops to a single inline pane on a narrow lane, so the legend keys on the gutter markers
      // rather than on colour or left/right.
      it('says what the two sides of the diff are', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, { transport: createTransport() });

        await waitFor(() =>
          expect((screen.getByTestId('yaml-editor') as HTMLTextAreaElement).value).toBe(DEPLOYED_YAML)
        );
        fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: `${DEPLOYED_YAML}\n# note` } });
        await openChanges(user);

        expect(await screen.findByText(/the saved configuration/iu)).toBeInTheDocument();
        expect(screen.getByText(/your unsaved edits/iu)).toBeInTheDocument();
      });

      it('jumps from a changed component to its lines in the YAML lane', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

        render(<PipelinePage />, { transport: createTransport() });

        await waitFor(() =>
          expect((screen.getByTestId('yaml-editor') as HTMLTextAreaElement).value).toBe(DEPLOYED_YAML)
        );
        fireEvent.change(screen.getByTestId('yaml-editor'), {
          target: { value: 'input:\n  generate: {}\noutput:\n  stdout: {}' },
        });
        await openChanges(user);

        await user.click(await screen.findByText('Changed'));

        await waitFor(() => expect(screen.getByTestId('yaml-editor')).toBeInTheDocument());
        expect(screen.queryByTestId('diff-editor')).not.toBeInTheDocument();
      });
    });
  });

  describe('deleting a draft', () => {
    beforeEach(() => {
      enableFeatures('enableRpcnPipelineDrafts');
    });

    it.each([
      ['the detail view', 'view' as const],
      ['the editor', 'edit' as const],
    ])('deletes a draft from %s, after confirming', async (_name, mode) => {
      const { user } = renderPipelinePage(mode, {
        getPipelineHandler: draftPipeline,
      });

      await user.click(await screen.findByTestId('delete-draft'));

      expect(await screen.findByText(/delete draft\?/iu)).toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/delete/iu)).not.toBeInTheDocument();
      expect(pipelineRequests.deletePipeline).toHaveLength(0);

      await user.click(screen.getByTestId('confirm-delete-draft'));

      await waitFor(() => expect(pipelineRequests.deletePipeline.length).toBeGreaterThan(0));
      expect(pipelineRequests.deletePipeline[0]?.request?.id).toBe('test-pipeline');
    });

    it('offers no draft delete on a deployed pipeline', async () => {
      mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      await screen.findByRole('button', { name: /edit pipeline/iu });
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
          getPipelineHandler: draftPipeline,
        }),
      });

      await user.click(await screen.findByTestId('delete-draft'));
      await user.click(await screen.findByTestId('confirm-delete-draft'));

      await waitFor(() => expect(useRpcnEditorAutosaveStore.getState().entries).toHaveLength(0));
    });

    // Deleting is a departure the user has already confirmed, so a second dialog would offer to save
    // the draft that was just deleted — writing to a pipeline that no longer exists.
    it('stands the unsaved-changes guard down after deleting, so no second dialog follows', async () => {
      const { user } = renderPipelinePage('edit', {
        getPipelineHandler: draftPipeline,
      });

      await replaceLoadedConfig('input:\n  half_typed', 'input:\n  kafka_');
      expect(lastShouldBlockFn()()).toBe(true);

      await user.click(await screen.findByTestId('delete-draft'));
      // The confirmation says the unsaved edits go too: a trash icon in an editor can read as
      // "throw away my changes".
      expect(await screen.findByText(/unsaved changes go with it/iu)).toBeInTheDocument();
      await user.click(screen.getByTestId('confirm-delete-draft'));

      await waitFor(() => expect(pipelineRequests.deletePipeline.length).toBeGreaterThan(0));
      await waitFor(() => expect(lastShouldBlockFn()()).toBe(false));
    });
  });

  describe('leaving with unsaved changes', () => {
    beforeEach(() => {
      localStorage.clear();
      useRpcnEditorAutosaveStore.getState().refresh();
      enableFeatures('enableRpcnPipelineDrafts');
    });

    const blocked = () => {
      const proceed = rs.fn();
      const reset = rs.fn();
      mockBlocker.mockReturnValue({ status: 'blocked', proceed, reset });
      return { proceed, reset };
    };

    it('offers a draft as the way out, and resumes the interrupted navigation', async () => {
      const user = userEvent.setup();
      const { proceed } = blocked();
      const createPipelineHandler = () =>
        create(ConsoleCreatePipelineResponseSchema, {
          response: create(CreatePipelineResponseSchema, {
            pipeline: create(PipelineSchema, { id: 'new-pipeline', state: Pipeline_State.DRAFT }),
          }),
        });

      render(<PipelinePage />, { transport: createTransport({ createPipelineHandler }) });

      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  half_typed' } });
      await user.click(await screen.findByTestId('save-draft-and-leave'));

      await waitFor(() => expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0));
      expect(pipelineRequests.createPipeline[0]?.request?.pipeline?.draft).toBe(true);
      // The dialog's own proceed is what resumes the navigation, so the editor must not add one of
      // its own — two navigations would flash a route nobody chose.
      await waitFor(() => expect(proceed).toHaveBeenCalled());
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('stays put when the draft it offered to save fails', async () => {
      const user = userEvent.setup();
      const { proceed } = blocked();
      const createPipelineHandler = () => {
        throw new ConnectError('pipeline quota exceeded', Code.ResourceExhausted);
      };

      render(<PipelinePage />, { transport: createTransport({ createPipelineHandler }) });

      fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  half_typed' } });
      await user.click(await screen.findByTestId('save-draft-and-leave'));

      await waitFor(() => expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0));
      expect(proceed).not.toHaveBeenCalled();
      expect(screen.getByTestId('save-draft-and-leave')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    // A quota-full cluster is the realistic version of this: the better exit is gone, and Discard must
    // not become the only one.
    it('falls back to keeping the edits in this browser when the draft cannot be saved', async () => {
      const { proceed } = blocked();
      const createPipelineHandler = () => {
        throw new ConnectError('pipeline quota exceeded', Code.ResourceExhausted);
      };
      const { user } = renderPipelineFromWizard({ createPipelineHandler });

      await replaceLoadedConfig('input:\n  half_typed');
      await user.click(await screen.findByTestId('save-draft-and-leave'));

      const leaveForNow = await screen.findByTestId('leave-and-keep-edits');
      expect(screen.getByTestId('save-draft-and-leave')).toBeInTheDocument();

      await user.click(leaveForNow);

      expect(autosaveEntry('create')?.configYaml).toBe('input:\n  half_typed');
      expect(proceed).toHaveBeenCalled();
    });

    it('offers no draft on a running pipeline, and says why', async () => {
      blocked();
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

      render(<PipelinePage />, { transport: createTransport() });

      expect(await screen.findByText(/restarts the pipeline/iu)).toBeInTheDocument();
      expect(screen.queryByTestId('save-draft-and-leave')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /keep editing/iu })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /discard changes/iu })).toBeInTheDocument();
    });

    // No draft is possible on a deployed pipeline, so leaving on purpose is the only exit that keeps
    // the work, and it has to say so.
    it('lets a deployed pipeline be left with the edits kept in this browser', async () => {
      const { proceed } = blocked();
      const { user } = renderPipelinePage('edit');

      await replaceLoadedConfig('input:\n  half_typed');

      await user.click(await screen.findByTestId('leave-and-keep-edits'));

      // Asserted without waiting out the debounce: the pending write dies with the page, so the button
      // that promises the edits are kept has to flush them itself.
      const buffer = useRpcnEditorAutosaveStore.getState().entries.find((e) => e.targetKey === 'test-pipeline');
      expect(buffer?.configYaml).toBe('input:\n  half_typed');
      expect(proceed).toHaveBeenCalled();
    });

    it('drops the recovery buffer when the changes are discarded on purpose', async () => {
      const { proceed } = blocked();

      const { user } = renderPipelineFromWizard();

      await replaceLoadedConfig('input:\n  half_typed');
      await waitFor(
        () => expect(useRpcnEditorAutosaveStore.getState().entries.some((e) => e.targetKey === 'create')).toBe(true),
        { timeout: 4000 }
      );

      await user.click(await screen.findByTestId('discard-and-leave'));

      expect(useRpcnEditorAutosaveStore.getState().entries.some((e) => e.targetKey === 'create')).toBe(false);
      expect(proceed).toHaveBeenCalled();
    });

    // A save that navigates stands the guard down for its own departure; coming back to edit must not
    // find it still standing down.
    it('re-arms the guard when the page returns to editing after a save', async () => {
      const { user, rerender } = renderPipelinePage('edit', {
        getPipelineHandler: editablePipeline(DEPLOYED_YAML),
      });
      await replaceLoadedConfig('input:\n  edited: {}');
      await user.click(await screen.findByTestId('save-pipeline'));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/rp-connect/test-pipeline' }));

      rerenderInMode(rerender, 'view');
      rerenderInMode(rerender, 'edit');

      typeConfig('input:\n  edited_again: {}');
      await waitFor(() => expect(lastShouldBlockFn()()).toBe(true));
    });
  });

  describe('autosave recovery', () => {
    beforeEach(() => {
      localStorage.clear();
      useRpcnEditorAutosaveStore.getState().refresh();
      enableFeatures('enableRpcnPipelineDrafts');
    });

    // Stale means "someone saved this pipeline since these edits were captured": the pipeline's
    // `update_time` against the one the buffer recorded, two server values. The buffer's own
    // `updatedAt` is a browser clock and is never compared against either.
    describe('staleness is judged on server timestamps, not the browser clock', () => {
      const SAVED_AT = 1_700_000_000_000;

      it('warns when the pipeline was written after the buffer was captured', async () => {
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
        seedBuffer('test-pipeline', 'input:\n  recovered: {}', 'Test Pipeline', SAVED_AT - 60_000);

        render(<PipelinePage />, { transport: transportWithUpdateTime(SAVED_AT) });

        const notice = await screen.findByTestId('autosave-restore-notice');
        expect(notice).toHaveTextContent(/Someone else saved this pipeline while you were away/u);
      });

      it('does not warn when the pipeline has not moved since', async () => {
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
        seedBuffer('test-pipeline', 'input:\n  recovered: {}', 'Test Pipeline', SAVED_AT);

        render(<PipelinePage />, { transport: transportWithUpdateTime(SAVED_AT) });

        const notice = await screen.findByTestId('autosave-restore-notice');
        expect(notice).toHaveTextContent(/You left this editor without saving/u);
      });

      it('ignores a browser clock that disagrees with the server', async () => {
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
        // updatedAt is ~now, decades after SAVED_AT, yet the recorded baseline still matches.
        seedBuffer('test-pipeline', 'input:\n  recovered: {}', 'Test Pipeline', SAVED_AT);

        render(<PipelinePage />, { transport: transportWithUpdateTime(SAVED_AT) });

        const notice = await screen.findByTestId('autosave-restore-notice');
        expect(notice).not.toHaveTextContent(/Someone else saved this pipeline/u);
      });

      // The baseline is the version that was hydrated. A refetch landing mid-edit (focus, an invalidation)
      // must not move it, or a colleague's save is adopted unseen and the warning it exists for never shows.
      it('stamps the buffer with the version on screen, not the one the query last fetched', async () => {
        let updatedAt = SAVED_AT;
        const getPipelineHandler = () => pipelineAt(updatedAt);

        renderPipelinePage('edit', { getPipelineHandler });
        await waitFor(() => expect(screen.getByTestId('yaml-editor')).toHaveValue(DEPLOYED_YAML));

        updatedAt += 60_000;
        await refetchPipelineOnFocus();
        typeConfig('input:\n  mid_sentence');

        await waitFor(
          () => {
            const buffer = useRpcnEditorAutosaveStore.getState().entries.find((e) => e.targetKey === 'test-pipeline');
            expect(buffer?.basedOnUpdateTime).toBe(SAVED_AT);
          },
          { timeout: 4000 }
        );
      });

      it('treats a buffer with no recorded baseline as not stale', async () => {
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
        seedBuffer('test-pipeline', 'input:\n  recovered: {}', 'Test Pipeline', null);

        render(<PipelinePage />, { transport: transportWithUpdateTime(SAVED_AT) });

        const notice = await screen.findByTestId('autosave-restore-notice');
        expect(notice).toHaveTextContent(/You left this editor without saving/u);
      });
    });

    describe('writing and offering the buffer', () => {
      it('mirrors the editor into local storage as the user types', async () => {
        renderPipelineFromWizard();

        await replaceLoadedConfig('input:\n  mid_sentence');

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
        expect(screen.queryByTestId('autosave-restore-notice')).not.toBeInTheDocument();
      });

      // A save writes the settings as well as the configuration, so an unsaved resize is recoverable work.
      // Offering the buffer only when the YAML differed dropped it silently.
      it('offers to restore a buffer whose settings differ, even with identical configuration', async () => {
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
        useRpcnEditorAutosaveStore.getState().save({
          targetKey: 'test-pipeline',
          name: 'Test Pipeline',
          description: '',
          computeUnits: 6,
          tags: [],
          configYaml: 'input:\n  stdin: {}\noutput:\n  stdout: {}',
        });

        render(<PipelinePage />, { transport: createTransport() });

        expect(await screen.findByTestId('autosave-restore-notice')).toBeInTheDocument();
      });

      // Quiet periods run on a fake clock that still advances by itself, so a debounce window
      // passes on demand rather than as a real wait.
      describe('across a debounce window', () => {
        beforeEach(() => {
          rs.useFakeTimers({ shouldAdvanceTime: true });
          return () => {
            rs.useRealTimers();
          };
        });

        // Loading a pipeline settles the document back to "nothing to recover". Tidying up on that signal
        // would delete the recovery buffer about a second before the user could click Restore.
        it('keeps a buffer left by an earlier session while the editor just sits there', async () => {
          mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
          seedBuffer('test-pipeline', 'input:\n  recovered: {}');

          render(<PipelinePage />, { transport: createTransport() });

          expect(await screen.findByTestId('autosave-restore-notice')).toBeInTheDocument();

          await rs.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 500);

          expect(useRpcnEditorAutosaveStore.getState().entries).toHaveLength(1);
          expect(screen.getByTestId('autosave-restore-notice')).toBeInTheDocument();
        });

        // The notice is for work left by an *earlier* session. Comparing live buffer against live editor
        // made this session's own buffer look recoverable, so the banner blinked once per debounce.
        it('never offers to recover the buffer this editor just wrote', async () => {
          mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });

          render(<PipelinePage />, { transport: createTransport() });

          const yamlEditor = (await screen.findByTestId('yaml-editor')) as HTMLTextAreaElement;
          await waitFor(() => expect(yamlEditor.value).toBe('input:\n  stdin: {}\noutput:\n  stdout: {}'));

          // Type, let autosave land, then type again — the buffer is now one keystroke behind the editor.
          fireEvent.change(yamlEditor, { target: { value: 'input:\n  first' } });
          await waitFor(
            () =>
              expect(
                useRpcnEditorAutosaveStore.getState().entries.find((e) => e.targetKey === 'test-pipeline')?.configYaml
              ).toBe('input:\n  first'),
            { timeout: 4000 }
          );
          fireEvent.change(yamlEditor, { target: { value: 'input:\n  second' } });

          expect(screen.queryByTestId('autosave-restore-notice')).not.toBeInTheDocument();

          await rs.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 500);
          expect(screen.queryByTestId('autosave-restore-notice')).not.toBeInTheDocument();
        });
      });
    });

    describe('restoring and clearing the buffer', () => {
      it('restores the service account along with the edits it was attached for', async () => {
        const secretName = 'ORDERS_SA';
        useRpcnEditorAutosaveStore.getState().save({
          targetKey: 'test-pipeline',
          name: 'Test Pipeline',
          description: '',
          computeUnits: 1,
          tags: [],
          configYaml: SERVICE_ACCOUNT_LOGIN_YAML,
          serviceAccount: { serviceAccountId: 'sa-123', secretName },
        });

        const { user } = renderPipelinePage('edit');

        await user.click(await screen.findByTestId('restore-autosave'));
        const sent = await saveAndCapturePipeline(user, 'updatePipeline');
        expect(sent?.serviceAccount).toMatchObject({ clientId: secretRef(secretName, 'client_id') });
        expect(sent?.tags).toMatchObject({ rp_cloud_service_account_id: 'sa-123', rp_cloud_secret_id: secretName });
      });

      // The reset must recompute `isDirty` from the restored values; keeping the pre-restore flag left the
      // guard disarmed when only a setting differed.
      it('arms the unsaved-changes guard after restoring a settings-only buffer', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
        useRpcnEditorAutosaveStore.getState().save({
          targetKey: 'test-pipeline',
          name: 'Test Pipeline',
          description: '',
          computeUnits: 6,
          tags: [],
          configYaml: 'input:\n  stdin: {}\noutput:\n  stdout: {}',
        });

        render(<PipelinePage />, { transport: createTransport() });

        await user.click(await screen.findByTestId('restore-autosave'));

        expect(await screen.findByText('Unsaved changes', { selector: '[role="status"]' })).toBeInTheDocument();
        expect(lastShouldBlockFn()()).toBe(true);
      });

      // A snapshot, so the version the user was shown survives autosave overwriting the stored copy.
      it('restores the version it offered, even after autosave has moved on', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
        seedBuffer('test-pipeline', 'input:\n  from_last_session: {}');

        render(<PipelinePage />, { transport: createTransport() });

        const yamlEditor = (await screen.findByTestId('yaml-editor')) as HTMLTextAreaElement;
        expect(await screen.findByTestId('autosave-restore-notice')).toBeInTheDocument();

        fireEvent.change(yamlEditor, { target: { value: 'input:\n  typed_instead' } });
        await waitFor(
          () =>
            expect(
              useRpcnEditorAutosaveStore.getState().entries.find((e) => e.targetKey === 'test-pipeline')?.configYaml
            ).toBe('input:\n  typed_instead'),
          { timeout: 4000 }
        );

        await user.click(screen.getByTestId('restore-autosave'));

        await waitFor(() => expect(yamlEditor.value).toBe('input:\n  from_last_session: {}'));
      });

      it('withdraws the offer once the work it was protecting is saved', async () => {
        const user = userEvent.setup();
        mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
        seedBuffer('test-pipeline', 'input:\n  from_last_session: {}');

        render(<PipelinePage />, {
          transport: createTransport({
            getPipelineHandler: draftPipeline,
          }),
        });

        expect(await screen.findByTestId('autosave-restore-notice')).toBeInTheDocument();

        fireEvent.change(await screen.findByTestId('yaml-editor'), { target: { value: 'input:\n  finished' } });
        await user.click(await screen.findByTestId('save-pipeline'));

        await waitFor(() => expect(screen.queryByTestId('autosave-restore-notice')).not.toBeInTheDocument());
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
        const createPipelineHandler = () =>
          create(ConsoleCreatePipelineResponseSchema, {
            response: create(CreatePipelineResponseSchema, {
              pipeline: create(PipelineSchema, { id: 'new-pipeline', state: Pipeline_State.DRAFT }),
            }),
          });
        seedBuffer('create', 'input:\n  stale: {}', 'work in progress');

        render(<PipelinePage />, { transport: createTransport({ createPipelineHandler }) });

        fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value: 'input:\n  stdin: {}' } });
        await user.click(screen.getByTestId('save-pipeline'));

        await waitFor(() => expect(pipelineRequests.createPipeline.length).toBeGreaterThan(0));
        await waitFor(() =>
          expect(useRpcnEditorAutosaveStore.getState().entries.find((e) => e.targetKey === 'create')).toBeUndefined()
        );
      });
    });
  });

  describe('a draft on its own page', () => {
    beforeEach(() => {
      enableFeatures('enableRpcnPipelineDrafts');
      mockUsePipelineMode.mockReturnValue({ mode: 'view', pipelineId: 'test-pipeline' });
    });

    // Drain the hand-off, so a refusal in one test can't seed the editor in another.
    afterEach(() => {
      takeStartLintHints('test-pipeline');
    });

    it('explains itself instead of offering monitoring it cannot have', async () => {
      logsTabRenders.count = 0;
      render(<PipelinePage />, { transport: draftTransport() });

      expect(await screen.findByTestId('draft-view-notice')).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Monitor' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('log-explorer')).not.toBeInTheDocument();
      expect(screen.queryByTestId('logs-tab')).not.toBeInTheDocument();
      // Not even for the one commit before the lane correction: mounting is what fires the requests.
      expect(logsTabRenders.count).toBe(0);
    });

    it('starts from the detail view', async () => {
      const user = userEvent.setup();

      render(<PipelinePage />, { transport: draftTransport() });

      await confirmStart(user);

      await waitFor(() => expect(pipelineRequests.startPipeline.length).toBeGreaterThan(0));
      expect(pipelineRequests.startPipeline[0]?.request?.id).toBe('test-pipeline');
    });

    it('routes a refused start into the editor, where the issues are', async () => {
      const user = userEvent.setup();
      const startPipelineHandler = () => {
        throw new ConnectError('invalid pipeline configuration', Code.InvalidArgument, undefined, [
          {
            desc: LintHintSchema,
            value: create(LintHintSchema, { line: 2, column: 1, hint: 'an explicit output type must be specified' }),
          },
        ]);
      };

      render(<PipelinePage />, { transport: draftTransport({ startPipelineHandler }) });

      await confirmStart(user);

      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith(
          expect.objectContaining({ to: '/rp-connect/$pipelineId/edit', params: { pipelineId: 'test-pipeline' } })
        )
      );
    });

    // The toast promises the editor opens on the issues, so it must show the server's refusal — not
    // whatever the editor's own lint happens to find.
    it("hands the refused start's hints to the editor it opens", async () => {
      const user = userEvent.setup();
      const startPipelineHandler = () => {
        throw new ConnectError('invalid pipeline configuration', Code.InvalidArgument, undefined, [
          {
            desc: LintHintSchema,
            value: create(LintHintSchema, { line: 1, column: 1, hint: 'secret NOT_YET_CREATED does not exist' }),
          },
        ]);
      };
      const { unmount } = render(<PipelinePage />, { transport: draftTransport({ startPipelineHandler }) });
      await confirmStart(user);
      await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
      unmount();

      // The editor the navigation lands on. Hydration clears hints, so they are seeded after it.
      mockUsePipelineMode.mockReturnValue({ mode: 'edit', pipelineId: 'test-pipeline' });
      render(<PipelinePage />, { transport: draftTransport() });

      expect(await screen.findByText(/secret NOT_YET_CREATED does not exist/u)).toBeInTheDocument();
    });

    it('names the topics and the compute before it commits to starting', async () => {
      const user = userEvent.setup();

      render(<PipelinePage />, {
        transport: draftTransport({
          configYaml: 'input:\n  redpanda:\n    topics: [orders]\noutput:\n  redpanda:\n    topic: orders-dlq',
        }),
      });

      await user.click(await screen.findByTestId('start-draft'));

      expect(await screen.findByText(/orders and orders-dlq/u)).toBeInTheDocument();
      expect(screen.getByText(/1 compute unit/u)).toBeInTheDocument();
      expect(screen.getByText(/can't go back to being a draft/u)).toBeInTheDocument();
      expect(pipelineRequests.startPipeline).toHaveLength(0);
    });

    it('starts nothing when the confirmation is dismissed', async () => {
      const user = userEvent.setup();

      render(<PipelinePage />, { transport: draftTransport() });

      await user.click(await screen.findByTestId('start-draft'));
      await user.click(await screen.findByRole('button', { name: /cancel/iu }));

      await waitFor(() => expect(screen.queryByTestId('confirm-start-draft')).not.toBeInTheDocument());
      expect(pipelineRequests.startPipeline).toHaveLength(0);
    });

    it('starts through the draft path, which can report a rejected config', async () => {
      render(<PipelinePage />, { transport: draftTransport() });

      await screen.findByTestId('draft-view-notice');
      // Same button copy as any other pipeline, but the generic start has nowhere to send a lint failure.
      expect(await screen.findByTestId('start-draft')).toHaveTextContent('Start pipeline');
      expect(screen.queryByTestId('pipeline-start')).not.toBeInTheDocument();
    });
  });
});
