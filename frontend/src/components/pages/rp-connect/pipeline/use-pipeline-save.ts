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
import { useNavigate } from '@tanstack/react-router';
import { isSystemTag } from 'components/constants';
import {
  CreatePipelineRequestSchema,
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
  UpdatePipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  CreatePipelineRequestSchema as CreatePipelineRequestSchemaDataPlane,
  type Pipeline,
  Pipeline_ServiceAccountSchema,
  PipelineCreateSchema,
  PipelineUpdateSchema,
  UpdatePipelineRequestSchema as UpdatePipelineRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { FieldErrors, UseFormReturn } from 'react-hook-form';
import {
  useCreatePipelineMutation,
  useDeletePipelineMutation,
  useFetchPipelineNames,
  useStartPipelineMutation,
  useStopPipelineMutation,
  useUpdatePipelineMutation,
} from 'react-query/api/pipeline';
import { toast } from 'sonner';
import { type AttachedServiceAccount, autosaveTargetKey, rpcnEditorAutosave } from 'state/rpcn-editor-autosave';
import { useRpcnWizardStore } from 'state/rpcn-wizard-store';
import { addServiceAccountTags } from 'utils/service-account.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import {
  DRAFT_UNSUPPORTED_MESSAGE,
  DRAFT_UNSUPPORTED_STOPPED_MESSAGE,
  DRAFT_UPDATE_UNSUPPORTED_MESSAGE,
  isDraft,
  NOTHING_TO_SAVE_MESSAGE,
  startBlockedMessage,
  timestampToMillis,
  UNTITLED_PIPELINE_NAME,
  untitledPipelineName,
} from './draft-copy';
import {
  BLANK_CONFIG_MESSAGE,
  isBlankConfig,
  isInvalidConfigError,
  isNoLongerDraftError,
  MISSING_SERVICE_ACCOUNT_MESSAGE,
  NO_LONGER_DRAFT_MESSAGE,
  primaryRunIntent,
  type SaveContext,
  type SaveIntent,
  type SaveRunIntent,
  saveSuccessMessage,
  wasDraftIgnored,
} from './save-actions';
import type { usePipelineEditorStoreApi } from './use-pipeline-editor-store';
import { extractLintHintsFromError } from '../errors';
import { cpuToTasks, tasksToCPU } from '../tasks';
import { navigateToConnectClusters } from '../utils/navigation';
import { usesServiceAccountLogin } from '../utils/yaml';
import type { PipelineFormValues } from '.';

// Sonner's default is 4s.
const SAVE_SUCCESS_TOAST_MS = 6000;

type PipelineForm = UseFormReturn<PipelineFormValues>;
type EditorStoreApi = ReturnType<typeof usePipelineEditorStoreApi>;
type LintHints = Record<string, LintHint>;

type MarkSaved = (
  yamlContent: string,
  submittedSettings: PipelineFormValues,
  savedPipelineId: string | undefined,
  savedUpdateTime: number | null
) => void;

/** The settings and config one save writes, shared by the create and update requests. */
type PipelineWrite = {
  name: string;
  description: string | undefined;
  computeUnits: number;
  userTags: Record<string, string>;
  yamlContent: string;
  draft: boolean;
  serviceAccount: AttachedServiceAccount | undefined;
};

/** What a save reads and reports through, fixed for the save's duration. */
type SaveFlow = {
  form: PipelineForm;
  editorStore: EditorStoreApi;
  mode: string;
  pipelineId: string | undefined;
  pipeline: Pipeline | undefined;
  saveContext: SaveContext;
  attachedServiceAccount: AttachedServiceAccount | undefined;
  navigate: ReturnType<typeof useNavigate>;
  onBeforeGuardedNavigate?: () => void;
  createPipeline: ReturnType<typeof useCreatePipelineMutation>['mutateAsync'];
  updatePipeline: ReturnType<typeof useUpdatePipelineMutation>['mutateAsync'];
  startPipeline: ReturnType<typeof useStartPipelineMutation>['mutateAsync'];
  stopPipeline: ReturnType<typeof useStopPipelineMutation>['mutateAsync'];
  setErrorLintHints: (hints: LintHints) => void;
  clearWizardStore: () => void;
  markSaved: MarkSaved;
  assignUntitledName: () => Promise<void>;
};

