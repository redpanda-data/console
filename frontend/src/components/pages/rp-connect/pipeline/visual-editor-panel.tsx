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

import { type LintHint, LintHintSchema } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { create } from '@bufbuild/protobuf';
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
import { formatShortcut, modKey, shiftKey } from 'utils/shortcuts';
import { pluralizeWithNumber } from 'utils/string';
import { showToast } from 'utils/toast.utils';

import type { InspectorChildItem } from './node-config-form';
import { NodeInspector, type PendingNodeCommit } from './node-inspector';
import { CanvasCommandPalette } from './pipeline-canvas-command-palette';
import { PipelineEndChip } from './pipeline-end-chip';
import { PipelineFlowCanvas } from './pipeline-flow-canvas';
import { PipelineFlowSkeleton } from './pipeline-flow-skeleton';
import { type PipelineProblem, PipelineProblemsPanel } from './pipeline-problems-panel';
import { PipelineUnsavedPanel } from './pipeline-unsaved-panel';
import { TemplateGalleryCta } from './template-cta';
import { usePipelineEditorStore } from './use-pipeline-editor-store';
import { AddConnectorDialog } from '../onboarding/add-connector-dialog';
import { AddSecretsDialog } from '../onboarding/add-secrets-dialog';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import { deprecationMessage, findDeprecatedUsages } from '../utils/deprecation';
import { pipelineEndStatus } from '../utils/input-end-behavior';
import { changedNodeIds, changedNodeIdsFromBaseline, nodeConfigSignatures } from '../utils/pipeline-diff';
import type { FlowInsertPayload } from '../utils/pipeline-flow-layout';
import {
  inputEndRows,
  type PipelineFlowNode,
  parsePipelineFlowTree,
  shouldOfferTemplate,
} from '../utils/pipeline-flow-parser';
import { mapLintHintsToNodes } from '../utils/pipeline-lint';
import {
  resolveStopCondition,
  type StopConditionDraft,
  sameStopCondition,
  setStopCondition,
} from '../utils/read-until';
import {
  appendResource,
  buildInsertableComponent,
  componentKeyAt,
  countResourceReferences,
  createResourceAndReturnLabel,
  type EditTarget,
  editTargetsEqual,
  firstKey,
  getComponentAt,
  insertComponentAt,
  isStopConditionSet,
  type ResourceArrayKey,
  type ResourceKind,
  removeComponentAt,
  resourceArrayKey,
  resourceTargetKind,
  seqLengthAt,
  setComponentAt,
} from '../utils/yaml';

const INSERTABLE_TYPES = ['processor', 'cache', 'rate_limit'] satisfies ConnectComponentType[];

const EMPTY_NODE_IDS: ReadonlySet<string> = new Set();

const INSERT_KIND_LABEL: Record<'input' | 'processor' | 'output', string> = {
  input: 'an input',
  output: 'an output',
  processor: 'a processor',
};

type PendingInsert =
  | { context: 'spine'; index: number }
  | { context: 'slot'; containerPath: (string | number)[]; accepts: 'input' | 'processor' | 'output'; index: number }
  | { context: 'switchCase'; containerPath: (string | number)[]; section: 'processor' | 'output' }
  | { context: 'resourceForNode'; kind: ResourceKind; target: EditTarget };

type InsertParams = {
  yaml: string;
  connectionName: string;
  connectionType: ConnectComponentType;
  target: PendingInsert;
  components: ConnectComponentSpec[];
};

