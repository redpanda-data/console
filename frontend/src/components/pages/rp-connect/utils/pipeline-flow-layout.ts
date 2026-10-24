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

import {
  Graph as DagreGraph,
  layout as dagreLayout,
  type EdgeLabel,
  type GraphLabel,
  type NodeLabel,
} from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';

import {
  buildChildrenMap,
  buildResourceRefResolver,
  CASE_CONTAINER_LABELS,
  mainFlowSequence,
  type PipelineFlowNode,
  sectionChildren,
} from './pipeline-flow-parser';
import type { EditTarget } from './yaml';

// ============================================================================
// Expanded canvas layout (left → right Dagre-laid-out DAG)
// ----------------------------------------------------------------------------
// Card dimensions here must match the node components in pipeline-flow-canvas-nodes.
// ============================================================================

/** Leaf card width on the full canvas; the node component must match this. */
export const FLOW_CARD_WIDTH = 256;
const FLOW_MAX_META_ROWS = 4;

type FlowDims = {
  cardW: number;
  leafBaseH: number;
  metaRowH: number;
  headerH: number;
  // Collapsed container height — taller than the header so the spine handle lands near its centre.
  collapsedH: number;
  pad: number;
  stackGap: number;
  colGap: number;
  // Routing-gutter inset on a container's fan-out/fan-in sides + extra spacing between fanned children.
  fanGutter: number;
  fanGap: number;
};
const FULL_DIMS: FlowDims = {
  cardW: FLOW_CARD_WIDTH,
  // Measured to match ComponentCard so stacked siblings don't overlap.
  leafBaseH: 68,
  metaRowH: 22,
  headerH: 48,
  collapsedH: 72,
  // Inner inset of a container body — tight so children sit close under the header.
  pad: 12,
  stackGap: 14,
  colGap: 72,
  fanGutter: 48,
  fanGap: 20,
};

// Empty-state "Add input/output" card height: 2× the spine-handle offset (36) so the arrow hits its center.
const FLOW_PLACEHOLDER_LEAF_H = 72;
// A `label:` badge renders on its own padded row beneath the full-card header.
const FLOW_LABEL_ROW_H = 30;
// Bottom inset when the label badge is the card's last row (no meta follows).
const FLOW_LABEL_ROW_BOTTOM_PAD = 12;
// The meta block's own vertical padding (rows counted at dims.metaRowH each).
const FLOW_META_BLOCK_PAD = 12;
// A switch case's routing-condition row beneath the header (only on cards carrying a `caseEditTarget`).
const FLOW_CONDITION_ROW_H = 30;

// Label badge and meta block are separately-padded rows; sum individually to track the rendered card.
function labelAndMetaRowsHeight(node: PipelineFlowNode, dims: FlowDims): number {
  const metaRows = Math.min(
    (node.meta?.length ?? 0) +
      (node.topics && node.topics.length > 0 ? 1 : 0) +
      (node.missingTopic ? 1 : 0) +
      (node.missingSasl ? 1 : 0),
    FLOW_MAX_META_ROWS
  );
  let h = 0;
  if (node.labelText) {
    h += FLOW_LABEL_ROW_H + (metaRows > 0 ? 0 : FLOW_LABEL_ROW_BOTTOM_PAD);
  }
  if (metaRows > 0) {
    h += FLOW_META_BLOCK_PAD + metaRows * dims.metaRowH;
  }
  return h;
}

function leafCardHeight(node: PipelineFlowNode, dims: FlowDims): number {
  if (node.label === 'none') {
    return FLOW_PLACEHOLDER_LEAF_H;
  }
  const conditionRowH = node.caseEditTarget ? FLOW_CONDITION_ROW_H : 0;
  return dims.leafBaseH + conditionRowH + labelAndMetaRowsHeight(node, dims);
}

// A parallel processor container's alternatives reconverge, unlike output fans which terminate at sinks.
function reconverges(node: PipelineFlowNode): boolean {
  return node.childFlow === 'parallel' && node.section === 'processor';
}

// Which sides of a container carry routed edges: `out` = fan-out (entry), `in` = fan-in (merge-back).
function fanSides(node: PipelineFlowNode): { out: boolean; in: boolean } {
  return {
    out: node.childFlow === 'parallel' && node.section !== 'input',
    // Inputs fan in only when parallel (broker); a `sequence` renders as a sequential chain.
    in: (node.section === 'input' && node.childFlow !== 'sequential') || reconverges(node),
  };
}

// What an in-container "+" does: insert into a nested array, or append a fresh case to a switch.
export type FlowInsertPayload =
  | { kind: 'insert'; containerPath: (string | number)[]; accepts: 'input' | 'processor' | 'output'; index: number }
  | { kind: 'addChild'; containerPath: (string | number)[]; section: 'processor' | 'output' };

// Routing condition rendered as a chip on the receiving card (not a floating edge label).
function routingData(node: PipelineFlowNode) {
  return {
    ...(node.condition ? { condition: node.condition } : {}),
    ...(node.isDefault ? { isDefault: true } : {}),
    ...(node.isErrorPath ? { isErrorPath: true } : {}),
  };
}

/** X offset of a card's top/bottom handles from its left edge; must match the node component. */
export const FLOW_SPINE_HANDLE_LEFT = 18;

