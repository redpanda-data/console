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

import type { LintHint } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { useBlocker, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { getUserTagEntries, isSystemTag } from 'components/constants';
import { ArrowLeftIcon } from 'components/icons';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from 'components/redpanda-ui/components/resizable';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Heading } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { LogExplorer } from 'components/ui/connect/log-explorer';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { LintHintList } from 'components/ui/lint-hint/lint-hint-list';
import { YamlEditor } from 'components/ui/yaml/yaml-editor';
import { isEmbedded, isFeatureFlagEnabled, isServerless } from 'config';
import { useRefFormDialog } from 'hooks/use-ref-form-dialog';
import { KeyRound, LayoutGrid, Plus, User, Zap } from 'lucide-react';
import type { editor } from 'monaco-editor';
import type { JSONSchema } from 'monaco-yaml';
import {
  CreatePipelineRequestSchema,
  DeletePipelineRequestSchema,
  UpdatePipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  type ComponentList,
  CreatePipelineRequestSchema as CreatePipelineRequestSchemaDataPlane,
  type Pipeline,
  Pipeline_ServiceAccountSchema,
  Pipeline_State,
  PipelineCreateSchema,
  PipelineUpdateSchema,
  UpdatePipelineRequestSchema as UpdatePipelineRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { type Resolver, type UseFormReturn, useForm } from 'react-hook-form';
import { useGetPipelineServiceConfigSchemaQuery, useListComponentsQuery } from 'react-query/api/connect';
import {
  useCreatePipelineMutation,
  useDeletePipelineMutation,
  useGetPipelineQuery,
  useUpdatePipelineMutation,
} from 'react-query/api/pipeline';
import { toast } from 'sonner';
import { useRpcnWizardStore } from 'state/rpcn-wizard-store';
import { addServiceAccountTags } from 'utils/service-account.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { z } from 'zod';

import { ConfigDialog } from './config-dialog';
import { DetailsDialog } from './details-dialog';
import { EditorTipsBar, type TipContext } from './editor-tips-bar';
import { PipelineCommandMenu } from './pipeline-command-menu';
import { PipelineEditHeader, PipelineViewHeader } from './pipeline-header';
import { PipelineStructureTree } from './pipeline-structure-tree';
import { PipelineThroughputCard } from './pipeline-throughput-card';
import { ScrollShadow } from './scroll-shadow';
import { TemplateGalleryCta } from './template-cta';
import { PipelineEditorProvider, usePipelineEditorStore, usePipelineEditorStoreApi } from './use-pipeline-editor-store';
import { usePipelineLint } from './use-pipeline-lint';
import { useSaveHotkey } from './use-save-hotkey';
import { useSlashCommand } from './use-slash-command';
import { VisualEditorPanel } from './visual-editor-panel';
import { extractLintHintsFromError } from '../errors';
import { AddConnectorDialog } from '../onboarding/add-connector-dialog';
import { AddConnectorsCard } from '../onboarding/add-connectors-card';
import { AddTopicStep } from '../onboarding/add-topic-step';
import { AddUserStep } from '../onboarding/add-user-step';
import { LogsTab } from '../pipelines-details';
import { cpuToTasks, MIN_TASKS, tasksToCPU } from '../tasks';
import { TemplateGalleryDialog } from '../template-gallery/template-gallery-dialog';
import type { ConnectComponentType } from '../types/schema';
import type {
  AddTopicFormData,
  AddUserFormData,
  BaseStepRef,
  ServiceAccountSubmissionData,
  UserStepRef,
} from '../types/wizard';
import { navigateToConnectClusters } from '../utils/navigation';
import { changedNodeIds } from '../utils/pipeline-diff';
import { parsePipelineFlowTree, shouldOfferTemplate } from '../utils/pipeline-flow-parser';
import { enclosingNodeId, mapLintHintsToNodes, nodeLineRanges } from '../utils/pipeline-lint';
import { parseSchema } from '../utils/schema';
import { useCreateModeInitialYaml } from '../utils/use-create-mode-initial-yaml';
import { usePipelineMode } from '../utils/use-pipeline-mode';
import { extractConnectorTopics, getConnectTemplate, type RedpandaSetupResultLike } from '../utils/yaml';

function getConnectorDialogTitle(type: ConnectComponentType | 'resource' | null): string | undefined {
  if (type === 'input') {
    return 'Add an input';
  }
  if (type === 'output') {
    return 'Add an output';
  }
  if (type) {
    return `Add a ${type}`;
  }
  return;
}

function getConnectorDialogPlaceholder(type: ConnectComponentType | 'resource' | null): string | undefined {
  if (type) {
    return `Search ${type}s...`;
  }
  return;
}

// Tips to show beneath the editor for the active lane; read-only YAML and Monitor get none.
function tipsContextForLane(isView: boolean, viewLane: string, editLane: string): TipContext | null {
  if (isView) {
    return viewLane === 'visual' ? 'visual' : null;
  }
  return editLane === 'visual' ? 'visual' : 'yaml';
}

// Stable empty set for the "nothing unsaved" / view-mode case so highlights don't churn renders.
const EMPTY_NODE_IDS: ReadonlySet<string> = new Set();

// How many effect re-runs (editor mount, ranges catch-up) a reveal request survives unresolved.
const MAX_REVEAL_ATTEMPTS = 5;

const pipelineFormSchema = z.object({
  name: z
    .string()
    .min(3, 'Pipeline name must be at least 3 characters')
    .max(100, 'Pipeline name must be less than 100 characters'),
  description: z.string().optional(),
  computeUnits: z.number().min(MIN_TASKS).int(),
  tags: z
    .array(
      z.object({
        key: z.string().min(1, 'Key is required'),
        value: z.string().min(1, 'Value is required'),
      })
    )
    .default([])
    .refine((tags) => {
      const keys = tags.map((t) => t.key).filter(Boolean);
      return new Set(keys).size === keys.length;
    }, 'Duplicate tag keys are not allowed'),
});

export type PipelineFormValues = z.infer<typeof pipelineFormSchema>;

function buildUserTags(formTags: PipelineFormValues['tags']): Record<string, string> {
  const userTags: Record<string, string> = {};
  for (const { key, value } of formTags) {
    if (key) {
      userTags[key] = value;
    }
  }
  return userTags;
}

function warnIfResized(form: UseFormReturn<PipelineFormValues>, cpuShares: string | undefined) {
  const retUnits = cpuToTasks(cpuShares);
  const currentUnits = form.getValues('computeUnits');
  if (retUnits && currentUnits !== retUnits) {
    toast.warning(`Pipeline has been resized to use ${retUnits} compute units`);
  }
}

function buildCreateRequest(opts: {
  name: string;
  description: string | undefined;
  computeUnits: number;
  userTags: Record<string, string>;
  yamlContent: string;
}) {
  const userData = useRpcnWizardStore.getState();
  const tags: Record<string, string> = {
    __redpanda_cloud_pipeline_type: 'pipeline',
  };

  let serviceAccountConfig: ReturnType<typeof create<typeof Pipeline_ServiceAccountSchema>> | undefined;
  if (userData.authMethod === 'service-account' && userData.serviceAccountId && userData.serviceAccountSecretName) {
    addServiceAccountTags(tags, userData.serviceAccountId, userData.serviceAccountSecretName);
    serviceAccountConfig = create(Pipeline_ServiceAccountSchema, {
      clientId: `\${secrets.${userData.serviceAccountSecretName}.client_id}`,
      clientSecret: `\${secrets.${userData.serviceAccountSecretName}.client_secret}`,
    });
  }

  return create(CreatePipelineRequestSchema, {
    request: create(CreatePipelineRequestSchemaDataPlane, {
      pipeline: create(PipelineCreateSchema, {
        displayName: opts.name,
        configYaml: opts.yamlContent,
        description: opts.description || '',
        resources: { cpuShares: tasksToCPU(opts.computeUnits) || '0', memoryShares: '0' },
        tags: { ...tags, ...opts.userTags },
        serviceAccount: serviceAccountConfig,
      }),
    }),
  });
}

function parseYamlEditorSchema(configSchema: string | undefined) {
  if (!configSchema) {
    return;
  }
  try {
    const parsed = JSON.parse(configSchema);
    return {
      definitions: parsed.definitions as Record<string, JSONSchema> | undefined,
      properties: parsed.properties as Record<string, JSONSchema> | undefined,
    };
  } catch {
    return;
  }
}

function usePipelineSave({
  form,
  editorStore,
  mode,
  pipelineId,
  pipeline,
  isPipelineDiagramsEnabled,
  onBeforeSaveNavigate,
}: {
  form: UseFormReturn<PipelineFormValues>;
  /** The editor store — read fresh at save time (after flushing pending visual edits). */
  editorStore: ReturnType<typeof usePipelineEditorStoreApi>;
  mode: string;
  pipelineId: string | undefined;
  pipeline: Pipeline | undefined;
  isPipelineDiagramsEnabled: boolean;
  /** Called right before a successful save navigates away, so the guard doesn't block it. */
  onBeforeSaveNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const { mutate: createMutation, isPending: isCreatePending } = useCreatePipelineMutation();
  const { mutate: updateMutation, isPending: isUpdatePending } = useUpdatePipelineMutation();
  const { mutate: deleteMutation, isPending: isDeletePending } = useDeletePipelineMutation();
  const [errorLintHints, setErrorLintHints] = useState<Record<string, LintHint>>({});

  const clearErrorLintHints = useCallback(() => setErrorLintHints({}), []);

  const clearWizardStore = useCallback(() => {
    if (!isPipelineDiagramsEnabled) {
      useRpcnWizardStore.getState().setYamlContent({ yamlContent: '' });
    }
    useRpcnWizardStore.getState().setWizardData({ input: undefined, output: undefined });
  }, [isPipelineDiagramsEnabled]);

  const handleSave = useCallback(async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      // Settings live in the header/dialog, so surface why the save was blocked.
      const fieldErrors = form.formState.errors;
      const firstError = fieldErrors.name?.message ?? fieldErrors.computeUnits?.message ?? fieldErrors.tags?.message;
      toast.error(typeof firstError === 'string' ? firstError : 'Fix the highlighted pipeline settings before saving.');
      return;
    }

    // Flush the Visual lane's in-progress edit (auto-applies on leave, but the user may save
    // mid-edit), then read the freshest YAML from the store.
    editorStore.getState().pendingEditCommit?.();
    const yamlContent = editorStore.getState().yamlContent;

    const { name, description, computeUnits, tags: formTags } = form.getValues();
    const userTags = buildUserTags(formTags);

    const onError = (err: ConnectError, action: 'create' | 'update') => {
      setErrorLintHints(extractLintHintsFromError(err));
      toast.error(formatToastErrorMessageGRPC({ error: err, action, entity: 'pipeline' }));
    };

    if (mode === 'create') {
      const createRequest = buildCreateRequest({ name, description, computeUnits, userTags, yamlContent });

      createMutation(createRequest, {
        onSuccess: (response) => {
          setErrorLintHints({});
          clearWizardStore();
          toast.success('Pipeline created');
          warnIfResized(form, response.response?.pipeline?.resources?.cpuShares);
          const newPipelineId = response.response?.pipeline?.id;
          onBeforeSaveNavigate?.();
          navigate({ to: newPipelineId ? `/rp-connect/${newPipelineId}` : '/connect-clusters' });
        },
        onError: (err) => onError(err, 'create'),
      });
    } else if (pipelineId) {
      const updateRequest = create(UpdatePipelineRequestSchema, {
        request: create(UpdatePipelineRequestSchemaDataPlane, {
          id: pipelineId,
          pipeline: create(PipelineUpdateSchema, {
            displayName: name,
            configYaml: yamlContent,
            description: description || '',
            resources: { cpuShares: tasksToCPU(computeUnits) || '0', memoryShares: '0' },
            tags: {
              ...Object.fromEntries(Object.entries(pipeline?.tags ?? {}).filter(([k]) => isSystemTag(k))),
              ...userTags,
            },
            serviceAccount: pipeline?.serviceAccount,
          }),
        }),
      });

      updateMutation(updateRequest, {
        onSuccess: (response) => {
          setErrorLintHints({});
          toast.success('Pipeline updated');
          warnIfResized(form, response.response?.pipeline?.resources?.cpuShares);
          onBeforeSaveNavigate?.();
          navigate({ to: `/rp-connect/${pipelineId}` });
        },
        onError: (err) => onError(err, 'update'),
      });
    }
  }, [
    form,
    editorStore,
    mode,
    pipelineId,
    createMutation,
    updateMutation,
    navigate,
    clearWizardStore,
    pipeline,
    onBeforeSaveNavigate,
  ]);

  const handleDelete = useCallback(
    (id: string) => {
      const deleteRequest = create(DeletePipelineRequestSchema, { request: { id } });
      deleteMutation(deleteRequest, {
        onSuccess: () => {
          toast.success('Pipeline deleted');
          navigateToConnectClusters(navigate);
        },
        onError: (err) => {
          toast.error(
            formatToastErrorMessageGRPC({ error: ConnectError.from(err), action: 'delete', entity: 'pipeline' })
          );
        },
      });
    },
    [deleteMutation, navigate]
  );

  return {
    handleSave,
    handleDelete,
    clearWizardStore,
    errorLintHints,
    clearErrorLintHints,
    isSaving: isCreatePending || isUpdatePending,
    isDeleting: isDeletePending,
  };
}

