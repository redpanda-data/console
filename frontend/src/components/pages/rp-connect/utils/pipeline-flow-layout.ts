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
  hasStopSlot,
  mainFlowSequence,
  type PipelineFlowNode,
  sectionChildren,
} from './pipeline-flow-parser';
import type { EditTarget } from './yaml';

/** Leaf card width on the full canvas; the node component must match this. */
export const FLOW_CARD_WIDTH = 256;
const FLOW_MAX_META_ROWS = 4;

type FlowDims = {
  cardW: number;
  leafBaseH: number;
  metaRowH: number;
  headerH: number;
  collapsedH: number;
  pad: number;
  stackGap: number;
  colGap: number;
  fanGutter: number;
  fanGap: number;
};
const FULL_DIMS: FlowDims = {
  cardW: FLOW_CARD_WIDTH,
  leafBaseH: 68,
  metaRowH: 22,
  headerH: 48,
  collapsedH: 72,
  pad: 12,
  stackGap: 14,
  colGap: 72,
  fanGutter: 48,
  fanGap: 20,
};

const FLOW_PLACEHOLDER_LEAF_H = 72;
const FLOW_LABEL_ROW_H = 30;
const FLOW_LABEL_ROW_BOTTOM_PAD = 12;
const FLOW_META_BLOCK_PAD = 12;
const FLOW_CONDITION_ROW_H = 30;
export const FLOW_STOP_ROW_H = 30;

function labelAndMetaRowsHeight(node: PipelineFlowNode, dims: FlowDims) {
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
  if (hasStopSlot(node)) {
    h += FLOW_STOP_ROW_H;
  }
  return h;
}

function leafCardHeight(node: PipelineFlowNode, dims: FlowDims) {
  if (node.label === 'none') {
    return FLOW_PLACEHOLDER_LEAF_H;
  }
  const conditionRowH = node.caseEditTarget ? FLOW_CONDITION_ROW_H : 0;
  return dims.leafBaseH + conditionRowH + labelAndMetaRowsHeight(node, dims);
}

function reconverges(node: PipelineFlowNode) {
  return node.childFlow === 'parallel' && node.section === 'processor';
}

function fanSides(node: PipelineFlowNode) {
  return {
    out: node.childFlow === 'parallel' && node.section !== 'input',
    in: (node.section === 'input' && node.childFlow !== 'sequential') || reconverges(node),
  };
}

export type FlowInsertPayload =
  | { kind: 'insert'; containerPath: (string | number)[]; accepts: 'input' | 'processor' | 'output'; index: number }
  | { kind: 'addChild'; containerPath: (string | number)[]; section: 'processor' | 'output' };

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
    ...(node.caseEditTarget ? { caseEditTarget: node.caseEditTarget } : {}),
    ...(node.caseOwnerId ? { caseOwnerId: node.caseOwnerId } : {}),
    ...(node.insertSlot ? { insertSlot: node.insertSlot } : {}),
    ...(node.addChildSlot ? { addChildSlot: node.addChildSlot } : {}),
    ...(node.danglingRef ? { danglingRef: true } : {}),
    ...(node.stopSlot ? { stopSlot: node.stopSlot } : {}),
    ...(node.endBehavior ? { endBehavior: node.endBehavior } : {}),
    ...(typeof node.usedByCount === 'number' ? { usedByCount: node.usedByCount } : {}),
    ...(childCount > 0 ? { childCount } : {}),
    ...routingData(node),
  };
}

const GRAPH_SPLIT_W = FLOW_CARD_WIDTH;
const GRAPH_SPLIT_H = 56;
const GRAPH_SPLIT_FOOTER_H = 34;
const GRAPH_MERGE_W = 48;
const GRAPH_MERGE_H = 32;
const GRAPH_INSERT_W = 150;
const GRAPH_INSERT_H = 24;
const GRAPH_RANKSEP = 120;
const GRAPH_NODESEP = 84;
const GRAPH_EDGESEP = 16;
const GRAPH_MARGIN = 24;
const RES_BUS_GAP = 48;
const RES_ROW_GAP = 32;
const RES_BUS_STAGGER = 7;
const RESOURCE_GAP = 28;
const HANDLE_X = FLOW_SPINE_HANDLE_LEFT;

type GraphEdgeType = 'flow' | 'conditional' | 'error';

