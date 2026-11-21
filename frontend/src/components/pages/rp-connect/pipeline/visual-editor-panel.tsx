/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'components/redpanda-ui/components/alert-dialog';
import { Button } from 'components/redpanda-ui/components/button';
import { Kbd } from 'components/redpanda-ui/components/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Redo2, TriangleAlert, Undo2 } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useCallback } from 'react';
import { pluralizeWithNumber } from 'utils/string';

import { NodeInspector } from './node-inspector';
import { CanvasCommandPalette } from './pipeline-canvas-command-palette';
import { REDO_SHORTCUT, ShortcutLabel, UNDO_SHORTCUT } from './pipeline-canvas-history';
import { PipelineEndChip } from './pipeline-end-chip';
import { PipelineFlowCanvas } from './pipeline-flow-canvas';
import { PipelineFlowSkeleton } from './pipeline-flow-skeleton';
import { PipelineProblemsPanel } from './pipeline-problems-panel';
import { PipelineUnsavedPanel } from './pipeline-unsaved-panel';
import { TemplateGalleryCta } from './template-cta';
import {
  type CanvasHistory,
  type FlowOverview,
  InsertConnectorPicker,
  type InspectorSelection,
  type NodeInsert,
  type PendingDelete,
  type SelectionEntryPoints,
  useCanvasHistory,
  useCanvasKeyboard,
  useFlowOverview,
  useInspectorSelection,
  useLiveSelection,
  useMissingSecrets,
  useNodeInsert,
  usePendingDelete,
  useSelectionEntryPoints,
  useSetStopCondition,
  type VisualEditorPanelProps,
} from './use-visual-editor';
import { AddSecretsDialog } from '../onboarding/add-secrets-dialog';
import { CONNECT_COMPONENT_TYPE } from '../types/schema';
import type { EditTarget } from '../utils/yaml-edit-target';

const HistoryToolbar = ({ history }: { history: CanvasHistory }) => (
  <TooltipProvider>
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/90 p-0.5 shadow-sm backdrop-blur-sm">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button aria-label="Undo" disabled={!history.canUndo} onClick={history.undo} size="icon-sm" variant="ghost">
              <Undo2 />
            </Button>
          }
        />
        <TooltipContent>
          <ShortcutLabel keys={UNDO_SHORTCUT} label="Undo" />
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button aria-label="Redo" disabled={!history.canRedo} onClick={history.redo} size="icon-sm" variant="ghost">
              <Redo2 />
            </Button>
          }
        />
        <TooltipContent>
          <ShortcutLabel keys={REDO_SHORTCUT} label="Redo" />
        </TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
);

type CanvasStageProps = Pick<
  VisualEditorPanelProps,
  'yamlContent' | 'onYamlChange' | 'isLoading' | 'onAddConnector' | 'onAddTopic' | 'onAddSasl' | 'onBrowseTemplates'
> & {
  isEditing: boolean;
  selection: InspectorSelection;
  history: CanvasHistory;
  overview: FlowOverview;
  insert: NodeInsert;
  entryPoints: SelectionEntryPoints;
  missingSecrets: string[];
  onAddSecrets: () => void;
};