type DiagramDialogTarget = { section: 'input' | 'output'; componentName: string };

function useDiagramDialogs(
  yamlContent: string,
  patchComponent: (section: 'input' | 'output', componentName: string, patch: RedpandaSetupResultLike) => boolean,
  focusEditorEnd: () => void
) {
  const topicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);
  const userStepRef = useRef<UserStepRef>(null);

  const topicDialog = useRefFormDialog<AddTopicFormData, DiagramDialogTarget>({
    ref: topicStepRef,
    onSuccess: (data, target) => {
      if (data.topicName && patchComponent(target.section, target.componentName, { topicName: data.topicName })) {
        focusEditorEnd();
      }
    },
  });

  const userDialog = useRefFormDialog<AddUserFormData | ServiceAccountSubmissionData, DiagramDialogTarget>({
    ref: userStepRef,
    onSuccess: (data, target) => {
      let setupResult: RedpandaSetupResultLike = {};
      if ('authMethod' in data && data.authMethod === 'service-account') {
        setupResult = {
          authMethod: 'service-account',
          serviceAccountSecretName: (data as ServiceAccountSubmissionData).serviceAccountSecretName,
        };
      } else if ('username' in data) {
        setupResult = {
          authMethod: 'sasl',
          username: (data as AddUserFormData).username,
          saslMechanism: (data as AddUserFormData).saslMechanism,
        };
      }
      if (patchComponent(target.section, target.componentName, setupResult)) {
        focusEditorEnd();
      }
    },
  });

  const [connectorTopics, setConnectorTopics] = useState<string[] | undefined>();

  const openTopicDialog = topicDialog.open;
  const openUserDialog = userDialog.open;

  return {
    topicDialog,
    userDialog,
    topicStepRef,
    userStepRef,
    connectorTopics,
    handleAddTopic: useCallback(
      (section: string, componentName: string) => {
        openTopicDialog({ section: section as 'input' | 'output', componentName });
      },
      [openTopicDialog]
    ),
    handleAddSasl: useCallback(
      (section: string, componentName: string) => {
        const { topics, parseError } = extractConnectorTopics(
          yamlContent,
          section as 'input' | 'output',
          componentName
        );
        if (parseError) {
          toast.error('Failed to parse pipeline YAML');
        }
        setConnectorTopics(topics);
        openUserDialog({ section: section as 'input' | 'output', componentName });
      },
      [openUserDialog, yamlContent]
    ),
  };
}

