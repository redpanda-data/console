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
import { zodResolver } from '@hookform/resolvers/zod';
// biome-ignore lint/suspicious/noDeprecatedImports: The object-options useBlocker overload is current; only its legacy overloads are deprecated.
import { type RegisteredRouter, useBlocker, useNavigate, useRouter } from '@tanstack/react-router';
import { getUserTagEntries } from 'components/constants';
import { useRefFormDialog } from 'hooks/use-ref-form-dialog';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { AttachedServiceAccount } from 'state/rpcn-editor-autosave';
import { useRpcnWizardStore } from 'state/rpcn-wizard-store';
import { asyncEvent } from 'utils/async-event';
import { reportActionError, showToast } from 'utils/toast.utils';

import { summarizeComponentChanges, summarizeSettingsChanges, UNSAVED_CHANGES_LANE_LABEL } from './changes-summary';
import { timestampToMillis } from './draft-copy';
import type { TipContext } from './editor-tips-bar';
import { useEgressGatewayNames } from './egress-gateway-field';
import { storedEgressGatewayIds } from './egress-gateways';
import { type SaveContext, unsavedChangesCopy } from './save-actions';
import { useEditorAutosave } from './use-editor-autosave';
import {
  type PipelineEditorState,
  type PipelineForm,
  type PipelineFormValues,
  type PipelinePageConfig,
  type PipelineServerData,
  pipelineFormSchema,
  type SessionInputs,
  useAutosaveRecovery,
  usePipelineEditorState,
  usePipelinePageConfig,
  usePipelineServerData,
} from './use-pipeline-document-recovery';
import type { EditLane, ViewLane } from './use-pipeline-editor-store';
import { usePipelineLint } from './use-pipeline-lint';
import { usePipelineSave } from './use-pipeline-save';
import { useSaveHotkey } from './use-save-hotkey';
import { useSlashCommand } from './use-slash-command';
import { takeStartLintHints } from './use-start-draft';
import { nonzeroNumber } from '../../../../utils/number-utils';
import { cpuToTasks, MIN_TASKS } from '../tasks';
import type { ConnectComponentType } from '../types/schema';
import type { AddTopicFormData, BaseStepRef, UserStepRef, UserStepSubmissionData } from '../types/wizard';
import { navigateToConnectClusters } from '../utils/navigation';
import { changedNodeIds } from '../utils/pipeline-diff';
import { mapLintHintsToNodes } from '../utils/pipeline-lint';
import { useCreateModeInitialYaml } from '../utils/use-create-mode-initial-yaml';
import type { PipelineMode } from '../utils/use-pipeline-mode';
import { getConnectTemplate } from '../utils/yaml';
import {
  extractConnectorConsumerGroup,
  extractConnectorTopics,
  type RedpandaSetupResultLike,
} from '../utils/yaml-redpanda';

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

// Stable empty set for the "nothing unsaved" / view-mode case so highlights don't churn renders.
const EMPTY_NODE_IDS: ReadonlySet<string> = new Set();

type DiagramDialogTarget = {
  section: 'input' | 'output';
  componentName: string;
};

/** What an Add user result writes into the component, and the new service account it brings. */
function userDialogSetup(data: UserStepSubmissionData): {
  setupResult: RedpandaSetupResultLike;
  serviceAccount?: AttachedServiceAccount;
} {
  if ('username' in data) {
    return {
      setupResult: {
        authMethod: 'sasl',
        username: data.username,
        saslMechanism: data.saslMechanism,
        consumerGroup: data.consumerGroup,
      },
    };
  }
  return {
    setupResult: { authMethod: 'service-account' },
    // A kept account is already the one the save sends.
    serviceAccount:
      'serviceAccountId' in data
        ? { serviceAccountId: data.serviceAccountId, secretName: data.serviceAccountSecretName }
        : undefined,
  };
}

