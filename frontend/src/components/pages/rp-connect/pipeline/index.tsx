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
import { Banner, BannerClose, BannerContent } from 'components/redpanda-ui/components/banner';
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
import { Kbd } from 'components/redpanda-ui/components/kbd';
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
import { useDebouncedValue } from 'hooks/use-debounced-value';
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Resolver, type UseFormReturn, useForm } from 'react-hook-form';
import {
  useGetPipelineServiceConfigSchemaQuery,
  useLintPipelineConfigQuery,
  useListComponentsQuery,
} from 'react-query/api/connect';
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
import { PipelineCommandMenu } from './pipeline-command-menu';
import { PipelineFlowDiagram } from './pipeline-flow-diagram';
import { PipelineEditHeader, PipelineViewHeader } from './pipeline-header';
import { PipelineStructureTree } from './pipeline-structure-tree';
import { PipelineThroughputCard } from './pipeline-throughput-card';
import { TemplateGalleryCta } from './template-cta';
import { PipelineEditorProvider, usePipelineEditorStore, usePipelineEditorStoreApi } from './use-pipeline-editor-store';
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
import { parsePipelineFlowTree } from '../utils/pipeline-flow-parser';
import { enclosingNodeId, mergeLintHints, nodeLineRanges } from '../utils/pipeline-lint';
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

function usePipelineLint(yamlContent: string, errorLintHints: Record<string, LintHint>, enabled: boolean) {
  const debouncedYamlContent = useDebouncedValue(yamlContent, 500);
  const { data: lintResponse, isPending: isLintPending } = useLintPipelineConfigQuery(debouncedYamlContent, {
    enabled,
  });

  // Deduped merge: after a failed save the same problem arrives from both the
  // error details and the re-lint of the unchanged YAML.
  const lintHints = useMemo(
    () => mergeLintHints(errorLintHints, lintResponse?.lintHints ?? []),
    [errorLintHints, lintResponse]
  );

  return { lintHints, isLintPending };
}

