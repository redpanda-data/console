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
import { useBlocker, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { getUserTagEntries } from 'components/constants';
import { ArrowLeftIcon } from 'components/icons';
import { ElementTooltip } from 'components/misc/element-tooltip';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import {
  Dialog,
  DialogBody,
  DialogContent,
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
import type { editor, IRange } from 'monaco-editor';
import type { JSONSchema } from 'monaco-yaml';
import { type ComponentList, type Pipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { type Resolver, type UseFormReturn, useForm, useWatch } from 'react-hook-form';
import { useGetPipelineServiceConfigSchemaQuery } from 'react-query/api/connect';
import { useGetPipelineQuery, usePipelineSampleQuery } from 'react-query/api/pipeline';
import { toast } from 'sonner';
import {
  type AttachedServiceAccount,
  autosaveTargetKey,
  type EditorAutosaveEntry,
  rpcnEditorAutosave,
  selectAutosaveEntry,
  useRpcnEditorAutosaveStore,
} from 'state/rpcn-editor-autosave';
import { useRpcnWizardStore } from 'state/rpcn-wizard-store';
import { z } from 'zod';
import { useShallow } from 'zustand/react/shallow';

import { AutosaveRestoreNotice } from './autosave-restore-notice';
import { ChangesPanel } from './changes-panel';
import { summarizeComponentChanges, summarizeSettingsChanges, UNSAVED_CHANGES_LANE_LABEL } from './changes-summary';
import { ConfigDialog } from './config-dialog';
import { DeleteDraftDialog } from './delete-draft-dialog';
import { DetailsDialog } from './details-dialog';
import {
  areDraftsEnabled,
  DRAFT_VIEW_NOTICE_BODY,
  DRAFT_VIEW_NOTICE_TITLE,
  isDraft,
  provesDraftSupport,
  timestampToMillis,
} from './draft-copy';
import { EditorTipsBar, type TipContext } from './editor-tips-bar';
import { PipelineCommandMenu } from './pipeline-command-menu';
import { PipelineEditHeader, PipelineViewHeader } from './pipeline-header';
import { PipelineStructureTree } from './pipeline-structure-tree';
import { PipelineThroughputCard } from './pipeline-throughput-card';
import { type SaveContext, type SaveIntent, unsavedChangesCopy } from './save-actions';
import { ScrollShadow } from './scroll-shadow';
import { TemplateGalleryCta } from './template-cta';
import { useEditorAutosave } from './use-editor-autosave';
import {
  type EditLane,
  PipelineEditorProvider,
  type PipelineEditorStore,
  usePipelineEditorStore,
  usePipelineEditorStoreApi,
  type ViewLane,
} from './use-pipeline-editor-store';
import { usePipelineLint } from './use-pipeline-lint';
import { usePipelineSave } from './use-pipeline-save';
import { useSaveHotkey } from './use-save-hotkey';
import { useSlashCommand } from './use-slash-command';
import { takeStartLintHints } from './use-start-draft';
import { VisualEditorPanel } from './visual-editor-panel';
import { AddConnectorDialog } from '../onboarding/add-connector-dialog';
import { AddConnectorsCard } from '../onboarding/add-connectors-card';
import { AddTopicStep } from '../onboarding/add-topic-step';
import { AddUserStep } from '../onboarding/add-user-step';
import { LogsTab } from '../pipelines-details';
import { cpuToTasks, MIN_TASKS } from '../tasks';
import { TemplateGalleryDialog } from '../template-gallery/template-gallery-dialog';
import type { ConnectComponentType } from '../types/schema';
import type { AddTopicFormData, BaseStepRef, UserStepRef, UserStepSubmissionData } from '../types/wizard';
import { navigateToConnectClusters } from '../utils/navigation';
import { changedNodeIds } from '../utils/pipeline-diff';
import { parsePipelineFlowTree, shouldOfferTemplate } from '../utils/pipeline-flow-parser';
import { enclosingNodeId, mapLintHintsToNodes, nodeLineRanges } from '../utils/pipeline-lint';
import { useCreateModeInitialYaml } from '../utils/use-create-mode-initial-yaml';
import { useEnrichedComponents } from '../utils/use-enriched-components';
import { type PipelineMode, usePipelineMode } from '../utils/use-pipeline-mode';
import {
  extractConnectorConsumerGroup,
  extractConnectorTopics,
  getConnectTemplate,
  type RedpandaSetupResultLike,
} from '../utils/yaml';
import { withYamlDocumentation } from '../utils/yaml-editor-schema';

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
    // Malformed schema: callers treat undefined as "no schema".
  }
}

type DiagramDialogTarget = { section: 'input' | 'output'; componentName: string };

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

function useDiagramDialogs(
  yamlContent: string,
  patchComponent: (section: 'input' | 'output', componentName: string, patch: RedpandaSetupResultLike) => boolean,
  focusEditorEnd: () => void,
  onServiceAccountAttached: (account: AttachedServiceAccount) => void
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

  const userDialog = useRefFormDialog<UserStepSubmissionData, DiagramDialogTarget>({
    ref: userStepRef,
    onSuccess: (data, target) => {
      const { setupResult, serviceAccount } = userDialogSetup(data);
      if (patchComponent(target.section, target.componentName, setupResult)) {
        if (serviceAccount) {
          onServiceAccountAttached(serviceAccount);
        }
        focusEditorEnd();
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
        // An input reading as its own user needs the group granted too, so the dialog starts from it.
        setConnectorConsumerGroup(
          section === 'input' ? extractConnectorConsumerGroup(yamlContent, componentName) : undefined
        );
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
    'pointer-events-none absolute inset-x-0 h-4 from-static-dark/10 to-transparent transition-opacity duration-150 dark:from-static-dark/40';
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
      <div aria-hidden className={cn(edge, 'top-0 bg-linear-to-b', overflow.top ? 'opacity-100' : 'opacity-0')} />
      <div aria-hidden className={cn(edge, 'bottom-0 bg-linear-to-t', overflow.bottom ? 'opacity-100' : 'opacity-0')} />
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

type NodeLineRange = ReturnType<typeof nodeLineRanges>[number];
type CursorSyncSuppression = { current: boolean };
type RevealAttempt = { id: string | null; count: number };

function useNodeLineRanges(yaml: string): NodeLineRange[] {
  return useMemo(() => {
    try {
      return nodeLineRanges(yaml);
    } catch {
      return [];
    }
  }, [yaml]);
}

// setSelection dispatches onDidChangeCursorPosition synchronously, so a same-tick flag
// is enough to keep it from re-deriving the highlight from the (possibly ancestor) range.
function selectWithoutCursorSync(
  ed: editor.IStandaloneCodeEditor,
  selection: IRange,
  suppressCursorSync: CursorSyncSuppression
) {
  suppressCursorSync.current = true;
  try {
    ed.setSelection(selection);
  } finally {
    suppressCursorSync.current = false;
  }
}

function revealNodeLines(
  ed: editor.IStandaloneCodeEditor | null,
  range: NodeLineRange | undefined,
  suppressCursorSync: CursorSyncSuppression
) {
  const model = ed?.getModel();
  if (!(ed && range && model)) {
    return;
  }
  const endLine = Math.min(range.end, model.getLineCount());
  selectWithoutCursorSync(
    ed,
    {
      startLineNumber: range.start,
      startColumn: 1,
      endLineNumber: endLine,
      endColumn: model.getLineMaxColumn(endLine),
    },
    suppressCursorSync
  );
  ed.revealLineInCenterIfOutsideViewport(range.start);
  ed.focus();
}

/** The attempt for `revealNodeId`, restarted whenever the request changes. */
function revealAttemptFor(attempt: RevealAttempt, revealNodeId: string | null): RevealAttempt {
  return attempt.id === revealNodeId ? attempt : { id: revealNodeId, count: 0 };
}

/** Counts a reveal that could not resolve yet; true once the request has used its retries. */
function recordUnresolvedReveal(attempt: RevealAttempt): boolean {
  attempt.count += 1;
  return attempt.count > MAX_REVEAL_ATTEMPTS;
}

// Editor cursor → highlight the most specific node enclosing the caret line.
function useCursorNodeHighlight(
  editorInstance: editor.IStandaloneCodeEditor | null,
  nodeRanges: NodeLineRange[],
  suppressCursorSync: CursorSyncSuppression,
  onHighlight: (nodeId: string | undefined) => void
) {
  // Latest ranges for the long-lived cursor listener, without re-subscribing per keystroke.
  const nodeRangesRef = useRef(nodeRanges);
  nodeRangesRef.current = nodeRanges;

  useEffect(() => {
    if (!editorInstance) {
      return;
    }
    const sub = editorInstance.onDidChangeCursorPosition((e) => {
      // Skip while a programmatic reveal is selecting an editable ancestor on the tree's behalf;
      // syncing here would snap the highlight from the clicked child row to that ancestor.
      if (suppressCursorSync.current) {
        return;
      }
      onHighlight(enclosingNodeId(e.position.lineNumber, nodeRangesRef.current));
    });
    return () => sub.dispose();
  }, [editorInstance, suppressCursorSync, onHighlight]);
}

// Pending reveal request from the Visual lane: honour once editor + ranges mount, then clear (fires once).
function usePendingNodeReveal(
  editorInstance: editor.IStandaloneCodeEditor | null,
  nodeRanges: NodeLineRange[],
  selectNode: (highlightId: string, editableId?: string) => void
) {
  const revealNodeId = usePipelineEditorStore((s) => s.revealNodeId);
  const requestRevealNode = usePipelineEditorStore((s) => s.requestRevealNode);
  const revealAttemptRef = useRef<RevealAttempt>({ id: null, count: 0 });
  useEffect(() => {
    revealAttemptRef.current = revealAttemptFor(revealAttemptRef.current, revealNodeId);
    if (!revealNodeId) {
      return;
    }
    if (editorInstance?.getModel() && nodeRanges.some((r) => r.id === revealNodeId)) {
      selectNode(revealNodeId, revealNodeId);
      requestRevealNode(null);
      return;
    }
    // Bounded retry: drop the request so an id that never resolves can't fire a surprise jump later.
    if (recordUnresolvedReveal(revealAttemptRef.current)) {
      requestRevealNode(null);
    }
  }, [revealNodeId, editorInstance, nodeRanges, selectNode, requestRevealNode]);
}

/** Two-way sync: clicking a node reveals/selects its lines; moving the cursor highlights the node. */
function useEditorNodeSync(yaml: string) {
  const editorInstance = usePipelineEditorStore((s) => s.editorInstance);
  const [activeNodeId, setActiveNodeId] = useState<string | undefined>();
  const nodeRanges = useNodeLineRanges(yaml);
  // While true, the cursor listener skips its highlight sync — a programmatic reveal
  // (which fires setSelection synchronously) must not overwrite the user's explicit tree selection.
  const suppressCursorSyncRef = useRef(false);

  const handleSelectNode = useCallback(
    (highlightId: string, editableId?: string) => {
      setActiveNodeId(highlightId);
      revealNodeLines(
        editorInstance,
        editableId ? nodeRanges.find((r) => r.id === editableId) : undefined,
        suppressCursorSyncRef
      );
    },
    [editorInstance, nodeRanges]
  );

  useCursorNodeHighlight(editorInstance, nodeRanges, suppressCursorSyncRef, setActiveNodeId);
  usePendingNodeReveal(editorInstance, nodeRanges, handleSelectNode);
  return { activeNodeId, handleSelectNode };
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
  const { activeNodeId, handleSelectNode } = useEditorNodeSync(deferredYaml);
  const showTemplateCta = showStructureTree && canEdit && Boolean(onBrowseTemplates) && offerTemplate;

  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-hidden border-r border-border!">
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
type LaneTab = {
  value: string;
  label: string;
  onSelect: () => void;
  count?: number;
  /** Plain marker when there is something to say but nothing to count. */
  showDot?: boolean;
  disabled?: boolean;
};

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

type PipelineForm = UseFormReturn<PipelineFormValues>;

/** Route and feature-flag inputs the page branches on. */
function usePipelinePageConfig() {
  const { mode, pipelineId } = usePipelineMode();
  const search = useSearch({ strict: false }) as { serverless?: string };
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

type PipelinePageConfig = ReturnType<typeof usePipelinePageConfig>;

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
function usePipelineEditorState() {
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

type PipelineEditorState = ReturnType<typeof usePipelineEditorState>;

function usePipelineSettingsForm() {
  return useForm<PipelineFormValues>({
    resolver: zodResolver(pipelineFormSchema) as Resolver<PipelineFormValues>,
    mode: 'onSubmit',
    defaultValues: { name: '', description: '', computeUnits: MIN_TASKS, tags: [] },
  });
}

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
function usePipelineServerData(mode: PipelineMode, pipelineId: string | undefined) {
  const { data: pipelineResponse } = useGetPipelineQuery(
    { id: pipelineId || '' },
    { enabled: mode !== 'create' && !!pipelineId }
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

type PipelineServerData = ReturnType<typeof usePipelineServerData>;

/** Guards against losing unsaved edits when navigating away from the editor (edit or create). */
function useUnsavedChangesGuard({
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

type UnsavedChangesGuard = ReturnType<typeof useUnsavedChangesGuard>;

type SessionInputs = {
  config: PipelinePageConfig;
  editorState: PipelineEditorState;
  form: PipelineForm;
  server: PipelineServerData;
};

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
    onSave: save.handleSave,
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
  const settingsChanges = useMemo(
    () => (mode === 'edit' ? summarizeSettingsChanges(form.formState.defaultValues, settingsValues) : []),
    [mode, form.formState.defaultValues, settingsValues]
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
}

/** Loads the document into the editor: from the server, or the create-mode starting YAML. */
function usePipelineDocumentLoad({
  config,
  editorState,
  form,
  server,
  clearErrorLintHints,
}: SessionInputs & { clearErrorLintHints: () => void }) {
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
    if (mode !== 'edit' || !pipelineId || !isDocumentLoaded) {
      return;
    }
    const hints = takeStartLintHints(pipelineId);
    if (hints) {
      setErrorLintHints(hints);
    }
  }, [mode, pipelineId, isDocumentLoaded, setErrorLintHints]);
}

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
function useAutosaveRecovery({
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
      },
      { keepDefaultValues: true }
    );
    setIsAutosaveDismissed(true);
    toast.success('Your edits were restored — they still need saving');
  }, [recoverableEntry, setYamlContent, setAttachedServiceAccount, form, setIsAutosaveDismissed]);

  const handleDiscardAutosave = useCallback(() => {
    rpcnEditorAutosave.clear(autosaveTarget);
    setIsAutosaveDismissed(true);
  }, [autosaveTarget, setIsAutosaveDismissed]);

  const recoveredSettingsChanges = useMemo(
    () => (recoverableEntry ? summarizeSettingsChanges(form.formState.defaultValues, recoverableEntry) : []),
    [recoverableEntry, form.formState.defaultValues]
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

/** The document's load, its change summaries, and the edits kept in (and offered back from) the browser. */
function usePipelineDocumentSession({ saveSession, ...inputs }: SessionInputs & { saveSession: PipelineSaveSession }) {
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
  router: ReturnType<typeof useRouter>
) {
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
}

function usePipelineCancel(mode: PipelineMode, pipelineId: string | undefined, clearWizardStore: () => void) {
  const navigate = useNavigate();
  const router = useRouter();
  return useCallback(() => {
    if (mode === 'create') {
      clearWizardStore();
    }
    leaveEditor(mode, pipelineId, navigate, router);
  }, [mode, clearWizardStore, navigate, pipelineId, router]);
}

/** Edits the page makes to the document on the user's behalf, and leaving the editor. */
function usePipelineEditorActions({
  config,
  editorState,
  server,
  saveSession,
}: SessionInputs & { saveSession: PipelineSaveSession }) {
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
      if (newYaml) {
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
function usePipelinePageModel() {
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

type PipelinePageModel = ReturnType<typeof usePipelinePageModel>;

type PageSectionProps = { page: PipelinePageModel; expanded: boolean };

function PipelinePageHeader({ page, expanded }: PageSectionProps) {
  const { config, server, editorState, saveSession, actions } = page;
  const { pipeline, editingDraft } = server;
  const { setIsDeleteAlertOpen, setIsViewConfigDialogOpen, setIsConfigDialogOpen } = editorState.actions;
  if (config.mode !== 'view') {
    return (
      <PipelineEditHeader
        draftIssueCount={Object.keys(saveSession.lint.lintHints).length}
        expanded={expanded}
        form={page.form}
        hasUnsavedChanges={saveSession.guard.hasUnsavedChanges}
        isSaveBlocked={server.isCheckingDraftSupport}
        isSaving={saveSession.save.isSaving}
        onBack={actions.handleCancel}
        onEditSettings={() => setIsConfigDialogOpen(true)}
        onRequestDelete={editingDraft ? () => setIsDeleteAlertOpen(true) : undefined}
        onSave={saveSession.save.handleSave}
        saveContext={server.saveContext}
        url={pipeline?.url}
      />
    );
  }
  if (!pipeline) {
    return (
      // Same inset as the loaded header, so nothing shifts when the pipeline arrives.
      <div className={cn('flex items-center gap-2', expanded && 'px-4')}>
        <Button
          aria-label="Go back"
          className="-ml-3.5 shrink-0"
          onClick={actions.handleCancel}
          size="icon"
          variant="ghost"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Button>
        <Skeleton variant="text" width="md" />
      </div>
    );
  }
  return (
    <PipelineViewHeader
      expanded={expanded}
      onBack={actions.handleCancel}
      onRequestDelete={() => setIsDeleteAlertOpen(true)}
      onViewDetails={() => setIsViewConfigDialogOpen(true)}
      pipeline={pipeline}
    />
  );
}

function PipelinePageNotices({ page, expanded }: PageSectionProps) {
  const { recovery } = page.documentSession;
  return (
    <>
      {recovery.showAutosaveRestore && recovery.recoverableEntry ? (
        <div className={cn('transition-[padding] duration-300 ease-in-out', expanded && 'px-4')}>
          <AutosaveRestoreNotice
            isStale={recovery.isAutosaveStale}
            onDiscard={recovery.handleDiscardAutosave}
            onRestore={recovery.handleRestoreAutosave}
            updatedAt={recovery.recoverableEntry.updatedAt}
          />
        </div>
      ) : null}
      {page.config.mode === 'view' && page.server.editingDraft ? (
        <div className={cn('transition-[padding] duration-300 ease-in-out', expanded && 'px-4')}>
          <Alert icon={<FileClock />} testId="draft-view-notice" variant="informative">
            <AlertTitle>{DRAFT_VIEW_NOTICE_TITLE}</AlertTitle>
            <AlertDescription>{DRAFT_VIEW_NOTICE_BODY}</AlertDescription>
          </Alert>
        </div>
      ) : null}
    </>
  );
}

function PipelineLaneTabs({ page, expanded, onToggleExpanded }: PageSectionProps & { onToggleExpanded: () => void }) {
  const { lanes } = page.lanes;
  const { activeViewLane, activeEditLane } = page.editorState;
  return (
    // Lane tabs with the fullscreen toggle overlaid at the right end. Lane-less modes keep an empty
    // strip so it stays put.
    <div className="relative shrink-0">
      {lanes.length > 0 ? (
        <Tabs value={page.config.mode === 'view' ? activeViewLane : activeEditLane}>
          <TabsList className="[&_[data-slot=tabs-trigger]]:w-auto" variant="underline">
            {lanes.map((lane) => (
              <TabsTrigger
                disabled={lane.disabled}
                key={lane.value}
                onClick={lane.onSelect}
                value={lane.value}
                variant="underline"
              >
                <span className="flex items-center gap-2">
                  {lane.label}
                  {lane.count ? <CountDot count={lane.count} size="sm" variant="informative" /> : null}
                  {!lane.count && lane.showDot ? (
                    <span aria-hidden className="size-2 shrink-0 rounded-full bg-informative" />
                  ) : null}
                </span>
              </TabsTrigger>
            ))}
            {/* Keeps the triggers clear of the overlaid toggle while the baseline spans the full strip. */}
            <span aria-hidden className="w-12 shrink-0" />
          </TabsList>
        </Tabs>
      ) : (
        <div className="h-9 border-b border-border!" />
      )}
      <div className="absolute inset-y-0 right-1.5 flex items-center">
        <ExpandedPageToggle expanded={expanded} onToggle={onToggleExpanded} />
      </div>
    </div>
  );
}

function PipelineLaneContent({ page }: { page: PipelinePageModel }) {
  const { config, editorState, server, saveSession, documentSession, actions, lanes } = page;
  const { mode } = config;
  const { pipeline } = server;
  const { lintHints } = saveSession.lint;
  const { setYamlContent, setAddConnectorType, setIsTemplateDialogOpen, setIsConfigDialogOpen } = editorState.actions;
  const onBrowseTemplates = config.isTemplateGalleryEnabled ? () => setIsTemplateDialogOpen(true) : undefined;
  return (
    // min-w-0 + overflow-hidden keep the editor region from propagating width upward.
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {lanes.showSidebar ? (
        // The monitor lane is document-height, so the structure tree is absolute: with intrinsic
        // height, a huge pipeline would stretch the page far past the metrics.
        <div className={cn(lanes.isMonitorLane && 'relative w-[300px] shrink-0', !lanes.isMonitorLane && 'contents')}>
          <div className={cn(lanes.isMonitorLane ? 'absolute inset-0 flex' : 'contents')}>
            <SidebarPanel
              errorNodeIds={documentSession.errorNodeIds}
              isPipelineDiagramsEnabled={config.isPipelineDiagramsEnabled}
              mode={mode}
              onAddConnector={(type) => setAddConnectorType(type)}
              onBrowseTemplates={onBrowseTemplates}
              onOpenCommandMenu={actions.handleCommandMenuOpen}
              unsavedNodeIds={documentSession.unsavedNodeIds}
              yamlContent={editorState.yamlContent}
            />
          </div>
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        {lanes.isMonitorLane ? <ViewModePanel pipeline={pipeline} /> : null}
        {mode === 'view' && pipeline && editorState.activeViewLane === 'configuration' ? (
          <YamlViewPanel configYaml={pipeline.configYaml} schema={server.yamlEditorSchema} />
        ) : null}
        {mode === 'view' && pipeline && editorState.activeViewLane === 'visual' ? (
          <VisualEditorPanel
            componentList={server.componentList ?? ({} as ComponentList)}
            components={server.components}
            lintHints={Object.values(lintHints)}
            mode="view"
            onNavigateToYaml={lanes.goToYamlNode}
            onYamlChange={setYamlContent}
            yamlContent={pipeline.configYaml}
          />
        ) : null}
        {mode !== 'view' && editorState.activeEditLane === 'visual' ? (
          <VisualEditorPanel
            componentList={server.componentList ?? ({} as ComponentList)}
            components={server.components}
            // Only edit mode waits on server hydration; create shows its empty state, not a skeleton.
            isLoading={mode === 'edit' && editorState.initialYaml === null}
            lintHints={Object.values(lintHints)}
            mode={mode}
            onAddConnector={(type) => setAddConnectorType(type)}
            onAddSasl={actions.diagramDialogs.handleAddSasl}
            onAddTopic={actions.diagramDialogs.handleAddTopic}
            onBrowseTemplates={onBrowseTemplates}
            onNavigateToYaml={lanes.goToYamlNode}
            onYamlChange={setYamlContent}
            yamlContent={editorState.yamlContent}
          />
        ) : null}
        {lanes.isEditChangesLane ? (
          <ChangesPanel
            changes={documentSession.componentChanges}
            editedYaml={editorState.yamlContent}
            onEditSettings={() => setIsConfigDialogOpen(true)}
            onSelectComponent={lanes.goToYamlNode}
            pipelineState={pipeline?.state}
            savedYaml={editorState.initialYaml ?? ''}
            settingsChanges={documentSession.settingsChanges}
          />
        ) : null}
        {mode === 'view' || editorState.activeEditLane === 'visual' || lanes.isEditChangesLane ? null : (
          <EditorPanel
            isLintPending={saveSession.lint.isLintPending}
            isServerlessInitializing={documentSession.isServerlessInitializing}
            lintHints={lintHints}
            onEditorMount={editorState.actions.setEditorInstance}
            onYamlChange={setYamlContent}
            yamlContent={editorState.yamlContent}
            yamlEditorSchema={server.yamlEditorSchema}
          />
        )}
      </div>
    </div>
  );
}

function PipelineEditorSurface({
  page,
  expanded,
  onToggleExpanded,
}: PageSectionProps & { onToggleExpanded: () => void }) {
  const { tipsContext } = page.lanes;
  return (
    // Editor frame flexes to fill the column; the tips strip is pinned just beneath so it stays visible.
    // Monaco needs a bounded box: the frame fills this floor and never grows with content.
    <div className="flex min-h-[600px] min-w-0 flex-1 flex-col gap-2">
      {/* Boxed: rounded frame. Fullscreen: flush sides, top/bottom borders kept so the
          clipped scroll area still has a visible edge. */}
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border! transition-[border-radius,border-color] duration-300 ease-in-out',
          expanded ? 'rounded-none border-x-transparent!' : 'rounded-lg'
        )}
      >
        <PipelineLaneTabs expanded={expanded} onToggleExpanded={onToggleExpanded} page={page} />
        <PipelineLaneContent page={page} />
      </div>
      {tipsContext ? (
        // Match the header's fullscreen inset.
        <div className={cn('transition-[padding] duration-300 ease-in-out', expanded && 'px-4')}>
          <EditorTipsBar
            context={tipsContext}
            readOnly={page.config.mode === 'view'}
            slashMenuEnabled={page.config.isSlashMenuEnabled}
          />
        </div>
      ) : null}
    </div>
  );
}

function PipelineSettingsDialogs({ page }: { page: PipelinePageModel }) {
  const { config, editorState, server, saveSession } = page;
  const { pipeline, editingDraft } = server;
  const { setIsConfigDialogOpen, setIsViewConfigDialogOpen, setIsDeleteAlertOpen } = editorState.actions;
  const { handleDelete, isDeleting } = saveSession.save;
  return (
    <>
      <ConfigDialog
        form={page.form}
        mode={config.mode}
        onOpenChange={setIsConfigDialogOpen}
        open={editorState.isConfigDialogOpen}
      />

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
        open={editorState.isViewConfigDialogOpen}
        pipeline={pipeline}
      />

      {pipeline && editingDraft ? (
        <DeleteDraftDialog
          draftName={pipeline.displayName}
          hasUnsavedChanges={saveSession.guard.hasUnsavedChanges}
          isDeleting={isDeleting}
          onConfirm={() => handleDelete(pipeline.id)}
          onOpenChange={setIsDeleteAlertOpen}
          open={editorState.isDeleteAlertOpen}
        />
      ) : null}

      {pipeline && !editingDraft ? (
        <DeleteResourceAlertDialog
          isDeleting={isDeleting}
          onDelete={handleDelete}
          onOpenChange={setIsDeleteAlertOpen}
          open={editorState.isDeleteAlertOpen}
          resourceId={pipeline.id}
          resourceName={pipeline.displayName || 'this pipeline'}
          resourceType="Pipeline"
        />
      ) : null}
    </>
  );
}

function UnsavedChangesDialog({
  guard,
  autosaveTarget,
  flushAutosave,
  onSave,
}: {
  guard: UnsavedChangesGuard;
  autosaveTarget: string;
  flushAutosave: () => boolean;
  onSave: (intent?: SaveIntent) => Promise<boolean>;
}) {
  const { blocker, unsavedChanges } = guard;
  // After a failed draft save the browser buffer is offered beside it, so Discard is never the only exit.
  const [hasDraftEscapeFailed, setHasDraftEscapeFailed] = useState(false);
  const canSaveDraftAndLeave = unsavedChanges.escape === 'save-draft';
  useEffect(() => {
    if (blocker.status !== 'blocked') {
      setHasDraftEscapeFailed(false);
    }
  }, [blocker.status]);

  // Discard clears the recovery buffer too, or the next visit offers the edits back.
  const handleDiscardAndLeave = useCallback(() => {
    rpcnEditorAutosave.clear(autosaveTarget);
    blocker.proceed?.();
  }, [autosaveTarget, blocker]);

  // Flushed, not debounced: the pending write dies with the page.
  const handleLeaveAndKeepEdits = useCallback(() => {
    if (!flushAutosave()) {
      toast.error('Your edits could not be kept in this browser. Save them, or discard them to leave.');
      return;
    }
    blocker.proceed?.();
  }, [flushAutosave, blocker]);

  return (
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
                if (await onSave({ run: 'draft', skipNavigation: true })) {
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
            <ElementTooltip content="Your edits stay in this browser, and this editor offers them back next time">
              <Button onClick={handleLeaveAndKeepEdits} testId="leave-and-keep-edits" variant="primary">
                Leave for now
              </Button>
            </ElementTooltip>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PipelineCommandMenus({ page }: { page: PipelinePageModel }) {
  const { editorInstance, commandMenuFilter, yamlContent } = page.editorState;
  const { setCommandMenuFilter } = page.editorState.actions;
  const { slashCommand } = page.actions;
  return (
    <>
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

      {page.config.isSlashMenuEnabled ? (
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
    </>
  );
}

type DiagramDialogs = ReturnType<typeof useDiagramDialogs>;

function AddTopicDialog({ dialogs }: { dialogs: DiagramDialogs }) {
  const { topicDialog, topicStepRef } = dialogs;
  return (
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
  );
}

function AddUserDialog({
  dialogs,
  hasServiceAccount,
  pipelineName,
}: {
  dialogs: DiagramDialogs;
  hasServiceAccount: boolean;
  pipelineName: string | undefined;
}) {
  const { userDialog, userStepRef, connectorTopics, connectorConsumerGroup } = dialogs;
  return (
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
        </DialogHeader>
        <DialogBody>
          {connectorTopics === undefined && (
            <Alert variant="warning">
              <AlertTitle>No topic yet</AlertTitle>
              <AlertDescription>
                This connector has no topic yet, so the user won't be granted access to one. Add a topic first, or grant
                access later in the Security settings.
              </AlertDescription>
            </Alert>
          )}
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
            defaultConsumerGroup={connectorConsumerGroup}
            hasServiceAccount={hasServiceAccount}
            hideTitle
            inline
            pipelineName={pipelineName}
            ref={userStepRef}
            showConsumerGroupFields={userDialog.target?.section === 'input'}
            topicAccess={userDialog.target?.section === 'input' ? 'read' : 'write'}
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
  );
}

function PipelineConnectorDialogs({ page }: { page: PipelinePageModel }) {
  const { config, editorState, form } = page;
  const { addConnectorType } = editorState;
  const { setAddConnectorType, setYamlContent, setIsTemplateDialogOpen } = editorState.actions;
  return (
    <>
      <AddConnectorDialog
        components={page.server.componentList ?? ({} as ComponentList)}
        connectorType={
          addConnectorType === 'resource'
            ? (['cache', 'rate_limit', 'buffer', 'scanner', 'tracer', 'metrics'] satisfies ConnectComponentType[])
            : (addConnectorType ?? undefined)
        }
        isOpen={addConnectorType !== null}
        onAddConnector={page.actions.handleConnectorSelected}
        onCloseAddConnector={() => setAddConnectorType(null)}
        searchPlaceholder={getConnectorDialogPlaceholder(addConnectorType)}
        title={getConnectorDialogTitle(addConnectorType)}
      />

      {config.isTemplateGalleryEnabled && config.mode !== 'view' ? (
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
          open={editorState.isTemplateDialogOpen}
        />
      ) : null}
    </>
  );
}

function PipelinePageContent() {
  const page = usePipelinePageModel();
  const {
    expanded,
    toggleExpanded,
    ref: expandedModeRef,
  } = useExpandedPageMode({ storageKey: 'rp-pipeline-editor-mode' });
  const { server, saveSession, documentSession, actions } = page;

  return (
    // The viewport measure is a floor here, not a fixed height: notices above the editor push the page
    // taller rather than shrinking it, and the Monitor lane flows with the document, keeping its logs
    // pagination out from behind an inner fold.
    // The -ml-3.5/pl-3.5 pair keeps the back button's overhang inside the overflow-x-clip region.
    <div
      className="page-fill-viewport-min -ml-3.5 flex min-w-0 flex-col gap-4 overflow-x-clip pl-3.5"
      ref={expandedModeRef}
    >
      <PipelinePageHeader expanded={expanded} page={page} />
      <PipelinePageNotices expanded={expanded} page={page} />
      <PipelineEditorSurface expanded={expanded} onToggleExpanded={toggleExpanded} page={page} />

      <PipelineSettingsDialogs page={page} />

      <UnsavedChangesDialog
        autosaveTarget={documentSession.recovery.autosaveTarget}
        flushAutosave={documentSession.flushAutosave}
        guard={saveSession.guard}
        onSave={saveSession.save.handleSave}
      />

      <PipelineCommandMenus page={page} />

      <AddTopicDialog dialogs={actions.diagramDialogs} />

      <AddUserDialog
        dialogs={actions.diagramDialogs}
        hasServiceAccount={Boolean(saveSession.attachedServiceAccount ?? server.pipeline?.serviceAccount)}
        pipelineName={documentSession.settingsValues.name || undefined}
      />

      <PipelineConnectorDialogs page={page} />
    </div>
  );
}