function makeFlowNodeData(node: PipelineFlowNode, collapsed: boolean, childCount: number) {
  return {
    label: node.label,
    collapsible: node.collapsible ?? false,
    collapsed,
    ...(node.section ? { section: node.section } : {}),
    ...(node.labelText ? { labelText: node.labelText } : {}),
    ...(node.topics ? { topics: node.topics } : {}),
    ...(node.meta && node.meta.length > 0 ? { meta: node.meta } : {}),
    ...(node.missingTopic ? { missingTopic: true } : {}),
    ...(node.missingSasl ? { missingSasl: true } : {}),
    ...(node.isCase ? { isCase: true } : {}),
    ...(node.editTarget ? { editTarget: node.editTarget } : {}),
    // Travels onto the case's entry card so its condition chip is clickable; distinct from `editTarget`.
    ...(node.caseEditTarget ? { caseEditTarget: node.caseEditTarget } : {}),
    ...(node.caseOwnerId ? { caseOwnerId: node.caseOwnerId } : {}),
    ...(node.insertSlot ? { insertSlot: node.insertSlot } : {}),
    ...(node.addChildSlot ? { addChildSlot: node.addChildSlot } : {}),
    ...(node.danglingRef ? { danglingRef: true } : {}),
    ...(typeof node.usedByCount === 'number' ? { usedByCount: node.usedByCount } : {}),
    ...(childCount > 0 ? { childCount } : {}),
    ...routingData(node),
  };
}

// ============================================================================
// Graph layout (Dagre) — full horizontal canvas
// ----------------------------------------------------------------------------
// Control flow flattens into split → branch lanes → merge; Dagre ranks and routes the flat graph,
// which then maps to React Flow. Inserts and the resource lane are placed post-layout (rank-neutral).
// ============================================================================

const GRAPH_SPLIT_W = FLOW_CARD_WIDTH;
const GRAPH_SPLIT_H = 56;
// Footer row inside a fan construct's card for its "Add case / Add input" affordance (edit mode).
const GRAPH_SPLIT_FOOTER_H = 34;
const GRAPH_MERGE_W = 48;
const GRAPH_MERGE_H = 32;
const GRAPH_INSERT_W = 150;
const GRAPH_INSERT_H = 24;
// Dagre spacing, deliberately roomy so edges route around nodes (not across cards) and on-edge
// condition labels sit in clear space between ranks.
const GRAPH_RANKSEP = 120;
// Roomy so stacked branches' condition labels and adjacent scope-region boxes don't collide.
const GRAPH_NODESEP = 84;
const GRAPH_EDGESEP = 16;
const GRAPH_MARGIN = 24;
// Resource dependency lane: a bus below the flow, resource cards beneath it (see placeResourceDependencies).
const RES_BUS_GAP = 48;
const RES_ROW_GAP = 32;
const RES_BUS_STAGGER = 7;
// Spacing between resource cards — tighter than colGap so a cluster doesn't spread far.
const RESOURCE_GAP = 28;
const HANDLE_X = FLOW_SPINE_HANDLE_LEFT;

type GraphEdgeType = 'flow' | 'conditional' | 'error';

type GraphNodeSpec = {
  id: string;
  kind: 'card' | 'split' | 'merge';
  node?: PipelineFlowNode;
  w: number;
  h: number;
  /** For split markers: direct child count (cases / steps), surfaced on the card as a descriptor. */
  childCount?: number;
  /** A fan construct's in-card "Add case / Add input" footer affordance (edit mode only). */
  footerAdd?: { payload: FlowInsertPayload; label: string };
};
type GraphEdgeSpec = {
  id: string;
  from: string;
  to: string;
  type: GraphEdgeType;
  label?: string;
  insertIndex?: number;
  // Nested-insert affordance rendered as an on-line "+" that inserts into a control-flow body.
  slot?: FlowInsertPayload;
  // Clickable routing-condition label that selects the case to edit; `selectId` is the reported node id.
  selectId?: string;
  selectTarget?: EditTarget;
};
// Placed after layout below its anchor node (never affects ranks); a dashed "+ Add …" pill (edit mode).
type GraphInsertSpec = {
  id: string;
  anchorId: string;
  payload: FlowInsertPayload;
  label: string;
};

type GraphSegment = { entry: string; exit: string } | null;

type GraphCtx = {
  gnodes: GraphNodeSpec[];
  gedges: GraphEdgeSpec[];
  inserts: GraphInsertSpec[];
  childrenOf: (id: string) => PipelineFlowNode[];
  dims: FlowDims;
  // Node-based add affordances are only emitted in edit mode; on-edge "+" slots are view-safe already.
  editable: boolean;
};

function addGraphCard(ctx: GraphCtx, node: PipelineFlowNode): string {
  ctx.gnodes.push({ id: node.id, kind: 'card', node, w: ctx.dims.cardW, h: leafCardHeight(node, ctx.dims) });
  return node.id;
}
// In-card add affordance: "Add case" for a switch, "Add <input/output>" for a broker/sequence/parallel.
function splitAddAction(
  node: PipelineFlowNode,
  childCount: number
): { payload: FlowInsertPayload; label: string } | undefined {
  if (node.addChildSlot) {
    return { payload: { kind: 'addChild', ...node.addChildSlot }, label: 'Add case' };
  }
  if (node.insertSlot) {
    return {
      payload: { kind: 'insert', ...node.insertSlot, index: childCount },
      label: `Add ${node.insertSlot.accepts}`,
    };
  }
}

