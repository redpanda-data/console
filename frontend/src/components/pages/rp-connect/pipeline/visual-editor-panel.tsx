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

import type { LintHint } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
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
import { extractSecretReferences, getUniqueSecretNames } from 'components/ui/secret/secret-detection';
import { Redo2, TriangleAlert, Undo2 } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import { toast } from 'sonner';
import { formatShortcut, modKey, shiftKey } from 'utils/shortcuts';
import { pluralizeWithNumber } from 'utils/string';

import type { InspectorChildItem } from './node-config-form';
import { NodeInspector, type PendingNodeCommit } from './node-inspector';
import { CanvasCommandPalette } from './pipeline-canvas-command-palette';
import { PipelineFlowCanvas } from './pipeline-flow-canvas';
import { PipelineFlowSkeleton } from './pipeline-flow-skeleton';
import { type PipelineProblem, PipelineProblemsPanel } from './pipeline-problems-panel';
import { PipelineUnsavedPanel } from './pipeline-unsaved-panel';
import { TemplateGalleryCta } from './template-cta';
import { usePipelineEditorStore } from './use-pipeline-editor-store';
import { AddConnectorDialog } from '../onboarding/add-connector-dialog';
import { AddSecretsDialog } from '../onboarding/add-secrets-dialog';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import { changedNodeIds, changedNodeIdsFromBaseline, nodeConfigSignatures } from '../utils/pipeline-diff';
import type { FlowInsertPayload } from '../utils/pipeline-flow-layout';
import { type PipelineFlowNode, parsePipelineFlowTree, shouldOfferTemplate } from '../utils/pipeline-flow-parser';
import { mapLintHintsToNodes } from '../utils/pipeline-lint';
import {
  appendResource,
  buildInsertableComponent,
  countResourceReferences,
  createResourceAndReturnLabel,
  type EditTarget,
  editTargetsEqual,
  firstKey,
  getComponentAt,
  insertComponentAt,
  type ResourceArrayKey,
  type ResourceKind,
  removeComponentAt,
  resourceArrayKey,
  resourceTargetKind,
  seqLengthAt,
  setComponentAt,
} from '../utils/yaml';

// Types the insert (+) picker offers: pipeline steps plus the resources they reference.
const INSERTABLE_TYPES = ['processor', 'cache', 'rate_limit'] satisfies ConnectComponentType[];

// Stable empty set so the "no unsaved nodes" case doesn't churn the canvas layout memo.
const EMPTY_NODE_IDS: ReadonlySet<string> = new Set();

const INSERT_KIND_LABEL: Record<'input' | 'processor' | 'output', string> = {
  input: 'an input',
  output: 'an output',
  processor: 'a processor',
};

// Where a chosen connector lands: a top-level spine slot or a nested container array.
type PendingInsert =
  | { context: 'spine'; index: number }
  | { context: 'slot'; containerPath: (string | number)[]; accepts: 'input' | 'processor' | 'output'; index: number }
  // Switch "add case": the picked step is wrapped as `{ check, output }` or `{ check, processors: [step] }`.
  | { context: 'switchCase'; containerPath: (string | number)[]; section: 'processor' | 'output' }
  // "Create new resource": create the cache/rate_limit and link it to `target`'s `resource:` field.
  | { context: 'resourceForNode'; kind: ResourceKind; target: EditTarget };

type InsertParams = {
  yaml: string;
  connectionName: string;
  connectionType: ConnectComponentType;
  target: PendingInsert;
  components: ConnectComponentSpec[];
};

// Routing-condition target for a node: output switch — the node owns it; processor switch — the
// case wrapper owns it and this node is the wrapper's first child.
function caseTargetForNode(node: PipelineFlowNode | undefined, flowNodes: PipelineFlowNode[]): EditTarget | undefined {
  if (node?.caseEditTarget) {
    return node.caseEditTarget;
  }
  if (!node?.parentId) {
    return;
  }
  const parent = flowNodes.find((n) => n.id === node.parentId);
  const firstChild = flowNodes.find((n) => n.parentId === node.parentId);
  return parent?.caseEditTarget && firstChild?.id === node.id ? parent.caseEditTarget : undefined;
}

// A processor-switch case has no rendered card, so jump to its first body step (carrying the
// case's condition target); every other node jumps to itself. Null if unjumpable.
function resolveJumpTarget(
  node: PipelineFlowNode,
  flowNodes: PipelineFlowNode[]
): { id: string; target: EditTarget; caseTarget?: EditTarget } | null {
  if (node.editTarget?.kind === 'switchCase') {
    const entry = flowNodes.find((n) => n.parentId === node.id);
    if (entry?.editTarget) {
      return { id: entry.id, target: entry.editTarget, caseTarget: node.caseEditTarget };
    }
  }
  return node.editTarget ? { id: node.id, target: node.editTarget, caseTarget: node.caseEditTarget } : null;
}

