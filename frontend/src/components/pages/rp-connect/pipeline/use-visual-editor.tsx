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
import { extractSecretReferences, getUniqueSecretNames } from 'components/ui/secret/secret-detection';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import { showToast } from 'utils/toast.utils';

import type { InspectorChildItem } from './node-config-form';
import type { PendingNodeCommit } from './node-inspector';
import { type CanvasKeyAction, canvasKeyAction, useEditHistory } from './pipeline-canvas-history';
import type { PipelineProblem } from './pipeline-problems-panel';
import {
  buildChildItems,
  buildInsertedYaml,
  caseTargetForNode,
  componentNameAt,
  EMPTY_NODE_IDS,
  INSERT_KIND_LABEL,
  INSERTABLE_TYPES,
  type InsertResult,
  type PendingInsert,
  resolveJumpTarget,
} from './pipeline-visual-editing';
import { usePipelineEditorStore } from './use-pipeline-editor-store';
import { nonzeroNumber } from '../../../../utils/number-utils';
import { AddConnectorDialog } from '../onboarding/add-connector-dialog';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import { deprecationMessage, findDeprecatedUsages } from '../utils/deprecation';
import { pipelineEndStatus } from '../utils/input-end-behavior';
import { changedNodeIds, changedNodeIdsFromBaseline, nodeConfigSignatures } from '../utils/pipeline-diff';
import type { FlowInsertPayload } from '../utils/pipeline-flow-layout';
import { inputEndRows, type PipelineFlowNode } from '../utils/pipeline-flow-nodes';
import { parsePipelineFlowTree, shouldOfferTemplate } from '../utils/pipeline-flow-parser';
import { mapLintHintsToNodes } from '../utils/pipeline-lint';
import {
  resolveStopCondition,
  type StopConditionDraft,
  sameStopCondition,
  setStopCondition,
} from '../utils/read-until';
import { getComponentAt, removeComponentAt } from '../utils/yaml-component-editing';
import { componentKeyAt, type EditTarget, editTargetsEqual } from '../utils/yaml-edit-target';
import { countResourceReferences, type ResourceKind, resourceTargetKind } from '../utils/yaml-resources';
import { isStopConditionSet } from '../utils/yaml-values';

