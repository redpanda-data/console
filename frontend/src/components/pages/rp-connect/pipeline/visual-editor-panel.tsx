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
import { AnimatePresence, motion } from 'motion/react';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import { isMacOS } from 'utils/platform';

import type { InspectorChildItem } from './node-config-form';
import { NodeInspector } from './node-inspector';
import { CanvasCommandPalette } from './pipeline-canvas-command-palette';
import { PipelineFlowCanvas } from './pipeline-flow-canvas';
import { PipelineFlowSkeleton } from './pipeline-flow-nodes';
import { type PipelineProblem, PipelineProblemsPanel } from './pipeline-problems-panel';
import { PipelineUnsavedPanel } from './pipeline-unsaved-panel';
import { TemplateGalleryCta } from './template-cta';
import { usePipelineEditorStore } from './use-pipeline-editor-store';
import { AddConnectorDialog } from '../onboarding/add-connector-dialog';
import { AddSecretsDialog } from '../onboarding/add-secrets-dialog';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import { changedNodeIds } from '../utils/pipeline-diff';
import { type FlowInsertPayload, type PipelineFlowNode, parsePipelineFlowTree } from '../utils/pipeline-flow-parser';
import { mapLintHintsToNodes } from '../utils/pipeline-lint';
import {
  appendResource,
  buildInsertableComponent,
  countResourceReferences,
  createResourceAndReturnLabel,
  type EditTarget,
  firstKey,
  getComponentAt,
  insertComponentAt,
  type ResourceArrayKey,
  type ResourceKind,
  removeComponentAt,
  seqLengthAt,
  setComponentAt,
} from '../utils/yaml';

// What the insertion (+) affordance offers: pipeline steps and the resources
// they reference. Passed to AddConnectorDialog's type filter.
const INSERTABLE_TYPES = ['processor', 'cache', 'rate_limit'] satisfies ConnectComponentType[];

// Stable empty set so the "no unsaved nodes" case doesn't churn the canvas layout memo.
const EMPTY_NODE_IDS: ReadonlySet<string> = new Set();

// Reads the picker title for a typed slot, e.g. "Insert an output" inside a switch.
const INSERT_KIND_LABEL: Record<'input' | 'processor' | 'output', string> = {
  input: 'an input',
  output: 'an output',
  processor: 'a processor',
};

// Where a chosen connector should land: a top-level spine slot (insert into
// pipeline.processors at an index) or a nested container slot (insert into an
// arbitrary YAML array — a switch case, branch, broker, fallback).
type PendingInsert =
  | { context: 'spine'; index: number }
  | { context: 'slot'; containerPath: (string | number)[]; accepts: 'input' | 'processor' | 'output'; index: number }
  // Switch "add case": pick the case's first step, then wrap it as a new case — `{ check, output }`
  // for an output switch or `{ check, processors: [step] }` for a processor switch.
  | { context: 'switchCase'; containerPath: (string | number)[]; section: 'processor' | 'output' }
  // "Create new resource" from a node's resource field: pick the cache/rate_limit impl,
  // create the resource, and link it to `target`'s `resource:` field.
  | { context: 'resourceForNode'; kind: ResourceKind; target: EditTarget };

type InsertParams = {
  yaml: string;
  connectionName: string;
  connectionType: ConnectComponentType;
  target: PendingInsert;
  components: ConnectComponentSpec[];
};

// The routing-condition target for a node carrying a lint problem, so selecting that problem
// opens the inspector on its condition. Output switch: the node owns it; processor switch: the
// case wrapper owns it and this node is the rendered entry (the wrapper's first child).
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

// What a "jump to node" should select + recenter. A processor-switch CASE is a structural wrapper
// with no rendered card (its `editTarget` is the `switchCase` itself); its condition rides its first
// body step. So resolve such a wrapper to that rendered entry, carrying the case's condition target
// so the inspector opens on the case. Every other node jumps to itself. Returns null if unjumpable.
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