function addGraphSplit(
  ctx: GraphCtx,
  node: PipelineFlowNode,
  footerAdd?: { payload: FlowInsertPayload; label: string }
): string {
  ctx.gnodes.push({
    id: node.id,
    kind: 'split',
    node,
    w: GRAPH_SPLIT_W,
    // Reserve a row each for the case-condition (caseEditTarget) and the footer add affordance.
    h: GRAPH_SPLIT_H + (node.caseEditTarget ? FLOW_CONDITION_ROW_H : 0) + (footerAdd ? GRAPH_SPLIT_FOOTER_H : 0),
    childCount: ctx.childrenOf(node.id).length,
    ...(footerAdd ? { footerAdd } : {}),
  });
  return node.id;
}
function addGraphMerge(ctx: GraphCtx, id: string): string {
  ctx.gnodes.push({ id, kind: 'merge', w: GRAPH_MERGE_W, h: GRAPH_MERGE_H });
  return id;
}
function addGraphEdge(ctx: GraphCtx, edge: GraphEdgeSpec): void {
  ctx.gedges.push(edge);
}
function addGraphInsert(ctx: GraphCtx, id: string, anchorId: string, payload: FlowInsertPayload, label: string): void {
  if (ctx.editable) {
    ctx.inserts.push({ id, anchorId, payload, label });
  }
}

// The label + edge tone for a fan branch (a switch/group_by case, fallback tier).
function branchEdgeInfo(owner: PipelineFlowNode): { type: GraphEdgeType; label?: string } {
  if (owner.isErrorPath) {
    return { type: 'error', label: owner.condition ?? 'on error' };
  }
  if (owner.condition) {
    return { type: 'conditional', label: owner.condition };
  }
  if (owner.isDefault) {
    return { type: 'conditional', label: 'default' };
  }
  return { type: 'flow' };
}

// Whether a fan's direct children are case wrappers to unwrap into lanes (switch/group_by cases).
function fanUnwrapsChildren(node: PipelineFlowNode): boolean {
  return CASE_CONTAINER_LABELS.has(node.label) && node.section === 'processor';
}

type FanLane = { owner: PipelineFlowNode; bodySteps: PipelineFlowNode[] };

// Stamp the case's routing condition + edit target onto the FIRST body step so its card renders the
// clickable condition chip. Shallow-clones that step (same id, so selection/edges still resolve).
function caseEntrySteps(lane: FanLane): PipelineFlowNode[] {
  const [first, ...rest] = lane.bodySteps;
  const o = lane.owner;
  return [
    {
      ...first,
      condition: o.condition,
      isDefault: o.isDefault,
      isErrorPath: o.isErrorPath,
      caseEditTarget: o.caseEditTarget,
      caseOwnerId: o.id,
    },
    ...rest,
  ];
}

function fanLaneList(node: PipelineFlowNode, kids: PipelineFlowNode[], ctx: GraphCtx): FanLane[] {
  const unwrap = fanUnwrapsChildren(node);
  return kids.map((kid) =>
    unwrap && kid.kind === 'group'
      ? { owner: kid, bodySteps: ctx.childrenOf(kid.id) }
      : { owner: kid, bodySteps: [kid] }
  );
}

// "Add a step into this body" rides the body's terminal edge as an on-line "+": at its start when
// the body is empty, else appended at its end.
function laneAppendSlot(owner: PipelineFlowNode, atEnd: boolean, ctx: GraphCtx): FlowInsertPayload | undefined {
  return owner.insertSlot
    ? { kind: 'insert', ...owner.insertSlot, index: atEnd ? ctx.childrenOf(owner.id).length : 0 }
    : undefined;
}

// A fan's split/merge marker ids (either may be absent: input broker = merge only, output fan = split only).
type FanEnds = { split?: string; merge?: string };

// One emitted fan lane: its owner and body segment, and whether its entry card carries the case chip.
type EmittedLane = { owner: PipelineFlowNode; body: GraphSegment; carriesChip: boolean };

function fanoutEdge(lane: EmittedLane, split: string, merge: string | undefined, ctx: GraphCtx): GraphEdgeSpec {
  const { owner, body, carriesChip } = lane;
  const info = branchEdgeInfo(owner);
  // The case edit target rides the fan-out edge only when there is no entry chip (empty case).
  const selectTarget = carriesChip ? undefined : owner.caseEditTarget;
  return {
    id: `fanout-${owner.id}`,
    from: split,
    to: body ? body.entry : (merge ?? split),
    type: info.type,
    ...(carriesChip ? {} : { label: info.label }),
    ...(selectTarget ? { selectId: owner.id, selectTarget } : {}),
    // Empty body: the "+" to add its first step sits on the split→merge edge.
    ...(body ? {} : { slot: laneAppendSlot(owner, false, ctx) }),
  };
}

