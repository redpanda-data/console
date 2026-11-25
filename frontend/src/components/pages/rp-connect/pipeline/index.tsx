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

import './pipeline-editor.css';

import type { LintHint } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { create } from '@bufbuild/protobuf';
import { ArrowLeftIcon } from 'components/icons';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from 'components/redpanda-ui/components/resizable';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { cn } from 'components/redpanda-ui/lib/utils';
import { LogExplorer } from 'components/ui/connect/log-explorer';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { ExpandedPageToggle } from 'components/ui/expanded-page-toggle';
import { LintHintList } from 'components/ui/lint-hint/lint-hint-list';
import { useExpandedPageMode } from 'hooks/use-expanded-page-mode';
import { FileClock, KeyRound, LayoutGrid, Plus, User, Zap } from 'lucide-react';
import type { IRange } from 'monaco-editor';
import { ComponentListSchema, type Pipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { asyncEvent } from 'utils/async-event';
import { reportActionError } from 'utils/toast.utils';

import { AutosaveRestoreNotice } from './autosave-restore-notice';
import { ChangesPanel } from './changes-panel';
import { ConfigDialog } from './config-dialog';
import { DeleteDraftDialog } from './delete-draft-dialog';
import { DeprecatedComponentList } from './deprecated-component-list';
import { DetailsDialog } from './details-dialog';
import { DRAFT_VIEW_NOTICE_BODY, DRAFT_VIEW_NOTICE_TITLE } from './draft-copy';
import { EditorTipsBar } from './editor-tips-bar';
import {
  AddTopicDialog,
  AddUserDialog,
  PipelineCommandMenus,
  PipelineConnectorDialogs,
  type PipelinePageModel,
  UnsavedChangesDialog,
} from './pipeline-dialogs';
import type { MarkerMonaco, PipelineEditor } from './pipeline-editor-port';
import { PipelineEditHeader, PipelineViewHeader } from './pipeline-header';
import { PipelineStructureTree } from './pipeline-structure-tree';
import { PipelineThroughputCard } from './pipeline-throughput-card';
import { PipelineYamlEditor as YamlEditor } from './pipeline-yaml-editor';
import { ScrollShadow } from './scroll-shadow';
import { TemplateGalleryCta } from './template-cta';
import { useDeprecationMarkers } from './use-deprecation-markers';
import { isVisualEditorFeatureEnabled, type parseYamlEditorSchema } from './use-pipeline-document-recovery';
import { PipelineEditorProvider, usePipelineEditorStore } from './use-pipeline-editor-store';
import { usePipelinePageModel } from './use-pipeline-page-model';
import { VisualEditorPanel } from './visual-editor-panel';
import { isEmbedded, isFeatureFlagEnabled, isServerless } from '../../../../runtime-config';
import { isNonzeroNumber } from '../../../../utils/number-utils';
import { AddConnectorsCard } from '../onboarding/add-connectors-card';
import { LogsTab } from '../pipelines-details';
import { CONNECT_COMPONENT_TYPE, type ConnectComponentSpec, type ConnectComponentType } from '../types/schema';
import { parsePipelineFlowTree, shouldOfferTemplate } from '../utils/pipeline-flow-parser';
import { enclosingNodeId, nodeLineRanges } from '../utils/pipeline-lint';
import { usePipelineMode } from '../utils/use-pipeline-mode';

// How many effect re-runs (editor mount, ranges catch-up) a reveal request survives unresolved.
const MAX_REVEAL_ATTEMPTS = 5;

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
  components,
}: {
  configYaml: string;
  schema: ReturnType<typeof parseYamlEditorSchema>;
  components: ConnectComponentSpec[];
}) {
  const { attach: attachDeprecationMarkers } = useDeprecationMarkers(configYaml, components);
  // Top/bottom shadows from Monaco's scroll position (it virtualizes, so onDidScrollChange is the only signal).
  const [overflow, setOverflow] = useState({ top: false, bottom: false });
  // Mount-time listener disposables, torn down on unmount so the editor + listener graph can be GC'd.
  const scrollSyncSubscriptions = useRef<ReturnType<PipelineEditor['onDidScrollChange']>[]>([]);
  // Register the read-only viewer as the active editor so sidebar/Visual selection can reveal lines here too.
  const setEditorInstance = usePipelineEditorStore((s) => s.setEditorInstance);
  const handleMount = useCallback(
    (instance: PipelineEditor, monaco: MarkerMonaco) => {
      attachDeprecationMarkers(instance, monaco);
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
    [setEditorInstance, attachDeprecationMarkers]
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
  components,
  lintHints,
  isLintPending,
}: {
  isServerlessInitializing: boolean;
  yamlContent: string;
  onYamlChange: (val: string) => void;
  onEditorMount: (editorRef: PipelineEditor) => void;
  yamlEditorSchema: ReturnType<typeof parseYamlEditorSchema>;
  components: ConnectComponentSpec[];
  lintHints: Record<string, LintHint>;
  isLintPending: boolean;
}) {
  const deprecations = useDeprecationMarkers(yamlContent, components);
  const { attach: attachDeprecationMarkers } = deprecations;
  const handleEditorMount = useCallback(
    (instance: PipelineEditor, monaco: MarkerMonaco) => {
      attachDeprecationMarkers(instance, monaco);
      onEditorMount(instance);
    },
    [attachDeprecationMarkers, onEditorMount]
  );
  const hasLintHints = Object.keys(lintHints).length > 0;
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
                onChange={(val) => onYamlChange((val ?? '') || '')}
                onEditorMount={handleEditorMount}
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
          {/* Its "No issues found" would contradict the deprecations listed below it. */}
          {hasLintHints || isLintPending || deprecations.usages.length === 0 ? (
            <LintHintList isPending={isLintPending} lintHints={lintHints} />
          ) : null}
          <DeprecatedComponentList usages={deprecations.usages} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function useShouldOfferTemplate(yamlContent: string): boolean {
  return useMemo(() => shouldOfferTemplate(yamlContent, parsePipelineFlowTree(yamlContent).nodes), [yamlContent]);
}

type NodeLineRange = ReturnType<typeof nodeLineRanges>[number];
type CursorSyncSuppression = {
  current: boolean;
};
type RevealAttempt = {
  id: string | null;
  count: number;
};
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
function selectWithoutCursorSync(ed: PipelineEditor, selection: IRange, suppressCursorSync: CursorSyncSuppression) {
  suppressCursorSync.current = true;
  try {
    ed.setSelection(selection);
  } finally {
    suppressCursorSync.current = false;
  }
}

function revealNodeLines(
  ed: PipelineEditor | null,
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
  editorInstance: PipelineEditor | null,
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
  editorInstance: PipelineEditor | null,
  nodeRanges: NodeLineRange[],
  selectNode: (highlightId: string, editableId?: string) => void
) {
  const revealNodeId = usePipelineEditorStore((s) => s.revealNodeId);
  const requestRevealNode = usePipelineEditorStore((s) => s.requestRevealNode);
  const revealAttemptRef = useRef<RevealAttempt>({ id: null, count: 0 });
  useEffect(() => {
    revealAttemptRef.current = revealAttemptFor(revealAttemptRef.current, revealNodeId);
    if (!(revealNodeId !== null && revealNodeId !== undefined && revealNodeId !== '')) {
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
        editableId !== null && editableId !== undefined && editableId !== ''
          ? nodeRanges.find((r) => r.id === editableId)
          : undefined,
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
              onAddConnector={
                canEdit
                  ? (section) => {
                      const type = CONNECT_COMPONENT_TYPE.find((candidate) => candidate === section);
                      if (type) {
                        onAddConnector(type);
                      }
                    }
                  : undefined
              }
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
export function PipelinePage() {
  const { pipelineId } = usePipelineMode();
  const isVisualEditorEnabled = isVisualEditorFeatureEnabled();
  // Keyed by pipeline id so each pipeline gets a fresh editor store.
  return (
    <PipelineEditorProvider initialEditLane={isVisualEditorEnabled ? 'visual' : 'yaml'} key={pipelineId ?? 'create'}>
      <PipelinePageContent />
    </PipelineEditorProvider>
  );
}
type PageSectionProps = {
  page: PipelinePageModel;
  expanded: boolean;
};
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
        onBack={asyncEvent(actions.handleCancel, reportActionError)}
        onEditSettings={() => setIsConfigDialogOpen(true)}
        onRequestDelete={editingDraft ? () => setIsDeleteAlertOpen(true) : undefined}
        onSave={asyncEvent(saveSession.save.handleSave, reportActionError)}
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
          onClick={asyncEvent(actions.handleCancel, reportActionError)}
          size="icon"
          variant="ghost"
        >
          <ArrowLeftIcon className="size-5" />
        </Button>
        <Skeleton variant="text" width="md" />
      </div>
    );
  }
  return (
    <PipelineViewHeader
      expanded={expanded}
      onBack={asyncEvent(actions.handleCancel, reportActionError)}
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
        <div className={cn('pipeline-transition-padding duration-300 ease-in-out', expanded && 'px-4')}>
          <AutosaveRestoreNotice
            isStale={recovery.isAutosaveStale}
            onDiscard={recovery.handleDiscardAutosave}
            onRestore={recovery.handleRestoreAutosave}
            updatedAt={recovery.recoverableEntry.updatedAt}
          />
        </div>
      ) : null}
      {page.config.mode === 'view' && page.server.editingDraft ? (
        <div className={cn('pipeline-transition-padding duration-300 ease-in-out', expanded && 'px-4')}>
          <Alert icon={<FileClock />} testId="draft-view-notice" variant="informative">
            <AlertTitle>{DRAFT_VIEW_NOTICE_TITLE}</AlertTitle>
            <AlertDescription>{DRAFT_VIEW_NOTICE_BODY}</AlertDescription>
          </Alert>
        </div>
      ) : null}
    </>
  );
}
function PipelineLaneTabs({
  page,
  expanded,
  onToggleExpanded,
}: PageSectionProps & {
  onToggleExpanded: () => void;
}) {
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
                  {isNonzeroNumber(lane.count) ? <CountDot count={lane.count} size="sm" variant="informative" /> : null}
                  {!isNonzeroNumber(lane.count) && lane.showDot === true ? (
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

function PipelineViewLaneContent({ page }: { page: PipelinePageModel }) {
  const { config, editorState, server, saveSession, lanes } = page;
  const { pipeline } = server;
  if (config.mode !== 'view' || !pipeline) {
    return null;
  }
  if (editorState.activeViewLane === 'configuration') {
    return (
      <YamlViewPanel components={server.components} configYaml={pipeline.configYaml} schema={server.yamlEditorSchema} />
    );
  }
  if (editorState.activeViewLane === 'visual') {
    return (
      <VisualEditorPanel
        componentList={server.componentList ?? create(ComponentListSchema)}
        components={server.components}
        lintHints={Object.values(saveSession.lint.lintHints)}
        mode="view"
        onNavigateToYaml={lanes.goToYamlNode}
        onYamlChange={editorState.actions.setYamlContent}
        yamlContent={pipeline.configYaml}
      />
    );
  }
  return null;
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
        <PipelineViewLaneContent page={page} />
        {mode !== 'view' && editorState.activeEditLane === 'visual' ? (
          <VisualEditorPanel
            componentList={server.componentList ?? create(ComponentListSchema)}
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
            components={server.components}
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
}: PageSectionProps & {
  onToggleExpanded: () => void;
}) {
  const { tipsContext } = page.lanes;
  return (
    // Editor frame flexes to fill the column; the tips strip is pinned just beneath so it stays visible.
    // Monaco needs a bounded box: the frame fills this floor and never grows with content.
    <div className="flex min-h-[600px] min-w-0 flex-1 flex-col gap-2">
      {/* Boxed: rounded frame. Fullscreen: flush sides, top/bottom borders kept so the
            clipped scroll area still has a visible edge. */}
      <div
        className={cn(
          'pipeline-transition-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border! duration-300 ease-in-out',
          expanded ? 'rounded-none border-x-transparent!' : 'rounded-lg'
        )}
      >
        <PipelineLaneTabs expanded={expanded} onToggleExpanded={onToggleExpanded} page={page} />
        <PipelineLaneContent page={page} />
      </div>
      {tipsContext ? (
        // Match the header's fullscreen inset.
        <div className={cn('pipeline-transition-padding duration-300 ease-in-out', expanded && 'px-4')}>
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
        pipelineName={(documentSession.settingsValues.name ?? '') || undefined}
      />

      <PipelineConnectorDialogs page={page} />
    </div>
  );
}