// Direct children (cases / steps) of a control-flow node as clickable inspector items; an
// output-switch case is its own entry, a processor-switch case resolves to its first body step.
function buildChildItems(
  selectedId: string,
  flowNodes: PipelineFlowNode[],
  lintByNode: Map<string, LintHint[]>
): InspectorChildItem[] {
  const items: InspectorChildItem[] = [];
  for (const child of flowNodes.filter((n) => n.parentId === selectedId)) {
    const isCaseWrapper = child.editTarget?.kind === 'switchCase';
    const entry = isCaseWrapper ? (flowNodes.find((n) => n.parentId === child.id) ?? child) : child;
    if (!entry?.editTarget) {
      continue;
    }
    const wrapperLint = child.id === entry.id ? 0 : (lintByNode.get(child.id)?.length ?? 0);
    const lintCount = (lintByNode.get(entry.id)?.length ?? 0) + wrapperLint;
    items.push({
      id: entry.id,
      target: entry.editTarget,
      caseTarget: child.caseEditTarget ?? entry.caseEditTarget,
      name: entry.label,
      condition: child.condition ?? entry.condition,
      isDefault: child.isDefault ?? entry.isDefault,
      isErrorPath: child.isErrorPath ?? entry.isErrorPath,
      lintCount: lintCount || undefined,
    });
  }
  return items;
}

// The component's name (its single top-level key) at a target, or undefined when unresolvable.
function componentNameAt(yaml: string, target: EditTarget): string | undefined {
  const comp = getComponentAt(yaml, target);
  return comp ? firstKey(comp) : undefined;
}

// The next YAML plus the edit target of the node that was just added, so the caller can select it.
type InsertResult = { yaml: string; selectTarget?: EditTarget };

type SwitchCaseInsert = Extract<PendingInsert, { context: 'switchCase' }>;
type ResourceForNodeInsert = Extract<PendingInsert, { context: 'resourceForNode' }>;
type IndexedInsert = Extract<PendingInsert, { context: 'spine' | 'slot' }>;

// A new case with an empty condition, wrapping the chosen step.
function wrapAsCase(section: SwitchCaseInsert['section'], step: Record<string, unknown>): Record<string, unknown> {
  return section === 'output' ? { check: '', output: step } : { check: '', processors: [step] };
}

// Where the wrapped step sits inside the case at `caseIndex`.
function caseStepPath(target: SwitchCaseInsert, caseIndex: number): (string | number)[] {
  return target.section === 'output'
    ? [...target.containerPath, caseIndex, 'output']
    : [...target.containerPath, caseIndex, 'processors', 0];
}

// Append a new case (empty condition) wrapping the chosen step; select the step for configuring.
function insertSwitchCase(
  { yaml, connectionName, connectionType, components }: InsertParams,
  target: SwitchCaseInsert
): InsertResult | null {
  if (connectionType !== target.section) {
    return null;
  }
  const step = buildInsertableComponent(connectionName, target.section, components);
  if (!step) {
    return null;
  }
  const next = insertComponentAt(yaml, target.containerPath, Number.MAX_SAFE_INTEGER, wrapAsCase(target.section, step));
  if (next === null) {
    return null;
  }
  const caseIndex = seqLengthAt(next, target.containerPath) - 1;
  return {
    yaml: next,
    selectTarget: { kind: 'path', path: caseStepPath(target, caseIndex), componentType: target.section },
  };
}

// Point the node's `resource:` at `label`; the YAML is unchanged when the node has no object config.
function linkResourceToNode(yaml: string, target: EditTarget, label: string): string {
  const comp = getComponentAt(yaml, target);
  const name = comp ? firstKey(comp) : undefined;
  const inner = name ? comp?.[name] : undefined;
  if (!(comp && name && inner && typeof inner === 'object' && !Array.isArray(inner))) {
    return yaml;
  }
  (inner as Record<string, unknown>).resource = label;
  return setComponentAt(yaml, target, comp) ?? yaml;
}

// Create the resource and link it to the node's `resource:` in one commit, so it's never left unlinked.
function insertLinkedResource(
  { yaml, connectionName, connectionType, components }: InsertParams,
  target: ResourceForNodeInsert
): InsertResult | null {
  if (connectionType !== target.kind) {
    return null;
  }
  const created = createResourceAndReturnLabel(yaml, target.kind, connectionName, components);
  if (!created) {
    return null;
  }
  return { yaml: linkResourceToNode(created.yaml, target.target, created.label) };
}

// Caches/rate limits append to their top-level resource array.
function insertResource(
  { yaml, connectionName, components }: InsertParams,
  connectionType: 'cache' | 'rate_limit'
): InsertResult | null {
  const resource = buildInsertableComponent(connectionName, connectionType, components);
  const resourceKey: ResourceArrayKey = resourceArrayKey(connectionType);
  if (!resource) {
    return null;
  }
  const next = appendResource(yaml, resourceKey, resource);
  return next === null
    ? null
    : { yaml: next, selectTarget: { kind: 'resource', resourceKey, index: seqLengthAt(next, [resourceKey]) - 1 } };
}

// Spine or slot insert — both carry an index; the spine targets the top-level processors array.
function insertStep(
  { yaml, connectionName, components }: InsertParams,
  target: IndexedInsert,
  connectionType: 'processor' | 'input' | 'output'
): InsertResult | null {
  const component = buildInsertableComponent(connectionName, connectionType, components);
  if (!component) {
    return null;
  }
  const containerPath = target.context === 'slot' ? target.containerPath : ['pipeline', 'processors'];
  const next = insertComponentAt(yaml, containerPath, target.index, component);
  if (next === null) {
    return null;
  }
  // insertComponentAt clamps the index to the array length; mirror that to locate the new node.
  const insertedIndex = Math.min(target.index, seqLengthAt(next, containerPath) - 1);
  const selectTarget: EditTarget =
    target.context === 'slot'
      ? { kind: 'path', path: [...containerPath, insertedIndex], componentType: target.accepts }
      : { kind: 'processor', index: insertedIndex };
  return { yaml: next, selectTarget };
}