/** One save that passed its checks: how it runs, and what it sends. */
type SaveAttempt = {
  run: SaveRunIntent;
  isDraftSave: boolean;
  skipNavigation: boolean;
  submittedSettings: PipelineFormValues;
  write: PipelineWrite;
};

type StopOutcome = { stopped: boolean; stopFailed: boolean };

function buildUserTags(formTags: PipelineFormValues['tags']): Record<string, string> {
  const userTags: Record<string, string> = {};
  for (const { key, value } of formTags) {
    if (key) {
      userTags[key] = value;
    }
  }
  return userTags;
}

function warnIfResized(form: PipelineForm, cpuShares: string | undefined) {
  const retUnits = cpuToTasks(cpuShares);
  const currentUnits = form.getValues('computeUnits');
  if (retUnits && currentUnits !== retUnits) {
    toast.warning(`Pipeline has been resized to use ${retUnits} compute units`);
  }
}

/** The pipeline's service account, which Connect's service-account SASL logs in with, and its tracking tags. */
function serviceAccountFields(account: AttachedServiceAccount | undefined) {
  if (!account) {
    return {};
  }
  const tags: Record<string, string> = {};
  addServiceAccountTags(tags, account.serviceAccountId, account.secretName);
  return {
    tags,
    serviceAccount: create(Pipeline_ServiceAccountSchema, {
      clientId: `\${secrets.${account.secretName}.client_id}`,
      clientSecret: `\${secrets.${account.secretName}.client_secret}`,
    }),
  };
}

function buildCreateRequest(write: PipelineWrite) {
  const account = serviceAccountFields(write.serviceAccount);

  return create(CreatePipelineRequestSchema, {
    request: create(CreatePipelineRequestSchemaDataPlane, {
      pipeline: create(PipelineCreateSchema, {
        displayName: write.name,
        configYaml: write.yamlContent,
        description: write.description || '',
        resources: { cpuShares: tasksToCPU(write.computeUnits) || '0', memoryShares: '0' },
        tags: { __redpanda_cloud_pipeline_type: 'pipeline', ...account.tags, ...write.userTags },
        serviceAccount: account.serviceAccount,
        draft: write.draft,
      }),
    }),
  });
}

function buildUpdateRequest(id: string, current: Pipeline | undefined, write: PipelineWrite) {
  const account = serviceAccountFields(write.serviceAccount);

  return create(UpdatePipelineRequestSchema, {
    request: create(UpdatePipelineRequestSchemaDataPlane, {
      id,
      pipeline: create(PipelineUpdateSchema, {
        displayName: write.name,
        configYaml: write.yamlContent,
        description: write.description || '',
        resources: { cpuShares: tasksToCPU(write.computeUnits) || '0', memoryShares: '0' },
        tags: {
          ...Object.fromEntries(Object.entries(current?.tags ?? {}).filter(([k]) => isSystemTag(k))),
          ...account.tags,
          ...write.userTags,
        },
        serviceAccount: account.serviceAccount ?? current?.serviceAccount,
        // Asserted so the server refuses the write if the draft was started meanwhile.
        draft: write.draft ? true : undefined,
      }),
    }),
  });
}

// A failed lookup must not fail the save; duplicate display names are legal.
async function nextUntitledName(fetchPipelineNames: ReturnType<typeof useFetchPipelineNames>) {
  try {
    return untitledPipelineName(await fetchPipelineNames(UNTITLED_PIPELINE_NAME));
  } catch {
    return UNTITLED_PIPELINE_NAME;
  }
}

function invalidSettingsMessage(fieldErrors: FieldErrors<PipelineFormValues>): string {
  const firstError = fieldErrors.name?.message ?? fieldErrors.computeUnits?.message ?? fieldErrors.tags?.message;
  return typeof firstError === 'string' ? firstError : 'Fix the highlighted pipeline settings before saving.';
}

/** A deploy needs a config to run, and an account for any component that logs in as the pipeline. */
function deployBlockerMessage(isDraftSave: boolean, yamlContent: string, hasServiceAccount: boolean): string | null {
  if (isDraftSave) {
    return null;
  }
  if (isBlankConfig(yamlContent)) {
    return BLANK_CONFIG_MESSAGE;
  }
  // A draft can wait for its account; a deploy would start a pipeline that can't log in.
  if (!hasServiceAccount && usesServiceAccountLogin(yamlContent)) {
    return MISSING_SERVICE_ACCOUNT_MESSAGE;
  }
  return null;
}

