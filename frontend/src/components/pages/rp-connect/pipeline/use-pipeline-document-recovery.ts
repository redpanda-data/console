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

import { useSearch } from '@tanstack/react-router';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useGetPipelineServiceConfigSchemaQuery } from 'react-query/api/connect';
import { useGetPipelineQuery, usePipelineSampleQuery } from 'react-query/api/pipeline';
import {
  type AttachedServiceAccount,
  autosaveTargetKey,
  type EditorAutosaveEntry,
  rpcnEditorAutosave,
  selectAutosaveEntry,
  useRpcnEditorAutosaveStore,
} from 'state/rpcn-editor-autosave';
import { showToast } from 'utils/toast.utils';
import { z } from 'zod';
import { useShallow } from 'zustand/react/shallow';

import { summarizeSettingsChanges } from './changes-summary';
import { areDraftsEnabled, isDraft, provesDraftSupport, timestampToMillis } from './draft-copy';
import { useEgressGatewayNames } from './egress-gateway-field';
import type { SaveContext } from './save-actions';
import {
  type PipelineEditorStore,
  usePipelineEditorStore,
  usePipelineEditorStoreApi,
} from './use-pipeline-editor-store';
import { isEmbedded, isFeatureFlagEnabled } from '../../../../runtime-config';
import { parseJsonSchema } from '../../../../types/json-schema';
import { MIN_TASKS } from '../tasks';
import { useEnrichedComponents } from '../utils/use-enriched-components';
import { type PipelineMode, usePipelineMode } from '../utils/use-pipeline-mode';
import { withYamlDocumentation } from '../utils/yaml-editor-schema';

export const pipelineFormSchema = z.object({
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
    .refine((tags) => {
      const keys = tags.map((t) => t.key).filter(Boolean);
      return new Set(keys).size === keys.length;
    }, 'Duplicate tag keys are not allowed'),
  egressGatewayIds: z.array(z.string()),
});

export type PipelineFormValues = z.infer<typeof pipelineFormSchema>;

export function parseYamlEditorSchema(configSchema: string | undefined) {
  if (!(configSchema !== null && configSchema !== undefined && configSchema !== '')) {
    return;
  }
  try {
    const parsed: unknown = JSON.parse(configSchema);
    const schema = parseJsonSchema(parsed);
    return schema ? { definitions: schema.definitions, properties: schema.properties } : undefined;
  } catch {
    // Malformed schema: callers treat undefined as "no schema".
  }
}

// The visual editor builds on the diagram parsing, so it also requires the diagrams flag and the
// embedded Cloud UI.
export const isVisualEditorFeatureEnabled = (): boolean =>
  isFeatureFlagEnabled('enableRpcnVisualEditor') && isFeatureFlagEnabled('enablePipelineDiagrams') && isEmbedded();

export type PipelineForm = UseFormReturn<PipelineFormValues>;

/** Route and feature-flag inputs the page branches on. */
export function usePipelinePageConfig() {
  const { mode, pipelineId } = usePipelineMode();
  const search = useSearch({ strict: false });
  return {
    mode,
    pipelineId,
    isServerlessMode: search.serverless === 'true',
    isSlashMenuEnabled: isFeatureFlagEnabled('enableConnectSlashMenu'),
    isPipelineDiagramsEnabled: isFeatureFlagEnabled('enablePipelineDiagrams') && isEmbedded(),
    isVisualEditorEnabled: isVisualEditorFeatureEnabled(),
    isTemplateGalleryEnabled: isFeatureFlagEnabled('enableRpcnTemplateGallery'),
  };
}

export type PipelinePageConfig = ReturnType<typeof usePipelinePageConfig>;

// The page's actions are stable store members, so they are read once rather than subscribed to.
function editorActions(state: PipelineEditorStore) {
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
  } = state;
  return {
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
  };
}

