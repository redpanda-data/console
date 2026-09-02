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
import { cn } from 'components/redpanda-ui/lib/utils';
import { LogExplorer } from 'components/ui/connect/log-explorer';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { ExpandedPageToggle } from 'components/ui/expanded-page-toggle';
import { LintHintList } from 'components/ui/lint-hint/lint-hint-list';
import { YamlEditor } from 'components/ui/yaml/yaml-editor';
import { isEmbedded, isFeatureFlagEnabled, isServerless } from 'config';
import { useExpandedPageMode } from 'hooks/use-expanded-page-mode';
import { useRefFormDialog } from 'hooks/use-ref-form-dialog';
import { FileClock, KeyRound, LayoutGrid, Plus, User, Zap } from 'lucide-react';
import type { editor } from 'monaco-editor';
import type { JSONSchema } from 'monaco-yaml';
import {
  CreatePipelineRequestSchema,
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
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
import { type Resolver, type UseFormReturn, useForm, useWatch } from 'react-hook-form';
import { useGetPipelineServiceConfigSchemaQuery } from 'react-query/api/connect';
import {
  useCreatePipelineMutation,
  useDeletePipelineMutation,
  useFetchPipelineNames,
  useGetPipelineQuery,
  useStartPipelineMutation,
  useStopPipelineMutation,
  useUpdatePipelineMutation,
} from 'react-query/api/pipeline';
import { toast } from 'sonner';
import {
  autosaveTargetKey,
  type EditorAutosaveEntry,
  rpcnEditorAutosave,
  selectAutosaveEntry,
  useRpcnEditorAutosaveStore,
} from 'state/rpcn-editor-autosave';
import { useRpcnWizardStore } from 'state/rpcn-wizard-store';
import { addServiceAccountTags } from 'utils/service-account.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { z } from 'zod';

import { AutosaveRestoreNotice } from './autosave-restore-notice';
import { ChangesPanel } from './changes-panel';
import { summarizeComponentChanges, summarizeSettingsChanges, UNSAVED_CHANGES_LANE_LABEL } from './changes-summary';
import { ConfigDialog } from './config-dialog';
import { DeleteDraftDialog } from './delete-draft-dialog';
import { DetailsDialog } from './details-dialog';
import {
  areDraftsEnabled,
  DRAFT_UNSUPPORTED_MESSAGE,
  isDraft,
  NOTHING_TO_SAVE_MESSAGE,
  startBlockedMessage,
  timestampToMillis,
  UNTITLED_PIPELINE_NAME,
  untitledPipelineName,
} from './draft-copy';
import { EditorTipsBar, type TipContext } from './editor-tips-bar';
import { PipelineCommandMenu } from './pipeline-command-menu';
import { PipelineEditHeader, PipelineViewHeader } from './pipeline-header';
import { PipelineStructureTree } from './pipeline-structure-tree';
import { PipelineThroughputCard } from './pipeline-throughput-card';
import {
  BLANK_CONFIG_MESSAGE,
  isBlankConfig,
  isInvalidConfigError,
  isNoLongerDraftError,
  NO_LONGER_DRAFT_MESSAGE,
  primaryRunIntent,
  type SaveContext,
  type SaveIntent,
  type SaveRunIntent,
  saveSuccessMessage,
  unsavedChangesCopy,
} from './save-actions';
import { ScrollShadow } from './scroll-shadow';
import { TemplateGalleryCta } from './template-cta';
import { useEditorAutosave } from './use-editor-autosave';
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
import { useCreateModeInitialYaml } from '../utils/use-create-mode-initial-yaml';
import { useEnrichedComponents } from '../utils/use-enriched-components';
import { usePipelineMode } from '../utils/use-pipeline-mode';
import { extractConnectorTopics, getConnectTemplate, type RedpandaSetupResultLike } from '../utils/yaml';

function getConnectorDialogTitle(type: ConnectComponentType | 'resource' | null): string | undefined {
  if (type === 'input') {
    return 'Add an input';
  }
  if (type === 'output') {
    return 'Add an output';
  }
  return type ? `Add a ${type}` : undefined;
}

function getConnectorDialogPlaceholder(type: ConnectComponentType | 'resource' | null): string | undefined {
  return type ? `Search ${type}s...` : undefined;
}

// Read-only lanes (view YAML, Monitor, the diff) get no tips.
function tipsContextForLane(isView: boolean, viewLane: string, editLane: string): TipContext | null {
  if (isView) {
    return viewLane === 'visual' ? 'visual' : null;
  }
  if (editLane === 'changes') {
    return null;
  }
  return editLane === 'visual' ? 'visual' : 'yaml';
}

const EMPTY_NODE_IDS: ReadonlySet<string> = new Set();

// Effect re-runs a reveal request survives unresolved.
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
  draft: boolean;
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
        draft: opts.draft,
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one save path covering create/update × draft/deploy × run-state transitions
function usePipelineSave({
  form,
  editorStore,
  mode,
  pipelineId,
  pipeline,
  isPipelineDiagramsEnabled,
  onBeforeGuardedNavigate,
  saveContext,
}: {
  form: UseFormReturn<PipelineFormValues>;
  editorStore: ReturnType<typeof usePipelineEditorStoreApi>;
  mode: string;
  pipelineId: string | undefined;
  pipeline: Pipeline | undefined;
  isPipelineDiagramsEnabled: boolean;
  /** Stands the unsaved-changes guard down before a navigation this page performs itself. */
  onBeforeGuardedNavigate?: () => void;
  saveContext: SaveContext;
}) {
  const navigate = useNavigate();
  const { mutateAsync: createMutation, isPending: isCreatePending } = useCreatePipelineMutation();
  const { mutateAsync: updateMutation, isPending: isUpdatePending } = useUpdatePipelineMutation();
  const { mutateAsync: startMutation, isPending: isStartPending } = useStartPipelineMutation();
  const { mutateAsync: stopMutation, isPending: isStopPending } = useStopPipelineMutation();
  const { mutate: deleteMutation, isPending: isDeletePending } = useDeletePipelineMutation();
  const fetchPipelineNames = useFetchPipelineNames();
  const [errorLintHints, setErrorLintHints] = useState<Record<string, LintHint>>({});

  // A failed lookup must not fail the save; duplicate display names are legal.
  const nextUntitledName = useCallback(async () => {
    try {
      return untitledPipelineName(await fetchPipelineNames(UNTITLED_PIPELINE_NAME));
    } catch {
      return UNTITLED_PIPELINE_NAME;
    }
  }, [fetchPipelineNames]);

  const clearErrorLintHints = useCallback(() => setErrorLintHints({}), []);

  const clearWizardStore = useCallback(() => {
    if (!isPipelineDiagramsEnabled) {
      useRpcnWizardStore.getState().setYamlContent({ yamlContent: '' });
    }
    useRpcnWizardStore.getState().setWizardData({ input: undefined, output: undefined });
  }, [isPipelineDiagramsEnabled]);

  const markSaved = useCallback(
    (yamlContent: string, savedPipelineId: string | undefined) => {
      editorStore.getState().markSavedBaseline(yamlContent);
      form.reset(form.getValues());
      rpcnEditorAutosave.clear(autosaveTargetKey(mode === 'create' ? undefined : pipelineId));
      if (savedPipelineId && savedPipelineId !== pipelineId) {
        rpcnEditorAutosave.clear(autosaveTargetKey(savedPipelineId));
      }
    },
    [editorStore, form, mode, pipelineId]
  );

  // Resolves to whether the configuration was persisted; a failed start/stop after the write still counts.
  const handleSave = useCallback(
    async (intent?: SaveIntent): Promise<boolean> => {
      const run: SaveRunIntent = intent?.run ?? primaryRunIntent(saveContext);
      const isDraftSave = run === 'draft';

      // Flush the Visual lane's in-progress edit before reading the YAML.
      editorStore.getState().pendingEditCommit?.();
      const yamlContent = editorStore.getState().yamlContent;

      if (isDraftSave && mode === 'create' && isBlankConfig(yamlContent) && !form.getValues('name').trim()) {
        toast.error(NOTHING_TO_SAVE_MESSAGE);
        return false;
      }

      if (isDraftSave && !form.getValues('name').trim()) {
        form.setValue('name', await nextUntitledName(), { shouldValidate: true });
      }

      const isValid = await form.trigger();
      if (!isValid) {
        const fieldErrors = form.formState.errors;
        const firstError = fieldErrors.name?.message ?? fieldErrors.computeUnits?.message ?? fieldErrors.tags?.message;
        toast.error(
          typeof firstError === 'string' ? firstError : 'Fix the highlighted pipeline settings before saving.'
        );
        return false;
      }

      if (!isDraftSave && isBlankConfig(yamlContent)) {
        toast.error(BLANK_CONFIG_MESSAGE);
        return false;
      }

      const { name, description, computeUnits, tags: formTags } = form.getValues();
      const userTags = buildUserTags(formTags);

      try {
        if (mode === 'create') {
          const response = await createMutation(
            buildCreateRequest({ name, description, computeUnits, userTags, yamlContent, draft: isDraftSave })
          );
          const createdPipeline = response.response?.pipeline;
          const newPipelineId = createdPipeline?.id;
          setErrorLintHints({});

          // A pre-drafts proxy drops `draft` silently and deploys for real; trust the response state.
          const draftWasIgnored =
            isDraftSave && createdPipeline !== undefined && createdPipeline.state !== Pipeline_State.DRAFT;

          // Without draft support CreatePipeline always starts, so "stopped" is a follow-up stop.
          let stopFailed = false;
          if (run === 'stopped' && newPipelineId) {
            try {
              await stopMutation(create(StopPipelineRequestSchema, { request: { id: newPipelineId } }));
            } catch {
              stopFailed = true;
              toast.warning('Pipeline created, but stopping it failed — it may be running. Stop it from its page.');
            }
          }

          clearWizardStore();
          markSaved(yamlContent, newPipelineId);
          if (draftWasIgnored) {
            toast.error(DRAFT_UNSUPPORTED_MESSAGE);
          } else if (!stopFailed) {
            toast.success(saveSuccessMessage(saveContext, run));
          }
          warnIfResized(form, createdPipeline?.resources?.cpuShares);
          onBeforeGuardedNavigate?.();
          if (intent?.skipNavigation) {
            return true;
          }
          if (!newPipelineId) {
            navigate({ to: '/connect-clusters' });
            return true;
          }
          // A draft stays in the editor on its own route so the next save updates it.
          navigate({
            to: isDraftSave && !draftWasIgnored ? `/rp-connect/${newPipelineId}/edit` : `/rp-connect/${newPipelineId}`,
          });
          return true;
        }

        if (!pipelineId) {
          return false;
        }

        const response = await updateMutation(
          create(UpdatePipelineRequestSchema, {
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
                // Asserted so the server refuses the write if the draft was started meanwhile.
                draft: isDraftSave ? true : undefined,
              }),
            }),
          })
        );
        setErrorLintHints({});

        // UpdatePipeline keeps the run state; on a draft, `start` is promotion and validates first.
        let runFailed = false;
        try {
          if (run === 'start') {
            await startMutation(create(StartPipelineRequestSchema, { request: { id: pipelineId } }));
          } else if (run === 'stopped') {
            await stopMutation(create(StopPipelineRequestSchema, { request: { id: pipelineId } }));
          }
        } catch (runErr) {
          runFailed = true;
          const runError = ConnectError.from(runErr);
          if (run === 'start' && isInvalidConfigError(runError)) {
            const hints = extractLintHintsFromError(runError);
            setErrorLintHints(hints);
            toast.warning(startBlockedMessage(Object.keys(hints).length));
          } else {
            toast.warning(
              formatToastErrorMessageGRPC({
                error: runError,
                action: run === 'start' ? 'start' : 'stop',
                entity: 'pipeline',
              })
            );
          }
        }

        markSaved(yamlContent, pipelineId);
        warnIfResized(form, response.response?.pipeline?.resources?.cpuShares);
        if (runFailed) {
          return true;
        }
        toast.success(saveSuccessMessage(saveContext, run));
        if (isDraftSave || intent?.skipNavigation) {
          return true;
        }
        onBeforeGuardedNavigate?.();
        navigate({ to: `/rp-connect/${pipelineId}` });
        return true;
      } catch (err) {
        const connectError = ConnectError.from(err);
        setErrorLintHints(extractLintHintsFromError(connectError));
        if (isDraftSave && isNoLongerDraftError(connectError)) {
          toast.error(NO_LONGER_DRAFT_MESSAGE);
          return false;
        }
        toast.error(
          formatToastErrorMessageGRPC({
            error: connectError,
            action: mode === 'create' ? 'create' : 'update',
            entity: 'pipeline',
          })
        );
        return false;
      }
    },
    [
      form,
      editorStore,
      mode,
      pipelineId,
      createMutation,
      updateMutation,
      startMutation,
      stopMutation,
      navigate,
      clearWizardStore,
      pipeline,
      onBeforeGuardedNavigate,
      markSaved,
      saveContext,
      nextUntitledName,
    ]
  );

  const handleDelete = useCallback(
    (id: string) => {
      const wasDraft = isDraft(pipeline);
      const deleteRequest = create(DeletePipelineRequestSchema, { request: { id } });
      deleteMutation(deleteRequest, {
        onSuccess: () => {
          rpcnEditorAutosave.clear(autosaveTargetKey(id));
          toast.success(wasDraft ? 'Draft deleted' : 'Pipeline deleted');
          onBeforeGuardedNavigate?.();
          navigateToConnectClusters(navigate);
        },
        onError: (err) => {
          toast.error(
            formatToastErrorMessageGRPC({ error: ConnectError.from(err), action: 'delete', entity: 'pipeline' })
          );
        },
      });
    },
    [deleteMutation, navigate, pipeline, onBeforeGuardedNavigate]
  );

  return {
    handleSave,
    handleDelete,
    clearWizardStore,
    errorLintHints,
    clearErrorLintHints,
    isSaving: isCreatePending || isUpdatePending || isStartPending || isStopPending,
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
  const [overflow, setOverflow] = useState({ top: false, bottom: false });
  const scrollSyncSubscriptions = useRef<ReturnType<editor.IStandaloneCodeEditor['onDidScrollChange']>[]>([]);
  // Registered so sidebar/Visual selection can reveal lines here too.
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
    'pointer-events-none absolute inset-x-0 h-4 from-static-dark/10 to-transparent transition-opacity duration-150 dark:from-static-dark/40';
  return (
    <div className="relative h-full overflow-hidden [&_.cursors-layer]:opacity-0">
      {/* Out of flow so Monaco can't feed its width up the layout. */}
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
      <div className="flex min-h-96 items-center justify-center text-body text-muted-foreground">
        Loading pipeline...
      </div>
    );
  }
  const showThroughput =
    isEmbedded() &&
    (isServerless()
      ? isFeatureFlagEnabled('enableDataplaneObservabilityServerless')
      : isFeatureFlagEnabled('enableDataplaneObservability'));
  return (
    // Natural height: this lane scrolls with the page.
    <div className="flex flex-col p-6">
      {showThroughput ? (
        <>
          <PipelineThroughputCard pipelineId={pipeline.id} />
          <Separator className="my-8" variant="subtle" />
        </>
      ) : null}
      <section className="flex flex-col gap-4">
        {isFeatureFlagEnabled('enableNewPipelineLogs') ? (
          <LogExplorer
            enableLiveView={pipeline.state === Pipeline_State.RUNNING}
            pipeline={pipeline}
            serverless={isServerless()}
            title="Logs"
          />
        ) : (
          <>
            <h3 className="text-heading-md">Logs</h3>
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
            <h5 className="text-heading-xs text-muted-foreground">Lint issues</h5>
            {Object.keys(lintHints).length > 0 ? (
              <CountDot count={Object.keys(lintHints).length} variant="destructive" />
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
  const canEdit = mode !== 'view';
  // Full-document parses tolerate stale YAML, so they run off the deferred value.
  const deferredYaml = useDeferredValue(yamlContent);
  const offerTemplate = useShouldOfferTemplate(deferredYaml);
  const showStructureTree = isPipelineDiagramsEnabled;

  const editorInstance = usePipelineEditorStore((s) => s.editorInstance);
  const [activeNodeId, setActiveNodeId] = useState<string | undefined>();
  const nodeRanges = useMemo(() => {
    try {
      return nodeLineRanges(deferredYaml);
    } catch {
      return [];
    }
  }, [deferredYaml]);
  const nodeRangesRef = useRef(nodeRanges);
  nodeRangesRef.current = nodeRanges;

  // A programmatic reveal fires setSelection synchronously; the cursor listener must not re-derive from it.
  const suppressCursorSyncRef = useRef(false);

  const revealNodeInEditor = useCallback(
    (nodeId?: string) => {
      const ed = editorInstance;
      const range = nodeId ? nodeRanges.find((r) => r.id === nodeId) : undefined;
      const model = ed?.getModel();
      if (!(ed && range && model)) {
        return;
      }
      const endLine = Math.min(range.end, model.getLineCount());
      suppressCursorSyncRef.current = true;
      try {
        ed.setSelection({
          startLineNumber: range.start,
          startColumn: 1,
          endLineNumber: endLine,
          endColumn: model.getLineMaxColumn(endLine),
        });
      } finally {
        suppressCursorSyncRef.current = false;
      }
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

  useEffect(() => {
    if (!editorInstance) {
      return;
    }
    const sub = editorInstance.onDidChangeCursorPosition((e) => {
      if (suppressCursorSyncRef.current) {
        return;
      }
      setActiveNodeId(enclosingNodeId(e.position.lineNumber, nodeRangesRef.current));
    });
    return () => sub.dispose();
  }, [editorInstance]);

  // Pending reveal from the Visual lane, honoured once editor + ranges exist.
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
    revealAttemptRef.current.count += 1;
    if (revealAttemptRef.current.count > MAX_REVEAL_ATTEMPTS) {
      requestRevealNode(null);
    }
  }, [revealNodeId, editorInstance, nodeRanges, revealNodeInEditor, requestRevealNode]);
  const showTemplateCta = showStructureTree && canEdit && Boolean(onBrowseTemplates) && offerTemplate;

  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-hidden border-border! border-r">
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
              <h5 className="mb-2 text-heading-xs text-muted-foreground">Variables</h5>
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

type LaneTab = {
  value: string;
  label: string;
  onSelect: () => void;
  count?: number;
  /** Plain marker when there is something to say but nothing to count. */
  showDot?: boolean;
};

const isVisualEditorFeatureEnabled = (): boolean =>
  isFeatureFlagEnabled('enableRpcnVisualEditor') && isFeatureFlagEnabled('enablePipelineDiagrams') && isEmbedded();

export default function PipelinePage() {
  const { pipelineId } = usePipelineMode();
  const isVisualEditorEnabled = isVisualEditorFeatureEnabled();
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
  const isVisualEditorEnabled = isVisualEditorFeatureEnabled();
  const isTemplateGalleryEnabled = isFeatureFlagEnabled('enableRpcnTemplateGallery');

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

  const { components, componentList } = useEnrichedComponents();

  const { data: schemaResponse } = useGetPipelineServiceConfigSchemaQuery();
  const yamlEditorSchema = useMemo(() => parseYamlEditorSchema(schemaResponse?.configSchema), [schemaResponse]);

  const markNavigationAllowed = useCallback(() => setAllowNavigation(true), [setAllowNavigation]);

  const draftsEnabled = areDraftsEnabled();
  const saveContext = useMemo<SaveContext>(
    () => ({ mode: mode === 'create' ? 'create' : 'edit', state: pipeline?.state, draftsEnabled }),
    [mode, pipeline?.state, draftsEnabled]
  );
  const editingDraft = isDraft(pipeline);

  const autosaveTarget = autosaveTargetKey(mode === 'create' ? undefined : pipelineId);
  // A boolean so autosave rewriting the entry isn't a re-render.
  const hasStoredBuffer = useRpcnEditorAutosaveStore(
    (s) => mode !== 'view' && selectAutosaveEntry(s.entries, autosaveTarget) !== null
  );
  // Snapshot taken when the editor opened; read live, this session's own writes would look recoverable.
  const [recoverableEntry, setRecoverableEntry] = useState<EditorAutosaveEntry | null>(null);
  const [isAutosaveDismissed, setIsAutosaveDismissed] = useState(false);

  // Restored work is unsaved, so the form must read dirty against the loaded defaults.
  const applyAutosave = useCallback(
    (entry: EditorAutosaveEntry) => {
      setYamlContent(entry.configYaml);
      form.reset(
        {
          name: entry.name,
          description: entry.description,
          computeUnits: entry.computeUnits,
          tags: entry.tags,
        },
        { keepDefaultValues: true }
      );
    },
    [setYamlContent, form]
  );

  const { handleSave, handleDelete, clearWizardStore, errorLintHints, clearErrorLintHints, isSaving, isDeleting } =
    usePipelineSave({
      form,
      editorStore,
      mode,
      pipelineId,
      pipeline,
      isPipelineDiagramsEnabled,
      onBeforeGuardedNavigate: markNavigationAllowed,
      saveContext,
    });
  const { lintHints, isLintPending } = usePipelineLint(yamlContent, errorLintHints, mode !== 'view');

  const yamlDirty = initialYaml !== null && yamlContent !== initialYaml;
  const hasUnsavedChanges = mode !== 'view' && (form.formState.isDirty || yamlDirty);

  // Flushes a pending inspector edit first; the rendered `hasUnsavedChanges` can't see it.
  const checkUnsavedChanges = useCallback(() => {
    if (mode === 'view') {
      return false;
    }
    editorStore.getState().pendingEditCommit?.();
    const { yamlContent: yaml, initialYaml: baseline } = editorStore.getState();
    return form.formState.isDirty || (baseline !== null && yaml !== baseline);
  }, [mode, editorStore, form]);

  const deferredYamlContent = useDeferredValue(yamlContent);
  const errorNodeIds = useMemo(
    () => new Set(mapLintHintsToNodes(deferredYamlContent, Object.values(lintHints)).keys()),
    [deferredYamlContent, lintHints]
  );
  const changedIds = useMemo(
    () => (mode !== 'view' && initialYaml !== null ? changedNodeIds(initialYaml, deferredYamlContent) : []),
    [mode, initialYaml, deferredYamlContent]
  );
  const unsavedNodeIds = useMemo(() => (changedIds.length > 0 ? new Set(changedIds) : EMPTY_NODE_IDS), [changedIds]);
  const componentChanges = useMemo(
    () =>
      mode !== 'view' && initialYaml !== null
        ? summarizeComponentChanges(initialYaml, deferredYamlContent, changedIds)
        : [],
    [mode, initialYaml, deferredYamlContent, changedIds]
  );
  // Against the form's default values, which every successful save re-baselines.
  const settingsValues = useWatch({ control: form.control });
  const settingsChanges = useMemo(
    () => (mode === 'edit' ? summarizeSettingsChanges(form.formState.defaultValues, settingsValues) : []),
    [mode, form.formState.defaultValues, settingsValues]
  );
  const blocker = useBlocker({
    shouldBlockFn: () => checkUnsavedChanges() && !editorStore.getState().allowNavigation,
    enableBeforeUnload: () => checkUnsavedChanges(),
    withResolver: true,
  });
  const unsavedChanges = useMemo(() => unsavedChangesCopy(saveContext), [saveContext]);
  // Re-arm the guard whenever the mode changes.
  useEffect(() => {
    setAllowNavigation(false);
  }, [mode, setAllowNavigation]);

  useSaveHotkey({ enabled: mode !== 'view', isSaving, onSave: handleSave });

  // On document change: clear stale lint and mirror create-mode YAML to the wizard store.
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

  // Once per id, so re-renders don't clobber edits.
  useEffect(() => {
    if (pipeline && mode !== 'create' && pipeline.id !== hydratedPipelineId) {
      hydrateFromServer(pipeline.id, pipeline.configYaml);
    }
  }, [pipeline, mode, hydratedPipelineId, hydrateFromServer]);

  // The query polls: a dirty form is never reset, a clean one re-syncs when the payload changes.
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

  const handleRestoreAutosave = useCallback(() => {
    if (recoverableEntry) {
      applyAutosave(recoverableEntry);
      setIsAutosaveDismissed(true);
      toast.success('Your edits were restored — they still need saving');
    }
  }, [recoverableEntry, applyAutosave]);

  const handleDiscardAutosave = useCallback(() => {
    rpcnEditorAutosave.clear(autosaveTarget);
    setIsAutosaveDismissed(true);
  }, [autosaveTarget]);

  // Discard clears the recovery buffer too, or the next visit offers the edits back.
  const handleDiscardAndLeave = useCallback(() => {
    rpcnEditorAutosave.clear(autosaveTarget);
    blocker.proceed?.();
  }, [autosaveTarget, blocker]);

  // The serverless template resolves late enough to overwrite a restore, so create waits on it.
  const isDocumentLoaded = mode === 'create' ? !isServerlessInitializing : initialYaml !== null;
  const capturedTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode === 'view' || !isDocumentLoaded || capturedTargetRef.current === autosaveTarget) {
      return;
    }
    capturedTargetRef.current = autosaveTarget;
    setRecoverableEntry(rpcnEditorAutosave.get(autosaveTarget));
    setIsAutosaveDismissed(false);
  }, [mode, isDocumentLoaded, autosaveTarget]);

  const recoveredSettingsChanges = useMemo(
    () => (recoverableEntry ? summarizeSettingsChanges(form.formState.defaultValues, recoverableEntry) : []),
    [recoverableEntry, form.formState.defaultValues]
  );
  const showAutosaveRestore =
    mode !== 'view' &&
    !isAutosaveDismissed &&
    !!recoverableEntry &&
    hasStoredBuffer &&
    // Against the baseline, not the live editor.
    (recoverableEntry.configYaml !== (initialYaml ?? '') || recoveredSettingsChanges.length > 0);
  const savedUpdateTime = timestampToMillis(pipeline?.updateTime);

  // Both sides are the dataplane's `update_time`, so clock skew can't affect this.
  const isAutosaveStale =
    !!recoverableEntry &&
    recoverableEntry.basedOnUpdateTime != null &&
    savedUpdateTime !== null &&
    savedUpdateTime !== recoverableEntry.basedOnUpdateTime;

  const { flush: flushAutosave } = useEditorAutosave({
    enabled: mode !== 'view',
    pipelineId: mode === 'create' ? undefined : pipelineId,
    savedUpdateTime,
    form,
    editorStore,
  });

  // Flushed, not debounced: the pending write dies with the page.
  const handleLeaveAndKeepEdits = useCallback(() => {
    flushAutosave();
    blocker.proceed?.();
  }, [flushAutosave, blocker]);

  // After a failed draft save the browser buffer is offered beside it, so Discard is never the only exit.
  const [hasDraftEscapeFailed, setHasDraftEscapeFailed] = useState(false);
  const canSaveDraftAndLeave = unsavedChanges.escape === 'save-draft';
  useEffect(() => {
    if (blocker.status !== 'blocked') {
      setHasDraftEscapeFailed(false);
    }
  }, [blocker.status]);

  // Create + diagrams: useCreateModeInitialYaml bails, so the baseline is seeded here. Serverless seeds its own.
  useEffect(() => {
    if (mode === 'create' && isPipelineDiagramsEnabled && !isServerlessMode && initialYaml === null) {
      resolveInitialYaml(yamlContent);
    }
  }, [mode, isPipelineDiagramsEnabled, isServerlessMode, initialYaml, yamlContent, resolveInitialYaml]);

  const handleCancel = useCallback(() => {
    if (mode === 'create') {
      clearWizardStore();
    }
    // `navigate`, not history.back, so the blocker intercepts.
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

  // Visual and changes lanes take the full canvas.
  const isViewVisualLane = mode === 'view' && activeViewLane === 'visual';
  const isEditVisualLane = mode !== 'view' && activeEditLane === 'visual';
  const isEditChangesLane = mode === 'edit' && activeEditLane === 'changes';
  const showSidebar = !(isViewVisualLane || isEditVisualLane || isEditChangesLane);

  const {
    expanded,
    toggleExpanded,
    ref: expandedModeRef,
  } = useExpandedPageMode({ storageKey: 'rp-pipeline-editor-mode' });

  const goToYamlNode = useCallback(
    (nodeId?: string) => {
      const target = nodeId ?? selectedNodeId;
      if (target) {
        requestRevealNode(target);
      }
      if (mode === 'view') {
        setActiveViewLane('configuration');
      } else {
        // The Visual lane has no commit-on-unmount.
        editorStore.getState().pendingEditCommit?.();
        setActiveEditLane('yaml');
      }
    },
    [mode, selectedNodeId, requestRevealNode, setActiveViewLane, setActiveEditLane, editorStore]
  );

  const isMonitorLane = mode === 'view' && activeViewLane === 'monitor';

  const lanes = useMemo<LaneTab[]>(() => {
    if (mode === 'view') {
      if (!pipeline) {
        return [];
      }
      const viewLanes: LaneTab[] = [
        // A draft has never run, so there is nothing to monitor.
        ...(editingDraft
          ? []
          : [{ value: 'monitor', label: 'Monitor', onSelect: () => setActiveViewLane('monitor') } as LaneTab]),
        { value: 'configuration', label: 'YAML', onSelect: () => goToYamlNode() },
      ];
      if (isVisualEditorEnabled) {
        viewLanes.push({ value: 'visual', label: 'Visual', onSelect: () => setActiveViewLane('visual') });
      }
      return viewLanes;
    }
    const editLanes: LaneTab[] = [{ value: 'yaml', label: 'YAML', onSelect: () => goToYamlNode() }];
    if (isVisualEditorEnabled) {
      editLanes.push({ value: 'visual', label: 'Visual', onSelect: () => setActiveEditLane('visual') });
    }
    // Only where something is saved to compare against.
    if (mode === 'edit') {
      editLanes.push({
        value: 'changes',
        label: UNSAVED_CHANGES_LANE_LABEL,
        count: componentChanges.length + settingsChanges.length,
        showDot: hasUnsavedChanges,
        onSelect: () => setActiveEditLane('changes'),
      });
    }
    return editLanes;
  }, [
    mode,
    pipeline,
    editingDraft,
    isVisualEditorEnabled,
    goToYamlNode,
    setActiveViewLane,
    setActiveEditLane,
    componentChanges.length,
    settingsChanges.length,
    hasUnsavedChanges,
  ]);

  useEffect(() => {
    if (mode === 'view' && editingDraft && activeViewLane === 'monitor') {
      setActiveViewLane('configuration');
    }
  }, [mode, editingDraft, activeViewLane, setActiveViewLane]);

  return (
    // Editor lanes are viewport-bounded for Monaco; the Monitor lane uses the same measure as a minimum.
    // The -ml-3.5/pl-3.5 pair keeps the back button's overhang inside the overflow-x-clip region.
    <div
      className={cn(
        '-ml-3.5 flex min-w-0 flex-col gap-4 overflow-x-clip pl-3.5',
        isMonitorLane ? 'page-min-fill-viewport' : 'page-fill-viewport min-h-[500px]'
      )}
      ref={expandedModeRef}
    >
      {mode === 'view' && pipeline ? (
        <PipelineViewHeader
          expanded={expanded}
          onBack={handleCancel}
          onRequestDelete={() => setIsDeleteAlertOpen(true)}
          onViewDetails={() => setIsViewConfigDialogOpen(true)}
          pipeline={pipeline}
        />
      ) : null}
      {mode === 'view' && !pipeline ? (
        <div className={cn('flex items-center gap-2', expanded && 'px-4')}>
          <Button aria-label="Go back" className="-ml-3.5 shrink-0" onClick={handleCancel} size="icon" variant="ghost">
            <ArrowLeftIcon className="h-5 w-5" />
          </Button>
          <Skeleton variant="text" width="md" />
        </div>
      ) : null}
      {mode !== 'view' ? (
        <PipelineEditHeader
          draftIssueCount={Object.keys(lintHints).length}
          draftsEnabled={draftsEnabled}
          expanded={expanded}
          form={form}
          hasUnsavedChanges={hasUnsavedChanges}
          isSaving={isSaving}
          mode={mode as 'create' | 'edit'}
          onBack={handleCancel}
          onEditSettings={() => setIsConfigDialogOpen(true)}
          onRequestDelete={editingDraft ? () => setIsDeleteAlertOpen(true) : undefined}
          onSave={handleSave}
          pipelineState={pipeline?.state}
          url={pipeline?.url}
        />
      ) : null}
      {showAutosaveRestore && recoverableEntry ? (
        <div className={cn('transition-[padding] duration-300 ease-in-out', expanded && 'px-4')}>
          <AutosaveRestoreNotice
            isStale={isAutosaveStale}
            onDiscard={handleDiscardAutosave}
            onRestore={handleRestoreAutosave}
            updatedAt={recoverableEntry.updatedAt}
          />
        </div>
      ) : null}
      {mode === 'view' && editingDraft ? (
        <div className={cn('transition-[padding] duration-300 ease-in-out', expanded && 'px-4')}>
          <Alert icon={<FileClock />} testId="draft-view-notice" variant="informative">
            <AlertTitle>This pipeline is a draft</AlertTitle>
            <AlertDescription>
              It has never run, so there is nothing to monitor yet and it costs nothing. Starting it checks the
              configuration first — anything it finds is shown in the editor. Once it starts it becomes a regular
              pipeline, and drafts only exist for pipelines that have never been deployed.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border! transition-[border-radius,border-color] duration-300 ease-in-out',
            expanded ? 'rounded-none border-x-transparent!' : 'rounded-lg'
          )}
        >
          {/* pr-12 keeps the triggers clear of the overlaid fullscreen toggle. */}
          <div className="relative shrink-0">
            {lanes.length > 0 ? (
              <Tabs value={mode === 'view' ? activeViewLane : activeEditLane}>
                <TabsList className="pr-12 [&_[data-slot=tabs-trigger]]:w-auto" variant="underline">
                  {lanes.map((lane) => (
                    <TabsTrigger key={lane.value} onClick={lane.onSelect} value={lane.value} variant="underline">
                      <span className="flex items-center gap-2">
                        {lane.label}
                        {lane.count ? <CountDot count={lane.count} size="sm" variant="informative" /> : null}
                        {!lane.count && lane.showDot ? (
                          <span aria-hidden className="size-2 shrink-0 rounded-full bg-informative" />
                        ) : null}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : (
              <div className="h-9 border-border! border-b" />
            )}
            <div className="absolute inset-y-0 right-1.5 flex items-center">
              <ExpandedPageToggle expanded={expanded} onToggle={toggleExpanded} />
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {showSidebar ? (
              // The monitor lane is document-height, so the structure tree is absolute there.
              <div className={cn(isMonitorLane && 'relative w-[300px] shrink-0', !isMonitorLane && 'contents')}>
                <div className={cn(isMonitorLane ? 'absolute inset-0 flex' : 'contents')}>
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
                </div>
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              {mode === 'view' && activeViewLane === 'monitor' ? <ViewModePanel pipeline={pipeline} /> : null}
              {mode === 'view' && pipeline && activeViewLane === 'configuration' ? (
                <YamlViewPanel configYaml={pipeline.configYaml} schema={yamlEditorSchema} />
              ) : null}
              {mode === 'view' && pipeline && activeViewLane === 'visual' ? (
                <VisualEditorPanel
                  componentList={componentList ?? ({} as ComponentList)}
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
                  componentList={componentList ?? ({} as ComponentList)}
                  components={components}
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
              {isEditChangesLane ? (
                <ChangesPanel
                  changes={componentChanges}
                  editedYaml={yamlContent}
                  onEditSettings={() => setIsConfigDialogOpen(true)}
                  onSelectComponent={goToYamlNode}
                  pipelineState={pipeline?.state}
                  savedYaml={initialYaml ?? ''}
                  settingsChanges={settingsChanges}
                />
              ) : null}
              {mode === 'view' || activeEditLane === 'visual' || isEditChangesLane ? null : (
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
          <div className={cn('transition-[padding] duration-300 ease-in-out', expanded && 'px-4')}>
            <EditorTipsBar context={tipsContext} readOnly={mode === 'view'} slashMenuEnabled={isSlashMenuEnabled} />
          </div>
        ) : null}
      </div>

      <ConfigDialog form={form} mode={mode} onOpenChange={setIsConfigDialogOpen} open={isConfigDialogOpen} />

      <DetailsDialog
        onOpenChange={setIsViewConfigDialogOpen}
        onRequestDelete={
          pipeline
            ? () => {
                setIsViewConfigDialogOpen(false);
                setIsDeleteAlertOpen(true);
              }
            : undefined
        }
        open={isViewConfigDialogOpen}
        pipeline={pipeline}
      />

      {pipeline && editingDraft ? (
        <DeleteDraftDialog
          draftName={pipeline.displayName}
          hasUnsavedChanges={hasUnsavedChanges}
          isDeleting={isDeleting}
          onConfirm={() => handleDelete(pipeline.id)}
          onOpenChange={setIsDeleteAlertOpen}
          open={isDeleteAlertOpen}
        />
      ) : null}

      {pipeline && !editingDraft ? (
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
            <DialogTitle>Leave without saving your changes?</DialogTitle>
          </DialogHeader>
          <DialogBody>{unsavedChanges.body}</DialogBody>
          <DialogFooter>
            <Button onClick={handleDiscardAndLeave} testId="discard-and-leave" variant="ghost">
              Discard changes
            </Button>
            <Button onClick={() => blocker.reset?.()} variant="outline">
              Keep editing
            </Button>
            {canSaveDraftAndLeave ? (
              <Button
                onClick={async () => {
                  if (await handleSave({ run: 'draft', skipNavigation: true })) {
                    blocker.proceed?.();
                    return;
                  }
                  setHasDraftEscapeFailed(true);
                }}
                testId="save-draft-and-leave"
                variant={hasDraftEscapeFailed ? 'outline' : 'primary'}
              >
                Save draft
              </Button>
            ) : null}
            {canSaveDraftAndLeave && !hasDraftEscapeFailed ? null : (
              <Button
                onClick={handleLeaveAndKeepEdits}
                testId="leave-and-keep-edits"
                title="Your edits stay in this browser, and this editor offers them back next time"
                variant="primary"
              >
                Leave for now
              </Button>
            )}
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
            <Button onClick={topicDialog.close} variant="ghost">
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
            <Button onClick={userDialog.close} variant="ghost">
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
        components={componentList ?? ({} as ComponentList)}
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