export function useDiagramDialogs(
  yamlContent: string,
  patchComponent: (section: 'input' | 'output', componentName: string, patch: RedpandaSetupResultLike) => boolean,
  focusEditorEnd: () => void,
  onServiceAccountAttached: (account: AttachedServiceAccount) => void
) {
  const topicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);
  const userStepRef = useRef<UserStepRef>(null);

  // A component that comes from a merge key, or sits inside nested wrappers, can't be rewritten safely.
  const warnUnpatched = (componentName: string) =>
    showToast({
      status: 'warning',
      title: 'Couldn’t add it to the YAML',
      description: `Add it to the ${componentName} config by hand.`,
    });

  const topicDialog = useRefFormDialog<AddTopicFormData, DiagramDialogTarget>({
    ref: topicStepRef,
    onSuccess: (data, target) => {
      if (!data.topicName) {
        return;
      }
      if (patchComponent(target.section, target.componentName, { topicName: data.topicName })) {
        focusEditorEnd();
      } else {
        warnUnpatched(target.componentName);
      }
    },
  });

  const userDialog = useRefFormDialog<UserStepSubmissionData, DiagramDialogTarget>({
    ref: userStepRef,
    onSuccess: (data, target) => {
      const { setupResult, serviceAccount } = userDialogSetup(data);
      if (patchComponent(target.section, target.componentName, setupResult)) {
        if (serviceAccount) {
          onServiceAccountAttached(serviceAccount);
        }
        focusEditorEnd();
      } else {
        warnUnpatched(target.componentName);
      }
    },
  });

  const [connectorTopics, setConnectorTopics] = useState<string[] | undefined>();
  const [connectorConsumerGroup, setConnectorConsumerGroup] = useState<string | undefined>();

  const openTopicDialog = topicDialog.open;
  const openUserDialog = userDialog.open;

  return {
    topicDialog,
    userDialog,
    topicStepRef,
    userStepRef,
    connectorTopics,
    connectorConsumerGroup,
    handleAddTopic: useCallback(
      (section: string, componentName: string) => {
        if (section === 'input' || section === 'output') {
          openTopicDialog({ section, componentName });
        }
      },
      [openTopicDialog]
    ),
    handleAddSasl: useCallback(
      (section: string, componentName: string) => {
        if (section !== 'input' && section !== 'output') {
          return;
        }
        const { topics, parseError } = extractConnectorTopics(yamlContent, section, componentName);
        if (parseError) {
          showToast({ status: 'error', title: 'Failed to parse pipeline YAML' });
        }
        setConnectorTopics(topics);
        // An input reading as its own user needs the group granted too, so the dialog starts from it.
        setConnectorConsumerGroup(
          section === 'input' ? extractConnectorConsumerGroup(yamlContent, componentName) : undefined
        );
        openUserDialog({ section, componentName });
      },
      [openUserDialog, yamlContent]
    ),
  };
}

/** One tab of the editor surface's lane strip. */
type LaneTab = {
  value: string;
  label: string;
  onSelect: () => void;
  count?: number;
  /** Plain marker when there is something to say but nothing to count. */
  showDot?: boolean;
  disabled?: boolean;
};

function usePipelineSettingsForm() {
  return useForm<PipelineFormValues>({
    resolver: zodResolver(pipelineFormSchema),
    mode: 'onSubmit',
    defaultValues: { name: '', description: '', computeUnits: MIN_TASKS, tags: [], egressGatewayIds: [] },
  });
}

/** Guards against losing unsaved edits when navigating away from the editor (edit or create). */
export function useUnsavedChangesGuard({
  mode,
  form,
  editorState,
  saveContext,
}: {
  mode: PipelineMode;
  form: PipelineForm;
  editorState: PipelineEditorState;
  saveContext: SaveContext;
}) {
  const { editorStore, initialYaml, yamlContent } = editorState;
  const { setAllowNavigation } = editorState.actions;
  const hasUnsavedChanges =
    mode !== 'view' && (form.formState.isDirty || (initialYaml !== null && yamlContent !== initialYaml));

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

  const blocker = useBlocker({
    shouldBlockFn: () => checkUnsavedChanges() && !editorStore.getState().allowNavigation,
    enableBeforeUnload: () => checkUnsavedChanges(),
    withResolver: true,
  });
  const unsavedChanges = useMemo(() => unsavedChangesCopy(saveContext), [saveContext]);
  // Re-arm the guard on entering an editable mode (e.g. editing again after the post-save nav to
  // view). In view mode the guard never blocks, so there is nothing to re-arm.
  useEffect(() => {
    if (mode !== 'view') {
      setAllowNavigation(false);
    }
  }, [mode, setAllowNavigation]);
  // Lets a successful save navigate away without tripping the unsaved-changes guard.
  const markNavigationAllowed = useCallback(() => setAllowNavigation(true), [setAllowNavigation]);

  return { hasUnsavedChanges, blocker, unsavedChanges, markNavigationAllowed };
}