function usePipelineSave({
  form,
  yamlContent,
  mode,
  pipelineId,
  pipeline,
  isPipelineDiagramsEnabled,
  onBeforeSaveNavigate,
}: {
  form: UseFormReturn<PipelineFormValues>;
  yamlContent: string;
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
    yamlContent,
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
  // Top/bottom shadows from Monaco's scroll position (useScrollShadow needs a native
  // scroll container; Monaco virtualizes, so onDidScrollChange is the only signal).
  const [overflow, setOverflow] = useState({ top: false, bottom: false });
  // Listener disposables from the editor mount, torn down on unmount (effect below). Without
  // this the sync closures (which capture the editor) keep the editor + listener graph alive
  // per mount of the view page.
  const scrollSyncSubscriptions = useRef<ReturnType<editor.IStandaloneCodeEditor['onDidScrollChange']>[]>([]);
  // Register the (read-only) viewer as the active editor so node selection from the
  // sidebar / Visual lane can reveal + select lines here too, just like edit mode.
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
      <section className="flex min-h-0 flex-col gap-4">
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
  slashTipVisible,
  onDismissSlashTip,
  yamlContent,
  onYamlChange,
  onEditorMount,
  yamlEditorSchema,
  lintHints,
  isLintPending,
}: {
  isServerlessInitializing: boolean;
  slashTipVisible: boolean;
  onDismissSlashTip: () => void;
  yamlContent: string;
  onYamlChange: (val: string) => void;
  onEditorMount: (editorRef: editor.IStandaloneCodeEditor) => void;
  yamlEditorSchema: ReturnType<typeof parseYamlEditorSchema>;
  lintHints: Record<string, LintHint>;
  isLintPending: boolean;
}) {
  return (
    <ResizablePanelGroup direction="vertical">
      <ResizablePanel defaultSize={70} minSize={30}>
        <div className="relative h-full">
          {isServerlessInitializing ? (
            <EditorSkeleton />
          ) : (
            <>
              {slashTipVisible ? (
                <div className="absolute inset-x-0 top-0 z-10 rounded-t-lg">
                  <Banner className="absolute inset-x-0 top-0" height="2rem" variant="accent">
                    <BannerContent>
                      Tip: Use{' '}
                      <Kbd size="xs" variant="filled">
                        /
                      </Kbd>{' '}
                      to insert variables
                    </BannerContent>
                    <BannerClose onClick={onDismissSlashTip} variant="ghost" />
                  </Banner>
                </div>
              ) : null}
              {/* Out of flow so Monaco can't feed its width up the layout and latch the page wide. */}
              <div className="absolute inset-0">
                <YamlEditor
                  onChange={(val) => onYamlChange(val || '')}
                  onEditorMount={onEditorMount}
                  options={slashTipVisible ? { padding: { top: 32 } } : undefined}
                  schema={yamlEditorSchema}
                  transparentBackground
                  value={yamlContent}
                />
              </div>
            </>
          )}
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel collapsible defaultSize={30}>
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

// A freshly-started pipeline has no real components yet — only section labels and
// `none` placeholders. Mirrors the old mini-diagram's "empty" check.
function useIsPipelineEmpty(yamlContent: string): boolean {
  return useMemo(() => {
    const { nodes } = parsePipelineFlowTree(yamlContent);
    return !nodes.some((n) => n.kind === 'group' || (n.kind === 'leaf' && n.label !== 'none'));
  }, [yamlContent]);
}

function SidebarPanel({
  mode,
  yamlContent,
  isPipelineDiagramsEnabled,
  isVisualEditorEnabled,
  onAddConnector,
  onAddTopic,
  onAddSasl,
  onBrowseTemplates,
  onOpenCommandMenu,
}: {
  mode: string;
  yamlContent: string;
  isPipelineDiagramsEnabled: boolean;
  isVisualEditorEnabled: boolean;
  onAddConnector: (type: ConnectComponentType | 'resource') => void;
  onAddTopic: (section: string, componentName: string) => void;
  onAddSasl: (section: string, componentName: string) => void;
  onBrowseTemplates?: () => void;
  onOpenCommandMenu: (filter?: 'all' | 'variables' | 'secrets' | 'topics' | 'users') => void;
}) {
  // View mode is read-only; only wire add handlers otherwise.
  const canEdit = mode !== 'view';
  const isEmpty = useIsPipelineEmpty(yamlContent);
  // The refreshed side-lane (structure outline) ships behind the visual-editor flag;
  // with it off we fall back to the original `PipelineFlowDiagram` mini-diagram.
  const showNewLane = isPipelineDiagramsEnabled && isVisualEditorEnabled;
  const showOldLane = isPipelineDiagramsEnabled && !isVisualEditorEnabled;

  // Two-way sync between the outline and the YAML editor: clicking a node reveals +
  // selects its lines, and moving the cursor in the editor highlights the node.
  const editorInstance = usePipelineEditorStore((s) => s.editorInstance);
  const [activeNodeId, setActiveNodeId] = useState<string | undefined>();
  // Node → YAML line ranges, recomputed as the document changes.
  const nodeRanges = useMemo(() => {
    try {
      return nodeLineRanges(yamlContent);
    } catch {
      return [];
    }
  }, [yamlContent]);
  // Keep the latest ranges available to the (long-lived) cursor listener without
  // re-subscribing on every keystroke.
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

  // A pending reveal request from the Visual lane (switching to YAML with a node
  // selected, or the inspector's "View in YAML"). Honour it once the editor + ranges
  // are mounted after the lane switch, then clear it so it fires only once.
  const revealNodeId = usePipelineEditorStore((s) => s.revealNodeId);
  const requestRevealNode = usePipelineEditorStore((s) => s.requestRevealNode);
  useEffect(() => {
    if (!revealNodeId) {
      return;
    }
    const range = nodeRanges.find((r) => r.id === revealNodeId);
    if (!(editorInstance?.getModel() && range)) {
      return;
    }
    setActiveNodeId(revealNodeId);
    revealNodeInEditor(revealNodeId);
    requestRevealNode(null);
  }, [revealNodeId, editorInstance, nodeRanges, revealNodeInEditor, requestRevealNode]);
  const showTemplateCta = showNewLane && canEdit && Boolean(onBrowseTemplates) && isEmpty;
  // The old mini-diagram renders its own template entry point internally; the new
  // lane uses the floating CTA below instead.
  const oldDiagramHandlers = canEdit
    ? {
        onAddConnector: (type: string) => onAddConnector(type as ConnectComponentType),
        onAddSasl,
        onAddTopic,
        onBrowseTemplates,
      }
    : {};

  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-hidden border-border! border-r">
      {/* Visualizer region (relative) so the template entry point can float pinned
          at its bottom with an enter/exit animation, like the old mini-diagram. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto overflow-x-hidden">
          {showNewLane ? (
            <PipelineStructureTree
              configYaml={yamlContent}
              onAddConnector={canEdit ? (section) => onAddConnector(section as ConnectComponentType) : undefined}
              onSelectNode={handleSelectNode}
              selectedNodeId={activeNodeId}
            />
          ) : null}
          {showOldLane ? (
            <PipelineFlowDiagram configYaml={yamlContent} hideZoomControls {...oldDiagramHandlers} />
          ) : null}
        </div>
        {showNewLane && onBrowseTemplates ? (
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
  const { mode, pipelineId } = usePipelineMode();
  const isSlashMenuEnabled = isFeatureFlagEnabled('enableConnectSlashMenu');
  // When the visual editor is enabled, open editing on the Visual lane by default.
  const isVisualEditorEnabled = isFeatureFlagEnabled('enableRpcnVisualEditor') && isEmbedded();
  // Keyed by pipeline id so each pipeline gets a fresh editor store.
  return (
    <PipelineEditorProvider
      initialEditLane={isVisualEditorEnabled ? 'visual' : 'yaml'}
      initialSlashTipVisible={isSlashMenuEnabled && mode !== 'view'}
      key={pipelineId ?? 'create'}
    >
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
  const isVisualEditorEnabled = isFeatureFlagEnabled('enableRpcnVisualEditor') && isEmbedded();
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
    setSlashTipVisible,
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
  const slashTipVisible = usePipelineEditorStore((s) => s.slashTipVisible);
  const isConfigDialogOpen = usePipelineEditorStore((s) => s.isConfigDialogOpen);
  const isViewConfigDialogOpen = usePipelineEditorStore((s) => s.isViewConfigDialogOpen);
  const isDeleteAlertOpen = usePipelineEditorStore((s) => s.isDeleteAlertOpen);
  const isTemplateDialogOpen = usePipelineEditorStore((s) => s.isTemplateDialogOpen);

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
      yamlContent,
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
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges && !editorStore.getState().allowNavigation,
    enableBeforeUnload: () => hasUnsavedChanges,
    withResolver: true,
  });
  // Re-arm the guard whenever the mode changes (e.g. after the post-save nav to view).
  useEffect(() => {
    setAllowNavigation(false);
  }, [mode, setAllowNavigation]);

  // ⌘S / Ctrl+S saves the pipeline (instead of the browser's save-page dialog) —
  // works from both the YAML and Visual lanes.
  useEffect(() => {
    if (mode === 'view') {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!isSaving) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, isSaving, handleSave]);

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

  useEffect(() => {
    if (pipeline && mode === 'edit') {
      form.reset({
        name: pipeline.displayName,
        description: pipeline.description || '',
        computeUnits: cpuToTasks(pipeline.resources?.cpuShares) || MIN_TASKS,
        tags: getUserTagEntries(pipeline.tags),
      });
    }
  }, [pipeline, mode, form]);

  const handleInitialYamlResolved = useCallback((yaml: string) => resolveInitialYaml(yaml), [resolveInitialYaml]);

  const { isInitializing: isServerlessInitializing } = useCreateModeInitialYaml({
    enabled: mode === 'create',
    isServerlessMode,
    components,
    isPipelineDiagramsEnabled,
    onResolved: handleInitialYamlResolved,
  });

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

  // The Visual lanes (view and edit) take the full canvas, so the YAML/diagram sidebar is hidden.
  const isViewVisualLane = mode === 'view' && activeViewLane === 'visual';
  const isEditVisualLane = mode !== 'view' && activeEditLane === 'visual';
  const showSidebar = !(isViewVisualLane || isEditVisualLane);

  // Open the YAML lane and reveal a node there: an explicit id (the inspector's
  // "View in YAML"), else the currently-selected node (switching tabs with a
  // selection). Routes to the right lane for the current mode.
  const goToYamlNode = useCallback(
    (nodeId?: string) => {
      const target = nodeId ?? selectedNodeId;
      if (target) {
        requestRevealNode(target);
      }
      if (mode === 'view') {
        setActiveViewLane('configuration');
      } else {
        setActiveEditLane('yaml');
      }
    },
    [mode, selectedNodeId, requestRevealNode, setActiveViewLane, setActiveEditLane]
  );

  return (
    // overflow-x-clip guards against stray horizontal overflow (clip, not hidden, to keep overflow-y visible).
    <div className="flex min-h-[calc(100dvh-10rem)] min-w-0 flex-col gap-4 overflow-x-clip">
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
      {/* View-mode lanes: Monitor (throughput/logs), YAML (read-only config), Visual (diagram). */}
      {mode === 'view' && pipeline ? (
        <Tabs value={activeViewLane}>
          <TabsList className="w-fit" variant="underline">
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
      {/* Edit-mode lanes: YAML editor vs. the (forthcoming) drag-and-drop visual editor. */}
      {mode !== 'view' && isVisualEditorEnabled ? (
        <Tabs value={activeEditLane}>
          <TabsList className="w-fit" variant="underline">
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
      <div className="flex min-h-[640px] min-w-0 flex-1 overflow-hidden rounded-lg border border-border!">
        {showSidebar ? (
          <SidebarPanel
            isPipelineDiagramsEnabled={isPipelineDiagramsEnabled}
            isVisualEditorEnabled={isVisualEditorEnabled}
            mode={mode}
            onAddConnector={(type) => setAddConnectorType(type)}
            onAddSasl={handleAddSasl}
            onAddTopic={handleAddTopic}
            onBrowseTemplates={isTemplateGalleryEnabled ? () => setIsTemplateDialogOpen(true) : undefined}
            onOpenCommandMenu={handleCommandMenuOpen}
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
              onDismissSlashTip={() => setSlashTipVisible(false)}
              onEditorMount={setEditorInstance}
              onYamlChange={setYamlContent}
              slashTipVisible={slashTipVisible}
              yamlContent={yamlContent}
              yamlEditorSchema={yamlEditorSchema}
            />
          )}
        </div>
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