type GraphNodeSpec = {
  id: string;
  kind: 'card' | 'split' | 'merge';
  node?: PipelineFlowNode;
  w: number;
  h: number;
  childCount?: number;
  footerAdd?: { payload: FlowInsertPayload; label: string };
};
type GraphEdgeSpec = {
  id: string;
  from: string;
  to: string;
  type: GraphEdgeType;
  label?: string;
  insertIndex?: number;
  slot?: FlowInsertPayload;
  selectId?: string;
  selectTarget?: EditTarget;
};
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
  editable: boolean;
};

function addGraphCard(ctx: GraphCtx, node: PipelineFlowNode) {
  ctx.gnodes.push({ id: node.id, kind: 'card', node, w: ctx.dims.cardW, h: leafCardHeight(node, ctx.dims) });
  return node.id;
}
function splitAddAction(node: PipelineFlowNode, childCount: number) {
  if (node.addChildSlot) {
    return { payload: { kind: 'addChild', ...node.addChildSlot }, label: 'Add case' } satisfies
      | { payload: FlowInsertPayload; label: string }
      | undefined;
  }
  if (node.insertSlot) {
    return {
      payload: { kind: 'insert', ...node.insertSlot, index: childCount },
      label: `Add ${node.insertSlot.accepts}`,
    } satisfies { payload: FlowInsertPayload; label: string } | undefined;
  }
}

function addGraphSplit(
  ctx: GraphCtx,
  node: PipelineFlowNode,
  footerAdd?: { payload: FlowInsertPayload; label: string }
) {
  ctx.gnodes.push({
    id: node.id,
    kind: 'split',
    node,
    w: GRAPH_SPLIT_W,
    h:
      GRAPH_SPLIT_H +
      (node.caseEditTarget ? FLOW_CONDITION_ROW_H : 0) +
      (hasStopSlot(node) ? FLOW_STOP_ROW_H : 0) +
      (footerAdd ? GRAPH_SPLIT_FOOTER_H : 0),
    childCount: ctx.childrenOf(node.id).length,
    ...(footerAdd ? { footerAdd } : {}),
  });
  return node.id;
}
function addGraphMerge(ctx: GraphCtx, id: string) {
  ctx.gnodes.push({ id, kind: 'merge', w: GRAPH_MERGE_W, h: GRAPH_MERGE_H });
  return id;
}
function addGraphEdge(ctx: GraphCtx, edge: GraphEdgeSpec) {
  ctx.gedges.push(edge);
}
function addGraphInsert(ctx: GraphCtx, id: string, anchorId: string, payload: FlowInsertPayload, label: string) {
  if (ctx.editable) {
    ctx.inserts.push({ id, anchorId, payload, label });
  }
}

function branchEdgeInfo(owner: PipelineFlowNode) {
  if (owner.isErrorPath) {
    return { type: 'error', label: owner.condition ?? 'on error' } satisfies { type: GraphEdgeType; label?: string };
  }
  if (owner.condition) {
    return { type: 'conditional', label: owner.condition } satisfies { type: GraphEdgeType; label?: string };
  }
  if (owner.isDefault) {
    return { type: 'conditional', label: 'default' } satisfies { type: GraphEdgeType; label?: string };
  }
  return { type: 'flow' } satisfies { type: GraphEdgeType; label?: string };
}

function fanUnwrapsChildren(node: PipelineFlowNode) {
  return CASE_CONTAINER_LABELS.has(node.label) && node.section === 'processor';
}

type FanLane = { owner: PipelineFlowNode; bodySteps: PipelineFlowNode[] };