/** The editor store's values the page renders from, and its actions. */
export function usePipelineEditorState() {
  const editorStore = usePipelineEditorStoreApi();
  const values = usePipelineEditorStore(
    useShallow((s) => ({
      yamlContent: s.yamlContent,
      initialYaml: s.initialYaml,
      editorInstance: s.editorInstance,
      hydratedPipelineId: s.hydratedPipelineId,
      activeViewLane: s.activeViewLane,
      activeEditLane: s.activeEditLane,
      selectedNodeId: s.selectedNodeId,
      commandMenuFilter: s.commandMenuFilter,
      addConnectorType: s.addConnectorType,
      isConfigDialogOpen: s.isConfigDialogOpen,
      isViewConfigDialogOpen: s.isViewConfigDialogOpen,
      isDeleteAlertOpen: s.isDeleteAlertOpen,
      isTemplateDialogOpen: s.isTemplateDialogOpen,
    }))
  );
  return { ...values, editorStore, actions: editorActions(editorStore.getState()) };
}

export type PipelineEditorState = ReturnType<typeof usePipelineEditorState>;

// Create mode proves draft support from another pipeline; an empty cluster, or a failed sample, falls
// back to the flag rather than to a save that deploys.
function useDraftSupport(mode: PipelineMode, pipeline: Pipeline | undefined) {
  const draftsFlagEnabled = areDraftsEnabled();
  const {
    data: sampleResponse,
    isLoading: isCheckingDraftSupport,
    isError: isSampleFailed,
  } = usePipelineSampleQuery({
    enabled: draftsFlagEnabled && mode === 'create',
  });
  const samplePipelines = sampleResponse?.response?.pipelines;
  const draftsEnabled =
    draftsFlagEnabled &&
    (mode === 'create'
      ? isSampleFailed || samplePipelines?.length === 0 || provesDraftSupport(samplePipelines?.[0])
      : provesDraftSupport(pipeline));
  return { draftsEnabled, isCheckingDraftSupport };
}

/** The loaded pipeline, the component catalog and config schema, and what saving it may do. */
export function usePipelineServerData(mode: PipelineMode, pipelineId: string | undefined) {
  const { data: pipelineResponse } = useGetPipelineQuery(
    { id: (pipelineId ?? '') || '' },
    { enabled: mode !== 'create' && pipelineId !== null && pipelineId !== undefined && pipelineId !== '' }
  );
  const pipeline = useMemo(() => pipelineResponse?.response?.pipeline, [pipelineResponse]);
  const { components, componentList } = useEnrichedComponents();
  const { data: schemaResponse } = useGetPipelineServiceConfigSchemaQuery();
  const yamlEditorSchema = useMemo(() => {
    const schema = parseYamlEditorSchema(schemaResponse?.configSchema);
    return schema ? withYamlDocumentation(schema, components) : undefined;
  }, [schemaResponse, components]);
  const { draftsEnabled, isCheckingDraftSupport } = useDraftSupport(mode, pipeline);
  const saveContext = useMemo<SaveContext>(
    () => ({ mode: mode === 'create' ? 'create' : 'edit', state: pipeline?.state, draftsEnabled }),
    [mode, pipeline?.state, draftsEnabled]
  );
  return {
    pipeline,
    components,
    componentList,
    yamlEditorSchema,
    saveContext,
    isCheckingDraftSupport,
    editingDraft: isDraft(pipeline),
  };
}

export type PipelineServerData = ReturnType<typeof usePipelineServerData>;

export type SessionInputs = {
  config: PipelinePageConfig;
  editorState: PipelineEditorState;
  form: PipelineForm;
  server: PipelineServerData;
};

/** The browser buffer captured when the editor opened, until it is restored or dismissed. */
function useRecoverableAutosave(mode: PipelineMode, isDocumentLoaded: boolean, autosaveTarget: string) {
  // Snapshot taken when the editor opened; read live, this session's own writes would look recoverable.
  const [recoverableEntry, setRecoverableEntry] = useState<EditorAutosaveEntry | null>(null);
  const [isAutosaveDismissed, setIsAutosaveDismissed] = useState(false);
  const capturedTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode === 'view' || !isDocumentLoaded || capturedTargetRef.current === autosaveTarget) {
      return;
    }
    capturedTargetRef.current = autosaveTarget;
    setRecoverableEntry(rpcnEditorAutosave.get(autosaveTarget));
    setIsAutosaveDismissed(false);
  }, [mode, isDocumentLoaded, autosaveTarget]);
  return { recoverableEntry, isAutosaveDismissed, setIsAutosaveDismissed };
}