/** Saving, the unsaved-changes guard, and the lint shown for the document. */
function usePipelineSaveSession({ config, editorState, form, server }: SessionInputs) {
  // A component given a new service account logs in as the pipeline's, so the save attaches it.
  const [attachedServiceAccount, setAttachedServiceAccount] = useState<AttachedServiceAccount>();
  const guard = useUnsavedChangesGuard({ mode: config.mode, form, editorState, saveContext: server.saveContext });
  const save = usePipelineSave({
    form,
    editorStore: editorState.editorStore,
    mode: config.mode,
    pipelineId: config.pipelineId,
    pipeline: server.pipeline,
    isPipelineDiagramsEnabled: config.isPipelineDiagramsEnabled,
    onBeforeGuardedNavigate: guard.markNavigationAllowed,
    saveContext: server.saveContext,
    attachedServiceAccount,
  });
  const lint = usePipelineLint(editorState.yamlContent, save.errorLintHints, config.mode !== 'view');
  // ⌘S / Ctrl+S saves from both the YAML and Visual lanes. Until draft support is known, a save could
  // deploy what was meant as a draft.
  useSaveHotkey({
    enabled: config.mode !== 'view',
    isSaving: save.isSaving || server.isCheckingDraftSupport,
    onSave: asyncEvent(save.handleSave, reportActionError),
  });
  return { attachedServiceAccount, setAttachedServiceAccount, guard, save, lint };
}

type PipelineSaveSession = ReturnType<typeof usePipelineSaveSession>;

// Structure-tree highlights (lint + unsaved). Deferred YAML keeps the parses off the keystroke path.
function usePipelineChangeSummaries({
  mode,
  editorState,
  form,
  lintHints,
}: {
  mode: PipelineMode;
  editorState: PipelineEditorState;
  form: PipelineForm;
  lintHints: Record<string, LintHint>;
}) {
  const { initialYaml } = editorState;
  const deferredYamlContent = useDeferredValue(editorState.yamlContent);
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
  const gatewayNames = useEgressGatewayNames();
  const settingsChanges = useMemo(
    () => (mode === 'edit' ? summarizeSettingsChanges(form.formState.defaultValues, settingsValues, gatewayNames) : []),
    [mode, form.formState.defaultValues, settingsValues, gatewayNames]
  );
  return { errorNodeIds, unsavedNodeIds, componentChanges, settingsValues, settingsChanges };
}

// Populate the form from the loaded pipeline. The query polls, so a DIRTY form is never reset
// (would clobber edits) — but a clean form re-syncs when the payload changes (concurrent rename).
function useSettingsFormSync(pipeline: Pipeline | undefined, mode: PipelineMode, form: PipelineForm) {
  const formResetSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    if (!(pipeline && mode === 'edit')) {
      return;
    }
    const values = {
      name: pipeline.displayName,
      description: pipeline.description || '',
      computeUnits: nonzeroNumber(cpuToTasks(pipeline.resources?.cpuShares)) ?? MIN_TASKS,
      tags: getUserTagEntries(pipeline.tags),
      egressGatewayIds: storedEgressGatewayIds(pipeline),
    };
    const snapshot = `${pipeline.id}\n${JSON.stringify(values)}`;
    if (snapshot === formResetSnapshotRef.current || form.formState.isDirty) {
      return;
    }
    formResetSnapshotRef.current = snapshot;
    form.reset(values);
  }, [pipeline, mode, form]);
}

/** Loads the document into the editor: from the server, or the create-mode starting YAML. */
function usePipelineDocumentLoad({
  config,
  editorState,
  form,
  server,
  clearErrorLintHints,
}: SessionInputs & {
  clearErrorLintHints: () => void;
}) {
  const { mode, isPipelineDiagramsEnabled } = config;
  const { editorStore, hydratedPipelineId } = editorState;
  const { hydrateFromServer, resolveInitialYaml } = editorState.actions;
  const { pipeline } = server;

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
  // Hydrate from the loaded pipeline once per id, so re-renders don't clobber edits.
  useEffect(() => {
    if (pipeline && mode !== 'create' && pipeline.id !== hydratedPipelineId) {
      hydrateFromServer(pipeline.id, pipeline.configYaml, timestampToMillis(pipeline.updateTime));
    }
  }, [pipeline, mode, hydratedPipelineId, hydrateFromServer]);
  useSettingsFormSync(pipeline, mode, form);

  const { isInitializing } = useCreateModeInitialYaml({
    enabled: mode === 'create',
    isServerlessMode: config.isServerlessMode,
    components: server.components,
    isPipelineDiagramsEnabled,
    onResolved: resolveInitialYaml,
  });
  return isInitializing;
}