function caseEntrySteps(lane: FanLane) {
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

function fanLaneList(node: PipelineFlowNode, kids: PipelineFlowNode[], ctx: GraphCtx) {
  const unwrap = fanUnwrapsChildren(node);
  return kids.map((kid) =>
    unwrap && kid.kind === 'group'
      ? { owner: kid, bodySteps: ctx.childrenOf(kid.id) }
      : { owner: kid, bodySteps: [kid] }
  );
}

function laneAppendSlot(owner: PipelineFlowNode, atEnd: boolean, ctx: GraphCtx) {
  return (
    owner.insertSlot
      ? { kind: 'insert', ...owner.insertSlot, index: atEnd ? ctx.childrenOf(owner.id).length : 0 }
      : undefined
  ) satisfies FlowInsertPayload | undefined;
}

type FanEnds = { split?: string; merge?: string };

type EmittedLane = { owner: PipelineFlowNode; body: GraphSegment; carriesChip: boolean };

function fanoutEdge(lane: EmittedLane, split: string, merge: string | undefined, ctx: GraphCtx) {
  const { owner, body, carriesChip } = lane;
  const info = branchEdgeInfo(owner);
  const selectTarget = carriesChip ? undefined : owner.caseEditTarget;
  return {
    id: `fanout-${owner.id}`,
    from: split,
    to: body ? body.entry : (merge ?? split),
    type: info.type,
    ...(carriesChip ? {} : { label: info.label }),
    ...(selectTarget ? { selectId: owner.id, selectTarget } : {}),
    ...(body ? {} : { slot: laneAppendSlot(owner, false, ctx) }),
  } satisfies GraphEdgeSpec;
}

function emitFanLane(lane: FanLane, ends: FanEnds, carriesCaseChips: boolean, ctx: GraphCtx) {
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

function emitFan(
  node: PipelineFlowNode,
  kids: PipelineFlowNode[],
  sides: { out: boolean; in: boolean },
  ctx: GraphCtx
) {
  const footerAdd = ctx.editable ? splitAddAction(node, kids.length) : undefined;
  const split = sides.out ? addGraphSplit(ctx, node, footerAdd) : undefined;
  const merge = sides.in
    ? split
      ? addGraphMerge(ctx, `${node.id}-merge`)
      : addGraphSplit(ctx, node, footerAdd)
    : undefined;
  const carriesCaseChips = CASE_CONTAINER_LABELS.has(node.label);
  for (const lane of fanLaneList(node, kids, ctx)) {
    emitFanLane(lane, { split, merge }, carriesCaseChips, ctx);
  }
  return { entry: split ?? merge ?? node.id, exit: merge ?? split ?? node.id } satisfies GraphSegment;
}

function emitSequentialGroup(node: PipelineFlowNode, kids: PipelineFlowNode[], ctx: GraphCtx) {
  const head = addGraphSplit(ctx, node);
  const body = emitSequence(kids, ctx);
  if (body) {
    addGraphEdge(ctx, {
      id: `flow-${head}-${body.entry}`,
      from: head,
      to: body.entry,
      type: node.isErrorPath ? 'error' : 'flow',
      ...(node.insertSlot ? { slot: { kind: 'insert', ...node.insertSlot, index: kids.length } } : {}),
    });
    return { entry: head, exit: body.exit } satisfies GraphSegment;
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
  return { entry: head, exit: head } satisfies GraphSegment;
}

const endInsertSlot = (node: PipelineFlowNode, ctx: GraphCtx) =>
  (node.insertSlot
    ? { kind: 'insert', ...node.insertSlot, index: ctx.childrenOf(node.id).length }
    : undefined) satisfies FlowInsertPayload | undefined;

type TryCatchArm = { node: PipelineFlowNode; head: string; body: GraphSegment; type: GraphEdgeType };

function emitTryCatchArm(arm: TryCatchArm, merge: string, ctx: GraphCtx) {
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

function emitTryCatch(tryNode: PipelineFlowNode, catchNode: PipelineFlowNode, ctx: GraphCtx) {
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
  return { entry: tryHead, exit: merge } satisfies GraphSegment;
}

function emitGraphStep(node: PipelineFlowNode, ctx: GraphCtx) {
  if (node.kind === 'leaf') {
    addGraphCard(ctx, node);
    return { entry: node.id, exit: node.id } satisfies GraphSegment;
  }
  const kids = ctx.childrenOf(node.id);
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

const topLevelProcessorIndex = (n?: PipelineFlowNode) =>
  n?.editTarget?.kind === 'processor' ? n.editTarget.index : undefined;

type SequenceUnit = [PipelineFlowNode] | [PipelineFlowNode, PipelineFlowNode];

function sequenceUnits(steps: PipelineFlowNode[]) {
  const units: SequenceUnit[] = [];
  let i = 0;
  while (i < steps.length) {
    const fusesTryCatch = isTryStep(steps[i]) && isCatchStep(steps[i + 1]);
    units.push(fusesTryCatch ? [steps[i], steps[i + 1]] : [steps[i]]);
    i += fusesTryCatch ? 2 : 1;
  }
  return units;
}

function emitSequenceUnit([step, catchStep]: SequenceUnit, ctx: GraphCtx) {
  return (catchStep ? emitTryCatch(step, catchStep, ctx) : emitGraphStep(step, ctx)) satisfies GraphSegment;
}

function lastProcessorIndexAfter(unit: SequenceUnit, lastProcessorIndex: number) {
  return unit.reduce((index, step) => topLevelProcessorIndex(step) ?? index, lastProcessorIndex);
}

type SequenceChain = { entry?: string; exit?: string };

function appendToChain(
  chain: SequenceChain,
  seg: NonNullable<GraphSegment>,
  insertIndex: number | undefined,
  ctx: GraphCtx
) {
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

function emitSequence(steps: PipelineFlowNode[], ctx: GraphCtx, topLevel = false) {
  const chain: SequenceChain = {};
  let lastProcessorIndex = -1;
  for (const unit of sequenceUnits(steps)) {
    const seg = emitSequenceUnit(unit, ctx);
    const insertIndex = topLevelProcessorIndex(unit[0]) ?? lastProcessorIndex + 1;
    if (seg) {
      appendToChain(chain, seg, topLevel ? insertIndex : undefined, ctx);
    }
    lastProcessorIndex = lastProcessorIndexAfter(unit, lastProcessorIndex);
  }
  return (
    chain.entry !== undefined && chain.exit !== undefined ? { entry: chain.entry, exit: chain.exit } : null
  ) satisfies GraphSegment;
}

function buildPipelineGraph(nodes: PipelineFlowNode[], editable: boolean) {
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
  return ctx;
}

function graphEdgePoints(edge: GraphEdgeSpec, laidOut: DagreGraph<GraphLabel, NodeLabel, EdgeLabel>) {
  const e = laidOut.edge({ v: edge.from, w: edge.to, name: edge.id });
  return (e?.points ?? []) satisfies { x: number; y: number }[];
}

function makeMergeData(ownerId: string) {
  return { label: 'merge', ownerId };
}

type NodeBox = { x: number; y: number; w: number; h: number };

function refEdge(id: string, from: string, to: string, points: { x: number; y: number }[]) {
  return {
    id,
    source: from,
    target: to,
    sourceHandle: 'b',
    targetHandle: 't',
    type: 'flowGraphEdge',
    zIndex: 4,
    data: { tone: 'muted', dashed: true, points },
  } satisfies Edge;
}

type ResourceRef = { userId: string; resourceId: string };

function collectResourceRefs(
  nodes: PipelineFlowNode[],
  resolve: ReturnType<typeof buildResourceRefResolver>,
  boxes: Map<string, NodeBox>
) {
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
  return { refs: [...refs.values()], desiredX } satisfies { refs: ResourceRef[]; desiredX: Map<string, number> };
}

type ResourcePlacement = { resource: PipelineFlowNode; x: number; h: number };

function placeResources(resources: PipelineFlowNode[], desiredX: Map<string, number>, startX: number) {
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

function resourceCardNode({ resource, x, h }: ResourcePlacement, laneY: number) {
  return {
    id: resource.id,
    type: 'flowCard',
    position: { x, y: laneY },
    initialWidth: FULL_DIMS.cardW,
    initialHeight: h,
    zIndex: 8,
    style: { pointerEvents: 'all', transition: 'transform 200ms ease' },
    data: makeFlowNodeData(resource, false, 0),
  } satisfies Node;
}

type CableLanes = { busTop: number; laneY: number };

function resourceCablePoints(user: NodeBox, endX: number, busY: number, laneY: number) {
  const startX = user.x - user.w / 2 + HANDLE_X;
  const startY = user.y + user.h / 2;
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

function resourceCable(ref: ResourceRef, index: number, ctx: CableCtx) {
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
) {
  const ctx: CableCtx = { ...lanes, boxes, resLeft: new Map(placements.map((p) => [p.resource.id, p.x])) };
  return refs.flatMap((ref, i) => resourceCable(ref, i, ctx) ?? []);
}

function placeResourceDependencies(
  nodes: PipelineFlowNode[],
  rfNodes: Node[],
  rfEdges: Edge[],
  boxes: Map<string, NodeBox>,
  bounds: { minX: number; maxX: number; maxY: number }
) {
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

function placeGraphInserts(ctx: GraphCtx, rfNodes: Node[], boxes: Map<string, NodeBox>) {
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

function insertPillNode(ins: GraphInsertSpec, center: { x: number; y: number }) {
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
  } satisfies Node;
}

const GRAPH_EDGE_TONE: Record<GraphEdgeType, 'primary' | 'muted' | 'error'> = {
  flow: 'primary',
  conditional: 'primary',
  error: 'error',
};

function predecessorMap(gedges: GraphEdgeSpec[]) {
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

function forwardRanks(gnodes: GraphNodeSpec[], gedges: GraphEdgeSpec[]) {
  const predecessors = predecessorMap(gedges);
  const rank = new Map<string, number>();
  const inProgress = new Set<string>();
  const rankOf = (id: string) => {
    const cached = rank.get(id);
    if (cached !== undefined) {
      return cached;
    }
    if (inProgress.has(id)) {
      return 0;
    }
    inProgress.add(id);
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

function newDagreGraph() {
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

function layoutGraph(ctx: GraphCtx) {
  const g = newDagreGraph();
  for (const gn of ctx.gnodes) {
    g.setNode(gn.id, { width: gn.w, height: gn.h });
  }
  const ranks = forwardRanks(ctx.gnodes, ctx.gedges);
  for (const ge of ctx.gedges) {
    const minlen = Math.max(1, (ranks.get(ge.to) ?? 0) - (ranks.get(ge.from) ?? 0));
    g.setEdge(ge.from, ge.to, { minlen }, ge.id);
  }
  dagreLayout(g);
  return g;
}

type PlacedGraphNode = { gn: GraphNodeSpec; x: number; y: number; center: NodeBox };

function placeGraphNode(gn: GraphNodeSpec, g: LaidOutGraph) {
  const dn = g.node(gn.id);
  if (!dn) {
    return;
  }
  const cx = dn.x ?? 0;
  const cy = dn.y ?? 0;
  return { gn, x: cx - gn.w / 2, y: cy - gn.h / 2, center: { x: cx, y: cy, w: gn.w, h: gn.h } } satisfies
    | PlacedGraphNode
    | undefined;
}

function graphRfNode({ gn, x, y }: PlacedGraphNode) {
  if (gn.kind === 'merge') {
    return {
      id: gn.id,
      type: 'flowMerge',
      position: { x, y },
      initialWidth: gn.w,
      initialHeight: gn.h,
      zIndex: 8,
      style: { pointerEvents: 'all', transition: 'transform 200ms ease' },
      data: makeMergeData(gn.id.replace(/-merge$/u, '')),
    } satisfies Node;
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
  } satisfies Node;
}

type FlowExtent = { minX: number; maxX: number; maxY: number };

function flowExtent(placed: PlacedGraphNode[]) {
  const minX = Math.min(...placed.map((p) => p.x));
  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: FULL_DIMS.cardW, maxY: FULL_DIMS.leafBaseH } satisfies FlowExtent;
  }
  return {
    minX,
    maxX: Math.max(...placed.map((p) => p.x + p.gn.w)),
    maxY: Math.max(...placed.map((p) => p.y + p.gn.h)),
  } satisfies FlowExtent;
}

function placeFlowNodes(ctx: GraphCtx, g: LaidOutGraph) {
  const placed = ctx.gnodes.map((gn) => placeGraphNode(gn, g)).filter((p) => p !== undefined);
  return {
    rfNodes: placed.map<Node>((p) => graphRfNode(p)),
    centerById: new Map(placed.map((p) => [p.gn.id, p.center])),
    extent: flowExtent(placed),
  };
}

function graphRfEdge(ge: GraphEdgeSpec, g: LaidOutGraph) {
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
      ...((ge.type === 'conditional' || ge.type === 'error') && ge.label ? { labelT: 0.5 } : {}),
    },
  } satisfies Edge;
}

/**
 * Lay out sequential and parallel lanes, with inputs merging and outputs
 * splitting. In edit mode, insertion controls retain their YAML slot even
 * when an invalid entry has no visible card.
 */
export function computeGraphLayout(nodes: PipelineFlowNode[], editable = false) {
  const ctx = buildPipelineGraph(nodes, editable);
  const g = layoutGraph(ctx);
  const { rfNodes, centerById, extent } = placeFlowNodes(ctx, g);
  const rfEdges = ctx.gedges.map<Edge>((ge) => graphRfEdge(ge, g));
  const inserts = placeGraphInserts(ctx, rfNodes, centerById);
  const bounds = {
    minX: extent.minX,
    maxX: Math.max(extent.maxX, inserts.maxX),
    maxY: Math.max(extent.maxY, inserts.maxY),
  };
  const { right, bottom } = placeResourceDependencies(nodes, rfNodes, rfEdges, centerById, bounds);
  return {
    rfNodes,
    rfEdges,
    width: Math.max(right, bounds.maxX) - bounds.minX,
    height: Math.max(bottom, bounds.maxY),
  };
}