function shouldOfferAutosaveRestore({
  mode,
  entry,
  isDismissed,
  hasStoredBuffer,
  baselineYaml,
  recoveredSettingsChangeCount,
}: {
  mode: PipelineMode;
  entry: EditorAutosaveEntry | null;
  isDismissed: boolean;
  hasStoredBuffer: boolean;
  baselineYaml: string | null;
  recoveredSettingsChangeCount: number;
}): boolean {
  return (
    mode !== 'view' &&
    !isDismissed &&
    !!entry &&
    hasStoredBuffer &&
    // Against the baseline, not the live editor.
    (entry.configYaml !== (baselineYaml ?? '') || recoveredSettingsChangeCount > 0)
  );
}

// Both sides are the dataplane's `update_time`, so clock skew can't affect this.
function isAutosaveEntryStale(entry: EditorAutosaveEntry | null, savedUpdateTime: number | null): boolean {
  return (
    !!entry &&
    entry.basedOnUpdateTime != null &&
    savedUpdateTime !== null &&
    savedUpdateTime !== entry.basedOnUpdateTime
  );
}

/** Offers back edits a previous visit left in this browser. */
export function useAutosaveRecovery({
  config,
  editorState,
  form,
  server,
  isDocumentLoaded,
  setAttachedServiceAccount,
}: SessionInputs & {
  isDocumentLoaded: boolean;
  setAttachedServiceAccount: (account: AttachedServiceAccount | undefined) => void;
}) {
  const { mode } = config;
  const autosaveTarget = autosaveTargetKey(mode === 'create' ? undefined : config.pipelineId);
  // A boolean so autosave rewriting the entry isn't a re-render.
  const hasStoredBuffer = useRpcnEditorAutosaveStore(
    (s) => mode !== 'view' && selectAutosaveEntry(s.entries, autosaveTarget) !== null
  );
  const { recoverableEntry, isAutosaveDismissed, setIsAutosaveDismissed } = useRecoverableAutosave(
    mode,
    isDocumentLoaded,
    autosaveTarget
  );
  const { setYamlContent } = editorState.actions;

  // Restored work is unsaved, so the form must read dirty against the loaded defaults.
  const handleRestoreAutosave = useCallback(() => {
    if (!recoverableEntry) {
      return;
    }
    setYamlContent(recoverableEntry.configYaml);
    setAttachedServiceAccount(recoverableEntry.serviceAccount ?? undefined);
    form.reset(
      {
        name: recoverableEntry.name,
        description: recoverableEntry.description,
        computeUnits: recoverableEntry.computeUnits,
        tags: recoverableEntry.tags,
        egressGatewayIds: recoverableEntry.egressGatewayIds ?? form.getValues('egressGatewayIds'),
      },
      { keepDefaultValues: true }
    );
    setIsAutosaveDismissed(true);
    showToast({ status: 'success', title: 'Your edits were restored — they still need saving' });
  }, [recoverableEntry, setYamlContent, setAttachedServiceAccount, form, setIsAutosaveDismissed]);

  const handleDiscardAutosave = useCallback(() => {
    rpcnEditorAutosave.clear(autosaveTarget);
    setIsAutosaveDismissed(true);
  }, [autosaveTarget, setIsAutosaveDismissed]);

  const gatewayNames = useEgressGatewayNames();
  const recoveredSettingsChanges = useMemo(
    () =>
      recoverableEntry ? summarizeSettingsChanges(form.formState.defaultValues, recoverableEntry, gatewayNames) : [],
    [recoverableEntry, form.formState.defaultValues, gatewayNames]
  );
  return {
    autosaveTarget,
    recoverableEntry,
    showAutosaveRestore: shouldOfferAutosaveRestore({
      mode,
      entry: recoverableEntry,
      isDismissed: isAutosaveDismissed,
      hasStoredBuffer,
      baselineYaml: editorState.initialYaml,
      recoveredSettingsChangeCount: recoveredSettingsChanges.length,
    }),
    isAutosaveStale: isAutosaveEntryStale(recoverableEntry, timestampToMillis(server.pipeline?.updateTime)),
    handleRestoreAutosave,
    handleDiscardAutosave,
  };
}