// Create + diagrams: useCreateModeInitialYaml bails, so seed the baseline here or the unsaved-changes
// guard never arms. Serverless resolves its own baseline later; seeding '' first would read false-dirty.
function useCreateModeBaseline(config: PipelinePageConfig, editorState: PipelineEditorState) {
  const { mode, isPipelineDiagramsEnabled, isServerlessMode } = config;
  const { initialYaml, yamlContent } = editorState;
  const { resolveInitialYaml } = editorState.actions;
  useEffect(() => {
    if (mode === 'create' && isPipelineDiagramsEnabled && !isServerlessMode && initialYaml === null) {
      resolveInitialYaml(yamlContent);
    }
  }, [mode, isPipelineDiagramsEnabled, isServerlessMode, initialYaml, yamlContent, resolveInitialYaml]);
}

// A start refused from the list or detail page hands its hints over; seeded after hydration, which clears them.
function useStartLintHandover(
  mode: PipelineMode,
  pipelineId: string | undefined,
  isDocumentLoaded: boolean,
  setErrorLintHints: (hints: Record<string, LintHint>) => void
) {
  useEffect(() => {
    if (
      mode !== 'edit' ||
      !(pipelineId !== null && pipelineId !== undefined && pipelineId !== '') ||
      !isDocumentLoaded
    ) {
      return;
    }
    const hints = takeStartLintHints(pipelineId);
    if (hints) {
      setErrorLintHints(hints);
    }
  }, [mode, pipelineId, isDocumentLoaded, setErrorLintHints]);
}

/** The document's load, its change summaries, and the edits kept in (and offered back from) the browser. */
function usePipelineDocumentSession({
  saveSession,
  ...inputs
}: SessionInputs & {
  saveSession: PipelineSaveSession;
}) {
  const { config, editorState, form } = inputs;
  const changes = usePipelineChangeSummaries({
    mode: config.mode,
    editorState,
    form,
    lintHints: saveSession.lint.lintHints,
  });
  const isServerlessInitializing = usePipelineDocumentLoad({
    ...inputs,
    clearErrorLintHints: saveSession.save.clearErrorLintHints,
  });
  // The serverless template resolves late enough to overwrite a restore, so create waits on it.
  const isDocumentLoaded = config.mode === 'create' ? !isServerlessInitializing : editorState.initialYaml !== null;
  const recovery = useAutosaveRecovery({
    ...inputs,
    isDocumentLoaded,
    setAttachedServiceAccount: saveSession.setAttachedServiceAccount,
  });
  useStartLintHandover(config.mode, config.pipelineId, isDocumentLoaded, saveSession.save.setErrorLintHints);
  const { flush: flushAutosave } = useEditorAutosave({
    enabled: config.mode !== 'view',
    pipelineId: config.mode === 'create' ? undefined : config.pipelineId,
    form,
    editorStore: editorState.editorStore,
    serviceAccount: saveSession.attachedServiceAccount,
  });
  useCreateModeBaseline(config, editorState);
  return { ...changes, isServerlessInitializing, recovery, flushAutosave };
}

type CommandMenuFilter = 'all' | 'variables' | 'secrets' | 'topics' | 'users';

/** The command menu, opened from the sidebar, and its slash-triggered popover in the YAML editor. */
function usePipelineCommandMenus(config: PipelinePageConfig, editorState: PipelineEditorState) {
  const { setCommandMenuFilter } = editorState.actions;
  const handleSlashOpen = useCallback(() => setCommandMenuFilter(null), [setCommandMenuFilter]);
  const slashCommand = useSlashCommand(
    config.mode === 'view' ? null : editorState.editorInstance,
    config.isSlashMenuEnabled,
    handleSlashOpen
  );
  const handleCommandMenuOpen = useCallback(
    (filter: CommandMenuFilter = 'all') => {
      slashCommand.close();
      setCommandMenuFilter(filter);
    },
    [slashCommand, setCommandMenuFilter]
  );
  return { slashCommand, handleCommandMenuOpen };
}