function emitFanLane(lane: FanLane, ends: FanEnds, carriesCaseChips: boolean, ctx: GraphCtx): void {
  // Case conditions live on the entry card as a clickable chip, not as an edge label — drop the
  // label when a body exists. An empty-bodied case (no card yet) keeps the edge label as fallback.
  const carriesChip = carriesCaseChips && lane.bodySteps.length > 0;
  const body = emitSequence(carriesChip ? caseEntrySteps(lane) : lane.bodySteps, ctx);
  if (ends.split) {
    addGraphEdge(ctx, fanoutEdge({ owner: lane.owner, body, carriesChip }, ends.split, ends.merge, ctx));
  }
  if (ends.merge && body) {
    addGraphEdge(ctx, {
      id: `fanin-${lane.owner.id}`,
      from: body.exit,
      to: ends.merge,
      type: lane.owner.isErrorPath ? 'error' : 'flow',
      slot: laneAppendSlot(lane.owner, true, ctx),
    });
  }
}

// A control-flow fan: split (fan-out) → branch sub-graphs → merge (reconverge). Input broker =
// merge only; output fan = split only (sinks terminate).
function emitFan(
  node: PipelineFlowNode,
  kids: PipelineFlowNode[],
  sides: { out: boolean; in: boolean },
  ctx: GraphCtx
): GraphSegment {
  const footerAdd = ctx.editable ? splitAddAction(node, kids.length) : undefined;
  const split = sides.out ? addGraphSplit(ctx, node, footerAdd) : undefined;
  // A fan-in without a split (an input broker) reconverges at the construct itself — render it as a
  // labeled hub, not a generic merge dot. A reconverging processor fan keeps the plain merge dot.
  const merge = sides.in
    ? split
      ? addGraphMerge(ctx, `${node.id}-merge`)
      : addGraphSplit(ctx, node, footerAdd)
    : undefined;
  const carriesCaseChips = CASE_CONTAINER_LABELS.has(node.label);
  for (const lane of fanLaneList(node, kids, ctx)) {
    emitFanLane(lane, { split, merge }, carriesCaseChips, ctx);
  }
  return { entry: split ?? merge ?? node.id, exit: merge ?? split ?? node.id };
}

// A sequential construct: a leading marker node (try / catch / for_each / …) then its body chain.
function emitSequentialGroup(node: PipelineFlowNode, kids: PipelineFlowNode[], ctx: GraphCtx): GraphSegment {
  const head = addGraphSplit(ctx, node);
  const body = emitSequence(kids, ctx);
  if (body) {
    addGraphEdge(ctx, {
      id: `flow-${head}-${body.entry}`,
      from: head,
      to: body.entry,
      type: node.isErrorPath ? 'error' : 'flow',
      // "Add a step into this body" rides the marker→body edge (appends to the body).
      ...(node.insertSlot ? { slot: { kind: 'insert', ...node.insertSlot, index: kids.length } } : {}),
    });
    return { entry: head, exit: body.exit };
  }
  if (node.insertSlot) {
    addGraphInsert(
      ctx,
      `${node.id}-add`,
      head,
      { kind: 'insert', ...node.insertSlot, index: 0 },
      `Add ${node.insertSlot.accepts}`
    );
  }
  return { entry: head, exit: head };
}

// Insert payload appending a step at the end of a container's body (none without an insert slot).
const endInsertSlot = (node: PipelineFlowNode, ctx: GraphCtx): FlowInsertPayload | undefined =>
  node.insertSlot ? { kind: 'insert', ...node.insertSlot, index: ctx.childrenOf(node.id).length } : undefined;

// One arm of a try/catch: its marker, its emitted body (null when empty) and its edge tone.
type TryCatchArm = { node: PipelineFlowNode; head: string; body: GraphSegment; type: GraphEdgeType };

// An arm's marker → body edge, then its body's end (or the bare marker) into the shared merge.
function emitTryCatchArm(arm: TryCatchArm, merge: string, ctx: GraphCtx): void {
  const { node, head, body, type } = arm;
  const successFrom = body ? body.exit : head;
  if (body) {
    addGraphEdge(ctx, { id: `flow-${head}-${body.entry}`, from: head, to: body.entry, type });
  }
  addGraphEdge(ctx, {
    id: `flow-${successFrom}-${merge}`,
    from: successFrom,
    to: merge,
    type,
    slot: endInsertSlot(node, ctx),
  });
}

// try then catch: success path = try body, error path = catch body, both converging at a merge.
function emitTryCatch(tryNode: PipelineFlowNode, catchNode: PipelineFlowNode, ctx: GraphCtx): GraphSegment {
  const tryHead = addGraphSplit(ctx, tryNode);
  const tryBody = emitSequence(ctx.childrenOf(tryNode.id), ctx);
  const catchHead = addGraphSplit(ctx, catchNode);
  const catchBody = emitSequence(ctx.childrenOf(catchNode.id), ctx);
  const merge = addGraphMerge(ctx, `${tryNode.id}-merge`);

  emitTryCatchArm({ node: tryNode, head: tryHead, body: tryBody, type: 'flow' }, merge, ctx);
  addGraphEdge(ctx, {
    id: `error-${tryNode.id}-${catchNode.id}`,
    from: tryHead,
    to: catchHead,
    type: 'error',
    label: 'on error',
  });
  emitTryCatchArm({ node: catchNode, head: catchHead, body: catchBody, type: 'error' }, merge, ctx);
  return { entry: tryHead, exit: merge };
}