// The canvas with its floating overlays: history toolbar, problems/unsaved panels, template entry point.
function CanvasStage({
  yamlContent,
  onYamlChange,
  isLoading,
  onAddConnector,
  onAddTopic,
  onAddSasl,
  onBrowseTemplates,
  isEditing,
  selection,
  history,
  overview,
  insert,
  entryPoints,
  missingSecrets,
  onAddSecrets,
}: CanvasStageProps) {
  const { selected, focus, selectAndReveal } = selection;
  const setStop = useSetStopCondition(yamlContent, overview.flowNodes, selection, onYamlChange);
  const handleAddConnectorSection = useCallback(
    (section: string) => {
      const type = CONNECT_COMPONENT_TYPE.find((candidate) => candidate === section);
      if (type) {
        onAddConnector?.(type);
      }
    },
    [onAddConnector]
  );

  const editingActions = isEditing
    ? {
        onAddConnector: onAddConnector ? handleAddConnectorSection : undefined,
        onAddSasl,
        onAddTopic,
        onInsert: insert.handleSpineInsert,
        onSetStopCondition: setStop,
        onSlotInsert: insert.handleSlotInsert,
      }
    : {};
  return (
    <div className="relative min-w-0 flex-1">
      {/* Don't mount the canvas pre-hydration — its parse debounce would briefly render a placeholder graph. */}
      {isLoading === true ? (
        <PipelineFlowSkeleton />
      ) : (
        <>
          <PipelineFlowCanvas
            {...editingActions}
            configYaml={yamlContent}
            deprecationsByNode={overview.deprecationsByNode}
            flashNodeIds={history.flash.ids}
            flashToken={history.flash.token}
            focusNodeId={focus.id || undefined}
            focusToken={focus.token}
            lintErrorsByNode={overview.lintMessagesByNode}
            onClearSelection={entryPoints.clearSelection}
            onSelectNode={entryPoints.selectFromCanvas}
            selectedNodeId={selected?.id}
            selectedTargetKind={selected?.target.kind}
            unsavedNodeIds={overview.unsavedNodeIds}
          />
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
            {isEditing ? <HistoryToolbar history={history} /> : null}
            <PipelineEndChip
              behavior={overview.pipelineEnd.behavior}
              onSelectInput={entryPoints.jumpToNodeId}
              rows={overview.pipelineEnd.rows}
              status={overview.pipelineEnd.status}
            />
          </div>
          <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
            <PipelineProblemsPanel
              deprecations={overview.deprecations}
              missingSecrets={missingSecrets}
              onAddSecrets={isEditing ? onAddSecrets : undefined}
              onSelectProblem={(id, target, caseTarget) => selectAndReveal({ id, target, caseTarget })}
              problems={overview.problems}
            />
            <PipelineUnsavedPanel nodes={overview.unsavedNodeList} onSelect={entryPoints.jumpToNodeId} />
          </div>
          {onBrowseTemplates ? (
            <TemplateGalleryCta
              className="right-auto bottom-6 left-1/2 w-80 max-w-[calc(100%-2rem)] -translate-x-1/2"
              hint={
                <>
                  or press{' '}
                  <Kbd size="xs" variant="filled">
                    /
                  </Kbd>{' '}
                  to search nodes &amp; actions
                </>
              }
              onBrowseTemplates={onBrowseTemplates}
              show={isEditing && overview.offerTemplate}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

type InspectorRailProps = Pick<VisualEditorPanelProps, 'yamlContent' | 'onYamlChange' | 'components' | 'onAddTopic'> & {
  isEditing: boolean;
  selection: InspectorSelection;
  history: CanvasHistory;
  overview: FlowOverview;
  insert: NodeInsert;
  entryPoints: SelectionEntryPoints;
  stageDelete: (target: EditTarget) => void;
};

// Inspector rail. Animate its width (not a transform) so the canvas and its right-anchored
// minimap/zoom controls glide in lockstep instead of snapping.
function InspectorRail({
  yamlContent,
  onYamlChange,
  components,
  onAddTopic,
  isEditing,
  selection,
  history,
  overview,
  insert,
  entryPoints,
  stageDelete,
}: InspectorRailProps) {
  const { commitRef, commitPending, selectNode, selectAndReveal } = selection;
  const selected = useLiveSelection(selection, yamlContent, overview.flowNodes);
  const setStop = useSetStopCondition(yamlContent, overview.flowNodes, selection, onYamlChange);
  const selectedFlowNode = selected ? overview.flowNodes.find((n) => n.id === selected.id) : undefined;
  const editingActions = isEditing
    ? {
        commitRef,
        onAddTopic,
        onCreateResource: insert.handleRequestCreateResource,
        onDelete: stageDelete,
        onRequestCommit: commitPending,
      }
    : {};
  const stop =
    selectedFlowNode?.stopSlot && selectedFlowNode.endBehavior
      ? {
          slot: selectedFlowNode.stopSlot,
          effective: selectedFlowNode.endBehavior,
          isGroup: selectedFlowNode.kind === 'group',
        }
      : undefined;

  return (
    <AnimatePresence>
      {selected ? (
        <motion.aside
          animate={{ width: 384, opacity: 1 }}
          className="relative shrink-0 overflow-hidden"
          exit={{ width: 0, opacity: 0 }}
          initial={{ width: 0, opacity: 0 }}
          key="node-inspector"
          transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
        >
          {/* min-width clips the content instead of reflowing it while the rail width animates. */}
          <div className="absolute inset-0 flex min-w-[24rem] flex-col overflow-hidden border-l border-border bg-background">
            <NodeInspector
              {...editingActions}
              caseTarget={selected.caseTarget}
              childItems={overview.childItems}
              components={components}
              deprecations={overview.deprecationsByNode.get(selected.id)}
              lintHints={overview.lintByNode.get(selected.id)}
              nodeId={selected.id}
              onApply={onYamlChange}
              onClose={() => selectNode(null)}
              onOpenInYaml={entryPoints.openSelectedInYaml}
              onSelectChild={selectAndReveal}
              onSetStopCondition={
                isEditing && selectedFlowNode?.stopSlot ? (draft) => setStop(selected.id, draft) : undefined
              }
              readOnly={!isEditing}
              resetToken={history.formEpoch}
              stop={stop}
              target={selected.target}
              yaml={yamlContent}
            />
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

const DeleteNodeDialog = ({ deletion }: { deletion: PendingDelete }) => {
  const { pendingDelete, setPendingDelete, pendingDeleteName, pendingDeleteHasStop, pendingDeleteRefCount } = deletion;
  return (
    <AlertDialog onOpenChange={(open) => (open ? undefined : setPendingDelete(null))} open={pendingDelete !== null}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Remove this node?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingDeleteName !== null && pendingDeleteName !== undefined && pendingDeleteName !== '' ? (
              <>
                This removes the <span className="font-mono">{pendingDeleteName}</span> node
                {pendingDeleteHasStop ? ' and its stop condition' : ''} from the pipeline. You can undo it with{' '}
                {UNDO_SHORTCUT}.
              </>
            ) : (
              <>This removes the node from the pipeline. You can undo it with {UNDO_SHORTCUT}.</>
            )}
          </AlertDialogDescription>
          {pendingDeleteRefCount > 0 ? (
            <Alert className="mt-1" icon={<TriangleAlert />} variant="warning">
              <AlertDescription>
                <span>
                  This resource is still referenced by{' '}
                  <span className="font-semibold">{pluralizeWithNumber(pendingDeleteRefCount, 'node')}</span>. Removing
                  it leaves {pendingDeleteRefCount === 1 ? 'that reference' : 'those references'} pointing at a missing
                  resource.
                </span>
              </AlertDescription>
            </Alert>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel render={<Button variant="ghost">Cancel</Button>} />
          <AlertDialogAction
            onClick={deletion.confirmDeleteNode}
            render={<Button variant="destructive">Remove</Button>}
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/**
 * The Visual lane: a pannable canvas laying the pipeline out as a left→right flow. In edit mode,
 * contextual actions (add input/output, insert steps, per-node edit/remove) mutate the canonical YAML.
 */
export function VisualEditorPanel({
  mode,
  yamlContent,
  onYamlChange,
  components,
  componentList,
  lintHints,
  onAddConnector,
  onAddTopic,
  onAddSasl,
  onBrowseTemplates,
  onNavigateToYaml,
  isLoading,
}: VisualEditorPanelProps) {
  const isEditing = mode !== 'view';
  const selection = useInspectorSelection(yamlContent, onYamlChange);
  const history = useCanvasHistory(yamlContent, onYamlChange, selection.commitRef);
  const overview = useFlowOverview({
    yamlContent,
    components,
    lintHints,
    isEditing,
    selectedId: selection.selected?.id,
  });
  const secrets = useMissingSecrets(yamlContent, isEditing, onYamlChange);
  const deletion = usePendingDelete(yamlContent, onYamlChange, selection.dropSelection, overview.flowNodes);
  const insert = useNodeInsert({ yamlContent, components, onYamlChange, selection });
  const { isPaletteOpen, setIsPaletteOpen } = useCanvasKeyboard({
    isEditing,
    selection,
    history,
    stageDelete: deletion.setPendingDelete,
    dialogOpen: insert.pendingInsert !== null || deletion.pendingDelete !== null || secrets.isSecretsDialogOpen,
  });
  const entryPoints = useSelectionEntryPoints(overview.flowNodes, selection, onNavigateToYaml);

  return (
    // reducedMotion="user": the global prefers-reduced-motion CSS can't reach JS-driven motion animations.
    <MotionConfig reducedMotion="user">
      <div className="flex size-full">
        <CanvasStage
          entryPoints={entryPoints}
          history={history}
          insert={insert}
          isEditing={isEditing}
          isLoading={isLoading}
          missingSecrets={secrets.missingSecrets}
          onAddConnector={onAddConnector}
          onAddSasl={onAddSasl}
          onAddSecrets={() => secrets.setIsSecretsDialogOpen(true)}
          onAddTopic={onAddTopic}
          onBrowseTemplates={onBrowseTemplates}
          onYamlChange={onYamlChange}
          overview={overview}
          selection={selection}
          yamlContent={yamlContent}
        />

        <InspectorRail
          components={components}
          entryPoints={entryPoints}
          history={history}
          insert={insert}
          isEditing={isEditing}
          onAddTopic={onAddTopic}
          onYamlChange={onYamlChange}
          overview={overview}
          selection={selection}
          stageDelete={deletion.setPendingDelete}
          yamlContent={yamlContent}
        />

        <InsertConnectorPicker componentList={componentList} insert={insert} />

        <AddSecretsDialog
          existingSecrets={secrets.existingSecrets}
          isOpen={secrets.isSecretsDialogOpen}
          missingSecrets={secrets.missingSecrets}
          onClose={() => secrets.setIsSecretsDialogOpen(false)}
          onSecretsCreated={() => secrets.setIsSecretsDialogOpen(false)}
          onUpdateEditorContent={secrets.handleRenameSecretReferences}
        />

        <CanvasCommandPalette
          canRedo={history.canRedo}
          canUndo={history.canUndo}
          nodes={overview.flowNodes}
          onJumpToNode={entryPoints.jumpToNode}
          onOpenChange={setIsPaletteOpen}
          onRedo={isEditing ? history.redo : undefined}
          onUndo={isEditing ? history.undo : undefined}
          onViewSelectedInYaml={entryPoints.openSelectedInYaml}
          open={isPaletteOpen}
        />

        <DeleteNodeDialog deletion={deletion} />
      </div>
    </MotionConfig>
  );
}