function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Skeleton variant="text" width="lg" />
      <Skeleton variant="text" width="md" />
      <Skeleton variant="text" width="lg" />
      <Skeleton variant="text" width="sm" />
      <Skeleton variant="text" width="md" />
      <Skeleton variant="text" width="lg" />
      <Skeleton variant="text" width="sm" />
    </div>
  );
}

/** Read-only YAML viewer for the view page — reuses the editor with editing cues suppressed. */
function YamlViewPanel({
  configYaml,
  schema,
}: {
  configYaml: string;
  schema: ReturnType<typeof parseYamlEditorSchema>;
}) {
  // Top/bottom shadows from Monaco's scroll position (it virtualizes, so onDidScrollChange is the only signal).
  const [overflow, setOverflow] = useState({ top: false, bottom: false });
  // Mount-time listener disposables, torn down on unmount so the editor + listener graph can be GC'd.
  const scrollSyncSubscriptions = useRef<ReturnType<editor.IStandaloneCodeEditor['onDidScrollChange']>[]>([]);
  // Register the read-only viewer as the active editor so sidebar/Visual selection can reveal lines here too.
  const setEditorInstance = usePipelineEditorStore((s) => s.setEditorInstance);
  const handleMount = useCallback(
    (instance: editor.IStandaloneCodeEditor) => {
      const sync = () => {
        const scrollTop = instance.getScrollTop();
        const maxY = instance.getScrollHeight() - instance.getLayoutInfo().height;
        setOverflow({ top: scrollTop > 1, bottom: scrollTop < maxY - 1 });
      };
      scrollSyncSubscriptions.current = [
        instance.onDidScrollChange(sync),
        instance.onDidContentSizeChange(sync),
        instance.onDidLayoutChange(sync),
      ];
      sync();
      setEditorInstance(instance);
    },
    [setEditorInstance]
  );
  useEffect(
    function disposeScrollSyncListeners() {
      return () => {
        for (const subscription of scrollSyncSubscriptions.current) {
          subscription.dispose();
        }
        scrollSyncSubscriptions.current = [];
        setEditorInstance(null);
      };
    },
    [setEditorInstance]
  );

  const edge =
    'pointer-events-none absolute inset-x-0 h-4 from-black/10 to-transparent transition-opacity duration-150 dark:from-black/40';
  return (
    <div className="relative h-full overflow-hidden [&_.cursors-layer]:opacity-0">
      {/* Out of flow so Monaco can't feed its width up the layout and latch the page wide. */}
      <div className="absolute inset-0">
        <YamlEditor
          onEditorMount={handleMount}
          options={{
            readOnly: true,
            domReadOnly: true,
            renderLineHighlight: 'none',
            mouseStyle: 'default',
            padding: { top: 0 },
            scrollbar: { alwaysConsumeMouseWheel: false, useShadows: false },
          }}
          schema={schema}
          transparentBackground
          value={configYaml}
        />
      </div>
      <div aria-hidden className={cn(edge, 'top-0 bg-gradient-to-b', overflow.top ? 'opacity-100' : 'opacity-0')} />
      <div
        aria-hidden
        className={cn(edge, 'bottom-0 bg-gradient-to-t', overflow.bottom ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  );
}

function ViewModePanel({ pipeline }: { pipeline: Pipeline | undefined }) {
  if (!pipeline) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Loading pipeline...</div>
    );
  }
  const showThroughput =
    isEmbedded() &&
    (isServerless()
      ? isFeatureFlagEnabled('enableDataplaneObservabilityServerless')
      : isFeatureFlagEnabled('enableDataplaneObservability'));
  return (
    <div className="flex h-full flex-col overflow-auto p-6">
      {showThroughput ? (
        <>
          <PipelineThroughputCard pipelineId={pipeline.id} />
          <Separator className="my-8" variant="subtle" />
        </>
      ) : null}
      <section className="flex flex-col gap-4">
        {isFeatureFlagEnabled('enableNewPipelineLogs') ? (
          // Title renders inline in the explorer's control row to line up with the table.
          <LogExplorer
            enableLiveView={pipeline.state === Pipeline_State.RUNNING}
            pipeline={pipeline}
            serverless={isServerless()}
            title="Logs"
          />
        ) : (
          <>
            <Heading level={3}>Logs</Heading>
            <LogsTab pipeline={pipeline} />
          </>
        )}
      </section>
    </div>
  );
}