function caseTargetForNode(node: PipelineFlowNode | undefined, flowNodes: PipelineFlowNode[]) {
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

function buildChildItems(selectedId: string, flowNodes: PipelineFlowNode[], lintByNode: Map<string, LintHint[]>) {
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

function componentNameAt(yaml: string, target: EditTarget) {
  const comp = getComponentAt(yaml, target);
  return comp ? componentKeyAt(target, comp) : undefined;
}

type InsertResult = { yaml: string; selectTarget?: EditTarget };

type SwitchCaseInsert = Extract<PendingInsert, { context: 'switchCase' }>;
type ResourceForNodeInsert = Extract<PendingInsert, { context: 'resourceForNode' }>;
type IndexedInsert = Extract<PendingInsert, { context: 'spine' | 'slot' }>;

function wrapAsCase(section: SwitchCaseInsert['section'], step: Record<string, unknown>): Record<string, unknown> {
  return section === 'output' ? { check: '', output: step } : { check: '', processors: [step] };
}

function caseStepPath(target: SwitchCaseInsert, caseIndex: number) {
  return target.section === 'output'
    ? [...target.containerPath, caseIndex, 'output']
    : [...target.containerPath, caseIndex, 'processors', 0];
}

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

function linkResourceToNode(yaml: string, target: EditTarget, label: string) {
  const comp = getComponentAt(yaml, target);
  const name = comp ? firstKey(comp) : undefined;
  const inner = name ? comp?.[name] : undefined;
  if (!(comp && name && inner && typeof inner === 'object' && !Array.isArray(inner))) {
    return yaml;
  }
  (inner as Record<string, unknown>).resource = label;
  return setComponentAt(yaml, target, comp) ?? yaml;
}

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
  const insertedIndex = Math.min(target.index, seqLengthAt(next, containerPath) - 1);
  const selectTarget: EditTarget =
    target.context === 'slot'
      ? { kind: 'path', path: [...containerPath, insertedIndex], componentType: target.accepts }
      : { kind: 'processor', index: insertedIndex };
  return { yaml: next, selectTarget };
}

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

type CanvasKeyAction = 'undo' | 'redo' | 'deselect' | 'delete' | 'palette';

// WARNING: Keep editor hotkeys off focused controls; Delete and / must not remove a node or open the palette while typing.
const FOCUS_GUARD_SELECTOR =
  'input, textarea, select, button, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"], [role="switch"], [role="radio"], [role="checkbox"], [data-slot="popover-content"], .monaco-editor';

function plainCanvasKeyAction(e: KeyboardEvent): CanvasKeyAction | null {
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
  if (e.defaultPrevented) {
    return null;
  }
  const target = e.target as HTMLElement | null;
  if (target?.closest(FOCUS_GUARD_SELECTOR)) {
    return null;
  }
  return plainCanvasKeyAction(e) ?? historyKeyAction(e);
}

function useEditHistory(
  yaml: string,
  onChange: (next: string) => void,
  onNavigate?: (from: string, to: string) => void,
  beforeApply?: () => void
) {
  const undoStack = usePipelineEditorStore((s) => s.editUndoStack);
  const redoStack = usePipelineEditorStore((s) => s.editRedoStack);
  const baseline = usePipelineEditorStore((s) => s.editBaseline);
  const recordEdit = usePipelineEditorStore((s) => s.recordEdit);
  const commitEditHistory = usePipelineEditorStore((s) => s.commitEditHistory);

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
type SelectedNode = NodeRef & { name?: string };

function usePendingNodeCommit(yamlContent: string, onYamlChange: (yaml: string) => void) {
  const commitRef = useRef<PendingNodeCommit | null>(null);
  const yamlRef = useRef(yamlContent);
  yamlRef.current = yamlContent;
  const commitPending = useCallback(() => {
    const pending = commitRef.current;
    if (!pending) {
      return yamlRef.current;
    }
    const next = pending.commit(yamlRef.current);
    if (next !== yamlRef.current) {
      onYamlChange(next);
      yamlRef.current = next;
    }
    return next;
  }, [onYamlChange]);

  const setPendingEditCommit = usePipelineEditorStore((s) => s.setPendingEditCommit);
  useEffect(() => {
    setPendingEditCommit(commitPending);
    return () => setPendingEditCommit(null);
  }, [commitPending, setPendingEditCommit]);

  return { commitRef, yamlRef, commitPending };
}

function useInspectorSelection(yamlContent: string, onYamlChange: (yaml: string) => void) {
  const { commitRef, yamlRef, commitPending } = usePendingNodeCommit(yamlContent, onYamlChange);
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [focus, setFocus] = useState<{ id: string; token: number }>({ id: '', token: 0 });

  const selectNode = useCallback(
    (next: NodeRef | null) => {
      commitPending();
      setSelected(next ? { ...next, name: componentNameAt(yamlRef.current, next.target) } : null);
    },
    [commitPending, yamlRef]
  );
  const selectAndReveal = useCallback(
    (next: NodeRef) => {
      selectNode(next);
      setFocus((f) => ({ id: next.id, token: f.token + 1 }));
    },
    [selectNode]
  );
  const dropSelection = useCallback(() => {
    commitRef.current?.discard();
    setSelected(null);
  }, [commitRef]);

  const setSelectedNodeId = usePipelineEditorStore((s) => s.setSelectedNodeId);
  useEffect(() => {
    setSelectedNodeId(selected?.id ?? null);
  }, [selected, setSelectedNodeId]);

  return {
    commitRef,
    yamlRef,
    commitPending,
    selected,
    setSelected,
    focus,
    selectNode,
    selectAndReveal,
    dropSelection,
  };
}

type InspectorSelection = ReturnType<typeof useInspectorSelection>;

function liveSelectionOf(
  selected: SelectedNode | null,
  yamlContent: string,
  flowNodes: PipelineFlowNode[]
): SelectedNode | null {
  if (!selected) {
    return null;
  }
  const comp = getComponentAt(yamlContent, selected.target);
  if (comp !== undefined && (selected.name === undefined || componentKeyAt(selected.target, comp) === selected.name)) {
    return selected;
  }
  const moved = flowNodes.find((n) => n.id === selected.id)?.editTarget;
  return moved && !editTargetsEqual(moved, selected.target) && componentNameAt(yamlContent, moved) === selected.name
    ? { ...selected, target: moved }
    : null;
}

function useLiveSelection(selection: InspectorSelection, yamlContent: string, flowNodes: PipelineFlowNode[]) {
  const { selected, setSelected, dropSelection } = selection;
  const liveSelected = useMemo(
    () => liveSelectionOf(selected, yamlContent, flowNodes),
    [selected, yamlContent, flowNodes]
  );
  useEffect(() => {
    if (liveSelected === selected) {
      return;
    }
    if (liveSelected) {
      setSelected(liveSelected);
    } else {
      dropSelection();
    }
  }, [liveSelected, selected, setSelected, dropSelection]);
  return liveSelected satisfies SelectedNode | null;
}

function useCanvasHistory(
  yamlContent: string,
  onYamlChange: (yaml: string) => void,
  commitRef: InspectorSelection['commitRef']
) {
  const [flash, setFlash] = useState<{ ids: ReadonlySet<string>; token: number }>({ ids: new Set(), token: 0 });
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const unsavedNodeList = useMemo(
    () =>
      flowNodes
        .filter((n) => unsavedNodeIds.has(n.id) && n.editTarget)
        .map((n) => ({ id: n.id, label: n.label, detail: n.labelText })),
    [flowNodes, unsavedNodeIds]
  );
  return { unsavedNodeIds, unsavedNodeList };
}

function nodeProblems(lintByNode: Map<string, LintHint[]>, flowNodes: PipelineFlowNode[]) {
  const nodesById = new Map(flowNodes.map((n) => [n.id, n]));
  const mapped = new Set<LintHint>();
  const list: PipelineProblem[] = [];
  for (const [nodeId, hints] of lintByNode) {
    const node = nodesById.get(nodeId);
    const caseTarget = caseTargetForNode(node, flowNodes);
    for (const hint of hints) {
      mapped.add(hint);
      list.push({
        key: `${nodeId}-${hint.line}:${hint.column}-${hint.hint}`,
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
    .map((hint) => ({
      key: `unmapped-${hint.line}:${hint.column}-${hint.hint}`,
      message: hint.hint,
      line: hint.line || undefined,
    }));
  return [...list, ...unmapped];
}

function hintMessagesByNode(hintsByNode: Map<string, LintHint[]>) {
  return new Map([...hintsByNode].map(([id, hints]) => [id, hints.map((h) => h.hint)]));
}

function useDeprecations(yamlContent: string, components: ConnectComponentSpec[], flowNodes: PipelineFlowNode[]) {
  const hints = useMemo(
    () =>
      findDeprecatedUsages(yamlContent, components).map(({ notice, range }) =>
        create(LintHintSchema, {
          line: range.startLineNumber,
          column: range.startColumn,
          hint: deprecationMessage(notice),
        })
      ),
    [yamlContent, components]
  );
  const byNode = useMemo(() => mapLintHintsToNodes(yamlContent, hints), [yamlContent, hints]);
  const deprecationsByNode = useMemo(() => hintMessagesByNode(byNode), [byNode]);
  const deprecations = useMemo(() => buildProblems(hints, byNode, flowNodes), [hints, byNode, flowNodes]);
  return { deprecationsByNode, deprecations };
}

type FlowOverviewOptions = {
  yamlContent: string;
  components: ConnectComponentSpec[];
  lintHints?: LintHint[];
  isEditing: boolean;
  selectedId?: string;
};

function useFlowOverview({ yamlContent, components, lintHints, isEditing, selectedId }: FlowOverviewOptions) {
  const flowNodes = useMemo(() => parsePipelineFlowTree(yamlContent).nodes, [yamlContent]);
  const offerTemplate = useMemo(() => shouldOfferTemplate(yamlContent, flowNodes), [yamlContent, flowNodes]);

  const lintByNode = useMemo(() => mapLintHintsToNodes(yamlContent, lintHints ?? []), [yamlContent, lintHints]);
  const lintMessagesByNode = useMemo(() => hintMessagesByNode(lintByNode), [lintByNode]);
  const { unsavedNodeIds, unsavedNodeList } = useUnsavedNodes(yamlContent, isEditing, flowNodes);

  const childItems = useMemo<InspectorChildItem[]>(
    () => (selectedId ? buildChildItems(selectedId, flowNodes, lintByNode) : []),
    [selectedId, flowNodes, lintByNode]
  );
  const problems = useMemo(
    () => buildProblems(lintHints ?? [], lintByNode, flowNodes),
    [lintHints, lintByNode, flowNodes]
  );
  const { deprecationsByNode, deprecations } = useDeprecations(yamlContent, components, flowNodes);
  const pipelineEnd = useMemo(() => {
    const top = flowNodes.find((n) => n.section === 'input' && n.parentId === 'section-input' && n.endBehavior);
    return { status: pipelineEndStatus(top?.endBehavior), behavior: top?.endBehavior, rows: inputEndRows(flowNodes) };
  }, [flowNodes]);

  return {
    flowNodes,
    offerTemplate,
    lintByNode,
    lintMessagesByNode,
    deprecationsByNode,
    deprecations,
    unsavedNodeIds,
    unsavedNodeList,
    childItems,
    problems,
    pipelineEnd,
  };
}

type FlowOverview = ReturnType<typeof useFlowOverview>;

function useMissingSecrets(yamlContent: string, isEditing: boolean, onYamlChange: (yaml: string) => void) {
  const { data: secretsResponse } = useListSecretsQuery({}, { enabled: isEditing });
  const [isSecretsDialogOpen, setIsSecretsDialogOpen] = useState(false);
  const existingSecrets = useMemo(
    () => (secretsResponse?.secrets ? secretsResponse.secrets.map((s) => s?.id || '').filter(Boolean) : []),
    [secretsResponse]
  );
  const missingSecrets = useMemo(() => {
    if (!(isEditing && secretsResponse)) {
      return [];
    }
    const referenced = getUniqueSecretNames(extractSecretReferences(yamlContent));
    const existingSet = new Set(existingSecrets);
    return referenced.filter((name) => !existingSet.has(name));
  }, [isEditing, secretsResponse, yamlContent, existingSecrets]);

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

function usePendingDelete(
  yamlContent: string,
  onYamlChange: (yaml: string) => void,
  dropSelection: () => void,
  flowNodes: PipelineFlowNode[]
) {
  const [pendingDelete, setPendingDelete] = useState<EditTarget | null>(null);
  const pendingDeleteComponent = useMemo(
    () => (pendingDelete ? getComponentAt(yamlContent, pendingDelete) : undefined),
    [pendingDelete, yamlContent]
  );
  const pendingDeleteName =
    pendingDelete && pendingDeleteComponent ? componentKeyAt(pendingDelete, pendingDeleteComponent) : undefined;
  const pendingDeleteHasStop = isStopConditionSet(
    pendingDelete
      ? flowNodes.find((n) => editTargetsEqual(n.editTarget, pendingDelete))?.stopSlot?.condition
      : undefined
  );

  const pendingDeleteRefCount = useMemo(() => {
    if (pendingDelete?.kind !== 'resource') {
      return 0;
    }
    const comp = getComponentAt(yamlContent, pendingDelete);
    const label = comp && typeof comp.label === 'string' ? comp.label : undefined;
    // WARNING: Match resource references by kind; a same-labelled resource of a different kind must not trigger a deletion warning.
    return label ? countResourceReferences(yamlContent, label, resourceTargetKind(pendingDelete)) : 0;
  }, [pendingDelete, yamlContent]);

  const confirmDeleteNode = useCallback(() => {
    if (pendingDelete) {
      const next = removeComponentAt(yamlContent, pendingDelete);
      if (next === null) {
        showToast({ status: 'error', title: 'Couldn’t remove this node — edit it in the YAML view instead.' });
      } else {
        onYamlChange(next);
      }
    }
    dropSelection();
    setPendingDelete(null);
  }, [pendingDelete, yamlContent, onYamlChange, dropSelection]);

  return {
    pendingDelete,
    setPendingDelete,
    pendingDeleteName,
    pendingDeleteHasStop,
    pendingDeleteRefCount,
    confirmDeleteNode,
  };
}

type PendingDelete = ReturnType<typeof usePendingDelete>;

type StopConditionEdit = { yaml: string } | { error: string };

function stopConditionEdit(
  yaml: string,
  nodes: PipelineFlowNode[],
  nodeId: string,
  draft: StopConditionDraft | null
): StopConditionEdit | null {
  const slot = nodes.find((n) => n.id === nodeId)?.stopSlot;
  if (!slot) {
    return { error: 'Couldn’t find that input any more — it may have been removed.' };
  }
  const stop = draft ? resolveStopCondition(slot.condition, draft) : null;
  if (isStopConditionSet(stop) ? sameStopCondition(stop, slot.condition) : !slot.condition) {
    return null;
  }
  const next = setStopCondition(yaml, slot.path, stop);
  if (next === null || next === yaml) {
    return { error: 'Couldn’t update the stop condition — edit it in the YAML view instead.' };
  }
  return { yaml: next };
}

function applyStopEdit(edit: ReturnType<typeof stopConditionEdit>, onYamlChange: (yaml: string) => void) {
  if (edit && 'error' in edit) {
    showToast({ id: 'rpcn-stop-condition-edit', status: 'error', title: edit.error });
    return false;
  }
  if (edit) {
    onYamlChange(edit.yaml);
  }
  return true;
}

function useSetStopCondition(
  yamlContent: string,
  flowNodes: PipelineFlowNode[],
  selection: InspectorSelection,
  onYamlChange: (yaml: string) => void
) {
  const { yamlRef, commitPending } = selection;
  const recordEdit = usePipelineEditorStore((s) => s.recordEdit);
  return useCallback(
    (nodeId: string, draft: StopConditionDraft | null) => {
      const before = yamlRef.current;
      const yaml = commitPending();
      if (yaml !== before) {
        recordEdit(yaml);
      }
      const nodes = yaml === yamlContent ? flowNodes : parsePipelineFlowTree(yaml).nodes;
      return applyStopEdit(stopConditionEdit(yaml, nodes, nodeId, draft), onYamlChange);
    },
    [yamlRef, commitPending, flowNodes, onYamlChange, recordEdit, yamlContent]
  );
}

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

function applyInsertResult(
  result: InsertResult | null,
  connectionName: string,
  { onYamlChange, select }: { onYamlChange: (yaml: string) => void; select: (next: SelectedNode) => void }
) {
  if (result === null) {
    showToast({ status: 'error', title: `Couldn’t add ${connectionName} — the insert position no longer exists.` });
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

// WARNING: Commit the active inspector draft before inserting; the insert otherwise starts from stale YAML and drops that edit.
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

  const handleRequestCreateResource = useCallback(
    (kind: ResourceKind) => {
      if (selected) {
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
  dialogOpen: boolean;
};

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

function useSelectionEntryPoints(
  flowNodes: PipelineFlowNode[],
  selection: InspectorSelection,
  onNavigateToYaml: VisualEditorPanelProps['onNavigateToYaml']
) {
  const { selected, selectNode, selectAndReveal } = selection;
  const selectFromCanvas = useCallback(
    (id: string, target: EditTarget, caseTarget?: EditTarget) => selectNode({ id, target, caseTarget }),
    [selectNode]
  );
  const clearSelection = useCallback(() => selectNode(null), [selectNode]);

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

  const openSelectedInYaml = selected && onNavigateToYaml ? () => onNavigateToYaml(selected.id) : undefined;

  return { selectFromCanvas, clearSelection, jumpToNode, jumpToNodeId, openSelectedInYaml };
}

type SelectionEntryPoints = ReturnType<typeof useSelectionEntryPoints>;

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

function insertSlotKind(pending: PendingInsert | null) {
  if (pending?.context === 'slot') {
    return pending.accepts;
  }
  if (pending?.context === 'switchCase') {
    return pending.section;
  }
}

function insertPickerCopy(pending: PendingInsert | null) {
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
    (section: string) => onAddConnector?.(section as ConnectComponentType),
    [onAddConnector]
  );

  return (
    <div className="relative min-w-0 flex-1">
      {isLoading ? (
        <PipelineFlowSkeleton />
      ) : (
        <>
          <PipelineFlowCanvas
            configYaml={yamlContent}
            deprecationsByNode={overview.deprecationsByNode}
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
            onSetStopCondition={isEditing ? setStop : undefined}
            onSlotInsert={isEditing ? insert.handleSlotInsert : undefined}
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
          <div className="absolute inset-0 flex min-w-[24rem] flex-col overflow-hidden border-l border-border bg-background">
            <NodeInspector
              caseTarget={selected.caseTarget}
              childItems={overview.childItems}
              commitRef={isEditing ? commitRef : undefined}
              components={components}
              deprecations={overview.deprecationsByNode.get(selected.id)}
              lintHints={overview.lintByNode.get(selected.id)}
              nodeId={selected.id}
              onAddTopic={isEditing ? onAddTopic : undefined}
              onApply={onYamlChange}
              onClose={() => selectNode(null)}
              onCreateResource={isEditing ? insert.handleRequestCreateResource : undefined}
              onDelete={isEditing ? stageDelete : undefined}
              onOpenInYaml={entryPoints.openSelectedInYaml}
              onRequestCommit={isEditing ? commitPending : undefined}
              onSelectChild={selectAndReveal}
              onSetStopCondition={
                isEditing && selectedFlowNode?.stopSlot ? (draft) => setStop(selected.id, draft) : undefined
              }
              readOnly={!isEditing}
              resetToken={history.formEpoch}
              stop={
                selectedFlowNode?.stopSlot && selectedFlowNode.endBehavior
                  ? {
                      slot: selectedFlowNode.stopSlot,
                      effective: selectedFlowNode.endBehavior,
                      isGroup: selectedFlowNode.kind === 'group',
                    }
                  : undefined
              }
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
            {pendingDeleteName ? (
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
 *
 * After hydration, opens the canvas without first parsing placeholder YAML. Keyboard shortcuts leave focused editing controls alone.
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