export type VisualEditorPanelProps = {
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
  // Speculative renders must not replace the document that an active Save handler flushes.
  useLayoutEffect(() => {
    yamlRef.current = yamlContent;
  }, [yamlContent]);
  // Returns the YAML after the flush, for a caller that edits on top of it in the same tick.
  const commitPending = useCallback((): string => {
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
export function useInspectorSelection(yamlContent: string, onYamlChange: (yaml: string) => void) {
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

export type InspectorSelection = ReturnType<typeof useInspectorSelection>;

// The selection against the current YAML: as is; followed to its new path when it moves but stays the
// same node (a broker member, when the broker's own stop condition wraps or unwraps it); or null once
// an undo/redo or external edit removes the node or puts a different component at its positional target.
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
  // Followed only to a target that really holds the component, so this settles in one sync.
  const moved = flowNodes.find((n) => n.id === selected.id)?.editTarget;
  return moved && !editTargetsEqual(moved, selected.target) && componentNameAt(yamlContent, moved) === selected.name
    ? { ...selected, target: moved }
    : null;
}

// The selection the inspector shows (see liveSelectionOf), with the state kept in step with it and a
// vanished node's stale draft dropped.
export function useLiveSelection(
  selection: InspectorSelection,
  yamlContent: string,
  flowNodes: PipelineFlowNode[]
): SelectedNode | null {
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
  return liveSelected;
}

// Undo/redo plus its feedback: a brief pulse on the node(s) a step touched, so the change is easy to
// spot, and an inspector-form remount onto the restored YAML.
export function useCanvasHistory(
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

export type CanvasHistory = ReturnType<typeof useCanvasHistory>;

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
      flowNodes.flatMap((n) =>
        unsavedNodeIds.has(n.id) && n.editTarget ? [{ id: n.id, label: n.label, detail: n.labelText }] : []
      ),
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
        key: `${nodeId}-${hint.line}:${hint.column}-${hint.hint}`,
        message: hint.hint,
        line: hint.line === 0 ? undefined : hint.line,
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
  const unmapped = all.flatMap((hint) =>
    mapped.has(hint)
      ? []
      : [
          {
            key: `unmapped-${hint.line}:${hint.column}-${hint.hint}`,
            message: hint.hint,
            line: nonzeroNumber(hint.line) ?? undefined,
          },
        ]
  );
  return [...list, ...unmapped];
}

// Each node's hint messages, for its canvas badge and inspector.
function hintMessagesByNode(hintsByNode: Map<string, LintHint[]>): Map<string, string[]> {
  return new Map([...hintsByNode].map(([id, hints]) => [id, hints.map((h) => h.hint)]));
}

// Deprecated components in use, as located hints: they map to nodes and problems the way lint does.
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

export type FlowOverviewOptions = {
  yamlContent: string;
  components: ConnectComponentSpec[];
  lintHints?: LintHint[];
  isEditing: boolean;
  selectedId?: string;
};

// What the canvas overlays show about the document: its nodes, lint, deprecations, unsaved changes,
// and the selected node's children for the inspector.
export function useFlowOverview({ yamlContent, components, lintHints, isEditing, selectedId }: FlowOverviewOptions) {
  const flowNodes = useMemo(() => parsePipelineFlowTree(yamlContent).nodes, [yamlContent]);
  const offerTemplate = useMemo(() => shouldOfferTemplate(yamlContent, flowNodes), [yamlContent, flowNodes]);

  // Map server lint hints to their nodes (badge on the node, full messages in the inspector).
  const lintByNode = useMemo(() => mapLintHintsToNodes(yamlContent, lintHints ?? []), [yamlContent, lintHints]);
  const lintMessagesByNode = useMemo(() => hintMessagesByNode(lintByNode), [lintByNode]);
  const { unsavedNodeIds, unsavedNodeList } = useUnsavedNodes(yamlContent, isEditing, flowNodes);

  const childItems = useMemo<InspectorChildItem[]>(
    () =>
      selectedId !== null && selectedId !== undefined && selectedId !== ''
        ? buildChildItems(selectedId, flowNodes, lintByNode)
        : [],
    [selectedId, flowNodes, lintByNode]
  );
  const problems = useMemo(
    () => buildProblems(lintHints ?? [], lintByNode, flowNodes),
    [lintHints, lintByNode, flowNodes]
  );
  const { deprecationsByNode, deprecations } = useDeprecations(yamlContent, components, flowNodes);
  // The pipeline ends when its top-level input does (a broker/sequence aggregates its members).
  const pipelineEnd = useMemo(() => {
    const top = flowNodes.find(
      (n) => n.section === 'input' && n.parentId === 'section-input' && n.endBehavior !== undefined
    );
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

export type FlowOverview = ReturnType<typeof useFlowOverview>;

// Secrets referenced as ${secrets.X} that don't exist yet — surfaced with a quick-add flow.
export function useMissingSecrets(yamlContent: string, isEditing: boolean, onYamlChange: (yaml: string) => void) {
  const { data: secretsResponse } = useListSecretsQuery({}, { enabled: isEditing });
  const [isSecretsDialogOpen, setIsSecretsDialogOpen] = useState(false);
  const existingSecrets = useMemo(
    () =>
      secretsResponse?.secrets
        ? secretsResponse.secrets.flatMap((s) => {
            const nodeId = s?.id || '';
            return Boolean(nodeId) ? [nodeId] : [];
          })
        : [],
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
export function usePendingDelete(
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

  // Warn when other nodes still reference the resource by label — deleting would leave them dangling.
  const pendingDeleteRefCount = useMemo(() => {
    if (pendingDelete?.kind !== 'resource') {
      return 0;
    }
    const comp = getComponentAt(yamlContent, pendingDelete);
    const label = comp && typeof comp.label === 'string' ? comp.label : undefined;
    // Kind-scoped: a same-labelled resource of the other kind must not inflate the warning.
    return label !== null && label !== undefined && label !== ''
      ? countResourceReferences(yamlContent, label, resourceTargetKind(pendingDelete))
      : 0;
  }, [pendingDelete, yamlContent]);

  const confirmDeleteNode = useCallback(() => {
    if (pendingDelete) {
      const next = removeComponentAt(yamlContent, pendingDelete);
      if (next === null) {
        // Removal can fail on YAML the surgical editor can't safely rewrite (e.g. a shared anchor) — say so.
        showToast({ status: 'error', title: 'Couldn’t remove this node — edit it in the YAML view instead.' });
      } else {
        onYamlChange(next);
      }
    }
    // Deleting discards any pending edit for the node (don't commit it).
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

export type PendingDelete = ReturnType<typeof usePendingDelete>;

type StopConditionEdit = { yaml: string } | { error: string };

// The YAML with a node's stop condition set (a null draft clears it), or null when nothing changes.
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

// Lands a stop condition edit in the YAML; false when it's refused, after a toast (one id, so retries don't stack).
function applyStopEdit(edit: ReturnType<typeof stopConditionEdit>, onYamlChange: (yaml: string) => void): boolean {
  if (edit && 'error' in edit) {
    showToast({ id: 'rpcn-stop-condition-edit', status: 'error', title: edit.error });
    return false;
  }
  if (edit) {
    onYamlChange(edit.yaml);
  }
  return true;
}

// Set/clear an input's stop condition (a card's stop row, inspector section). Pending inspector
// edits land first — wrapping moves the component, so a later flush would miss its path — and
// stay their own undo step.
export function useSetStopCondition(
  yamlContent: string,
  flowNodes: PipelineFlowNode[],
  selection: InspectorSelection,
  onYamlChange: (yaml: string) => void
) {
  const { yamlRef, commitPending } = selection;
  const recordEdit = usePipelineEditorStore((s) => s.recordEdit);
  return useCallback(
    (nodeId: string, draft: StopConditionDraft | null): boolean => {
      const before = yamlRef.current;
      const yaml = commitPending();
      if (yaml !== before) {
        recordEdit(yaml);
      }
      // The canvas already parsed this YAML unless a pending edit just landed.
      const nodes = yaml === yamlContent ? flowNodes : parsePipelineFlowTree(yaml).nodes;
      return applyStopEdit(stopConditionEdit(yaml, nodes, nodeId, draft), onYamlChange);
    },
    [yamlRef, commitPending, flowNodes, onYamlChange, recordEdit, yamlContent]
  );
}

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
    showToast({ status: 'error', title: `Couldn’t add ${connectionName} — the insert position no longer exists.` });
    return;
  }
  onYamlChange(result.yaml);
  const added = insertedNodeSelection(result);
  if (added) {
    select(added);
  }
}

export type NodeInsertOptions = {
  yamlContent: string;
  components: ConnectComponentSpec[];
  onYamlChange: (yaml: string) => void;
  selection: InspectorSelection;
};

// The connector picker's pending insert and the canvas/inspector entry points that open it. Each
// commits any pending inspector edit first — the insert builds on the current YAML, so the draft
// would otherwise be lost.
export function useNodeInsert({ yamlContent, components, onYamlChange, selection }: NodeInsertOptions) {
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

export type NodeInsert = ReturnType<typeof useNodeInsert>;

type CanvasKeyboardOptions = {
  isEditing: boolean;
  selection: InspectorSelection;
  history: CanvasHistory;
  stageDelete: (target: EditTarget) => void;
  /** One of the editor's own dialogs is open. */
  dialogOpen: boolean;
};

// Canvas shortcuts (`/` palette, Escape, Delete, undo/redo), and the palette they open.
export function useCanvasKeyboard({ isEditing, selection, history, stageDelete, dialogOpen }: CanvasKeyboardOptions) {
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
export function useSelectionEntryPoints(
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

export type SelectionEntryPoints = ReturnType<typeof useSelectionEntryPoints>;

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

export function InsertConnectorPicker({ componentList, insert }: { componentList: ComponentList; insert: NodeInsert }) {
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