function EditorPanel({
  isServerlessInitializing,
  yamlContent,
  onYamlChange,
  onEditorMount,
  yamlEditorSchema,
  lintHints,
  isLintPending,
}: {
  isServerlessInitializing: boolean;
  yamlContent: string;
  onYamlChange: (val: string) => void;
  onEditorMount: (editorRef: editor.IStandaloneCodeEditor) => void;
  yamlEditorSchema: ReturnType<typeof parseYamlEditorSchema>;
  lintHints: Record<string, LintHint>;
  isLintPending: boolean;
}) {
  return (
    <ResizablePanelGroup orientation="vertical">
      <ResizablePanel defaultSize="70%" minSize="30%">
        <div className="relative h-full">
          {isServerlessInitializing ? (
            <EditorSkeleton />
          ) : (
            // Out of flow so Monaco can't feed its width up the layout and latch the page wide.
            <div className="absolute inset-0">
              <YamlEditor
                onChange={(val) => onYamlChange(val || '')}
                onEditorMount={onEditorMount}
                schema={yamlEditorSchema}
                transparentBackground
                value={yamlContent}
              />
            </div>
          )}
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel collapsible defaultSize="30%">
        <div className="h-full overflow-auto p-4">
          <div className="mb-3 flex items-center gap-2">
            <Heading className="text-muted-foreground" level={5}>
              Lint issues
            </Heading>
            {Object.keys(lintHints).length > 0 ? (
              <CountDot count={Object.keys(lintHints).length} variant="error" />
            ) : null}
          </div>
          <LintHintList isPending={isLintPending} lintHints={lintHints} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function useShouldOfferTemplate(yamlContent: string): boolean {
  return useMemo(() => shouldOfferTemplate(yamlContent, parsePipelineFlowTree(yamlContent).nodes), [yamlContent]);
}

function SidebarPanel({
  mode,
  yamlContent,
  isPipelineDiagramsEnabled,
  errorNodeIds,
  unsavedNodeIds,
  onAddConnector,
  onBrowseTemplates,
  onOpenCommandMenu,
}: {
  mode: string;
  yamlContent: string;
  isPipelineDiagramsEnabled: boolean;
  errorNodeIds?: ReadonlySet<string>;
  unsavedNodeIds?: ReadonlySet<string>;
  onAddConnector: (type: ConnectComponentType | 'resource') => void;
  onBrowseTemplates?: () => void;
  onOpenCommandMenu: (filter?: 'all' | 'variables' | 'secrets' | 'topics' | 'users') => void;
}) {
  // View mode is read-only; only wire add handlers otherwise.
  const canEdit = mode !== 'view';
  // The tree/decoration consumers below tolerate slightly-stale YAML, so defer it to keep their
  // full-document parses off the per-keystroke critical path (the Monaco editor stays live).
  const deferredYaml = useDeferredValue(yamlContent);
  const offerTemplate = useShouldOfferTemplate(deferredYaml);
  const showStructureTree = isPipelineDiagramsEnabled;

  // Two-way sync: clicking a node reveals/selects its lines; moving the cursor highlights the node.
  const editorInstance = usePipelineEditorStore((s) => s.editorInstance);
  const [activeNodeId, setActiveNodeId] = useState<string | undefined>();
  // Node → YAML line ranges.
  const nodeRanges = useMemo(() => {
    try {
      return nodeLineRanges(deferredYaml);
    } catch {
      return [];
    }
  }, [deferredYaml]);
  // Latest ranges for the long-lived cursor listener, without re-subscribing per keystroke.
  const nodeRangesRef = useRef(nodeRanges);
  nodeRangesRef.current = nodeRanges;

  const revealNodeInEditor = useCallback(
    (nodeId?: string) => {
      const ed = editorInstance;
      const range = nodeId ? nodeRanges.find((r) => r.id === nodeId) : undefined;
      const model = ed?.getModel();
      if (!(ed && range && model)) {
        return;
      }
      const endLine = Math.min(range.end, model.getLineCount());
      ed.setSelection({
        startLineNumber: range.start,
        startColumn: 1,
        endLineNumber: endLine,
        endColumn: model.getLineMaxColumn(endLine),
      });
      ed.revealLineInCenterIfOutsideViewport(range.start);
      ed.focus();
    },
    [editorInstance, nodeRanges]
  );

  const handleSelectNode = useCallback(
    (highlightId: string, editableId?: string) => {
      setActiveNodeId(highlightId);
      revealNodeInEditor(editableId);
    },
    [revealNodeInEditor]
  );

  // Editor cursor → highlight the most specific node enclosing the caret line.
  useEffect(() => {
    if (!editorInstance) {
      return;
    }
    const sub = editorInstance.onDidChangeCursorPosition((e) => {
      setActiveNodeId(enclosingNodeId(e.position.lineNumber, nodeRangesRef.current));
    });
    return () => sub.dispose();
  }, [editorInstance]);

  // Pending reveal request from the Visual lane: honour once editor + ranges mount, then clear (fires once).
  const revealNodeId = usePipelineEditorStore((s) => s.revealNodeId);
  const requestRevealNode = usePipelineEditorStore((s) => s.requestRevealNode);
  const revealAttemptRef = useRef<{ id: string | null; count: number }>({ id: null, count: 0 });
  useEffect(() => {
    if (!revealNodeId) {
      revealAttemptRef.current = { id: null, count: 0 };
      return;
    }
    if (revealAttemptRef.current.id !== revealNodeId) {
      revealAttemptRef.current = { id: revealNodeId, count: 0 };
    }
    const range = nodeRanges.find((r) => r.id === revealNodeId);
    if (editorInstance?.getModel() && range) {
      setActiveNodeId(revealNodeId);
      revealNodeInEditor(revealNodeId);
      requestRevealNode(null);
      return;
    }
    // Bounded retry: allow a few re-runs (editor mount, ranges catch-up), then drop the request
    // so an id that never resolves can't fire as a surprise jump much later.
    revealAttemptRef.current.count += 1;
    if (revealAttemptRef.current.count > MAX_REVEAL_ATTEMPTS) {
      requestRevealNode(null);
    }
  }, [revealNodeId, editorInstance, nodeRanges, revealNodeInEditor, requestRevealNode]);
  const showTemplateCta = showStructureTree && canEdit && Boolean(onBrowseTemplates) && offerTemplate;

  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-hidden border-border! border-r">
      {/* Relative so the template entry point can float pinned at the bottom with an enter/exit animation. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ScrollShadow className="h-full overflow-x-hidden">
          {showStructureTree ? (
            <PipelineStructureTree
              configYaml={deferredYaml}
              errorNodeIds={errorNodeIds}
              onAddConnector={canEdit ? (section) => onAddConnector(section as ConnectComponentType) : undefined}
              onSelectNode={handleSelectNode}
              selectedNodeId={activeNodeId}
              unsavedNodeIds={unsavedNodeIds}
            />
          ) : null}
        </ScrollShadow>
        {showStructureTree && onBrowseTemplates ? (
          <TemplateGalleryCta onBrowseTemplates={onBrowseTemplates} show={showTemplateCta} />
        ) : null}
      </div>
      {mode !== 'view' && (
        <>
          <AddConnectorsCard
            editorContent={yamlContent}
            hasInput={yamlContent.includes('input:')}
            hasOutput={yamlContent.includes('output:')}
            hideInputOutput={isPipelineDiagramsEnabled}
            onAddConnector={onAddConnector}
          />
          <div className="px-4 pb-4">
            <Separator className="mb-3" variant="subtle" />
            <div className="flex flex-col gap-2">
              <Heading className="mb-2 text-muted-foreground" level={5}>
                Variables
              </Heading>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="max-w-fit"
                  icon={<Plus />}
                  onClick={() => onOpenCommandMenu('variables')}
                  size="xs"
                  variant="outline"
                >
                  <Zap />
                  Variables
                </Button>
                <Button
                  className="max-w-fit"
                  icon={<Plus />}
                  onClick={() => onOpenCommandMenu('secrets')}
                  size="xs"
                  variant="outline"
                >
                  <KeyRound />
                  Secrets
                </Button>
                <Button
                  className="max-w-fit"
                  icon={<Plus />}
                  onClick={() => onOpenCommandMenu('topics')}
                  size="xs"
                  variant="outline"
                >
                  <LayoutGrid />
                  Topics
                </Button>
                <Button
                  className="max-w-fit"
                  icon={<Plus />}
                  onClick={() => onOpenCommandMenu('users')}
                  size="xs"
                  variant="outline"
                >
                  <User />
                  Users
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PipelinePage() {
  const { pipelineId } = usePipelineMode();
  // With the visual editor enabled, open editing on the Visual lane by default. The visual editor
  // builds on the diagram parsing/outline, so it also requires the diagrams flag.
  const isVisualEditorEnabled =
    isFeatureFlagEnabled('enableRpcnVisualEditor') && isFeatureFlagEnabled('enablePipelineDiagrams') && isEmbedded();
  // Keyed by pipeline id so each pipeline gets a fresh editor store.
  return (
    <PipelineEditorProvider initialEditLane={isVisualEditorEnabled ? 'visual' : 'yaml'} key={pipelineId ?? 'create'}>
      <PipelinePageContent />
    </PipelineEditorProvider>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: top-level page wiring across many concerns
function PipelinePageContent() {
  const { mode, pipelineId } = usePipelineMode();
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ strict: false }) as { serverless?: string };
  const isSlashMenuEnabled = isFeatureFlagEnabled('enableConnectSlashMenu');
  const isServerlessMode = search.serverless === 'true';
  const isPipelineDiagramsEnabled = isFeatureFlagEnabled('enablePipelineDiagrams') && isEmbedded();
  // The visual editor builds on the diagram parsing/outline, so it also requires the diagrams flag.
  const isVisualEditorEnabled = isFeatureFlagEnabled('enableRpcnVisualEditor') && isPipelineDiagramsEnabled;
  const isTemplateGalleryEnabled = isFeatureFlagEnabled('enableRpcnTemplateGallery');

  // Actions are stable, so read them once via getState; values use selectors.
  const editorStore = usePipelineEditorStoreApi();
  const {
    setYamlContent,
    patchComponent,
    setEditorInstance,
    hydrateFromServer,
    resolveInitialYaml,
    setAllowNavigation,
    setActiveViewLane,
    setActiveEditLane,
    requestRevealNode,
    setCommandMenuFilter,
    setAddConnectorType,
    setIsConfigDialogOpen,
    setIsViewConfigDialogOpen,
    setIsDeleteAlertOpen,
    setIsTemplateDialogOpen,
  } = editorStore.getState();

  const yamlContent = usePipelineEditorStore((s) => s.yamlContent);
  const initialYaml = usePipelineEditorStore((s) => s.initialYaml);
  const editorInstance = usePipelineEditorStore((s) => s.editorInstance);
  const hydratedPipelineId = usePipelineEditorStore((s) => s.hydratedPipelineId);
  const activeViewLane = usePipelineEditorStore((s) => s.activeViewLane);
  const activeEditLane = usePipelineEditorStore((s) => s.activeEditLane);
  const selectedNodeId = usePipelineEditorStore((s) => s.selectedNodeId);
  const commandMenuFilter = usePipelineEditorStore((s) => s.commandMenuFilter);
  const addConnectorType = usePipelineEditorStore((s) => s.addConnectorType);
  const isConfigDialogOpen = usePipelineEditorStore((s) => s.isConfigDialogOpen);
  const isViewConfigDialogOpen = usePipelineEditorStore((s) => s.isViewConfigDialogOpen);
  const isDeleteAlertOpen = usePipelineEditorStore((s) => s.isDeleteAlertOpen);
  const isTemplateDialogOpen = usePipelineEditorStore((s) => s.isTemplateDialogOpen);
  const tipsContext = tipsContextForLane(mode === 'view', activeViewLane, activeEditLane);

  const form = useForm<PipelineFormValues>({
    resolver: zodResolver(pipelineFormSchema) as Resolver<PipelineFormValues>,
    mode: 'onSubmit',
    defaultValues: { name: '', description: '', computeUnits: MIN_TASKS, tags: [] },
  });

  const handleSlashOpen = useCallback(() => setCommandMenuFilter(null), [setCommandMenuFilter]);
  const slashCommand = useSlashCommand(mode !== 'view' ? editorInstance : null, isSlashMenuEnabled, handleSlashOpen);

  const handleCommandMenuOpen = useCallback(
    (filter: 'all' | 'variables' | 'secrets' | 'topics' | 'users' = 'all') => {
      slashCommand.close();
      setCommandMenuFilter(filter);
    },
    [slashCommand, setCommandMenuFilter]
  );

  const { data: pipelineResponse } = useGetPipelineQuery(
    { id: pipelineId || '' },
    { enabled: mode !== 'create' && !!pipelineId }
  );
  const pipeline = useMemo(() => pipelineResponse?.response?.pipeline, [pipelineResponse]);

  const { data: componentListResponse } = useListComponentsQuery();
  const components = useMemo(
    () => (componentListResponse?.components ? parseSchema(componentListResponse.components) : []),
    [componentListResponse]
  );

  const { data: schemaResponse } = useGetPipelineServiceConfigSchemaQuery();
  const yamlEditorSchema = useMemo(() => parseYamlEditorSchema(schemaResponse?.configSchema), [schemaResponse]);

  // Lets a successful save navigate away without tripping the unsaved-changes guard.
  const markNavigationAllowed = useCallback(() => setAllowNavigation(true), [setAllowNavigation]);

  const { handleSave, handleDelete, clearWizardStore, errorLintHints, clearErrorLintHints, isSaving, isDeleting } =
    usePipelineSave({
      form,
      editorStore,
      mode,
      pipelineId,
      pipeline,
      isPipelineDiagramsEnabled,
      onBeforeSaveNavigate: markNavigationAllowed,
    });
  const { lintHints, isLintPending } = usePipelineLint(yamlContent, errorLintHints, mode !== 'view');

  // Guard against losing unsaved edits when navigating away from the editor (edit or create).
  const yamlDirty = initialYaml !== null && yamlContent !== initialYaml;
  const hasUnsavedChanges = mode !== 'view' && (form.formState.isDirty || yamlDirty);

  // Guard-time dirty check: flush any in-progress inspector draft into the store first (the
  // rendered `hasUnsavedChanges` above can't see a pending draft), then re-read fresh state.
  const checkUnsavedChanges = useCallback(() => {
    if (mode === 'view') {
      return false;
    }
    editorStore.getState().pendingEditCommit?.();
    const { yamlContent: yaml, initialYaml: baseline } = editorStore.getState();
    return form.formState.isDirty || (baseline !== null && yaml !== baseline);
  }, [mode, editorStore, form]);

  // Node-level highlights for the structure tree (lint errors + unsaved edits). Deferred YAML keeps
  // these full-document parses/diffs off the per-keystroke critical path.
  const deferredYamlContent = useDeferredValue(yamlContent);
  const errorNodeIds = useMemo(
    () => new Set(mapLintHintsToNodes(deferredYamlContent, Object.values(lintHints)).keys()),
    [deferredYamlContent, lintHints]
  );
  const unsavedNodeIds = useMemo(
    () =>
      mode !== 'view' && initialYaml !== null
        ? new Set(changedNodeIds(initialYaml, deferredYamlContent))
        : EMPTY_NODE_IDS,
    [mode, initialYaml, deferredYamlContent]
  );
  const blocker = useBlocker({
    shouldBlockFn: () => checkUnsavedChanges() && !editorStore.getState().allowNavigation,
    enableBeforeUnload: () => checkUnsavedChanges(),
    withResolver: true,
  });
  // Re-arm the guard whenever the mode changes (e.g. after the post-save nav to view).
  useEffect(() => {
    setAllowNavigation(false);
  }, [mode, setAllowNavigation]);

  // ⌘S / Ctrl+S saves from both the YAML and Visual lanes.
  useSaveHotkey({ enabled: mode !== 'view', isSaving, onSave: handleSave });

  // On any document change: clear stale lint and mirror the create-mode draft to the wizard store.
  useEffect(
    () =>
      editorStore.subscribe((state, prev) => {
        if (state.yamlContent === prev.yamlContent) {
          return;
        }
        clearErrorLintHints();
        if (mode === 'create' && !isPipelineDiagramsEnabled) {
          useRpcnWizardStore.getState().setYamlContent({ yamlContent: state.yamlContent });
        }
      }),
    [editorStore, clearErrorLintHints, mode, isPipelineDiagramsEnabled]
  );

  // Move the caret to the end after a programmatic edit so the user sees the change.
  const focusEditorEnd = useCallback(() => {
    setTimeout(() => {
      const ed = editorStore.getState().editorInstance;
      if (!ed) {
        return;
      }
      const model = ed.getModel();
      if (model) {
        const lastLine = model.getLineCount();
        ed.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
        ed.revealLine(lastLine);
      }
      ed.focus();
    }, 0);
  }, [editorStore]);

  const { topicDialog, userDialog, topicStepRef, userStepRef, connectorTopics, handleAddTopic, handleAddSasl } =
    useDiagramDialogs(yamlContent, patchComponent, focusEditorEnd);

  const handleConnectorSelected = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      setAddConnectorType(null);
      const newYaml = getConnectTemplate({
        connectionName,
        connectionType,
        components,
        showAdvancedFields: false,
        existingYaml: yamlContent,
      });
      if (newYaml) {
        setYamlContent(newYaml);
        focusEditorEnd();
      }
    },
    [components, yamlContent, setYamlContent, focusEditorEnd, setAddConnectorType]
  );

  // Hydrate from the loaded pipeline once per id, so re-renders don't clobber edits.
  useEffect(() => {
    if (pipeline && mode !== 'create' && pipeline.id !== hydratedPipelineId) {
      hydrateFromServer(pipeline.id, pipeline.configYaml);
    }
  }, [pipeline, mode, hydratedPipelineId, hydrateFromServer]);

  // Populate the form from the loaded pipeline. The query polls while starting/stopping, so a
  // DIRTY form is never reset (would clobber in-progress edits) — but a clean form re-syncs when
  // the server payload changes (stale-cache refetch, or a concurrent rename must not be reverted).
  const formResetSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    if (!(pipeline && mode === 'edit')) {
      return;
    }
    const values = {
      name: pipeline.displayName,
      description: pipeline.description || '',
      computeUnits: cpuToTasks(pipeline.resources?.cpuShares) || MIN_TASKS,
      tags: getUserTagEntries(pipeline.tags),
    };
    const snapshot = `${pipeline.id}\n${JSON.stringify(values)}`;
    if (snapshot === formResetSnapshotRef.current || form.formState.isDirty) {
      return;
    }
    formResetSnapshotRef.current = snapshot;
    form.reset(values);
  }, [pipeline, mode, form]);

  const handleInitialYamlResolved = useCallback((yaml: string) => resolveInitialYaml(yaml), [resolveInitialYaml]);

  const { isInitializing: isServerlessInitializing } = useCreateModeInitialYaml({
    enabled: mode === 'create',
    isServerlessMode,
    components,
    isPipelineDiagramsEnabled,
    onResolved: handleInitialYamlResolved,
  });

  // Non-serverless create + visual editor: useCreateModeInitialYaml bails when diagrams are on, so
  // no baseline resolves — seed from the starting content, else `initialYaml` stays null, the guard
  // never arms, and canvas-only edits are lost on navigate-away. Serverless is excluded (it resolves
  // its own baseline once components load; seeding '' first would leave a stale baseline → false-dirty).
  useEffect(() => {
    if (mode === 'create' && isPipelineDiagramsEnabled && !isServerlessMode && initialYaml === null) {
      resolveInitialYaml(yamlContent);
    }
  }, [mode, isPipelineDiagramsEnabled, isServerlessMode, initialYaml, yamlContent, resolveInitialYaml]);

  const handleCancel = useCallback(() => {
    if (mode === 'create') {
      clearWizardStore();
    }
    // Route through `navigate` (not history.back) so the unsaved-changes blocker intercepts.
    if (mode === 'edit' && pipelineId) {
      navigate({ to: `/rp-connect/${pipelineId}` });
      return;
    }
    if (mode === 'view') {
      navigateToConnectClusters(navigate);
      return;
    }
    if (router.history.canGoBack()) {
      router.history.back();
    } else {
      navigateToConnectClusters(navigate);
    }
  }, [mode, clearWizardStore, navigate, pipelineId, router]);

  // Visual lanes take the full canvas, so the YAML/diagram sidebar is hidden.
  const isViewVisualLane = mode === 'view' && activeViewLane === 'visual';
  const isEditVisualLane = mode !== 'view' && activeEditLane === 'visual';
  const showSidebar = !(isViewVisualLane || isEditVisualLane);

  // Open the YAML lane and reveal a node: explicit id, else the selected node. Routes per mode.
  const goToYamlNode = useCallback(
    (nodeId?: string) => {
      const target = nodeId ?? selectedNodeId;
      if (target) {
        requestRevealNode(target);
      }
      if (mode === 'view') {
        setActiveViewLane('configuration');
      } else {
        // Commit the selected node's in-progress edit before unmounting the Visual lane,
        // otherwise the lane switch discards it (no commit-on-unmount).
        editorStore.getState().pendingEditCommit?.();
        setActiveEditLane('yaml');
      }
    },
    [mode, selectedNodeId, requestRevealNode, setActiveViewLane, setActiveEditLane, editorStore]
  );

  return (
    // Bounded to the viewport (definite height, not just a min) so a tall lane scrolls WITHIN the
    // framed panel instead of stretching the page. Reserve only the chrome ABOVE (app header + pt-8),
    // NOT the footer — the editor fills the screen and the footer sits below the fold rather than
    // eating height. overflow-x-clip (not hidden) blocks stray horizontal overflow but keeps overflow-y.
    <div className="flex h-[calc(100dvh-7rem)] min-h-[500px] min-w-0 flex-col gap-4 overflow-x-clip">
      {mode === 'view' && pipeline ? (
        <PipelineViewHeader
          onBack={handleCancel}
          onViewDetails={() => setIsViewConfigDialogOpen(true)}
          pipeline={pipeline}
        />
      ) : null}
      {mode === 'view' && !pipeline ? (
        <div className="flex items-center gap-2">
          <Button aria-label="Go back" className="-ml-3.5 shrink-0" onClick={handleCancel} size="icon" variant="ghost">
            <ArrowLeftIcon className="h-5 w-5" />
          </Button>
          <Skeleton variant="text" width="md" />
        </div>
      ) : null}
      {mode !== 'view' ? (
        <PipelineEditHeader
          form={form}
          hasUnsavedChanges={hasUnsavedChanges}
          isSaving={isSaving}
          mode={mode as 'create' | 'edit'}
          onBack={handleCancel}
          onEditSettings={() => setIsConfigDialogOpen(true)}
          onSave={handleSave}
          url={pipeline?.url}
        />
      ) : null}
      {/* Editor frame flexes to fill the column; the tips strip is pinned just beneath so it stays visible. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {/* Framed panel: the lane tabs sit flush at the top (their full-width underline is the
            internal divider) with the content below, all inside one rounded border. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border!">
          {mode === 'view' && pipeline ? (
            <Tabs value={activeViewLane}>
              {/* Full-width list (so the underline divider spans) with content-width triggers so tabs pack left. */}
              <TabsList className="[&_[data-slot=tabs-trigger]]:w-auto" variant="underline">
                <TabsTrigger onClick={() => setActiveViewLane('monitor')} value="monitor" variant="underline">
                  Monitor
                </TabsTrigger>
                <TabsTrigger onClick={() => goToYamlNode()} value="configuration" variant="underline">
                  YAML
                </TabsTrigger>
                {isVisualEditorEnabled ? (
                  <TabsTrigger onClick={() => setActiveViewLane('visual')} value="visual" variant="underline">
                    Visual
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </Tabs>
          ) : null}
          {mode !== 'view' && isVisualEditorEnabled ? (
            <Tabs value={activeEditLane}>
              {/* Full-width list (so the underline divider spans) with content-width triggers so tabs pack left. */}
              <TabsList className="[&_[data-slot=tabs-trigger]]:w-auto" variant="underline">
                <TabsTrigger onClick={() => goToYamlNode()} value="yaml" variant="underline">
                  YAML
                </TabsTrigger>
                <TabsTrigger onClick={() => setActiveEditLane('visual')} value="visual" variant="underline">
                  Visual
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
          {/* min-w-0 + overflow-hidden keep the editor region from propagating width upward. */}
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {showSidebar ? (
              <SidebarPanel
                errorNodeIds={errorNodeIds}
                isPipelineDiagramsEnabled={isPipelineDiagramsEnabled}
                mode={mode}
                onAddConnector={(type) => setAddConnectorType(type)}
                onBrowseTemplates={isTemplateGalleryEnabled ? () => setIsTemplateDialogOpen(true) : undefined}
                onOpenCommandMenu={handleCommandMenuOpen}
                unsavedNodeIds={unsavedNodeIds}
                yamlContent={yamlContent}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              {mode === 'view' && activeViewLane === 'monitor' ? <ViewModePanel pipeline={pipeline} /> : null}
              {mode === 'view' && pipeline && activeViewLane === 'configuration' ? (
                <YamlViewPanel configYaml={pipeline.configYaml} schema={yamlEditorSchema} />
              ) : null}
              {mode === 'view' && pipeline && activeViewLane === 'visual' ? (
                <VisualEditorPanel
                  componentList={componentListResponse?.components ?? ({} as ComponentList)}
                  components={components}
                  lintHints={Object.values(lintHints)}
                  mode="view"
                  onNavigateToYaml={goToYamlNode}
                  onYamlChange={setYamlContent}
                  yamlContent={pipeline.configYaml}
                />
              ) : null}
              {mode !== 'view' && activeEditLane === 'visual' ? (
                <VisualEditorPanel
                  componentList={componentListResponse?.components ?? ({} as ComponentList)}
                  components={components}
                  // Only edit mode waits on a server fetch/hydration; a new pipeline (create) is
                  // immediately editable, so it shows its empty state rather than a skeleton.
                  isLoading={mode === 'edit' && initialYaml === null}
                  lintHints={Object.values(lintHints)}
                  mode={mode}
                  onAddConnector={(type) => setAddConnectorType(type)}
                  onAddSasl={handleAddSasl}
                  onAddTopic={handleAddTopic}
                  onBrowseTemplates={isTemplateGalleryEnabled ? () => setIsTemplateDialogOpen(true) : undefined}
                  onNavigateToYaml={goToYamlNode}
                  onYamlChange={setYamlContent}
                  yamlContent={yamlContent}
                />
              ) : null}
              {mode === 'view' || activeEditLane === 'visual' ? null : (
                <EditorPanel
                  isLintPending={isLintPending}
                  isServerlessInitializing={isServerlessInitializing}
                  lintHints={lintHints}
                  onEditorMount={setEditorInstance}
                  onYamlChange={setYamlContent}
                  yamlContent={yamlContent}
                  yamlEditorSchema={yamlEditorSchema}
                />
              )}
            </div>
          </div>
        </div>
        {tipsContext ? (
          <EditorTipsBar context={tipsContext} readOnly={mode === 'view'} slashMenuEnabled={isSlashMenuEnabled} />
        ) : null}
      </div>

      <ConfigDialog form={form} mode={mode} onOpenChange={setIsConfigDialogOpen} open={isConfigDialogOpen} />

      <DetailsDialog
        onOpenChange={setIsViewConfigDialogOpen}
        onRequestDelete={
          pipeline
            ? () => {
                // Close the details dialog first so the two don't stack.
                setIsViewConfigDialogOpen(false);
                setIsDeleteAlertOpen(true);
              }
            : undefined
        }
        open={isViewConfigDialogOpen}
        pipeline={pipeline}
      />

      {pipeline ? (
        <DeleteResourceAlertDialog
          isDeleting={isDeleting}
          onDelete={handleDelete}
          onOpenChange={setIsDeleteAlertOpen}
          open={isDeleteAlertOpen}
          resourceId={pipeline.id}
          resourceName={pipeline.displayName || 'this pipeline'}
          resourceType="Pipeline"
        />
      ) : null}

      <Dialog onOpenChange={(open) => (open ? undefined : blocker.reset?.())} open={blocker.status === 'blocked'}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            You have unsaved changes to this pipeline. If you leave now, your changes will be lost.
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => blocker.reset?.()} variant="ghost">
              Keep editing
            </Button>
            <Button onClick={() => blocker.proceed?.()} variant="primary">
              Leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PipelineCommandMenu
        editorInstance={editorInstance}
        initialFilter={commandMenuFilter ?? undefined}
        onOpenChange={(open) => {
          if (!open) {
            setCommandMenuFilter(null);
          }
        }}
        open={commandMenuFilter !== null}
        yamlContent={yamlContent}
      />

      {isSlashMenuEnabled ? (
        <PipelineCommandMenu
          editorInstance={editorInstance}
          onOpenChange={(open) => {
            if (!open) {
              slashCommand.close();
            }
          }}
          onSlashSelect={slashCommand.handleSlashSelect}
          open={slashCommand.isOpen}
          slashPosition={slashCommand.slashPosition}
          variant="popover"
          yamlContent={yamlContent}
        />
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            topicDialog.close();
          }
        }}
        open={topicDialog.isOpen}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Add topic</DialogTitle>
            <DialogDescription>
              This component requires a Redpanda topic for logging the data. Select an existing topic, or create a new
              one.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <AddTopicStep hideTitle inline ref={topicStepRef} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={topicDialog.close} variant="secondary-ghost">
              Cancel
            </Button>
            <Button
              disabled={topicDialog.isSubmitting}
              icon={topicDialog.isSubmitting ? <Spinner /> : undefined}
              onClick={topicDialog.submit}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            userDialog.close();
          }
        }}
        open={userDialog.isOpen}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Select or create a user for this connector. ACLs will be configured automatically for the topic when
              creating a new user.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {connectorTopics && connectorTopics.length > 1 && (
              <Alert variant="warning">
                <AlertTitle>Multiple topics configured</AlertTitle>
                <AlertDescription>
                  This connector uses multiple topics ({connectorTopics.join(', ')}). You will need to configure topic
                  ACLs for this user manually in the Security settings.
                </AlertDescription>
              </Alert>
            )}
            <AddUserStep
              hideTitle
              inline
              ref={userStepRef}
              showConsumerGroupFields={userDialog.target?.section === 'input'}
              topicName={connectorTopics?.length === 1 ? connectorTopics[0] : undefined}
            />
          </DialogBody>
          <DialogFooter>
            <Button onClick={userDialog.close} variant="secondary-ghost">
              Cancel
            </Button>
            <Button
              disabled={userDialog.isSubmitting}
              icon={userDialog.isSubmitting ? <Spinner /> : undefined}
              onClick={userDialog.submit}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddConnectorDialog
        components={componentListResponse?.components ?? ({} as ComponentList)}
        connectorType={
          addConnectorType === 'resource'
            ? (['cache', 'rate_limit', 'buffer', 'scanner', 'tracer', 'metrics'] satisfies ConnectComponentType[])
            : (addConnectorType ?? undefined)
        }
        isOpen={addConnectorType !== null}
        onAddConnector={handleConnectorSelected}
        onCloseAddConnector={() => setAddConnectorType(null)}
        searchPlaceholder={getConnectorDialogPlaceholder(addConnectorType)}
        title={getConnectorDialogTitle(addConnectorType)}
      />

      {isTemplateGalleryEnabled && mode !== 'view' ? (
        <TemplateGalleryDialog
          onClose={(stashedYaml) => {
            if (stashedYaml) {
              setYamlContent(stashedYaml);
            }
            setIsTemplateDialogOpen(false);
          }}
          onSubmit={({ pipelineName: suggestedName, yaml }) => {
            setYamlContent(yaml);
            if (!form.getValues('name')) {
              form.setValue('name', suggestedName, { shouldDirty: true, shouldValidate: true });
            }
            setIsTemplateDialogOpen(false);
            toast.success('Template applied — review the YAML and click Save to deploy.');
          }}
          open={isTemplateDialogOpen}
        />
      ) : null}
    </div>
  );
}