/** Why the save must not go ahead, or null when it can; an unnamed draft is named first. */
async function saveBlockerMessage(flow: SaveFlow, isDraftSave: boolean, yamlContent: string): Promise<string | null> {
  if (isDraftSave && flow.mode === 'create' && isBlankConfig(yamlContent) && !flow.form.getValues('name').trim()) {
    return NOTHING_TO_SAVE_MESSAGE;
  }
  if (isDraftSave) {
    await flow.assignUntitledName();
  }
  if (!(await flow.form.trigger())) {
    // Settings live in the header/dialog, so surface why the save was blocked.
    return invalidSettingsMessage(flow.form.formState.errors);
  }
  return deployBlockerMessage(
    isDraftSave,
    yamlContent,
    Boolean(flow.attachedServiceAccount || flow.pipeline?.serviceAccount)
  );
}

/** The validated settings, read after the checks so a just-assigned name is included. */
function saveAttempt(
  flow: SaveFlow,
  run: SaveRunIntent,
  yamlContent: string,
  intent: SaveIntent | undefined
): SaveAttempt {
  const submittedSettings = flow.form.getValues();
  const { name, description, computeUnits, tags } = submittedSettings;
  return {
    run,
    isDraftSave: run === 'draft',
    skipNavigation: Boolean(intent?.skipNavigation),
    submittedSettings,
    write: {
      name,
      description,
      computeUnits,
      userTags: buildUserTags(tags),
      yamlContent,
      draft: run === 'draft',
      serviceAccount: flow.attachedServiceAccount,
    },
  };
}

async function stopQuietly(stopPipeline: SaveFlow['stopPipeline'], id: string): Promise<boolean> {
  try {
    await stopPipeline(create(StopPipelineRequestSchema, { request: { id } }));
    return true;
  } catch {
    return false;
  }
}

/**
 * CreatePipeline always starts, so "stopped" is a follow-up stop; a dropped `draft` lands in the same
 * place, and leaving that to the user is the weak link on something irreversible. `stopFailed` covers
 * a stop that was needed and did not happen, including a response with no id to aim one at, so the
 * copy cannot claim it was parked.
 */
async function stopCreatedPipeline(
  flow: SaveFlow,
  attempt: SaveAttempt,
  newPipelineId: string | undefined,
  draftWasIgnored: boolean
): Promise<StopOutcome> {
  if (!(attempt.run === 'stopped' || draftWasIgnored)) {
    return { stopped: false, stopFailed: false };
  }
  const stopped = newPipelineId ? await stopQuietly(flow.stopPipeline, newPipelineId) : false;
  if (!(stopped || draftWasIgnored)) {
    toast.warning('Pipeline created, but stopping it failed — it may be running. Stop it from its page.');
  }
  return { stopped, stopFailed: !stopped };
}

function toastCreateOutcome(flow: SaveFlow, attempt: SaveAttempt, draftWasIgnored: boolean, outcome: StopOutcome) {
  if (draftWasIgnored) {
    // Both messages name the deployment; only one of them still needs a human.
    toast.error(outcome.stopped ? DRAFT_UNSUPPORTED_STOPPED_MESSAGE : DRAFT_UNSUPPORTED_MESSAGE);
  } else if (!outcome.stopFailed) {
    toast.success(saveSuccessMessage(flow.saveContext, attempt.run), { duration: SAVE_SUCCESS_TOAST_MS });
  }
}

function leaveAfterCreate(
  flow: SaveFlow,
  attempt: SaveAttempt,
  newPipelineId: string | undefined,
  draftWasIgnored: boolean
) {
  flow.onBeforeGuardedNavigate?.();
  if (attempt.skipNavigation) {
    return;
  }
  if (!newPipelineId) {
    flow.navigate({ to: '/connect-clusters' });
    return;
  }
  // A draft stays in the editor on its own route so the next save updates it.
  flow.navigate({
    to: attempt.isDraftSave && !draftWasIgnored ? `/rp-connect/${newPipelineId}/edit` : `/rp-connect/${newPipelineId}`,
  });
}

async function requestCreate(flow: SaveFlow, write: PipelineWrite) {
  const response = await flow.createPipeline(buildCreateRequest(write));
  flow.setErrorLintHints({});
  return response.response?.pipeline;
}