function emitGraphStep(node: PipelineFlowNode, ctx: GraphCtx): GraphSegment {
  if (node.kind === 'leaf') {
    addGraphCard(ctx, node);
    return { entry: node.id, exit: node.id };
  }
  const kids = ctx.childrenOf(node.id);
  // A `branch` copies + merges back, but reads cleanest as marker → body → continue — the card
  // conveys the copy/merge, so no separate merge node or dashed edges are drawn.
  if (node.branch) {
    return emitSequentialGroup(node, kids, ctx);
  }
  const sides = fanSides(node);
  if (sides.out || sides.in) {
    return emitFan(node, kids, sides, ctx);
  }
  return emitSequentialGroup(node, kids, ctx);
}

const isTryStep = (n?: PipelineFlowNode) => n?.kind === 'group' && n.label === 'try';
const isCatchStep = (n?: PipelineFlowNode) => n?.kind === 'group' && n.label === 'catch';

// A top-level processor's ACTUAL index into `pipeline.processors`. Rendered position drifts when
// unparseable entries are skipped, so on-edge inserts must carry the YAML index, not a rendered count.
const topLevelProcessorIndex = (n?: PipelineFlowNode): number | undefined =>
  n?.editTarget?.kind === 'processor' ? n.editTarget.index : undefined;

// A sequence's emission units: one step, or a try immediately followed by its catch.
type SequenceUnit = [PipelineFlowNode] | [PipelineFlowNode, PipelineFlowNode];

function sequenceUnits(steps: PipelineFlowNode[]): SequenceUnit[] {
  const units: SequenceUnit[] = [];
  let i = 0;
  while (i < steps.length) {
    const fusesTryCatch = isTryStep(steps[i]) && isCatchStep(steps[i + 1]);
    units.push(fusesTryCatch ? [steps[i], steps[i + 1]] : [steps[i]]);
    i += fusesTryCatch ? 2 : 1;
  }
  return units;
}

function emitSequenceUnit([step, catchStep]: SequenceUnit, ctx: GraphCtx): GraphSegment {
  return catchStep ? emitTryCatch(step, catchStep, ctx) : emitGraphStep(step, ctx);
}

// The YAML index of the last top-level processor once `unit` has been passed.
function lastProcessorIndexAfter(unit: SequenceUnit, lastProcessorIndex: number): number {
  return unit.reduce((index, step) => topLevelProcessorIndex(step) ?? index, lastProcessorIndex);
}

// The chained sequence so far: its first entry and latest exit.
type SequenceChain = { entry?: string; exit?: string };

// Appends a segment to the chain, joined to the previous exit by a flow edge.
function appendToChain(
  chain: SequenceChain,
  seg: NonNullable<GraphSegment>,
  insertIndex: number | undefined,
  ctx: GraphCtx
): void {
  if (chain.exit !== undefined) {
    addGraphEdge(ctx, {
      id: `flow-${chain.exit}-${seg.entry}`,
      from: chain.exit,
      to: seg.entry,
      type: 'flow',
      ...(insertIndex === undefined ? {} : { insertIndex }),
    });
  }
  chain.entry ??= seg.entry;
  chain.exit = seg.exit;
}

// Chain steps with flow edges; top-level edges carry the processor-insert index for the spine "+".
// A try immediately followed by a catch fuses into one success/error structure.
function emitSequence(steps: PipelineFlowNode[], ctx: GraphCtx, topLevel = false): GraphSegment {
  const chain: SequenceChain = {};
  let lastProcessorIndex = -1;
  for (const unit of sequenceUnits(steps)) {
    const seg = emitSequenceUnit(unit, ctx);
    // Insert on the edge into a processor splices before it; into the output, after the last processor.
    const insertIndex = topLevelProcessorIndex(unit[0]) ?? lastProcessorIndex + 1;
    if (seg) {
      appendToChain(chain, seg, topLevel ? insertIndex : undefined, ctx);
    }
    lastProcessorIndex = lastProcessorIndexAfter(unit, lastProcessorIndex);
  }
  return chain.entry !== undefined && chain.exit !== undefined ? { entry: chain.entry, exit: chain.exit } : null;
}

function buildPipelineGraph(nodes: PipelineFlowNode[], editable: boolean): GraphCtx {
  const childrenMap = buildChildrenMap(nodes);
  const ctx: GraphCtx = {
    gnodes: [],
    gedges: [],
    inserts: [],
    childrenOf: (id) => childrenMap.get(id) ?? [],
    dims: FULL_DIMS,
    editable,
  };
  emitSequence(mainFlowSequence(nodes), ctx, true);
  // Resources are not in the Dagre graph — they're laid out below the flow (see placeResourceDependencies).
  return ctx;
}

// Dagre keys multigraph edges by (v, w, name) — name is our edge id.
function graphEdgePoints(
  edge: GraphEdgeSpec,
  laidOut: DagreGraph<GraphLabel, NodeLabel, EdgeLabel>
): { x: number; y: number }[] {
  const e = laidOut.edge({ v: edge.from, w: edge.to, name: edge.id });
  return e?.points ?? [];
}

function makeMergeData(ownerId: string) {
  return { label: 'merge', ownerId };
}

