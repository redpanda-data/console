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
import { changedNodeIds } from '../utils/pipeline-diff';
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

// Reads the picker title for a typed slot, e.g. "Insert an output" inside a switch.
const INSERT_KIND_LABEL: Record<'input' | 'processor' | 'output', string> = {
  input: 'an input',
  output: 'an output',
  processor: 'a processor',
};

// Where a chosen connector lands: a top-level spine slot (pipeline.processors) or a nested
// container array (switch case, branch, broker, fallback).
type PendingInsert =
  | { context: 'spine'; index: number }
  | { context: 'slot'; containerPath: (string | number)[]; accepts: 'input' | 'processor' | 'output'; index: number }
  // Switch "add case": pick the first step, then wrap it as `{ check, output }` (output switch)
  // or `{ check, processors: [step] }` (processor switch).
  | { context: 'switchCase'; containerPath: (string | number)[]; section: 'processor' | 'output' }
  // "Create new resource" from a node's resource field: create the cache/rate_limit and link it
  // to `target`'s `resource:` field.
  | { context: 'resourceForNode'; kind: ResourceKind; target: EditTarget };

type InsertParams = {
  yaml: string;
  connectionName: string;
  connectionType: ConnectComponentType;
  target: PendingInsert;
  components: ConnectComponentSpec[];
};

// Routing-condition target for a node with a lint problem, so selecting the problem opens its
// condition. Output switch: the node owns it; processor switch: the case wrapper owns it and this
// node is the wrapper's first child.
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

// What a "jump to node" selects + recenters. A processor-switch case is a structural wrapper with
// no rendered card, so resolve it to its first body step, carrying the case's condition target;
// every other node jumps to itself. Null if unjumpable.
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