// Resolve the chosen connector + target to the next YAML (null on failure). Caches/rate limits
// append to their top-level resource arrays; everything else splices into the target container.
function buildInsertedYaml(params: InsertParams): InsertResult | null {
  const { target, connectionType } = params;
  if (target.context === 'switchCase') {
    return insertSwitchCase(params, target);
  }
  if (target.context === 'resourceForNode') {
    return insertLinkedResource(params, target);
  }
  if (connectionType === 'cache' || connectionType === 'rate_limit') {
    return insertResource(params, connectionType);
  }
  if (connectionType === 'processor' || connectionType === 'input' || connectionType === 'output') {
    return insertStep(params, target, connectionType);
  }
  return null;
}

const UNDO_SHORTCUT = formatShortcut(modKey(), 'Z');
const REDO_SHORTCUT = formatShortcut(modKey(), shiftKey(), 'Z');

const ShortcutLabel = ({ label, keys }: { label: string; keys: string }) => (
  <span className="flex items-center gap-2">
    {label}
    <Kbd size="xs" variant="filled">
      {keys}
    </Kbd>
  </span>
);

// Classify a canvas keydown; presses inside text fields / Monaco keep their own editing semantics.
type CanvasKeyAction = 'undo' | 'redo' | 'deselect' | 'delete' | 'palette';

// Focused controls own their keys: text fields / Monaco keep editing semantics, and buttons, selects,
// switches, menus (toolbar buttons, Radix triggers — all render as focusable controls) must not have
// Delete open the confirm dialog or `/` open the palette while focused.
const FOCUS_GUARD_SELECTOR =
  'input, textarea, select, button, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"], [role="switch"], .monaco-editor';

// Unmodified canvas keys: `/` opens the palette, Escape deselects, Delete/Backspace deletes.
function plainCanvasKeyAction(e: KeyboardEvent): CanvasKeyAction | null {
  // `/` opens the palette — ⌘K is taken by the outer app-shell search.
  if (e.key === '/' && !(e.metaKey || e.ctrlKey || e.altKey)) {
    return 'palette';
  }
  if (e.key === 'Escape') {
    return 'deselect';
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    return 'delete';
  }
  return null;
}

// History chords: ⌘Z undoes, ⌘⇧Z / ⌘Y redo.
function historyKeyAction(e: KeyboardEvent): CanvasKeyAction | null {
  if (!(e.metaKey || e.ctrlKey)) {
    return null;
  }
  const key = e.key.toLowerCase();
  if (key === 'y' || (key === 'z' && e.shiftKey)) {
    return 'redo';
  }
  if (key === 'z') {
    return 'undo';
  }
  return null;
}

function canvasKeyAction(e: KeyboardEvent): CanvasKeyAction | null {
  // Another layer (a chip popover, a dialog) already handled this key.
  if (e.defaultPrevented) {
    return null;
  }
  const target = e.target as HTMLElement | null;
  if (target?.closest(FOCUS_GUARD_SELECTOR)) {
    return null;
  }
  return plainCanvasKeyAction(e) ?? historyKeyAction(e);
}