type NodeBox = { x: number; y: number; w: number; h: number };

function refEdge(id: string, from: string, to: string, points: { x: number; y: number }[]): Edge {
  return {
    id,
    source: from,
    target: to,
    sourceHandle: 'b',
    targetHandle: 't',
    type: 'flowGraphEdge',
    zIndex: 4,
    data: { tone: 'muted', dashed: true, points },
  };
}

type ResourceRef = { userId: string; resourceId: string };

// Every (placed user → resource) dependency, and each resource's desired x (its nearest user's left edge).
function collectResourceRefs(
  nodes: PipelineFlowNode[],
  resolve: ReturnType<typeof buildResourceRefResolver>,
  boxes: Map<string, NodeBox>
): { refs: ResourceRef[]; desiredX: Map<string, number> } {
  // Keyed by user → resource so a repeated dependency is drawn once, in first-seen order.
  const refs = new Map<string, ResourceRef>();
  const desiredX = new Map<string, number>();
  for (const node of nodes) {
    const resource = node.resourceRef ? resolve(node, node.resourceRef) : undefined;
    const userBox = resource ? boxes.get(node.id) : undefined;
    if (resource && userBox) {
      refs.set(`${node.id}->${resource.id}`, { userId: node.id, resourceId: resource.id });
      const left = userBox.x - userBox.w / 2;
      desiredX.set(resource.id, Math.min(desiredX.get(resource.id) ?? Number.POSITIVE_INFINITY, left));
    }
  }
  return { refs: [...refs.values()], desiredX };
}

type ResourcePlacement = { resource: PipelineFlowNode; x: number; h: number };

// Lay resources left→right (referenced ones at their user's x, then unreferenced), de-overlapped.
function placeResources(
  resources: PipelineFlowNode[],
  desiredX: Map<string, number>,
  startX: number
): ResourcePlacement[] {
  const ordered = [
    ...resources
      .filter((r) => desiredX.has(r.id))
      .sort((a, b) => (desiredX.get(a.id) ?? 0) - (desiredX.get(b.id) ?? 0)),
    ...resources.filter((r) => !desiredX.has(r.id)),
  ];
  const placements: ResourcePlacement[] = [];
  let cursor = startX;
  for (const resource of ordered) {
    const x = Math.max(desiredX.get(resource.id) ?? cursor, cursor);
    placements.push({ resource, x, h: leafCardHeight(resource, FULL_DIMS) });
    cursor = x + FULL_DIMS.cardW + RESOURCE_GAP;
  }
  return placements;
}

function resourceCardNode({ resource, x, h }: ResourcePlacement, laneY: number): Node {
  return {
    id: resource.id,
    type: 'flowCard',
    position: { x, y: laneY },
    initialWidth: FULL_DIMS.cardW,
    initialHeight: h,
    zIndex: 8,
    style: { pointerEvents: 'all', transition: 'transform 200ms ease' },
    data: makeFlowNodeData(resource, false, 0),
  };
}

// Where the resource lane's cables run: `busTop` is the first bus lane, `laneY` the resource cards' top.
type CableLanes = { busTop: number; laneY: number };

// A cable jogs from the user's bottom into the inter-rank gap, drops to its bus below the flow,
// runs across, then enters the resource's top at `endX`.
function resourceCablePoints(user: NodeBox, endX: number, busY: number, laneY: number): { x: number; y: number }[] {
  const startX = user.x - user.w / 2 + HANDLE_X;
  const startY = user.y + user.h / 2;
  // Drop in the rank gap facing the resource — rank gaps are node-free, so the run clears all cards.
  const toLeft = endX < user.x;
  const gapX = toLeft ? user.x - user.w / 2 - GRAPH_RANKSEP / 2 : user.x + user.w / 2 + GRAPH_RANKSEP / 2;
  return [
    { x: startX, y: startY },
    { x: startX, y: startY + 14 },
    { x: gapX, y: startY + 14 },
    { x: gapX, y: busY },
    { x: endX, y: busY },
    { x: endX, y: laneY },
  ];
}

type CableCtx = CableLanes & { boxes: Map<string, NodeBox>; resLeft: Map<string, number> };

// The dashed dependency cable for the `index`-th ref, on its own staggered bus lane.
function resourceCable(ref: ResourceRef, index: number, ctx: CableCtx): Edge | undefined {
  const user = ctx.boxes.get(ref.userId);
  const rx = ctx.resLeft.get(ref.resourceId);
  if (!(user && rx !== undefined)) {
    return;
  }
  const busY = ctx.busTop + (index % 4) * RES_BUS_STAGGER;
  const points = resourceCablePoints(user, rx + HANDLE_X, busY, ctx.laneY);
  return refEdge(`ref-${ref.userId}-${ref.resourceId}`, ref.userId, ref.resourceId, points);
}

function resourceCables(
  refs: ResourceRef[],
  placements: ResourcePlacement[],
  boxes: Map<string, NodeBox>,
  lanes: CableLanes
): Edge[] {
  const ctx: CableCtx = { ...lanes, boxes, resLeft: new Map(placements.map((p) => [p.resource.id, p.x])) };
  return refs.flatMap((ref, i) => resourceCable(ref, i, ctx) ?? []);
}