async function createAndFinish(flow: SaveFlow, attempt: SaveAttempt): Promise<boolean> {
  const createdPipeline = await requestCreate(flow, attempt.write);
  const draftWasIgnored = wasDraftIgnored(attempt.isDraftSave, createdPipeline);
  const stopOutcome = await stopCreatedPipeline(flow, attempt, createdPipeline?.id, draftWasIgnored);
  flow.clearWizardStore();
  flow.markSaved(
    attempt.write.yamlContent,
    attempt.submittedSettings,
    createdPipeline?.id,
    timestampToMillis(createdPipeline?.updateTime)
  );
  toastCreateOutcome(flow, attempt, draftWasIgnored, stopOutcome);
  warnIfResized(flow.form, createdPipeline?.resources?.cpuShares);
  leaveAfterCreate(flow, attempt, createdPipeline?.id, draftWasIgnored);
  return true;
}

function reportRunFailure(flow: SaveFlow, run: SaveRunIntent, runError: ConnectError) {
  if (run === 'start' && isInvalidConfigError(runError)) {
    const hints = extractLintHintsFromError(runError);
    flow.setErrorLintHints(hints);
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

/**
 * UpdatePipeline keeps the run state; on a draft, `start` is promotion and validates first. Resolves
 * to false when the start or stop failed, which the saved configuration survives.
 */
async function applyRunIntent(flow: SaveFlow, run: SaveRunIntent, pipelineId: string): Promise<boolean> {
  try {
    if (run === 'start') {
      await flow.startPipeline(create(StartPipelineRequestSchema, { request: { id: pipelineId } }));
    } else if (run === 'stopped') {
      await flow.stopPipeline(create(StopPipelineRequestSchema, { request: { id: pipelineId } }));
    }
    return true;
  } catch (runErr) {
    reportRunFailure(flow, run, ConnectError.from(runErr));
    return false;
  }
}

function toastUpdateOutcome(flow: SaveFlow, attempt: SaveAttempt, draftWasIgnored: boolean) {
  if (draftWasIgnored) {
    // No longer a draft, so the editor's next save would deploy too: hand over to the pipeline's page.
    toast.error(DRAFT_UPDATE_UNSUPPORTED_MESSAGE);
  } else {
    toast.success(saveSuccessMessage(flow.saveContext, attempt.run), { duration: SAVE_SUCCESS_TOAST_MS });
  }
}

// A saved draft stays in the editor; everything else opens the pipeline's page.
function leaveAfterUpdate(flow: SaveFlow, attempt: SaveAttempt, pipelineId: string, draftWasIgnored: boolean) {
  if ((attempt.isDraftSave && !draftWasIgnored) || attempt.skipNavigation) {
    return;
  }
  flow.onBeforeGuardedNavigate?.();
  flow.navigate({ to: `/rp-connect/${pipelineId}` });
}

async function requestUpdate(flow: SaveFlow, write: PipelineWrite, pipelineId: string) {
  const response = await flow.updatePipeline(buildUpdateRequest(pipelineId, flow.pipeline, write));
  flow.setErrorLintHints({});
  return response.response?.pipeline;
}

async function updateAndFinish(flow: SaveFlow, attempt: SaveAttempt, pipelineId: string): Promise<boolean> {
  const updatedPipeline = await requestUpdate(flow, attempt.write, pipelineId);
  const draftWasIgnored = wasDraftIgnored(attempt.isDraftSave, updatedPipeline);
  const runSucceeded = await applyRunIntent(flow, attempt.run, pipelineId);
  flow.markSaved(
    attempt.write.yamlContent,
    attempt.submittedSettings,
    pipelineId,
    timestampToMillis(updatedPipeline?.updateTime)
  );
  warnIfResized(flow.form, updatedPipeline?.resources?.cpuShares);
  if (!runSucceeded) {
    return true;
  }
  toastUpdateOutcome(flow, attempt, draftWasIgnored);
  leaveAfterUpdate(flow, attempt, pipelineId, draftWasIgnored);
  return true;
}

function reportSaveFailure(flow: SaveFlow, err: unknown, isDraftSave: boolean): false {
  const connectError = ConnectError.from(err);
  flow.setErrorLintHints(extractLintHintsFromError(connectError));
  if (isDraftSave && isNoLongerDraftError(connectError)) {
    toast.error(NO_LONGER_DRAFT_MESSAGE);
    return false;
  }
  toast.error(
    formatToastErrorMessageGRPC({
      error: connectError,
      action: flow.mode === 'create' ? 'create' : 'update',
      entity: 'pipeline',
    })
  );
  return false;
}

async function submitSave(flow: SaveFlow, attempt: SaveAttempt): Promise<boolean> {
  try {
    if (flow.mode === 'create') {
      return await createAndFinish(flow, attempt);
    }
    return flow.pipelineId ? await updateAndFinish(flow, attempt, flow.pipelineId) : false;
  } catch (err) {
    return reportSaveFailure(flow, err, attempt.isDraftSave);
  }
}

/** Resolves to whether the configuration was persisted; a failed start/stop after the write still counts. */
async function savePipeline(flow: SaveFlow, intent?: SaveIntent): Promise<boolean> {
  const run: SaveRunIntent = intent?.run ?? primaryRunIntent(flow.saveContext);
  // Flush the Visual lane's in-progress edit (the user may save mid-edit), then read fresh YAML.
  flow.editorStore.getState().pendingEditCommit?.();
  const { yamlContent } = flow.editorStore.getState();
  const blocker = await saveBlockerMessage(flow, run === 'draft', yamlContent);
  if (blocker) {
    toast.error(blocker);
    return false;
  }
  return submitSave(flow, saveAttempt(flow, run, yamlContent, intent));
}

// A save that navigates unmounts the editor before the debounced write can run, so edits made
// while the request was in flight are stored here, against the target the editor continues on.
function keepEditsMadeInFlight({
  targetKey,
  savedYaml,
  currentYaml,
  submittedSettings,
  onScreen,
  basedOnUpdateTime,
  serviceAccount,
}: {
  targetKey: string;
  savedYaml: string;
  currentYaml: string;
  submittedSettings: PipelineFormValues;
  onScreen: PipelineFormValues;
  basedOnUpdateTime: number | null;
  serviceAccount: AttachedServiceAccount | undefined;
}) {
  if (currentYaml === savedYaml && JSON.stringify(onScreen) === JSON.stringify(submittedSettings)) {
    return;
  }
  rpcnEditorAutosave.save({
    targetKey,
    name: onScreen.name,
    description: onScreen.description ?? '',
    computeUnits: onScreen.computeUnits,
    tags: onScreen.tags,
    configYaml: currentYaml,
    basedOnUpdateTime,
    serviceAccount,
  });
}

function useMarkSaved({
  editorStore,
  form,
  mode,
  pipelineId,
  attachedServiceAccount,
}: {
  editorStore: EditorStoreApi;
  form: PipelineForm;
  mode: string;
  pipelineId: string | undefined;
  attachedServiceAccount: AttachedServiceAccount | undefined;
}): MarkSaved {
  // Add user can attach one while a save is in flight, after the save read it.
  const latestServiceAccount = useRef(attachedServiceAccount);
  useLayoutEffect(
    function syncSavedServiceAccount() {
      latestServiceAccount.current = attachedServiceAccount;
    },
    [attachedServiceAccount]
  );

  return useCallback(
    (yamlContent, submittedSettings, savedPipelineId, savedUpdateTime) => {
      editorStore.getState().markSavedBaseline(yamlContent, savedUpdateTime);
      // The settings stay editable while the request is in flight, so the baseline is what it carried.
      const onScreen = form.getValues();
      form.reset(submittedSettings);
      form.reset(onScreen, { keepDefaultValues: true });
      rpcnEditorAutosave.clear(autosaveTargetKey(mode === 'create' ? undefined : pipelineId));
      if (savedPipelineId && savedPipelineId !== pipelineId) {
        rpcnEditorAutosave.clear(autosaveTargetKey(savedPipelineId));
      }
      keepEditsMadeInFlight({
        targetKey: autosaveTargetKey(savedPipelineId ?? pipelineId),
        savedYaml: yamlContent,
        currentYaml: editorStore.getState().yamlContent,
        submittedSettings,
        onScreen,
        basedOnUpdateTime: savedUpdateTime,
        serviceAccount: latestServiceAccount.current,
      });
    },
    [editorStore, form, mode, pipelineId]
  );
}

function useSaveMutations() {
  const createMutation = useCreatePipelineMutation();
  const updateMutation = useUpdatePipelineMutation();
  const startMutation = useStartPipelineMutation();
  const stopMutation = useStopPipelineMutation();
  return {
    createPipeline: createMutation.mutateAsync,
    updatePipeline: updateMutation.mutateAsync,
    startPipeline: startMutation.mutateAsync,
    stopPipeline: stopMutation.mutateAsync,
    isPending:
      createMutation.isPending || updateMutation.isPending || startMutation.isPending || stopMutation.isPending,
  };
}

/** Names an unnamed draft before it is saved. */
function useUntitledNaming(form: PipelineForm) {
  const fetchPipelineNames = useFetchPipelineNames();
  // The name lookup runs before any mutation is pending, so the button needs its own busy flag.
  const [isNaming, setIsNaming] = useState(false);

  const assignUntitledName = useCallback(async () => {
    if (form.getValues('name').trim()) {
      return;
    }
    setIsNaming(true);
    try {
      form.setValue('name', await nextUntitledName(fetchPipelineNames), { shouldValidate: true });
    } finally {
      setIsNaming(false);
    }
  }, [form, fetchPipelineNames]);

  return { isNaming, assignUntitledName };
}

function useErrorLintHints() {
  const [errorLintHints, setErrorLintHints] = useState<LintHints>({});
  const clearErrorLintHints = useCallback(() => setErrorLintHints({}), []);
  return { errorLintHints, setErrorLintHints, clearErrorLintHints };
}

function useClearWizardStore(isPipelineDiagramsEnabled: boolean) {
  return useCallback(() => {
    if (!isPipelineDiagramsEnabled) {
      useRpcnWizardStore.getState().setYamlContent({ yamlContent: '' });
    }
    useRpcnWizardStore.getState().setWizardData({ input: undefined, output: undefined });
  }, [isPipelineDiagramsEnabled]);
}

function usePipelineDelete(pipeline: Pipeline | undefined, onBeforeGuardedNavigate: (() => void) | undefined) {
  const navigate = useNavigate();
  const { mutate: deleteMutation, isPending } = useDeletePipelineMutation();

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

  return { handleDelete, isDeleting: isPending };
}

export function usePipelineSave({
  form,
  editorStore,
  mode,
  pipelineId,
  pipeline,
  isPipelineDiagramsEnabled,
  onBeforeGuardedNavigate,
  saveContext,
  attachedServiceAccount,
}: {
  form: PipelineForm;
  /** The editor store — read fresh at save time (after flushing pending visual edits). */
  editorStore: EditorStoreApi;
  mode: string;
  pipelineId: string | undefined;
  pipeline: Pipeline | undefined;
  isPipelineDiagramsEnabled: boolean;
  /** Stands the unsaved-changes guard down before a navigation this page performs itself. */
  onBeforeGuardedNavigate?: () => void;
  saveContext: SaveContext;
  /** Replaces the pipeline's service account on save. */
  attachedServiceAccount: AttachedServiceAccount | undefined;
}) {
  const navigate = useNavigate();
  const { createPipeline, updatePipeline, startPipeline, stopPipeline, isPending } = useSaveMutations();
  const { isNaming, assignUntitledName } = useUntitledNaming(form);
  const { errorLintHints, setErrorLintHints, clearErrorLintHints } = useErrorLintHints();
  const clearWizardStore = useClearWizardStore(isPipelineDiagramsEnabled);
  const markSaved = useMarkSaved({ editorStore, form, mode, pipelineId, attachedServiceAccount });

  const handleSave = useCallback(
    (intent?: SaveIntent) =>
      savePipeline(
        {
          form,
          editorStore,
          mode,
          pipelineId,
          pipeline,
          saveContext,
          attachedServiceAccount,
          navigate,
          onBeforeGuardedNavigate,
          createPipeline,
          updatePipeline,
          startPipeline,
          stopPipeline,
          setErrorLintHints,
          clearWizardStore,
          markSaved,
          assignUntitledName,
        },
        intent
      ),
    [
      form,
      editorStore,
      mode,
      pipelineId,
      pipeline,
      saveContext,
      attachedServiceAccount,
      navigate,
      onBeforeGuardedNavigate,
      createPipeline,
      updatePipeline,
      startPipeline,
      stopPipeline,
      setErrorLintHints,
      clearWizardStore,
      markSaved,
      assignUntitledName,
    ]
  );
  const { handleDelete, isDeleting } = usePipelineDelete(pipeline, onBeforeGuardedNavigate);

  return {
    handleSave,
    handleDelete,
    clearWizardStore,
    errorLintHints,
    setErrorLintHints,
    clearErrorLintHints,
    isSaving: isNaming || isPending,
    isDeleting,
  };
}