// The direct children (cases / steps) of a control-flow node, as clickable inspector items.
// Each maps to the RENDERED child node: an editable child IS the entry (output switch leaf);
// otherwise the case wrapper's first child is (processor switch). Returns [] for leaf nodes.
function buildChildItems(
  selectedId: string,
  flowNodes: PipelineFlowNode[],
  lintByNode: Map<string, LintHint[]>
): InspectorChildItem[] {
  const items: InspectorChildItem[] = [];
  for (const child of flowNodes.filter((n) => n.parentId === selectedId)) {
    // A structural switch-case wrapper (editTarget is the `switchCase` itself, not a real
    // component) isn't navigable as a component — its rendered entry is the first step of its
    // body, so we navigate there (full config) and NAME the row by that node (the type the
    // branch starts with), not "case N". An output-switch case is itself a leaf component.
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

// Structural equality of two edit targets — to find the parsed node for a just-inserted target.
// Path/switchCase targets are identified by their YAML path; the rest by their discriminant fields.
function editTargetsEqual(a: EditTarget | undefined, b: EditTarget): boolean {
  if (a?.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'processor' && b.kind === 'processor') {
    return a.index === b.index;
  }
  if (a.kind === 'resource' && b.kind === 'resource') {
    return a.resourceKey === b.resourceKey && a.index === b.index;
  }
  if ((a.kind === 'path' || a.kind === 'switchCase') && (b.kind === 'path' || b.kind === 'switchCase')) {
    return JSON.stringify(a.path) === JSON.stringify(b.path);
  }
  return true; // input / output — singletons, kind match is enough
}

// Resolve the chosen connector + insertion target to the next YAML (or null if the
// component couldn't be generated). Caches and rate limits always append to their
// top-level resource arrays (they're referenced, not nested); every other component
// splices into the target container array.
function buildInsertedYaml({
  yaml,
  connectionName,
  connectionType,
  target,
  components,
}: InsertParams): InsertResult | null {
  // Switch case: wrap the chosen step in a new case (default condition; edited afterwards) appended
  // to the switch's cases — `{ check, output }` for an output switch, `{ check, processors: [step] }`
  // for a processor switch. Select the step inside the new case (its config is what the user fills in).
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
  // Create the chosen cache/rate_limit resource and link it to the node's `resource:`
  // field in one commit — so the new resource is never left unlinked. (No re-select: the
  // currently-selected node stays — it just got the link.)
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
    const resourceKey: ResourceArrayKey = connectionType === 'cache' ? 'cache_resources' : 'rate_limit_resources';
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
    // The target here is a spine or slot insert — both carry an index, and the spine
    // targets the top-level processors array.
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

// Keyboard shortcuts shown in the undo/redo tooltips, using the conventions of the
// user's platform (⌘ on macOS, Ctrl elsewhere).
const MAC = isMacOS();
const UNDO_SHORTCUT = MAC ? '⌘Z' : 'Ctrl+Z';
const REDO_SHORTCUT = MAC ? '⌘⇧Z' : 'Ctrl+Shift+Z';

const ShortcutLabel = ({ label, keys }: { label: string; keys: string }) => (
  <span className="flex items-center gap-2">
    {label}
    <Kbd size="xs" variant="filled">
      {keys}
    </Kbd>
  </span>
);

// Classify a canvas keydown, ignoring presses inside a text field or the Monaco
// YAML editor (which have their own undo / editing semantics).
type CanvasKeyAction = 'undo' | 'redo' | 'deselect' | 'delete' | 'palette';

function canvasKeyAction(e: KeyboardEvent): CanvasKeyAction | null {
  if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"], .monaco-editor')) {
    return null;
  }
  // `/` opens the command palette (the GitHub/Slack "focus search" convention). ⌘K is taken by the
  // outer app-shell search, so the canvas uses its own non-conflicting key.
  if (e.key === '/') {
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

// Undo/redo for visual edits: the YAML lane has Monaco's native undo, but visual mutations write
// YAML directly, so this keeps a history of YAML snapshots for ⌘Z / ⌘⇧Z. The history lives in the
// store (not local state) so it SURVIVES switching to the YAML lane and back; `recordEdit` no-ops
// on an unchanged round-trip, and records an external (Monaco) edit as one step when seen on return.
function useEditHistory(
  yaml: string,
  onChange: (next: string) => void,
  onNavigate?: (from: string, to: string) => void
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
    const target = undoStack.at(-1) as string;
    commitEditHistory({ undo: undoStack.slice(0, -1), redo: [baseline, ...redoStack], baseline: target });
    onChange(target);
    onNavigate?.(baseline, target);
  }, [undoStack, redoStack, baseline, commitEditHistory, onChange, onNavigate]);

  const redo = useCallback(() => {
    if (redoStack.length === 0 || baseline === null) {
      return;
    }
    const target = redoStack[0];
    commitEditHistory({ undo: [...undoStack, baseline], redo: redoStack.slice(1), baseline: target });
    onChange(target);
    onNavigate?.(baseline, target);
  }, [undoStack, redoStack, baseline, commitEditHistory, onChange, onNavigate]);

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

  // Inspector edits auto-commit on leave / save (no per-node Apply). The inspector populates
  // `commitRef` with a pure `(yaml) => yaml` that applies the selected node's pending edits; we
  // call it BEFORE any selection change and on pipeline save, so leaving a node commits its edits.
  const commitRef = useRef<((yaml: string) => string) | null>(null);
  const yamlRef = useRef(yamlContent);
  yamlRef.current = yamlContent;
  const commitPending = useCallback(() => {
    const commit = commitRef.current;
    if (!commit) {
      return;
    }
    // One-shot: clear the hook before applying so the SAME pending edit can't be committed twice
    // (e.g. the rail's exit animation keeps the inspector briefly mounted after a deselect — a
    // follow-up selection must not re-apply the just-committed draft). The inspector re-registers
    // its commit on its next render.
    commitRef.current = null;
    const next = commit(yamlRef.current);
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

  // Mirror the selection into the shared store so switching to the YAML lane can
  // reveal the same node (the lanes are separate component trees).
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

  const { undo, redo, canUndo, canRedo } = useEditHistory(yamlContent, onYamlChange, handleNavigate);

  const flowNodes = useMemo(() => parsePipelineFlowTree(yamlContent).nodes, [yamlContent]);

  // A freshly-started pipeline (only section labels / `none` placeholders) gets the
  // floating "Start from a template" entry point.
  const isPipelineEmpty = useMemo(
    () => !flowNodes.some((n) => n.kind === 'group' || (n.kind === 'leaf' && n.label !== 'none')),
    [flowNodes]
  );

  // Associate server lint hints with the nodes they belong to, so they show in
  // context (a badge on the node, full messages in the inspector).
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

  // The selected control-flow node's children, shown as a clickable list in its inspector so
  // the high-level construct links straight to each child's full config.
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

  // Renaming a missing secret to an existing one from the dialog rewrites the
  // references in the pipeline YAML (the visual lane has no text editor to patch).
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
    return label ? countResourceReferences(yamlContent, label) : 0;
  }, [pendingDelete, yamlContent]);

  const confirmDeleteNode = useCallback(() => {
    if (pendingDelete) {
      const next = removeComponentAt(yamlContent, pendingDelete);
      if (next !== null) {
        onYamlChange(next);
      }
    }
    // Deleting discards any pending edit for the node (don't commit it), so clear the commit hook.
    commitRef.current = null;
    setSelected(null);
    setPendingDelete(null);
  }, [pendingDelete, yamlContent, onYamlChange]);

  // Canvas keyboard: ⌘Z/⌘⇧Z undo/redo, Escape deselects, Delete/Backspace removes
  // the selected node — all ignored while typing in a field or the YAML editor.
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
      const action = canvasKeyAction(e);
      if (action) {
        handlers[action](e);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEditing, undo, redo, selected, selectNode]);

  const handleInsertSelected = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      const target = pendingInsert;
      setPendingInsert(null);
      if (target === null) {
        return;
      }
      const result = buildInsertedYaml({ yaml: yamlContent, connectionName, connectionType, target, components });
      if (result === null) {
        return;
      }
      onYamlChange(result.yaml);
      // Auto-select the node we just added (open its inspector), so the user can configure it right
      // away instead of hunting for it. Found by matching the new node's edit target in the reparse.
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

  // The in-container "+" affordances: open the picker filtered to the slot's type. "Add case" on a
  // switch opens it too (pick the case's first step, then it's wrapped as a case) — rather than
  // dropping an empty case the user then has to find and fill. Commit any pending inspector edit
  // first: the insert builds on the current YAML, and we'll select the new node (dropping the old
  // selection), so the in-progress edit must be flushed now rather than lost.
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

  // "Create new resource" from a node's resource field: open the picker filtered to the
  // resource kind (memory/redis/memcached, …); the pick is created and linked together.
  const handleRequestCreateResource = useCallback(
    (kind: ResourceKind) => {
      if (selected) {
        setPendingInsert({ context: 'resourceForNode', kind, target: selected.target });
      }
    },
    [selected]
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

  // The picker's title/placeholder adapt to what's being added — a nested slot (or a switch case)
  // names its exact kind, so an output added inside a switch reads "Insert an output", not the
  // generic "Insert a step".
  const isResourceInsert = pendingInsert?.context === 'resourceForNode';
  const slotKind =
    pendingInsert?.context === 'slot'
      ? pendingInsert.accepts
      : pendingInsert?.context === 'switchCase'
        ? pendingInsert.section
        : undefined;
  let insertTitle = 'Insert a step';
  if (isResourceInsert) {
    insertTitle = `Add ${pendingInsert.kind === 'cache' ? 'cache' : 'rate limit'} resource`;
  } else if (slotKind) {
    insertTitle = `Insert ${INSERT_KIND_LABEL[slotKind]}`;
  }

  return (
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
                onSelectProblem={(id, target, caseTarget) => selectNode({ id, target, caseTarget })}
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
                show={isEditing && isPipelineEmpty}
              />
            ) : null}
          </>
        )}
      </div>

      {/* Inspector rail (Figma-style): mounted only when a node is selected. We animate
          its WIDTH (the flex slot) rather than a transform, so the canvas — and its
          right-anchored minimap / zoom controls — glide in lockstep instead of snapping
          when the rail finishes closing. The content is pinned to the rail's right edge
          at a fixed width so it doesn't reflow while the width animates. */}
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
            {/* Fill the rail's actual width (so the content never leaves a gap), with a
                min-width so it clips rather than reflows while the width animates. */}
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
                onSelectChild={(item) => selectNode({ id: item.id, target: item.target, caseTarget: item.caseTarget })}
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
                  can undo it with {MAC ? '⌘Z' : 'Ctrl+Z'}.
                </>
              ) : (
                <>This removes the node from the pipeline. You can undo it with {MAC ? '⌘Z' : 'Ctrl+Z'}.</>
              )}
            </AlertDialogDescription>
            {pendingDeleteRefCount > 0 ? (
              <div className="mt-1 flex items-start gap-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  This resource is still referenced by{' '}
                  <span className="font-semibold">
                    {pendingDeleteRefCount} {pendingDeleteRefCount === 1 ? 'node' : 'nodes'}
                  </span>
                  . Removing it leaves {pendingDeleteRefCount === 1 ? 'that reference' : 'those references'} pointing at
                  a missing resource.
                </span>
              </div>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="secondary-ghost">Cancel</Button>} />
            <AlertDialogAction onClick={confirmDeleteNode} render={<Button variant="destructive">Remove</Button>} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