// Move the caret to the end after a programmatic edit so the user sees the change.
function useFocusEditorEnd(editorStore: PipelineEditorState['editorStore']) {
  return useCallback(() => {
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
}

// Route through `navigate` (not history.back) so the unsaved-changes blocker intercepts.
function leaveEditor(
  mode: PipelineMode,
  pipelineId: string | undefined,
  navigate: ReturnType<typeof useNavigate>,
  router: RegisteredRouter
) {
  if (mode === 'edit' && pipelineId !== null && pipelineId !== undefined && pipelineId !== '') {
    return navigate({ to: '/rp-connect/$pipelineId', params: { pipelineId } });
  }
  if (mode === 'view') {
    return navigateToConnectClusters(navigate);
  }
  if (router.history.canGoBack()) {
    router.history.back();
  } else {
    return navigateToConnectClusters(navigate);
  }
}

function usePipelineCancel(mode: PipelineMode, pipelineId: string | undefined, clearWizardStore: () => void) {
  const navigate = useNavigate();
  const router = useRouter();
  return useCallback(() => {
    if (mode === 'create') {
      clearWizardStore();
    }
    return leaveEditor(mode, pipelineId, navigate, router);
  }, [mode, clearWizardStore, navigate, pipelineId, router]);
}

/** Edits the page makes to the document on the user's behalf, and leaving the editor. */
function usePipelineEditorActions({
  config,
  editorState,
  server,
  saveSession,
}: SessionInputs & {
  saveSession: PipelineSaveSession;
}) {
  const { yamlContent } = editorState;
  const { components } = server;
  const { setYamlContent, setAddConnectorType } = editorState.actions;
  const commandMenus = usePipelineCommandMenus(config, editorState);
  const focusEditorEnd = useFocusEditorEnd(editorState.editorStore);
  const diagramDialogs = useDiagramDialogs(
    yamlContent,
    editorState.actions.patchComponent,
    focusEditorEnd,
    saveSession.setAttachedServiceAccount
  );
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
      if (newYaml !== null && newYaml !== undefined && newYaml !== '') {
        setYamlContent(newYaml);
        focusEditorEnd();
      }
    },
    [components, yamlContent, setYamlContent, focusEditorEnd, setAddConnectorType]
  );
  const handleCancel = usePipelineCancel(config.mode, config.pipelineId, saveSession.save.clearWizardStore);
  return { ...commandMenus, diagramDialogs, handleConnectorSelected, handleCancel };
}