// Direct children (cases / steps) of a control-flow node as clickable inspector items, each mapped
// to the rendered child: an editable child is itself the entry (output switch leaf); otherwise the
// case wrapper's first child is (processor switch). [] for leaf nodes.
function buildChildItems(
  selectedId: string,
  flowNodes: PipelineFlowNode[],
  lintByNode: Map<string, LintHint[]>
): InspectorChildItem[] {
  const items: InspectorChildItem[] = [];
  for (const child of flowNodes.filter((n) => n.parentId === selectedId)) {
    // A structural switch-case wrapper isn't navigable as a component: use its first body step as
    // the entry and name the row by that node. An output-switch case is itself a leaf.
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

// The next YAML plus the edit target of the node that was just added, so the caller can select it.
type InsertResult = { yaml: string; selectTarget?: EditTarget };

// Resolve the chosen connector + target to the next YAML (null if it couldn't be generated).
// Caches/rate limits append to their top-level resource arrays (referenced, not nested); every
// other component splices into the target container array.
function buildInsertedYaml({
  yaml,
  connectionName,
  connectionType,
  target,
  components,
}: InsertParams): InsertResult | null {
  // Wrap the chosen step in a new case (empty condition, edited afterwards) appended to the
  // switch's cases; select the step, since its config is what the user fills in next.
  if (target.context === 'switchCase') {
    if (connectionType !== target.section) {
      return null;
    }
    const step = buildInsertableComponent(connectionName, target.section, components);
    if (!step) {
      return null;
    }
    const wrapped = target.section === 'output' ? { check: '', output: step } : { check: '', processors: [step] };
    const next = insertComponentAt(yaml, target.containerPath, Number.MAX_SAFE_INTEGER, wrapped);
    if (next === null) {
      return null;
    }
    const caseIndex = seqLengthAt(next, target.containerPath) - 1;
    const stepPath =
      target.section === 'output'
        ? [...target.containerPath, caseIndex, 'output']
        : [...target.containerPath, caseIndex, 'processors', 0];
    return { yaml: next, selectTarget: { kind: 'path', path: stepPath, componentType: target.section } };
  }
  // Create the cache/rate_limit resource and link it to the node's `resource:` in one commit, so
  // it's never left unlinked. No re-select — the selected node just gains the link.
  if (target.context === 'resourceForNode') {
    if (connectionType !== target.kind) {
      return null;
    }
    const created = createResourceAndReturnLabel(yaml, target.kind, connectionName, components);
    if (!created) {
      return null;
    }
    const comp = getComponentAt(created.yaml, target.target);
    const name = comp ? firstKey(comp) : undefined;
    const inner = name ? comp?.[name] : undefined;
    if (comp && name && inner && typeof inner === 'object' && !Array.isArray(inner)) {
      (inner as Record<string, unknown>).resource = created.label;
      return { yaml: setComponentAt(created.yaml, target.target, comp) ?? created.yaml };
    }
    return { yaml: created.yaml };
  }
  if (connectionType === 'cache' || connectionType === 'rate_limit') {
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
  if (connectionType === 'processor' || connectionType === 'input' || connectionType === 'output') {
    const component = buildInsertableComponent(connectionName, connectionType, components);
    if (!component) {
      return null;
    }
    // Spine or slot insert — both carry an index; the spine targets the top-level processors array.
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
  return null;
}

// Undo/redo tooltip shortcuts, per platform (⌘ on macOS, Ctrl elsewhere).
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

// Classify a canvas keydown, ignoring presses inside a text field or the Monaco editor (which have
// their own undo / editing semantics).
type CanvasKeyAction = 'undo' | 'redo' | 'deselect' | 'delete' | 'palette';

function canvasKeyAction(e: KeyboardEvent): CanvasKeyAction | null {
  // Another layer (a chip popover, a dialog) already handled this key.
  if (e.defaultPrevented) {
    return null;
  }
  const target = e.target as HTMLElement | null;
  if (target?.closest('input, textarea, [contenteditable="true"], .monaco-editor')) {
    return null;
  }
  // `/` opens the command palette; ⌘K is taken by the outer app-shell search, so the canvas uses
  // its own non-conflicting key.
  if (e.key === '/' && !(e.metaKey || e.ctrlKey || e.altKey)) {
    return 'palette';
  }
  if (e.key === 'Escape') {
    return 'deselect';
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    return 'delete';
  }
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

// Undo/redo for visual edits: mutations write YAML directly, so this keeps YAML snapshots for ⌘Z /
// ⌘⇧Z. Lives in the store to survive lane switches; `recordEdit` no-ops on an unchanged round-trip
// and folds an external (Monaco) edit into one step when seen on return.
function useEditHistory(
  yaml: string,
  onChange: (next: string) => void,
  onNavigate?: (from: string, to: string) => void,
  // Runs before a history step is applied — discards the inspector's in-flight draft so it can't be
  // re-committed against the now-shifted YAML (positional node ids move when a step is undone).
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

/**
 * The Visual lane: a full-size, pannable canvas that lays the pipeline out as a
 * left→right flow. In edit mode it overlays contextual actions — add
 * input/output, insert a step on the spine, and per-node edit/remove — all of
 * which mutate the canonical YAML.
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
  const [selected, setSelected] = useState<{ id: string; target: EditTarget; caseTarget?: EditTarget } | null>(null);
  const [pendingInsert, setPendingInsert] = useState<PendingInsert | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  // Recenter the canvas on a node picked from the command palette (token re-pans on re-pick).
  const [focus, setFocus] = useState<{ id: string; token: number }>({ id: '', token: 0 });

  // Inspector edits auto-commit on leave / save (no per-node Apply): the inspector populates
  // `commitRef` with the selected node's hooks, flushed before any selection change and on save.
  // `commit` consumes drafts as it applies them, so flushing at multiple points never
  // double-applies; edits made after a flush commit on the next.
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
  // Select a different node (or none), committing the current node's pending edits first.
  const selectNode = useCallback(
    (next: { id: string; target: EditTarget; caseTarget?: EditTarget } | null) => {
      commitPending();
      setSelected(next);
    },
    [commitPending]
  );

  // Expose the flush so the page's pipeline Save commits the still-selected node before saving.
  const setPendingEditCommit = usePipelineEditorStore((s) => s.setPendingEditCommit);
  useEffect(() => {
    setPendingEditCommit(commitPending);
    return () => setPendingEditCommit(null);
  }, [commitPending, setPendingEditCommit]);

  // Mirror the selection into the shared store so the YAML lane can reveal the same node (the lanes
  // are separate component trees).
  const setSelectedNodeId = usePipelineEditorStore((s) => s.setSelectedNodeId);
  useEffect(() => {
    setSelectedNodeId(selected?.id ?? null);
  }, [selected, setSelectedNodeId]);

  // Briefly pulse the node(s) an undo/redo touched, so the change is easy to spot.
  const [flash, setFlash] = useState<{ ids: ReadonlySet<string>; token: number }>({ ids: new Set(), token: 0 });
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleNavigate = useCallback((from: string, to: string) => {
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
  }, []);
  const { undo, redo, canUndo, canRedo } = useEditHistory(
    yamlContent,
    onYamlChange,
    handleNavigate,
    discardPendingEdit
  );

  const parsedFlow = useMemo(() => parsePipelineFlowTree(yamlContent), [yamlContent]);
  const flowNodes = parsedFlow.nodes;

  const offerTemplate = useMemo(() => shouldOfferTemplate(yamlContent, flowNodes), [yamlContent, flowNodes]);

  // If an undo/redo or external edit removes the selected node entirely, close the inspector —
  // leaving it open on an empty state (with a stale draft) invites edits that can't land.
  useEffect(() => {
    if (selected && getComponentAt(yamlContent, selected.target) === undefined) {
      commitRef.current?.discard();
      setSelected(null);
    }
  }, [selected, yamlContent]);

  // Associate server lint hints with their nodes, so they show in context (badge on the node, full
  // messages in the inspector).
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

  // Nodes whose config differs from the last-saved/loaded pipeline — flagged with an unsaved dot.
  // View mode is read-only, so nothing is ever unsaved there.
  const initialYaml = usePipelineEditorStore((s) => s.initialYaml);
  const unsavedNodeIds = useMemo(
    () => (isEditing && initialYaml !== null ? new Set(changedNodeIds(initialYaml, yamlContent)) : EMPTY_NODE_IDS),
    [isEditing, initialYaml, yamlContent]
  );
  // The unsaved nodes as a jumpable list for the floating "unsaved" panel (only nodes with an
  // edit target can be selected/recentered).
  const unsavedNodeList = useMemo(
    () =>
      flowNodes
        .filter((n) => unsavedNodeIds.has(n.id) && n.editTarget)
        .map((n) => ({ id: n.id, label: n.label, detail: n.labelText })),
    [flowNodes, unsavedNodeIds]
  );

  // The selected control-flow node's children as a clickable inspector list, linking the high-level
  // construct to each child's full config.
  const childItems = useMemo<InspectorChildItem[]>(
    () => (selected ? buildChildItems(selected.id, flowNodes, lintByNode) : []),
    [selected, flowNodes, lintByNode]
  );

  // A flat problems list for the floating overview: hints that map to a node are
  // clickable (select the node); the rest are listed inert.
  const problems = useMemo<PipelineProblem[]>(() => {
    const all = lintHints ?? [];
    if (all.length === 0) {
      return [];
    }
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
    for (const hint of all) {
      if (!mapped.has(hint)) {
        list.push({ key: `unmapped-${hint.line}-${hint.hint}`, message: hint.hint, line: hint.line || undefined });
      }
    }
    return list;
  }, [lintHints, lintByNode, flowNodes]);

  // Secrets referenced as ${secrets.X} that don't exist yet — surfaced as a banner
  // with a quick-add flow, so a pasted/templated config is easy to complete.
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

  // Rename a missing secret to an existing one by rewriting the references in YAML (the visual lane
  // has no text editor to patch).
  const handleRenameSecretReferences = useCallback(
    (oldName: string, newName: string) => {
      const updated = yamlContent.replaceAll(`\${secrets.${oldName}}`, `\${secrets.${newName}}`);
      if (updated !== yamlContent) {
        onYamlChange(updated);
      }
    },
    [yamlContent, onYamlChange]
  );

  // Deleting a node is confirmed first (it's destructive, even if ⌘Z can undo it):
  // the trash action / Delete key stage the target, and the dialog commits the removal.
  const [pendingDelete, setPendingDelete] = useState<EditTarget | null>(null);
  const pendingDeleteName = useMemo(() => {
    if (!pendingDelete) {
      return;
    }
    const comp = getComponentAt(yamlContent, pendingDelete);
    return comp ? firstKey(comp) : undefined;
  }, [pendingDelete, yamlContent]);

  // Deleting a resource that other nodes still reference (by label) leaves those references
  // dangling — warn before confirming, so a shared cache/rate-limit isn't silently broken.
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
      if (next !== null) {
        onYamlChange(next);
      } else {
        // Removal can fail on YAML the surgical editor can't safely rewrite (e.g. an anchor
        // referenced elsewhere) — say so rather than silently keeping the node.
        toast.error('Couldn’t remove this node — edit it in the YAML view instead.');
      }
    }
    // Deleting discards any pending edit for the node (don't commit it).
    commitRef.current?.discard();
    setSelected(null);
    setPendingDelete(null);
  }, [pendingDelete, yamlContent, onYamlChange]);

  // Canvas keyboard shortcuts (undo/redo, deselect, delete), dispatched via canvasKeyAction.
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
          setPendingDelete(selected.target);
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
      // With one of the editor's own dialogs open, the canvas shortcuts stay inert (they'd stack the
      // palette, stage a second delete, or mutate YAML under a staged insert). Checked against
      // component state, not a role="dialog" query, so a host-shell dialog can't disable us.
      if (pendingInsert || pendingDelete || isPaletteOpen || isSecretsDialogOpen) {
        return;
      }
      const action = canvasKeyAction(e);
      if (action) {
        handlers[action](e);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEditing, undo, redo, selected, selectNode, pendingInsert, pendingDelete, isPaletteOpen, isSecretsDialogOpen]);

  const handleInsertSelected = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      const target = pendingInsert;
      setPendingInsert(null);
      if (target === null) {
        return;
      }
      const result = buildInsertedYaml({ yaml: yamlContent, connectionName, connectionType, target, components });
      if (result === null) {
        // The insert can fail if the slot's container vanished from the YAML (e.g. an undo while
        // the picker was open) — say so rather than closing the dialog with nothing added.
        toast.error(`Couldn’t add ${connectionName} — the insert position no longer exists.`);
        return;
      }
      onYamlChange(result.yaml);
      // Auto-select (open the inspector on) the node we just added, so it can be configured right
      // away. Found by matching its edit target in the reparse.
      if (result.selectTarget) {
        const added = parsePipelineFlowTree(result.yaml).nodes.find(
          (n) => result.selectTarget && editTargetsEqual(n.editTarget, result.selectTarget)
        );
        if (added?.editTarget) {
          setSelected({ id: added.id, target: added.editTarget, caseTarget: added.caseEditTarget });
        }
      }
    },
    [pendingInsert, components, yamlContent, onYamlChange]
  );

  // In-container "+" affordances: open the picker filtered to the slot's type ("Add case" wraps the
  // chosen first step as a case). Commit any pending inspector edit first — the insert builds on the
  // current YAML and selects the new node, so the in-progress edit would otherwise be lost.
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

  // Stable canvas callbacks — inline arrows here would change identity every render and
  // defeat the canvas's Dagre-layout memo (which keys on these props).
  const handleCanvasSelectNode = useCallback(
    (id: string, target: EditTarget, caseTarget?: EditTarget) => selectNode({ id, target, caseTarget }),
    [selectNode]
  );
  const handleClearSelection = useCallback(() => selectNode(null), [selectNode]);
  const handleSpineInsert = useCallback(
    (index: number) => {
      commitPending();
      setPendingInsert({ context: 'spine', index });
    },
    [commitPending]
  );
  const handleAddConnectorSection = useCallback(
    (section: string) => onAddConnector?.(section as ConnectComponentType),
    [onAddConnector]
  );

  // "Create new resource" from a node's resource field: open the picker filtered to the resource
  // kind; the pick is created and linked in one step.
  const handleRequestCreateResource = useCallback(
    (kind: ResourceKind) => {
      if (selected) {
        // Flush in-progress edits first (as other insert handlers do): the insert re-links the node
        // on the current YAML, so an uncommitted draft would clobber it.
        commitPending();
        setPendingInsert({ context: 'resourceForNode', kind, target: selected.target });
      }
    },
    [selected, commitPending]
  );

  // Command-palette "go to": select the node and recenter the canvas on it. Only nodes with an
  // edit target are listed, so the target is always present.
  const handleJumpToNode = useCallback(
    (node: PipelineFlowNode) => {
      const jump = resolveJumpTarget(node, flowNodes);
      if (!jump) {
        return;
      }
      selectNode({ id: jump.id, target: jump.target, caseTarget: jump.caseTarget });
      setFocus((f) => ({ id: jump.id, token: f.token + 1 }));
    },
    [flowNodes, selectNode]
  );
  const handleJumpToNodeId = useCallback(
    (nodeId: string) => {
      const node = flowNodes.find((n) => n.id === nodeId);
      if (node) {
        handleJumpToNode(node);
      }
    },
    [flowNodes, handleJumpToNode]
  );

  // The slot dictates which component types the picker offers: a nested slot accepts
  // exactly its kind; an output-switch case accepts outputs; a resource link accepts its
  // resource kind; the top-level spine also offers cache/rate-limit resources.
  let insertTypes: ConnectComponentType[] = INSERTABLE_TYPES;
  if (pendingInsert?.context === 'slot') {
    insertTypes = [pendingInsert.accepts];
  } else if (pendingInsert?.context === 'switchCase') {
    insertTypes = [pendingInsert.section];
  } else if (pendingInsert?.context === 'resourceForNode') {
    insertTypes = [pendingInsert.kind];
  }

  // Picker title/placeholder adapt to what's being added: a nested slot or switch case names its
  // exact kind, so an output added inside a switch reads "Insert an output", not "Insert a step".
  const isResourceInsert = pendingInsert?.context === 'resourceForNode';
  const slotKind =
    pendingInsert?.context === 'slot'
      ? pendingInsert.accepts
      : pendingInsert?.context === 'switchCase'
        ? pendingInsert.section
        : undefined;
  let insertTitle = 'Insert a step or resource';
  if (isResourceInsert) {
    insertTitle = `Add ${pendingInsert.kind === 'cache' ? 'cache' : 'rate limit'} resource`;
  } else if (slotKind) {
    insertTitle = `Insert ${INSERT_KIND_LABEL[slotKind]}`;
  }

  return (
    // reducedMotion="user" collapses the rail/flash animations for prefers-reduced-motion —
    // the global CSS rule can't reach these JS-driven motion/react animations.
    <MotionConfig reducedMotion="user">
      <div className="flex h-full w-full">
        <div className="relative min-w-0 flex-1">
          {/* Don't mount the canvas until the config is loaded — otherwise its parse debounce seeds
            with the empty pre-hydration config and briefly renders (and fits) a placeholder graph. */}
          {isLoading ? (
            <PipelineFlowSkeleton />
          ) : (
            <>
              <PipelineFlowCanvas
                configYaml={yamlContent}
                flashNodeIds={flash.ids}
                flashToken={flash.token}
                focusNodeId={focus.id || undefined}
                focusToken={focus.token}
                lintErrorsByNode={lintMessagesByNode}
                onAddConnector={isEditing && onAddConnector ? handleAddConnectorSection : undefined}
                onAddSasl={isEditing ? onAddSasl : undefined}
                onAddTopic={isEditing ? onAddTopic : undefined}
                onClearSelection={handleClearSelection}
                onInsert={isEditing ? handleSpineInsert : undefined}
                onSelectNode={handleCanvasSelectNode}
                onSlotInsert={isEditing ? handleSlotInsert : undefined}
                selectedNodeId={selected?.id}
                selectedTargetKind={selected?.target.kind}
                unsavedNodeIds={unsavedNodeIds}
              />
              {isEditing ? (
                <TooltipProvider>
                  <div className="absolute top-3 left-3 z-10 flex items-center gap-0.5 rounded-md border border-border bg-background/90 p-0.5 shadow-sm backdrop-blur-sm">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button aria-label="Undo" disabled={!canUndo} onClick={undo} size="icon-sm" variant="ghost">
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
                          <Button aria-label="Redo" disabled={!canRedo} onClick={redo} size="icon-sm" variant="ghost">
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
              ) : null}
              <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
                <PipelineProblemsPanel
                  missingSecrets={missingSecrets}
                  onAddSecrets={isEditing ? () => setIsSecretsDialogOpen(true) : undefined}
                  onSelectProblem={(id, target, caseTarget) => {
                    // Select AND recenter — the offending node may be off-screen.
                    selectNode({ id, target, caseTarget });
                    setFocus((f) => ({ id, token: f.token + 1 }));
                  }}
                  problems={problems}
                />
                <PipelineUnsavedPanel nodes={unsavedNodeList} onSelect={handleJumpToNodeId} />
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
                  show={isEditing && offerTemplate}
                />
              ) : null}
            </>
          )}
        </div>

        {/* Inspector rail, mounted only when a node is selected. Animate its width (the flex slot),
          not a transform, so the canvas and its right-anchored minimap/zoom controls glide in
          lockstep instead of snapping shut. */}
        <AnimatePresence>
          {selected ? (
            <motion.aside
              animate={{ width: 384, opacity: 1 }}
              className="relative shrink-0 overflow-hidden border-border border-l bg-background"
              exit={{ width: 0, opacity: 0 }}
              initial={{ width: 0, opacity: 0 }}
              key="node-inspector"
              transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
            >
              {/* Fill the rail's width so the content never leaves a gap; min-width clips it instead
                of reflowing while the width animates. */}
              <div className="absolute inset-0 flex min-w-[24rem] flex-col overflow-hidden">
                <NodeInspector
                  caseTarget={selected.caseTarget}
                  childItems={childItems}
                  commitRef={isEditing ? commitRef : undefined}
                  components={components}
                  lintHints={lintByNode.get(selected.id)}
                  onApply={onYamlChange}
                  onClose={() => selectNode(null)}
                  onCreateResource={isEditing ? handleRequestCreateResource : undefined}
                  onDelete={isEditing ? setPendingDelete : undefined}
                  onOpenInYaml={onNavigateToYaml ? () => onNavigateToYaml(selected.id) : undefined}
                  onSelectChild={(item) => {
                    selectNode({ id: item.id, target: item.target, caseTarget: item.caseTarget });
                    // Recenter on the child so the newly selected node is in view (like the palette jump).
                    setFocus((f) => ({ id: item.id, token: f.token + 1 }));
                  }}
                  readOnly={!isEditing}
                  target={selected.target}
                  yaml={yamlContent}
                />
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>

        <AddConnectorDialog
          components={componentList}
          connectorType={insertTypes}
          isOpen={pendingInsert !== null}
          onAddConnector={handleInsertSelected}
          onCloseAddConnector={() => setPendingInsert(null)}
          searchPlaceholder={
            isResourceInsert ? 'Search caches, rate limits…' : slotKind ? `Search ${slotKind}s…` : 'Search components…'
          }
          title={insertTitle}
        />

        <AddSecretsDialog
          existingSecrets={existingSecrets}
          isOpen={isSecretsDialogOpen}
          missingSecrets={missingSecrets}
          onClose={() => setIsSecretsDialogOpen(false)}
          onSecretsCreated={() => setIsSecretsDialogOpen(false)}
          onUpdateEditorContent={handleRenameSecretReferences}
        />

        <CanvasCommandPalette
          canRedo={canRedo}
          canUndo={canUndo}
          nodes={flowNodes}
          onJumpToNode={handleJumpToNode}
          onOpenChange={setIsPaletteOpen}
          onRedo={isEditing ? redo : undefined}
          onUndo={isEditing ? undo : undefined}
          onViewSelectedInYaml={selected && onNavigateToYaml ? () => onNavigateToYaml(selected.id) : undefined}
          open={isPaletteOpen}
        />

        <AlertDialog onOpenChange={(open) => (open ? undefined : setPendingDelete(null))} open={pendingDelete !== null}>
          <AlertDialogContent>
            <AlertDialogHeader className="text-left">
              <AlertDialogTitle>Remove this node?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingDeleteName ? (
                  <>
                    This removes the <span className="font-mono">{pendingDeleteName}</span> node from the pipeline. You
                    can undo it with {UNDO_SHORTCUT}.
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
                      <span className="font-semibold">{pluralizeWithNumber(pendingDeleteRefCount, 'node')}</span>.
                      Removing it leaves {pendingDeleteRefCount === 1 ? 'that reference' : 'those references'} pointing
                      at a missing resource.
                    </span>
                  </AlertDescription>
                </Alert>
              ) : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel render={<Button variant="secondary-ghost">Cancel</Button>} />
              <AlertDialogAction onClick={confirmDeleteNode} render={<Button variant="destructive">Remove</Button>} />
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MotionConfig>
  );
}
