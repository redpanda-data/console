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
import { type Resolver, type UseFormReturn, useForm } from 'react-hook-form';
import { useGetPipelineServiceConfigSchemaQuery } from 'react-query/api/connect';
import {
  useCreatePipelineMutation,
  useDeletePipelineMutation,
  useGetPipelineQuery,
  useListPipelinesQuery,
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
import { summarizeComponentChanges } from './changes-summary';
import { ConfigDialog } from './config-dialog';
import { DeleteDraftDialog } from './delete-draft-dialog';
import { DetailsDialog } from './details-dialog';
import {
  areDraftsEnabled,
  isDraft,
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

// Tips to show beneath the editor for the active lane; read-only YAML and Monitor get none.
function tipsContextForLane(isView: boolean, viewLane: string, editLane: string): TipContext | null {
  if (isView) {
    return viewLane === 'visual' ? 'visual' : null;
  }
  return editLane === 'visual' ? 'visual' : 'yaml';
}

// Stable empty set for the "nothing unsaved" / view-mode case so highlights don't churn renders.
const EMPTY_NODE_IDS: ReadonlySet<string> = new Set();

/**
 * Names already taken by auto-named drafts, so a new one can be numbered past them.
 *
 * Narrowed to the untitled prefix on purpose. The unfiltered list drains every page — on a cluster
 * with a few thousand pipelines that is several seconds, and the save mutation *awaits* its own
 * invalidation of every active list query, so an unrelated 30ms write ended up taking 13 seconds.
 *
 * `name_contains` is a case-sensitive substring match server-side, so a differently-cased "untitled
 * pipeline" is not returned and could collide. That is fine: duplicate display names are allowed.
 *
 * Module scope keeps the request object identity stable, which the query hook memoizes on.
 */
const DRAFT_NAME_LIST_INPUT = {
  pageSize: 100,
  filter: { includeDrafts: true, nameContains: UNTITLED_PIPELINE_NAME },
} as const;

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
  /** Store it without deploying or validating it. */
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
  onBeforeSaveNavigate,
  saveContext,
  existingPipelineNames,
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
  saveContext: SaveContext;
  /** Names already in use, so an unnamed draft gets a distinguishable one. */
  existingPipelineNames: string[];
}) {
  const navigate = useNavigate();
  const { mutateAsync: createMutation, isPending: isCreatePending } = useCreatePipelineMutation();
  const { mutateAsync: updateMutation, isPending: isUpdatePending } = useUpdatePipelineMutation();
  const { mutateAsync: startMutation, isPending: isStartPending } = useStartPipelineMutation();
  const { mutateAsync: stopMutation, isPending: isStopPending } = useStopPipelineMutation();
  const { mutate: deleteMutation, isPending: isDeletePending } = useDeletePipelineMutation();
  const [errorLintHints, setErrorLintHints] = useState<Record<string, LintHint>>({});

  const clearErrorLintHints = useCallback(() => setErrorLintHints({}), []);

  const clearWizardStore = useCallback(() => {
    if (!isPipelineDiagramsEnabled) {
      useRpcnWizardStore.getState().setYamlContent({ yamlContent: '' });
    }
    useRpcnWizardStore.getState().setWizardData({ input: undefined, output: undefined });
  }, [isPipelineDiagramsEnabled]);

  /**
   * Re-baseline the document and the form so the unsaved-changes guard reads clean, and drop the
   * recovery buffer — what it was protecting is now saved.
   */
  const markSaved = useCallback(
    (yamlContent: string, savedPipelineId: string | undefined) => {
      editorStore.getState().markSavedBaseline(yamlContent);
      form.reset(form.getValues());
      rpcnEditorAutosave.clear(autosaveTargetKey(mode === 'create' ? undefined : pipelineId));
      if (savedPipelineId && savedPipelineId !== pipelineId) {
        // The create page's buffer is keyed on `create`; once saved, the pipeline owns its own.
        rpcnEditorAutosave.clear(autosaveTargetKey(savedPipelineId));
      }
    },
    [editorStore, form, mode, pipelineId]
  );

  const handleSave = useCallback(
    async (intent?: SaveIntent) => {
      const run: SaveRunIntent = intent?.run ?? primaryRunIntent(saveContext);
      const isDraftSave = run === 'draft';

      // A draft is saved as typed, so the only settings that must hold are the ones the server will
      // reject outright. An unnamed draft gets a name rather than a scolding.
      if (isDraftSave && !form.getValues('name').trim()) {
        form.setValue('name', untitledPipelineName(existingPipelineNames), { shouldValidate: true });
      }

      const isValid = await form.trigger();
      if (!isValid) {
        // Settings live in the header/dialog, so surface why the save was blocked.
        const fieldErrors = form.formState.errors;
        const firstError = fieldErrors.name?.message ?? fieldErrors.computeUnits?.message ?? fieldErrors.tags?.message;
        toast.error(
          typeof firstError === 'string' ? firstError : 'Fix the highlighted pipeline settings before saving.'
        );
        return;
      }

      // Flush the Visual lane's in-progress edit (the user may save mid-edit), then read fresh YAML.
      editorStore.getState().pendingEditCommit?.();
      const yamlContent = editorStore.getState().yamlContent;

      // An empty document can be parked but not deployed. Caught here so `Save and start` doesn't
      // round-trip just to be told there is nothing to run.
      if (!isDraftSave && isBlankConfig(yamlContent)) {
        toast.error(BLANK_CONFIG_MESSAGE);
        return;
      }

      const { name, description, computeUnits, tags: formTags } = form.getValues();
      const userTags = buildUserTags(formTags);

      try {
        if (mode === 'create') {
          const response = await createMutation(
            buildCreateRequest({ name, description, computeUnits, userTags, yamlContent, draft: isDraftSave })
          );
          const newPipelineId = response.response?.pipeline?.id;
          setErrorLintHints({});

          // Without draft support, CreatePipeline always starts the pipeline, so "save without
          // starting" is a follow-up stop. It lands in well under a second, but the pipeline is
          // briefly STARTING first. A draft never runs, so it needs no such correction.
          if (run === 'stopped' && newPipelineId) {
            try {
              await stopMutation(create(StopPipelineRequestSchema, { request: { id: newPipelineId } }));
            } catch {
              toast.warning('Pipeline created, but stopping it failed — it may be running. Stop it from its page.');
            }
          }

          clearWizardStore();
          markSaved(yamlContent, newPipelineId);
          toast.success(saveSuccessMessage(saveContext, run));
          warnIfResized(form, response.response?.pipeline?.resources?.cpuShares);
          onBeforeSaveNavigate?.();
          if (intent?.skipNavigation) {
            return;
          }
          if (!newPipelineId) {
            navigate({ to: '/connect-clusters' });
            return;
          }
          // A parked draft stays in the editor, on its own route so the next save updates this draft
          // instead of forking another one. Anything deployed goes to its pipeline page, as before.
          navigate({ to: isDraftSave ? `/rp-connect/${newPipelineId}/edit` : `/rp-connect/${newPipelineId}` });
          return;
        }

        if (!pipelineId) {
          return;
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
                // Stated explicitly so the server refuses the write if someone started the draft
                // while it was open, rather than deploying this configuration to a running pipeline.
                draft: isDraftSave ? true : undefined,
              }),
            }),
          })
        );
        setErrorLintHints({});

        // UpdatePipeline keeps the pipeline's run state, so only an explicit start/stop needs a call.
        // On a draft, `start` is promotion: the server validates the stored config and refuses an
        // invalid one, which is why its failure is reported rather than swallowed.
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
            // The configuration was saved; only the start was refused. Keep the hints on screen so the
            // problems stay anchored to their lines.
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
          // Staying put: the reason it didn't start is only actionable here.
          return;
        }
        toast.success(saveSuccessMessage(saveContext, run));
        // Parking a draft is a "keep working" action, so it doesn't leave the editor. It also must not
        // navigate on its own when it was triggered from the leave-without-saving dialog, whose own
        // `proceed()` is what resumes the navigation the user actually asked for.
        if (isDraftSave || intent?.skipNavigation) {
          return;
        }
        onBeforeSaveNavigate?.();
        navigate({ to: `/rp-connect/${pipelineId}` });
      } catch (err) {
        const connectError = ConnectError.from(err);
        setErrorLintHints(extractLintHintsFromError(connectError));
        if (isNoLongerDraftError(connectError)) {
          toast.error(NO_LONGER_DRAFT_MESSAGE);
          return;
        }
        toast.error(
          formatToastErrorMessageGRPC({
            error: connectError,
            action: mode === 'create' ? 'create' : 'update',
            entity: 'pipeline',
          })
        );
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
      onBeforeSaveNavigate,
      markSaved,
      saveContext,
      existingPipelineNames,
    ]
  );

  const handleDelete = useCallback(
    (id: string) => {
      const wasDraft = isDraft(pipeline);
      const deleteRequest = create(DeletePipelineRequestSchema, { request: { id } });
      deleteMutation(deleteRequest, {
        onSuccess: () => {
          // The recovery buffer outlives the pipeline otherwise, and would offer to restore edits to
          // something that no longer exists.
          rpcnEditorAutosave.clear(autosaveTargetKey(id));
          toast.success(wasDraft ? 'Draft deleted' : 'Pipeline deleted');
          navigateToConnectClusters(navigate);
        },
        onError: (err) => {
          toast.error(
            formatToastErrorMessageGRPC({ error: ConnectError.from(err), action: 'delete', entity: 'pipeline' })
          );
        },
      });
    },
    [deleteMutation, navigate, pipeline]
  );

  return {
    handleSave,
    handleDelete,
    clearWizardStore,
    errorLintHints,
    clearErrorLintHints,
    // The run transitions are part of the save, so the button stays busy until they settle.
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
      <div className="flex min-h-96 items-center justify-center text-muted-foreground text-sm">Loading pipeline...</div>
    );
  }
  const showThroughput =
    isEmbedded() &&
    (isServerless()
      ? isFeatureFlagEnabled('enableDataplaneObservabilityServerless')
      : isFeatureFlagEnabled('enableDataplaneObservability'));
  return (
    // Natural height on purpose: this lane scrolls with the page, so logs pagination sits right below
    // the table.
    <div className="flex flex-col p-6">
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
            <h5 className="text-heading-xs text-muted-foreground">Lint issues</h5>
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
  // The full-document parses below tolerate stale YAML — defer it off the per-keystroke critical path.
  const deferredYaml = useDeferredValue(yamlContent);
  const offerTemplate = useShouldOfferTemplate(deferredYaml);
  const showStructureTree = isPipelineDiagramsEnabled;

  // Two-way sync: clicking a node reveals/selects its lines; moving the cursor highlights the node.
  const editorInstance = usePipelineEditorStore((s) => s.editorInstance);
  const [activeNodeId, setActiveNodeId] = useState<string | undefined>();
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

  // While true, the cursor listener below skips its highlight sync — a programmatic reveal
  // (which fires setSelection synchronously) must not overwrite the user's explicit tree selection.
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
      // setSelection dispatches onDidChangeCursorPosition synchronously, so a same-tick flag
      // is enough to keep it from re-deriving the highlight from the (possibly ancestor) range.
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

  // Editor cursor → highlight the most specific node enclosing the caret line.
  useEffect(() => {
    if (!editorInstance) {
      return;
    }
    const sub = editorInstance.onDidChangeCursorPosition((e) => {
      // Skip while a programmatic reveal is selecting an editable ancestor on the tree's behalf;
      // syncing here would snap the highlight from the clicked child row to that ancestor.
      if (suppressCursorSyncRef.current) {
        return;
      }
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
    // Bounded retry: drop the request so an id that never resolves can't fire a surprise jump later.
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

/** One tab of the editor surface's lane strip. */
type LaneTab = { value: string; label: string; onSelect: () => void; count?: number };

// The visual editor builds on the diagram parsing, so it also requires the diagrams flag and the
// embedded Cloud UI.
const isVisualEditorFeatureEnabled = (): boolean =>
  isFeatureFlagEnabled('enableRpcnVisualEditor') && isFeatureFlagEnabled('enablePipelineDiagrams') && isEmbedded();

export default function PipelinePage() {
  const { pipelineId } = usePipelineMode();
  const isVisualEditorEnabled = isVisualEditorFeatureEnabled();
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
  const search = useSearch({ strict: false }) as { serverless?: string; draft?: string };
  const isSlashMenuEnabled = isFeatureFlagEnabled('enableConnectSlashMenu');
  const isServerlessMode = search.serverless === 'true';
  const isPipelineDiagramsEnabled = isFeatureFlagEnabled('enablePipelineDiagrams') && isEmbedded();
  const isVisualEditorEnabled = isVisualEditorFeatureEnabled();
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

  const { components, componentList } = useEnrichedComponents();

  const { data: schemaResponse } = useGetPipelineServiceConfigSchemaQuery();
  const yamlEditorSchema = useMemo(() => parseYamlEditorSchema(schemaResponse?.configSchema), [schemaResponse]);

  // Lets a successful save navigate away without tripping the unsaved-changes guard.
  const markNavigationAllowed = useCallback(() => setAllowNavigation(true), [setAllowNavigation]);

  // Drafts are a server-side pipeline state, so nothing about them is local. The local store below is
  // only crash recovery for the editor buffer.
  const draftsEnabled = areDraftsEnabled();
  const saveContext = useMemo<SaveContext>(
    () => ({ mode: mode === 'create' ? 'create' : 'edit', state: pipeline?.state, draftsEnabled }),
    [mode, pipeline?.state, draftsEnabled]
  );
  const editingDraft = isDraft(pipeline);

  // Names in use, so an unnamed draft is saved as "Untitled pipeline 2" rather than colliding.
  //
  // Create only. A list call costs ~0.7s on a cluster with a few thousand pipelines (the service
  // filters in memory after listing every pipeline), and the save mutation awaits its own invalidation
  // of whatever list queries are active — so paying for this while editing an already-named draft
  // would put that cost on every save for no benefit. Blanking an existing draft's name falls back to
  // an unnumbered "Untitled pipeline", which is fine: duplicate names are allowed.
  const { data: pipelineListData } = useListPipelinesQuery(DRAFT_NAME_LIST_INPUT, {
    enabled: draftsEnabled && mode === 'create',
  });
  const existingPipelineNames = useMemo(
    () => (pipelineListData?.pipelines ?? []).map((p) => p.displayName),
    [pipelineListData]
  );

  const autosaveTarget = autosaveTargetKey(mode === 'create' ? undefined : pipelineId);
  const autosaveEntries = useRpcnEditorAutosaveStore((s) => s.entries);
  const autosaveEntry = useMemo(
    () => (mode === 'view' ? null : selectAutosaveEntry(autosaveEntries, autosaveTarget)),
    [mode, autosaveEntries, autosaveTarget]
  );
  // Recovery is offered once per visit: restoring rewrites the document, and re-offering it afterwards
  // (or after an explicit discard) would make the notice impossible to get rid of.
  const [isAutosaveDismissed, setIsAutosaveDismissed] = useState(false);

  /** Load a buffer over the editor. It is unsaved work, so the document stays dirty on purpose. */
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
        { keepDirty: true, keepDefaultValues: true }
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
      onBeforeSaveNavigate: markNavigationAllowed,
      saveContext,
      existingPipelineNames,
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

  // Structure-tree highlights (lint + unsaved). Deferred YAML keeps the parses off the keystroke path.
  const deferredYamlContent = useDeferredValue(yamlContent);
  const errorNodeIds = useMemo(
    () => new Set(mapLintHintsToNodes(deferredYamlContent, Object.values(lintHints)).keys()),
    [deferredYamlContent, lintHints]
  );
  // Ids first (also drive the structure-tree markers), then the same ids described per component for
  // the Changes lane. Both off the deferred document, so neither parse sits on the keystroke path.
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
  const blocker = useBlocker({
    shouldBlockFn: () => checkUnsavedChanges() && !editorStore.getState().allowNavigation,
    enableBeforeUnload: () => checkUnsavedChanges(),
    withResolver: true,
  });
  const unsavedChanges = useMemo(() => unsavedChangesCopy(saveContext), [saveContext]);
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

  // Populate the form from the loaded pipeline. The query polls, so a DIRTY form is never reset
  // (would clobber edits) — but a clean form re-syncs when the payload changes (concurrent rename).
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

  /** Restore the autosaved buffer over the document the editor loaded. */
  const handleRestoreAutosave = useCallback(() => {
    if (autosaveEntry) {
      applyAutosave(autosaveEntry);
      setIsAutosaveDismissed(true);
      toast.success('Unsaved changes restored');
    }
  }, [autosaveEntry, applyAutosave]);

  const handleDiscardAutosave = useCallback(() => {
    rpcnEditorAutosave.clear(autosaveTarget);
    setIsAutosaveDismissed(true);
  }, [autosaveTarget]);

  // Offer recovery only once the document it would replace has actually loaded, and only while it
  // really differs — otherwise the notice appears over a skeleton, or offers to restore what is
  // already on screen. Editing waits on the server pipeline; creating has nothing to wait for except
  // the serverless template, which resolves late enough to overwrite a restore.
  const isDocumentLoaded = mode === 'create' ? !isServerlessInitializing : initialYaml !== null;
  const showAutosaveRestore =
    mode !== 'view' &&
    !isAutosaveDismissed &&
    !!autosaveEntry &&
    isDocumentLoaded &&
    autosaveEntry.configYaml !== yamlContent;
  // The saved pipeline moved on since the buffer was captured: restoring is still the user's call, but
  // it is no longer just "put my typing back".
  const isAutosaveStale = (() => {
    const savedAt = timestampToMillis(pipeline?.updateTime);
    return !!autosaveEntry && savedAt !== null && savedAt > autosaveEntry.updatedAt;
  })();

  useEditorAutosave({
    enabled: mode !== 'view',
    pipelineId: mode === 'create' ? undefined : pipelineId,
    form,
    editorStore,
  });

  // Create + diagrams: useCreateModeInitialYaml bails, so seed the baseline here or the unsaved-changes
  // guard never arms. Serverless resolves its own baseline later; seeding '' first would read false-dirty.
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
  // The Changes lane lists the components it touched itself, so the structure tree would be a second,
  // less specific copy of the same information.
  const isEditChangesLane = mode !== 'view' && activeEditLane === 'changes';
  const showSidebar = !(isViewVisualLane || isEditVisualLane || isEditChangesLane);

  const {
    expanded,
    toggleExpanded,
    ref: expandedModeRef,
  } = useExpandedPageMode({ storageKey: 'rp-pipeline-editor-mode' });

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

  const isMonitorLane = mode === 'view' && activeViewLane === 'monitor';

  // Empty while a view-mode pipeline is still loading, or in edit mode without the visual editor.
  const lanes = useMemo<LaneTab[]>(() => {
    if (mode === 'view') {
      if (!pipeline) {
        return [];
      }
      const viewLanes: LaneTab[] = [
        // A draft has never run, so it has no throughput and no logs. Offering the lane would only
        // promise metrics that cannot exist.
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
    // Always offered, so "what am I about to apply" is answerable before it is a restart. The count is
    // components touched; a change with no component-level effect (a comment, say) still opens it.
    editLanes.push({
      value: 'changes',
      label: 'Changes',
      count: componentChanges.length,
      onSelect: () => setActiveEditLane('changes'),
    });
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
  ]);

  // A draft opens on its configuration, since Monitor isn't offered.
  useEffect(() => {
    if (mode === 'view' && editingDraft && activeViewLane === 'monitor') {
      setActiveViewLane('configuration');
    }
  }, [mode, editingDraft, activeViewLane, setActiveViewLane]);

  return (
    // Editor lanes are viewport-bounded (page-fill-viewport, globals.css) because Monaco needs a
    // bounded box. The Monitor lane instead flows with the document, keeping its logs pagination out
    // from behind an inner fold.
    // The -ml-3.5/pl-3.5 pair keeps the back button's overhang inside the overflow-x-clip region.
    <div
      className={cn(
        '-ml-3.5 flex min-h-[500px] min-w-0 flex-col gap-4 overflow-x-clip pl-3.5',
        !isMonitorLane && 'page-fill-viewport'
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
        // Same inset as the loaded header, so nothing shifts when the pipeline arrives.
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
      {showAutosaveRestore && autosaveEntry ? (
        // Matches the header's fullscreen inset so it lines up with the title above it.
        <div className={cn('transition-[padding] duration-300 ease-in-out', expanded && 'px-4')}>
          <AutosaveRestoreNotice
            isStale={isAutosaveStale}
            onDiscard={handleDiscardAutosave}
            onRestore={handleRestoreAutosave}
            updatedAt={autosaveEntry.updatedAt}
          />
        </div>
      ) : null}
      {mode === 'view' && editingDraft ? (
        // A draft's page has no metrics and no logs to show, so it says what it is instead of leaving
        // the user to work out why the monitoring is missing.
        <div className={cn('transition-[padding] duration-300 ease-in-out', expanded && 'px-4')}>
          <Alert icon={<FileClock />} testId="draft-view-notice" variant="info">
            <AlertTitle>This pipeline is a draft</AlertTitle>
            <AlertDescription>
              It has never run, so there is nothing to monitor yet and it costs nothing. Starting it checks the
              configuration first — anything it finds is shown in the editor.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      {/* Editor frame flexes to fill the column; the tips strip is pinned just beneath so it stays visible. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {/* Boxed: rounded frame. Fullscreen: flush sides, top/bottom borders kept so the
            clipped scroll area still has a visible edge. */}
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border! transition-[border-radius,border-color] duration-300 ease-in-out',
            expanded ? 'rounded-none border-x-transparent!' : 'rounded-lg'
          )}
        >
          {/* Lane tabs with the fullscreen toggle overlaid at the right end (pr-12 keeps the
              triggers clear of it). Lane-less modes keep an empty strip so it stays put. */}
          <div className="relative shrink-0">
            {lanes.length > 0 ? (
              <Tabs value={mode === 'view' ? activeViewLane : activeEditLane}>
                <TabsList className="pr-12 [&_[data-slot=tabs-trigger]]:w-auto" variant="underline">
                  {lanes.map((lane) => (
                    <TabsTrigger key={lane.value} onClick={lane.onSelect} value={lane.value} variant="underline">
                      {lane.label}
                      {lane.count ? (
                        <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
                          {lane.count}
                        </span>
                      ) : null}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : (
              <div className="h-9 border-border! border-b bg-background" />
            )}
            <div className="absolute inset-y-0 right-1.5 flex items-center">
              <ExpandedPageToggle expanded={expanded} onToggle={toggleExpanded} />
            </div>
          </div>
          {/* min-w-0 + overflow-hidden keep the editor region from propagating width upward. */}
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {showSidebar ? (
              // The monitor lane is document-height, so the structure tree is absolute: with intrinsic
              // height, a huge pipeline would stretch the page far past the metrics.
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
                  // Only edit mode waits on server hydration; create shows its empty state, not a skeleton.
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
                  mode={mode as 'create' | 'edit'}
                  onSelectComponent={goToYamlNode}
                  pipelineState={pipeline?.state}
                  savedYaml={initialYaml ?? ''}
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
          // Match the header's fullscreen inset.
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
                // Close the details dialog first so the two don't stack.
                setIsViewConfigDialogOpen(false);
                setIsDeleteAlertOpen(true);
              }
            : undefined
        }
        open={isViewConfigDialogOpen}
        pipeline={pipeline}
      />

      {/* A draft gets the lighter confirmation: nothing is deployed, so type-to-confirm is theatre. */}
      {pipeline && editingDraft ? (
        <DeleteDraftDialog
          draftName={pipeline.displayName}
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
            <DialogTitle>Leave without saving?</DialogTitle>
          </DialogHeader>
          <DialogBody>{unsavedChanges.body}</DialogBody>
          <DialogFooter>
            <Button onClick={() => blocker.reset?.()} variant={unsavedChanges.canSaveDraft ? 'ghost' : 'primary'}>
              Keep editing
            </Button>
            <Button onClick={() => blocker.proceed?.()} variant="secondary-outline">
              Discard changes
            </Button>
            {unsavedChanges.canSaveDraft ? (
              <Button
                // Draft first, then continue the navigation the guard interrupted.
                onClick={async () => {
                  await handleSave({ run: 'draft', skipNavigation: true });
                  blocker.proceed?.();
                }}
                testId="save-draft-and-leave"
                variant="primary"
              >
                Save draft
              </Button>
            ) : null}
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