function viewLaneTabs({
  editingDraft,
  isVisualEditorEnabled,
  goToYamlNode,
  setActiveViewLane,
}: {
  editingDraft: boolean;
  isVisualEditorEnabled: boolean;
  goToYamlNode: () => void;
  setActiveViewLane: (lane: ViewLane) => void;
}): LaneTab[] {
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

function editLaneTabs({
  mode,
  isVisualEditorEnabled,
  goToYamlNode,
  setActiveEditLane,
  changeCount,
  hasUnsavedChanges,
}: {
  mode: PipelineMode;
  isVisualEditorEnabled: boolean;
  goToYamlNode: () => void;
  setActiveEditLane: (lane: EditLane) => void;
  changeCount: number;
  hasUnsavedChanges: boolean;
}): LaneTab[] {
  const editLanes: LaneTab[] = [{ value: 'yaml', label: 'YAML', onSelect: () => goToYamlNode() }];
  if (isVisualEditorEnabled) {
    editLanes.push({ value: 'visual', label: 'Visual', onSelect: () => setActiveEditLane('visual') });
  }
  // Only where something is saved to compare against.
  if (mode === 'edit') {
    editLanes.push({
      value: 'changes',
      label: UNSAVED_CHANGES_LANE_LABEL,
      count: changeCount,
      showDot: hasUnsavedChanges,
      disabled: !hasUnsavedChanges,
      onSelect: () => setActiveEditLane('changes'),
    });
  }
  return editLanes;
}

/** Which surfaces the active lane shows. */
function laneLayout(mode: PipelineMode, viewLane: ViewLane, editLane: EditLane, editingDraft: boolean) {
  const isViewVisualLane = mode === 'view' && viewLane === 'visual';
  const isEditVisualLane = mode !== 'view' && editLane === 'visual';
  const isEditChangesLane = mode === 'edit' && editLane === 'changes';
  return {
    // Visual and changes lanes take the full canvas.
    showSidebar: !(isViewVisualLane || isEditVisualLane || isEditChangesLane),
    isEditChangesLane,
    // Excludes a draft here, not just in the corrective effect below: that runs after the commit, by
    // which point this lane's children have mounted and fired their requests.
    isMonitorLane: mode === 'view' && viewLane === 'monitor' && !editingDraft,
  };
}

/** Steps off a lane that no longer applies. */
function useLaneCorrections({
  mode,
  editorState,
  editingDraft,
  isEditChangesLane,
  hasUnsavedChanges,
}: {
  mode: PipelineMode;
  editorState: PipelineEditorState;
  editingDraft: boolean;
  isEditChangesLane: boolean;
  hasUnsavedChanges: boolean;
}) {
  const { activeViewLane } = editorState;
  const { setActiveViewLane, setActiveEditLane } = editorState.actions;
  useEffect(() => {
    if (mode === 'view' && editingDraft && activeViewLane === 'monitor') {
      setActiveViewLane('configuration');
    }
  }, [mode, editingDraft, activeViewLane, setActiveViewLane]);

  // The tab is disabled once everything is saved, so leave the lane too.
  useEffect(() => {
    if (isEditChangesLane && !hasUnsavedChanges) {
      setActiveEditLane('yaml');
    }
  }, [isEditChangesLane, hasUnsavedChanges, setActiveEditLane]);
}

/** The editor surface's lanes: the tab strip, which one is showing, and moving between them. */
function usePipelineLanes({
  config,
  editorState,
  server,
  hasUnsavedChanges,
  changeCount,
}: {
  config: PipelinePageConfig;
  editorState: PipelineEditorState;
  server: PipelineServerData;
  hasUnsavedChanges: boolean;
  changeCount: number;
}) {
  const { mode, isVisualEditorEnabled } = config;
  const { editorStore, selectedNodeId } = editorState;
  const { requestRevealNode, setActiveViewLane, setActiveEditLane } = editorState.actions;
  const layout = laneLayout(mode, editorState.activeViewLane, editorState.activeEditLane, server.editingDraft);

  // Open the YAML lane and reveal a node: explicit id, else the selected node. Routes per mode.
  const goToYamlNode = useCallback(
    (nodeId?: string) => {
      const target = nodeId ?? selectedNodeId;
      if (target !== null && target !== undefined && target !== '') {
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

  const { pipeline, editingDraft } = server;
  const lanes = useMemo<LaneTab[]>(() => {
    if (mode === 'view') {
      return pipeline ? viewLaneTabs({ editingDraft, isVisualEditorEnabled, goToYamlNode, setActiveViewLane }) : [];
    }
    return editLaneTabs({
      mode,
      isVisualEditorEnabled,
      goToYamlNode,
      setActiveEditLane,
      changeCount,
      hasUnsavedChanges,
    });
  }, [
    mode,
    pipeline,
    editingDraft,
    isVisualEditorEnabled,
    goToYamlNode,
    setActiveViewLane,
    setActiveEditLane,
    changeCount,
    hasUnsavedChanges,
  ]);

  useLaneCorrections({
    mode,
    editorState,
    editingDraft,
    isEditChangesLane: layout.isEditChangesLane,
    hasUnsavedChanges,
  });
  return {
    ...layout,
    lanes,
    goToYamlNode,
    tipsContext: tipsContextForLane(mode === 'view', editorState.activeViewLane, editorState.activeEditLane),
  };
}

/** Everything the editor page renders from, composed from its concerns. */
export function usePipelinePageModel() {
  const config = usePipelinePageConfig();
  const editorState = usePipelineEditorState();
  const form = usePipelineSettingsForm();
  const server = usePipelineServerData(config.mode, config.pipelineId);
  const saveSession = usePipelineSaveSession({ config, editorState, form, server });
  const documentSession = usePipelineDocumentSession({ config, editorState, form, server, saveSession });
  const actions = usePipelineEditorActions({ config, editorState, form, server, saveSession });
  const lanes = usePipelineLanes({
    config,
    editorState,
    server,
    hasUnsavedChanges: saveSession.guard.hasUnsavedChanges,
    changeCount: documentSession.componentChanges.length + documentSession.settingsChanges.length,
  });
  return { config, editorState, form, server, saveSession, documentSession, actions, lanes };
}