// Undo/redo via YAML snapshots (⌘Z / ⌘⇧Z), stored to survive lane switches; `recordEdit` no-ops on
// unchanged round-trips and folds an external (Monaco) edit into one step when seen on return.
function useEditHistory(
  yaml: string,
  onChange: (next: string) => void,
  onNavigate?: (from: string, to: string) => void,
  // Runs before a history step applies — discards the inspector's in-flight draft (positional node
  // ids shift when a step is undone, so the draft can't safely re-commit).
  beforeApply?: () => void
) {
  const undoStack = usePipelineEditorStore((s) => s.editUndoStack);
  const redoStack = usePipelineEditorStore((s) => s.editRedoStack);
  const baseline = usePipelineEditorStore((s) => s.editBaseline);
  const recordEdit = usePipelineEditorStore((s) => s.recordEdit);
  const commitEditHistory = usePipelineEditorStore((s) => s.commitEditHistory);

  // Observe every document state; recordEdit pushes an undo step only on a real change.
  useEffect(() => {
    recordEdit(yaml);
  }, [yaml, recordEdit]);

  const undo = useCallback(() => {
    if (undoStack.length === 0 || baseline === null) {
      return;
    }
    beforeApply?.();
    const target = undoStack.at(-1) as string;
    commitEditHistory({ undo: undoStack.slice(0, -1), redo: [baseline, ...redoStack], baseline: target });
    onChange(target);
    onNavigate?.(baseline, target);
  }, [undoStack, redoStack, baseline, commitEditHistory, onChange, onNavigate, beforeApply]);

  const redo = useCallback(() => {
    if (redoStack.length === 0 || baseline === null) {
      return;
    }
    beforeApply?.();
    const target = redoStack[0];
    commitEditHistory({ undo: [...undoStack, baseline], redo: redoStack.slice(1), baseline: target });
    onChange(target);
    onNavigate?.(baseline, target);
  }, [undoStack, redoStack, baseline, commitEditHistory, onChange, onNavigate, beforeApply]);

  return { undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
}

type VisualEditorPanelProps = {
  mode: 'view' | 'edit' | 'create';
  yamlContent: string;
  onYamlChange: (yaml: string) => void;
  /** Parsed component specs, used to generate templates for inserted components. */
  components: ConnectComponentSpec[];
  /** Raw component list for the connector picker. */
  componentList: ComponentList;
  /** Server lint hints, surfaced in context on the nodes they map to. */
  lintHints?: LintHint[];
  /** Reused page flows (edit mode only): add input/output placeholders, redpanda setup hints. */
  onAddConnector?: (type: ConnectComponentType | 'resource') => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
  /** Open the template gallery (edit mode); shows a floating entry point when empty. */
  onBrowseTemplates?: () => void;
  /** Switch to the YAML lane and reveal the given node there (inspector "View in YAML"). */
  onNavigateToYaml?: (nodeId: string) => void;
  /** The pipeline config is still loading — the canvas shows a skeleton until it's ready. */
  isLoading?: boolean;
};

type NodeRef = { id: string; target: EditTarget; caseTarget?: EditTarget };
// `name` snapshots the component's key at selection time: targets are positional, so a reorder can
// leave a different component at the same target — the name mismatch lets us detect that.
type SelectedNode = NodeRef & { name?: string };

// Inspector edits auto-commit on leave / save (no per-node Apply): `commitRef` holds the selected
// node's pending commit, flushed before selection changes and on save; a flush consumes the draft,
// so flushing at multiple points never double-applies.
function usePendingNodeCommit(yamlContent: string, onYamlChange: (yaml: string) => void) {
  const commitRef = useRef<PendingNodeCommit | null>(null);
  const yamlRef = useRef(yamlContent);
  yamlRef.current = yamlContent;
  const commitPending = useCallback(() => {
    const pending = commitRef.current;
    if (!pending) {
      return;
    }
    const next = pending.commit(yamlRef.current);
    if (next !== yamlRef.current) {
      onYamlChange(next);
    }
  }, [onYamlChange]);

  // Expose the flush so the page's pipeline Save commits the still-selected node before saving.
  const setPendingEditCommit = usePipelineEditorStore((s) => s.setPendingEditCommit);
  useEffect(() => {
    setPendingEditCommit(commitPending);
    return () => setPendingEditCommit(null);
  }, [commitPending, setPendingEditCommit]);

  return { commitRef, yamlRef, commitPending };
}

// The node open in the inspector, how it changes (committing the previous node's draft first), and
// the canvas recentre target for selections made away from the canvas.
function useInspectorSelection(yamlContent: string, onYamlChange: (yaml: string) => void) {
  const { commitRef, yamlRef, commitPending } = usePendingNodeCommit(yamlContent, onYamlChange);
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  // Recenter the canvas on a node picked from the command palette (token re-pans on re-pick).
  const [focus, setFocus] = useState<{ id: string; token: number }>({ id: '', token: 0 });

  // Select a different node (or none), committing the current node's pending edits first. The name
  // is read pre-commit, which is safe: the commit rewrites a node in place and never reorders.
  const selectNode = useCallback(
    (next: NodeRef | null) => {
      commitPending();
      setSelected(next ? { ...next, name: componentNameAt(yamlRef.current, next.target) } : null);
    },
    [commitPending, yamlRef]
  );
  // Select AND recenter (palette jump, problems list, inspector child nav) — the node may be off-screen.
  const selectAndReveal = useCallback(
    (next: NodeRef) => {
      selectNode(next);
      setFocus((f) => ({ id: next.id, token: f.token + 1 }));
    },
    [selectNode]
  );
  // Close the inspector without committing its draft (the node is gone, or being removed).
  const dropSelection = useCallback(() => {
    commitRef.current?.discard();
    setSelected(null);
  }, [commitRef]);

  // Mirror the selection into the shared store so the YAML lane (a separate tree) can reveal the node.
  const setSelectedNodeId = usePipelineEditorStore((s) => s.setSelectedNodeId);
  useEffect(() => {
    setSelectedNodeId(selected?.id ?? null);
  }, [selected, setSelectedNodeId]);

  // Close the inspector (dropping its stale draft) when an undo/redo or external edit removes the
  // node — or reorders the document so a different component now sits at the positional target.
  useEffect(() => {
    if (!selected) {
      return;
    }
    const comp = getComponentAt(yamlContent, selected.target);
    if (comp === undefined || (selected.name !== undefined && firstKey(comp) !== selected.name)) {
      dropSelection();
    }
  }, [selected, yamlContent, dropSelection]);

  return { commitRef, commitPending, selected, setSelected, focus, selectNode, selectAndReveal, dropSelection };
}

type InspectorSelection = ReturnType<typeof useInspectorSelection>;

// Undo/redo plus its feedback: a brief pulse on the node(s) a step touched, so the change is easy to
// spot, and an inspector-form remount onto the restored YAML.
function useCanvasHistory(
  yamlContent: string,
  onYamlChange: (yaml: string) => void,
  commitRef: InspectorSelection['commitRef']
) {
  const [flash, setFlash] = useState<{ ids: ReadonlySet<string>; token: number }>({ ids: new Set(), token: 0 });
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on undo/redo so the inspector form remounts to the restored YAML instead of keeping
  // (now stale) in-place edit state. Same-node commits/resyncs deliberately do NOT bump it.
  const [formEpoch, setFormEpoch] = useState(0);
  const handleNavigate = useCallback((from: string, to: string) => {
    setFormEpoch((e) => e + 1);
    const ids = changedNodeIds(from, to);
    if (ids.length === 0) {
      return;
    }
    setFlash((f) => ({ ids: new Set(ids), token: f.token + 1 }));
    if (flashTimer.current) {
      clearTimeout(flashTimer.current);
    }
    flashTimer.current = setTimeout(() => setFlash((f) => ({ ids: new Set(), token: f.token })), 1400);
  }, []);
  useEffect(() => () => clearTimeout(flashTimer.current ?? undefined), []);

  const discardPendingEdit = useCallback(() => {
    commitRef.current?.discard();
  }, [commitRef]);
  const history = useEditHistory(yamlContent, onYamlChange, handleNavigate, discardPendingEdit);
  return { ...history, flash, formEpoch };
}

type CanvasHistory = ReturnType<typeof useCanvasHistory>;

// Nodes whose config differs from the last-saved pipeline (unsaved dot); view mode is never unsaved.
// The baseline is signed once per save — re-signing the constant initialYaml on every keystroke
// would double the diff's parse cost.
function useUnsavedNodes(yamlContent: string, isEditing: boolean, flowNodes: PipelineFlowNode[]) {
  const initialYaml = usePipelineEditorStore((s) => s.initialYaml);
  const baselineSignatures = useMemo(
    () => (isEditing && initialYaml !== null ? nodeConfigSignatures(initialYaml) : null),
    [isEditing, initialYaml]
  );
  const unsavedNodeIds = useMemo(
    () => (baselineSignatures ? new Set(changedNodeIdsFromBaseline(baselineSignatures, yamlContent)) : EMPTY_NODE_IDS),
    [baselineSignatures, yamlContent]
  );
  // Jumpable list for the floating "unsaved" panel — only nodes with an edit target can be selected.
  const unsavedNodeList = useMemo(
    () =>
      flowNodes
        .filter((n) => unsavedNodeIds.has(n.id) && n.editTarget)
        .map((n) => ({ id: n.id, label: n.label, detail: n.labelText })),
    [flowNodes, unsavedNodeIds]
  );
  return { unsavedNodeIds, unsavedNodeList };
}

// Node-mapped lint hints, each clickable to select its node; `mapped` lets the rest be listed inert.
function nodeProblems(
  lintByNode: Map<string, LintHint[]>,
  flowNodes: PipelineFlowNode[]
): { list: PipelineProblem[]; mapped: Set<LintHint> } {
  const nodesById = new Map(flowNodes.map((n) => [n.id, n]));
  const mapped = new Set<LintHint>();
  const list: PipelineProblem[] = [];
  for (const [nodeId, hints] of lintByNode) {
    const node = nodesById.get(nodeId);
    const caseTarget = caseTargetForNode(node, flowNodes);
    for (const hint of hints) {
      mapped.add(hint);
      list.push({
        key: `${nodeId}-${hint.line}-${hint.hint}`,
        message: hint.hint,
        line: hint.line || undefined,
        nodeId,
        nodeLabel: node?.label,
        target: node?.editTarget,
        caseTarget,
      });
    }
  }
  return { list, mapped };
}

// Flat problems list for the floating overview: node-mapped hints are clickable, the rest inert.
function buildProblems(
  all: LintHint[],
  lintByNode: Map<string, LintHint[]>,
  flowNodes: PipelineFlowNode[]
): PipelineProblem[] {
  if (all.length === 0) {
    return [];
  }
  const { list, mapped } = nodeProblems(lintByNode, flowNodes);
  const unmapped = all
    .filter((hint) => !mapped.has(hint))
    .map((hint) => ({ key: `unmapped-${hint.line}-${hint.hint}`, message: hint.hint, line: hint.line || undefined }));
  return [...list, ...unmapped];
}

type FlowOverviewOptions = {
  yamlContent: string;
  lintHints?: LintHint[];
  isEditing: boolean;
  selectedId?: string;
};

// What the canvas overlays show about the document: its nodes, lint, unsaved changes, and the
// selected node's children for the inspector.
function useFlowOverview({ yamlContent, lintHints, isEditing, selectedId }: FlowOverviewOptions) {
  const flowNodes = useMemo(() => parsePipelineFlowTree(yamlContent).nodes, [yamlContent]);
  const offerTemplate = useMemo(() => shouldOfferTemplate(yamlContent, flowNodes), [yamlContent, flowNodes]);

  // Map server lint hints to their nodes (badge on the node, full messages in the inspector).
  const lintByNode = useMemo(() => mapLintHintsToNodes(yamlContent, lintHints ?? []), [yamlContent, lintHints]);
  const lintMessagesByNode = useMemo(() => {
    const messages = new Map<string, string[]>();
    for (const [id, hints] of lintByNode) {
      messages.set(
        id,
        hints.map((h) => h.hint)
      );
    }
    return messages;
  }, [lintByNode]);
  const { unsavedNodeIds, unsavedNodeList } = useUnsavedNodes(yamlContent, isEditing, flowNodes);

  const childItems = useMemo<InspectorChildItem[]>(
    () => (selectedId ? buildChildItems(selectedId, flowNodes, lintByNode) : []),
    [selectedId, flowNodes, lintByNode]
  );
  const problems = useMemo(
    () => buildProblems(lintHints ?? [], lintByNode, flowNodes),
    [lintHints, lintByNode, flowNodes]
  );

  return {
    flowNodes,
    offerTemplate,
    lintByNode,
    lintMessagesByNode,
    unsavedNodeIds,
    unsavedNodeList,
    childItems,
    problems,
  };
}

type FlowOverview = ReturnType<typeof useFlowOverview>;

// Secrets referenced as ${secrets.X} that don't exist yet — surfaced with a quick-add flow.
function useMissingSecrets(yamlContent: string, isEditing: boolean, onYamlChange: (yaml: string) => void) {
  const { data: secretsResponse } = useListSecretsQuery({}, { enabled: isEditing });
  const [isSecretsDialogOpen, setIsSecretsDialogOpen] = useState(false);
  const existingSecrets = useMemo(
    () => (secretsResponse?.secrets ? secretsResponse.secrets.map((s) => s?.id || '').filter(Boolean) : []),
    [secretsResponse]
  );
  const missingSecrets = useMemo(() => {
    // Only warn once the secrets list has actually loaded.
    if (!(isEditing && secretsResponse)) {
      return [];
    }
    const referenced = getUniqueSecretNames(extractSecretReferences(yamlContent));
    const existingSet = new Set(existingSecrets);
    return referenced.filter((name) => !existingSet.has(name));
  }, [isEditing, secretsResponse, yamlContent, existingSecrets]);

  // Rename a missing secret by rewriting references in the YAML (the visual lane has no text editor).
  const handleRenameSecretReferences = useCallback(
    (oldName: string, newName: string) => {
      const updated = yamlContent.replaceAll(`\${secrets.${oldName}}`, `\${secrets.${newName}}`);
      if (updated !== yamlContent) {
        onYamlChange(updated);
      }
    },
    [yamlContent, onYamlChange]
  );

  return { existingSecrets, missingSecrets, isSecretsDialogOpen, setIsSecretsDialogOpen, handleRenameSecretReferences };
}

// Deletes are confirmed: the trash action / Delete key stage the target, the dialog commits it.
function usePendingDelete(yamlContent: string, onYamlChange: (yaml: string) => void, dropSelection: () => void) {
  const [pendingDelete, setPendingDelete] = useState<EditTarget | null>(null);
  const pendingDeleteName = useMemo(
    () => (pendingDelete ? componentNameAt(yamlContent, pendingDelete) : undefined),
    [pendingDelete, yamlContent]
  );

  // Warn when other nodes still reference the resource by label — deleting would leave them dangling.
  const pendingDeleteRefCount = useMemo(() => {
    if (pendingDelete?.kind !== 'resource') {
      return 0;
    }
    const comp = getComponentAt(yamlContent, pendingDelete);
    const label = comp && typeof comp.label === 'string' ? comp.label : undefined;
    // Kind-scoped: a same-labelled resource of the other kind must not inflate the warning.
    return label ? countResourceReferences(yamlContent, label, resourceTargetKind(pendingDelete)) : 0;
  }, [pendingDelete, yamlContent]);

  const confirmDeleteNode = useCallback(() => {
    if (pendingDelete) {
      const next = removeComponentAt(yamlContent, pendingDelete);
      if (next === null) {
        // Removal can fail on YAML the surgical editor can't safely rewrite (e.g. a shared anchor) — say so.
        toast.error('Couldn’t remove this node — edit it in the YAML view instead.');
      } else {
        onYamlChange(next);
      }
    }
    // Deleting discards any pending edit for the node (don't commit it).
    dropSelection();
    setPendingDelete(null);
  }, [pendingDelete, yamlContent, onYamlChange, dropSelection]);

  return { pendingDelete, setPendingDelete, pendingDeleteName, pendingDeleteRefCount, confirmDeleteNode };
}

type PendingDelete = ReturnType<typeof usePendingDelete>;

// The just-added node (matched by edit target in the reparse), to select so it can be configured.
function insertedNodeSelection(result: InsertResult): SelectedNode | null {
  const { selectTarget } = result;
  if (!selectTarget) {
    return null;
  }
  const added = parsePipelineFlowTree(result.yaml).nodes.find((n) => editTargetsEqual(n.editTarget, selectTarget));
  if (!added?.editTarget) {
    return null;
  }
  return {
    id: added.id,
    target: added.editTarget,
    caseTarget: added.caseEditTarget,
    name: componentNameAt(result.yaml, added.editTarget),
  };
}

// Apply an insert and auto-select the node it added. A null result means the slot's container
// vanished (e.g. an undo while the picker was open) — say so.
function applyInsertResult(
  result: InsertResult | null,
  connectionName: string,
  { onYamlChange, select }: { onYamlChange: (yaml: string) => void; select: (next: SelectedNode) => void }
): void {
  if (result === null) {
    toast.error(`Couldn’t add ${connectionName} — the insert position no longer exists.`);
    return;
  }
  onYamlChange(result.yaml);
  const added = insertedNodeSelection(result);
  if (added) {
    select(added);
  }
}

type NodeInsertOptions = {
  yamlContent: string;
  components: ConnectComponentSpec[];
  onYamlChange: (yaml: string) => void;
  selection: InspectorSelection;
};

// The connector picker's pending insert and the canvas/inspector entry points that open it. Each
// commits any pending inspector edit first — the insert builds on the current YAML, so the draft
// would otherwise be lost.
function useNodeInsert({ yamlContent, components, onYamlChange, selection }: NodeInsertOptions) {
  const { selected, setSelected, commitPending } = selection;
  const [pendingInsert, setPendingInsert] = useState<PendingInsert | null>(null);

  const handleInsertSelected = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      const target = pendingInsert;
      setPendingInsert(null);
      if (target !== null) {
        const result = buildInsertedYaml({ yaml: yamlContent, connectionName, connectionType, target, components });
        applyInsertResult(result, connectionName, { onYamlChange, select: setSelected });
      }
    },
    [pendingInsert, components, yamlContent, onYamlChange, setSelected]
  );

  // In-container "+": open the picker filtered to the slot's type.
  const handleSlotInsert = useCallback(
    (payload: FlowInsertPayload) => {
      commitPending();
      if (payload.kind === 'addChild') {
        setPendingInsert({
          context: 'switchCase',
          containerPath: payload.containerPath,
          section: payload.section,
        });
        return;
      }
      setPendingInsert({
        context: 'slot',
        containerPath: payload.containerPath,
        accepts: payload.accepts,
        index: payload.index,
      });
    },
    [commitPending]
  );
  const handleSpineInsert = useCallback(
    (index: number) => {
      commitPending();
      setPendingInsert({ context: 'spine', index });
    },
    [commitPending]
  );

  // "Create new resource" from a node's resource field: the pick is created and linked in one step.
  const handleRequestCreateResource = useCallback(
    (kind: ResourceKind) => {
      if (selected) {
        // Flush in-progress edits first — the insert re-links the node on the current YAML.
        commitPending();
        setPendingInsert({ context: 'resourceForNode', kind, target: selected.target });
      }
    },
    [selected, commitPending]
  );

  return {
    pendingInsert,
    setPendingInsert,
    handleInsertSelected,
    handleSlotInsert,
    handleSpineInsert,
    handleRequestCreateResource,
  };
}