// Resources are shared dependencies, not flow steps: a row below the flow, each near its user's x,
// wired by a dashed cable from the user's bottom along a bus into the resource's top.
function placeResourceDependencies(
  nodes: PipelineFlowNode[],
  rfNodes: Node[],
  rfEdges: Edge[],
  boxes: Map<string, NodeBox>,
  bounds: { minX: number; maxX: number; maxY: number }
): { right: number; bottom: number } {
  const resources = sectionChildren(nodes, buildChildrenMap(nodes), 'resource');
  if (resources.length === 0) {
    return { right: bounds.maxX, bottom: bounds.maxY };
  }
  const { refs, desiredX } = collectResourceRefs(nodes, buildResourceRefResolver(resources), boxes);
  const lanes: CableLanes = { busTop: bounds.maxY + RES_BUS_GAP, laneY: bounds.maxY + RES_BUS_GAP + RES_ROW_GAP };
  const placements = placeResources(resources, desiredX, bounds.minX);
  rfNodes.push(...placements.map((p) => resourceCardNode(p, lanes.laneY)));
  rfEdges.push(...resourceCables(refs, placements, boxes, lanes));
  return {
    right: Math.max(bounds.maxX, ...placements.map((p) => p.x + FULL_DIMS.cardW)),
    bottom: Math.max(bounds.maxY, ...placements.map((p) => lanes.laneY + p.h)),
  };
}

// Place the "+ Add …" insert pills after layout, just below their anchor nodes.
function placeGraphInserts(
  ctx: GraphCtx,
  rfNodes: Node[],
  boxes: Map<string, NodeBox>
): { maxX: number; maxY: number } {
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const ins of ctx.inserts) {
    const anchor = boxes.get(ins.anchorId);
    if (anchor) {
      const center = { x: anchor.x, y: anchor.y + anchor.h / 2 + 10 + GRAPH_INSERT_H / 2 };
      rfNodes.push(insertPillNode(ins, center));
      maxX = Math.max(maxX, center.x + GRAPH_INSERT_W / 2);
      maxY = Math.max(maxY, center.y + GRAPH_INSERT_H / 2);
    }
  }
  return { maxX, maxY };
}

function insertPillNode(ins: GraphInsertSpec, center: { x: number; y: number }): Node {
  return {
    id: ins.id,
    type: 'flowInsert',
    position: { x: center.x - GRAPH_INSERT_W / 2, y: center.y - GRAPH_INSERT_H / 2 },
    initialWidth: GRAPH_INSERT_W,
    initialHeight: GRAPH_INSERT_H,
    selectable: false,
    draggable: false,
    zIndex: 8,
    style: { pointerEvents: 'all' },
    data: { payload: ins.payload, label: ins.label, ghost: true },
  };
}

const GRAPH_EDGE_TONE: Record<GraphEdgeType, 'primary' | 'muted' | 'error'> = {
  flow: 'primary',
  conditional: 'primary',
  error: 'error',
};

function predecessorMap(gedges: GraphEdgeSpec[]): Map<string, string[]> {
  const predecessors = new Map<string, string[]>();
  for (const edge of gedges) {
    const list = predecessors.get(edge.to);
    if (list) {
      list.push(edge.from);
    } else {
      predecessors.set(edge.to, [edge.from]);
    }
  }
  return predecessors;
}

// Forward longest-path rank (edge distance from the nearest source): nodes hug their predecessor
// (the split) instead of being pulled right to the merge. The cycle guard is defensive — it's a DAG.
function forwardRanks(gnodes: GraphNodeSpec[], gedges: GraphEdgeSpec[]): Map<string, number> {
  const predecessors = predecessorMap(gedges);
  const rank = new Map<string, number>();
  const inProgress = new Set<string>();
  const rankOf = (id: string): number => {
    const cached = rank.get(id);
    if (cached !== undefined) {
      return cached;
    }
    if (inProgress.has(id)) {
      return 0;
    }
    inProgress.add(id);
    // A source ranks 0; anything else sits one past its furthest predecessor.
    const value = Math.max(0, ...(predecessors.get(id) ?? []).map((p) => rankOf(p) + 1));
    inProgress.delete(id);
    rank.set(id, value);
    return value;
  };
  for (const gn of gnodes) {
    rankOf(gn.id);
  }
  return rank;
}

type LaidOutGraph = DagreGraph<GraphLabel, NodeLabel, EdgeLabel>;

function newDagreGraph(): LaidOutGraph {
  const g = new DagreGraph<GraphLabel, NodeLabel, EdgeLabel>({ multigraph: true });
  g.setGraph({
    rankdir: 'LR',
    ranksep: GRAPH_RANKSEP,
    nodesep: GRAPH_NODESEP,
    edgesep: GRAPH_EDGESEP,
    marginx: GRAPH_MARGIN,
    marginy: GRAPH_MARGIN,
    ranker: 'network-simplex',
  });
  g.setDefaultEdgeLabel(() => ({}));
  return g;
}

function layoutGraph(ctx: GraphCtx): LaidOutGraph {
  const g = newDagreGraph();
  for (const gn of ctx.gnodes) {
    g.setNode(gn.id, { width: gn.w, height: gn.h });
  }
  // Source-align: pin each node to its forward longest-path rank via per-edge `minlen` (see forwardRanks).
  const ranks = forwardRanks(ctx.gnodes, ctx.gedges);
  for (const ge of ctx.gedges) {
    const minlen = Math.max(1, (ranks.get(ge.to) ?? 0) - (ranks.get(ge.from) ?? 0));
    g.setEdge(ge.from, ge.to, { minlen }, ge.id);
  }
  dagreLayout(g);
  return g;
}

// A graph node at its laid-out position: top-left corner (x, y) plus its centre box.
type PlacedGraphNode = { gn: GraphNodeSpec; x: number; y: number; center: NodeBox };

function placeGraphNode(gn: GraphNodeSpec, g: LaidOutGraph): PlacedGraphNode | undefined {
  const dn = g.node(gn.id);
  if (!dn) {
    return;
  }
  const cx = dn.x ?? 0;
  const cy = dn.y ?? 0;
  return { gn, x: cx - gn.w / 2, y: cy - gn.h / 2, center: { x: cx, y: cy, w: gn.w, h: gn.h } };
}

function graphRfNode({ gn, x, y }: PlacedGraphNode): Node {
  if (gn.kind === 'merge') {
    return {
      id: gn.id,
      type: 'flowMerge',
      position: { x, y },
      initialWidth: gn.w,
      initialHeight: gn.h,
      zIndex: 8,
      style: { pointerEvents: 'all', transition: 'transform 200ms ease' },
      data: makeMergeData(gn.id.replace(/-merge$/, '')),
    };
  }
  const node = gn.node as PipelineFlowNode;
  return {
    id: gn.id,
    type: gn.kind === 'split' ? 'flowSplit' : 'flowCard',
    position: { x, y },
    initialWidth: gn.w,
    initialHeight: gn.h,
    zIndex: 8,
    style: { pointerEvents: 'all', transition: 'transform 200ms ease' },
    data: {
      ...makeFlowNodeData(node, false, gn.childCount ?? 0),
      ...(node.parentId ? { ownerId: node.parentId } : {}),
      ...(gn.footerAdd ? { addAction: gn.footerAdd } : {}),
    },
  };
}

type FlowExtent = { minX: number; maxX: number; maxY: number };

// The placed flow's extent; an empty flow falls back to one card's footprint at the origin.
function flowExtent(placed: PlacedGraphNode[]): FlowExtent {
  const minX = Math.min(...placed.map((p) => p.x));
  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: FULL_DIMS.cardW, maxY: FULL_DIMS.leafBaseH };
  }
  return {
    minX,
    maxX: Math.max(...placed.map((p) => p.x + p.gn.w)),
    maxY: Math.max(...placed.map((p) => p.y + p.gn.h)),
  };
}

// The laid-out graph nodes as React Flow nodes, their centre boxes by id, and the flow's extent.
function placeFlowNodes(
  ctx: GraphCtx,
  g: LaidOutGraph
): { rfNodes: Node[]; centerById: Map<string, NodeBox>; extent: FlowExtent } {
  const placed = ctx.gnodes.map((gn) => placeGraphNode(gn, g)).filter((p) => p !== undefined);
  return {
    rfNodes: placed.map((p) => graphRfNode(p)),
    centerById: new Map(placed.map((p) => [p.gn.id, p.center])),
    extent: flowExtent(placed),
  };
}

function graphRfEdge(ge: GraphEdgeSpec, g: LaidOutGraph): Edge {
  return {
    id: ge.id,
    source: ge.from,
    target: ge.to,
    sourceHandle: 'r',
    targetHandle: 'l',
    type: 'flowGraphEdge',
    zIndex: 4,
    data: {
      tone: GRAPH_EDGE_TONE[ge.type],
      dashed: ge.type === 'error',
      label: ge.label,
      points: graphEdgePoints(ge, g),
      ...(ge.insertIndex === undefined ? {} : { insertIndex: ge.insertIndex }),
      ...(ge.slot ? { slotPayload: ge.slot } : {}),
      ...(ge.selectId && ge.selectTarget ? { selectId: ge.selectId, selectTarget: ge.selectTarget } : {}),
      // Condition labels ride the rank-gap midpoint — clear of both the split and the target card.
      ...((ge.type === 'conditional' || ge.type === 'error') && ge.label ? { labelT: 0.5 } : {}),
    },
  };
}

export function computeGraphLayout(
  nodes: PipelineFlowNode[],
  editable = false
): {
  rfNodes: Node[];
  rfEdges: Edge[];
  width: number;
  height: number;
} {
  const ctx = buildPipelineGraph(nodes, editable);
  const g = layoutGraph(ctx);
  const { rfNodes, centerById, extent } = placeFlowNodes(ctx, g);
  const rfEdges = ctx.gedges.map((ge) => graphRfEdge(ge, g));
  const inserts = placeGraphInserts(ctx, rfNodes, centerById);
  const bounds = {
    minX: extent.minX,
    maxX: Math.max(extent.maxX, inserts.maxX),
    maxY: Math.max(extent.maxY, inserts.maxY),
  };
  const { right, bottom } = placeResourceDependencies(nodes, rfNodes, rfEdges, centerById, bounds);
  return { rfNodes, rfEdges, width: Math.max(right, bounds.maxX) - bounds.minX, height: Math.max(bottom, bounds.maxY) };
}