type NodeInsert = ReturnType<typeof useNodeInsert>;

type CanvasKeyboardOptions = {
  isEditing: boolean;
  selection: InspectorSelection;
  history: CanvasHistory;
  stageDelete: (target: EditTarget) => void;
  /** One of the editor's own dialogs is open. */
  dialogOpen: boolean;
};

// Canvas shortcuts (`/` palette, Escape, Delete, undo/redo), and the palette they open.
function useCanvasKeyboard({ isEditing, selection, history, stageDelete, dialogOpen }: CanvasKeyboardOptions) {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const { selected, selectNode } = selection;
  const { undo, redo } = history;

  useEffect(() => {
    const handlers: Record<CanvasKeyAction, (e: KeyboardEvent) => void> = {
      palette: (e) => {
        e.preventDefault();
        setIsPaletteOpen(true);
      },
      deselect: () => selectNode(null),
      delete: (e) => {
        if (isEditing && selected) {
          e.preventDefault();
          stageDelete(selected.target);
        }
      },
      undo: (e) => {
        if (isEditing) {
          e.preventDefault();
          undo();
        }
      },
      redo: (e) => {
        if (isEditing) {
          e.preventDefault();
          redo();
        }
      },
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // Shortcuts stay inert while one of the editor's own dialogs is open. Checked against component
      // state, not a role="dialog" query, so a host-shell dialog can't disable us.
      if (dialogOpen || isPaletteOpen) {
        return;
      }
      const action = canvasKeyAction(e);
      if (action) {
        handlers[action](e);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEditing, undo, redo, selected, selectNode, stageDelete, dialogOpen, isPaletteOpen]);

  return { isPaletteOpen, setIsPaletteOpen };
}

// Selection entry points away from the inspector: the canvas itself, the command palette's
// "go to", the floating unsaved list, and "View in YAML" for the open node.
function useSelectionEntryPoints(
  flowNodes: PipelineFlowNode[],
  selection: InspectorSelection,
  onNavigateToYaml: VisualEditorPanelProps['onNavigateToYaml']
) {
  const { selected, selectNode, selectAndReveal } = selection;
  // Stable canvas callbacks — inline arrows here would change identity every render and
  // defeat the canvas's Dagre-layout memo (which keys on these props).
  const selectFromCanvas = useCallback(
    (id: string, target: EditTarget, caseTarget?: EditTarget) => selectNode({ id, target, caseTarget }),
    [selectNode]
  );
  const clearSelection = useCallback(() => selectNode(null), [selectNode]);

  // Command-palette "go to": select + recenter (only nodes with an edit target are listed).
  const jumpToNode = useCallback(
    (node: PipelineFlowNode) => {
      const jump = resolveJumpTarget(node, flowNodes);
      if (jump) {
        selectAndReveal(jump);
      }
    },
    [flowNodes, selectAndReveal]
  );
  const jumpToNodeId = useCallback(
    (nodeId: string) => {
      const node = flowNodes.find((n) => n.id === nodeId);
      if (node) {
        jumpToNode(node);
      }
    },
    [flowNodes, jumpToNode]
  );

  // Inspector and palette "View in YAML", when the page can reveal the node there.
  const openSelectedInYaml = selected && onNavigateToYaml ? () => onNavigateToYaml(selected.id) : undefined;

  return { selectFromCanvas, clearSelection, jumpToNode, jumpToNodeId, openSelectedInYaml };
}

type SelectionEntryPoints = ReturnType<typeof useSelectionEntryPoints>;

// The slot dictates the picker's component types; the top-level spine also offers resources.
function insertPickerTypes(pending: PendingInsert | null): ConnectComponentType[] {
  if (pending?.context === 'slot') {
    return [pending.accepts];
  }
  if (pending?.context === 'switchCase') {
    return [pending.section];
  }
  if (pending?.context === 'resourceForNode') {
    return [pending.kind];
  }
  return INSERTABLE_TYPES;
}

// The one component kind a slot or switch-case insert adds, if it's that narrow.
function insertSlotKind(pending: PendingInsert | null): 'input' | 'processor' | 'output' | undefined {
  if (pending?.context === 'slot') {
    return pending.accepts;
  }
  if (pending?.context === 'switchCase') {
    return pending.section;
  }
}

// Title/placeholder name the exact kind being added, e.g. "Insert an output" inside a switch.
function insertPickerCopy(pending: PendingInsert | null): { title: string; searchPlaceholder: string } {
  if (pending?.context === 'resourceForNode') {
    return {
      title: `Add ${pending.kind === 'cache' ? 'cache' : 'rate limit'} resource`,
      searchPlaceholder: 'Search caches, rate limits…',
    };
  }
  const slotKind = insertSlotKind(pending);
  if (slotKind) {
    return { title: `Insert ${INSERT_KIND_LABEL[slotKind]}`, searchPlaceholder: `Search ${slotKind}s…` };
  }
  return { title: 'Insert a step or resource', searchPlaceholder: 'Search components…' };
}

function InsertConnectorPicker({ componentList, insert }: { componentList: ComponentList; insert: NodeInsert }) {
  const { title, searchPlaceholder } = insertPickerCopy(insert.pendingInsert);
  return (
    <AddConnectorDialog
      components={componentList}
      connectorType={insertPickerTypes(insert.pendingInsert)}
      isOpen={insert.pendingInsert !== null}
      onAddConnector={insert.handleInsertSelected}
      onCloseAddConnector={() => insert.setPendingInsert(null)}
      searchPlaceholder={searchPlaceholder}
      title={title}
    />
  );
}

const HistoryToolbar = ({ history }: { history: CanvasHistory }) => (
  <TooltipProvider>
    <div className="absolute top-3 left-3 z-10 flex items-center gap-0.5 rounded-md border border-border bg-background/90 p-0.5 shadow-sm backdrop-blur-sm">
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
  'yamlContent' | 'isLoading' | 'onAddConnector' | 'onAddTopic' | 'onAddSasl' | 'onBrowseTemplates'
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
  const handleAddConnectorSection = useCallback(
    (section: string) => onAddConnector?.(section as ConnectComponentType),
    [onAddConnector]
  );

  return (
    <div className="relative min-w-0 flex-1">
      {/* Don't mount the canvas pre-hydration — its parse debounce would briefly render a placeholder graph. */}
      {isLoading ? (
        <PipelineFlowSkeleton />
      ) : (
        <>
          <PipelineFlowCanvas
            configYaml={yamlContent}
            flashNodeIds={history.flash.ids}
            flashToken={history.flash.token}
            focusNodeId={focus.id || undefined}
            focusToken={focus.token}
            lintErrorsByNode={overview.lintMessagesByNode}
            onAddConnector={isEditing && onAddConnector ? handleAddConnectorSection : undefined}
            onAddSasl={isEditing ? onAddSasl : undefined}
            onAddTopic={isEditing ? onAddTopic : undefined}
            onClearSelection={entryPoints.clearSelection}
            onInsert={isEditing ? insert.handleSpineInsert : undefined}
            onSelectNode={entryPoints.selectFromCanvas}
            onSlotInsert={isEditing ? insert.handleSlotInsert : undefined}
            selectedNodeId={selected?.id}
            selectedTargetKind={selected?.target.kind}
            unsavedNodeIds={overview.unsavedNodeIds}
          />
          {isEditing ? <HistoryToolbar history={history} /> : null}
          <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
            <PipelineProblemsPanel
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
  const { selected, commitRef, commitPending, selectNode, selectAndReveal } = selection;
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
              caseTarget={selected.caseTarget}
              childItems={overview.childItems}
              commitRef={isEditing ? commitRef : undefined}
              components={components}
              lintHints={overview.lintByNode.get(selected.id)}
              onAddTopic={isEditing ? onAddTopic : undefined}
              onApply={onYamlChange}
              onClose={() => selectNode(null)}
              onCreateResource={isEditing ? insert.handleRequestCreateResource : undefined}
              onDelete={isEditing ? stageDelete : undefined}
              onOpenInYaml={entryPoints.openSelectedInYaml}
              onRequestCommit={isEditing ? commitPending : undefined}
              onSelectChild={selectAndReveal}
              readOnly={!isEditing}
              resetToken={history.formEpoch}
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
  const { pendingDelete, setPendingDelete, pendingDeleteName, pendingDeleteRefCount, confirmDeleteNode } = deletion;
  return (
    <AlertDialog onOpenChange={(open) => (open ? undefined : setPendingDelete(null))} open={pendingDelete !== null}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Remove this node?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingDeleteName ? (
              <>
                This removes the <span className="font-mono">{pendingDeleteName}</span> node from the pipeline. You can
                undo it with {UNDO_SHORTCUT}.
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
          <AlertDialogAction onClick={confirmDeleteNode} render={<Button variant="destructive">Remove</Button>} />
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
  const overview = useFlowOverview({ yamlContent, lintHints, isEditing, selectedId: selection.selected?.id });
  const secrets = useMissingSecrets(yamlContent, isEditing, onYamlChange);
  const deletion = usePendingDelete(yamlContent, onYamlChange, selection.dropSelection);
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
      <div className="flex h-full w-full">
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
