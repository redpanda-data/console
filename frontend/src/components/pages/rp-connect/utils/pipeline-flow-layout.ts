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
// The whole pipeline renders as one flat left→right DAG: input → processors → output. Control flow
// (switch/branch/try-catch/parallel/…) is flattened into split → body → merge nodes rather than
// nested containers; Dagre assigns ranks and routes edges, and resources sit in a row below as
// dependencies. Card dimensions here must match the node components in pipeline-flow-canvas-nodes.
// ============================================================================

/** Leaf card width on the full canvas; the node component must match this. A touch wider
 * than the minimum so labeled cards and longer meta values aren't horizontally cramped. */
export const FLOW_CARD_WIDTH = 256;
const FLOW_MAX_META_ROWS = 4;

type FlowDims = {
  cardW: number;
  leafBaseH: number;
  metaRowH: number;
  headerH: number;
  // Collapsed container card height. Taller than the header so the spine (anchored
  // ~SPINE_HANDLE_TOP from the top) lands near its centre and arrows look aligned.
  collapsedH: number;
  pad: number;
  stackGap: number;
  colGap: number;
  // Routing-gutter inset on the side a container fans out (gs) / merges back / fans in (gt),
  // plus extra vertical spacing between fanned children, so lines and arrows aren't cramped.
  fanGutter: number;
  fanGap: number;
};
const FULL_DIMS: FlowDims = {
  cardW: FLOW_CARD_WIDTH,
  // Tinted header band (kind label + logo/name + divider). Measured to match ComponentCard
  // so stacked siblings don't overlap.
  leafBaseH: 68,
  metaRowH: 22,
  headerH: 48,
  collapsedH: 72,
  // Inner inset on all sides of a container body — tight so children sit close under the
  // header and the "+ add" row doesn't float far from the stack.
  pad: 12,
  stackGap: 14,
  colGap: 72,
  fanGutter: 48,
  fanGap: 20,
};

// Empty-state "Add input/output" cards are taller/more prominent than a leaf. Height is
// 2× the spine-handle offset (SPINE_HANDLE_TOP = 36) so the arrow lands on its vertical center.
const FLOW_PLACEHOLDER_LEAF_H = 72;
// A `label:` badge renders on its own padded row beneath the full-card header.
const FLOW_LABEL_ROW_H = 30;
// Bottom inset when the label badge is the card's last row (no meta follows).
const FLOW_LABEL_ROW_BOTTOM_PAD = 12;
// The meta block's own vertical padding (rows counted at dims.metaRowH each).
const FLOW_META_BLOCK_PAD = 12;
// A switch case's routing condition row beneath the header (only on case-entry cards —
// those carrying a `caseEditTarget`).
const FLOW_CONDITION_ROW_H = 30;

function leafCardHeight(node: PipelineFlowNode, dims: FlowDims): number {
  if (node.label === 'none') {
    return FLOW_PLACEHOLDER_LEAF_H;
  }
  const metaRows = Math.min(
    (node.meta?.length ?? 0) +
      (node.topics && node.topics.length > 0 ? 1 : 0) +
      (node.missingTopic ? 1 : 0) +
      (node.missingSasl ? 1 : 0),
    FLOW_MAX_META_ROWS
  );
  // Label badge and meta block are separately-padded rows below the header; sum them
  // individually (not as one block) so the measured height tracks the rendered card.
  let h = dims.leafBaseH;
  // A case entry shows its routing condition on its own row beneath the header.
  if (node.caseEditTarget) {
    h += FLOW_CONDITION_ROW_H;
  }
  if (node.labelText) {
    // When the label is the last row (no meta), it carries a bottom inset; mirror that here.
    h += FLOW_LABEL_ROW_H + (metaRows > 0 ? 0 : FLOW_LABEL_ROW_BOTTOM_PAD);
  }
  if (metaRows > 0) {
    h += FLOW_META_BLOCK_PAD + metaRows * dims.metaRowH;
  }
  return h;
}

// A parallel processor container (switch/parallel/group_by): its alternatives reconverge
// (data flows back out and continues), unlike output fans which terminate at their sinks.
function reconverges(node: PipelineFlowNode): boolean {
  return node.childFlow === 'parallel' && node.section === 'processor';
}

// Which sides of a container carry routed edges: `out` is the `gs` source side
// (entry / fan-out), `in` is the `gt` target side (merge-back / fan-in).
function fanSides(node: PipelineFlowNode): { out: boolean; in: boolean } {
  return {
    out: node.childFlow === 'parallel' && node.section !== 'input',
    // Inputs fan in only when parallel (broker); a `sequence` renders as a sequential chain.
    in: (node.section === 'input' && node.childFlow !== 'sequential') || reconverges(node),
  };
}

// What an in-container "+" does: insert a component into a nested array (switch case /
// branch / broker / fallback), or append a fresh case to a switch. Carried on `flowInsert`
// nodes and handed to the editor.
export type FlowInsertPayload =
  | { kind: 'insert'; containerPath: (string | number)[]; accepts: 'input' | 'processor' | 'output'; index: number }
  | { kind: 'addChild'; containerPath: (string | number)[]; section: 'processor' | 'output' };

// Routing condition shown as a chip on the receiving card (not a floating edge label) so
// fanned branches stay readable.
function routingData(node: PipelineFlowNode) {
  return {
    ...(node.condition ? { condition: node.condition } : {}),
    ...(node.isDefault ? { isDefault: true } : {}),
    ...(node.isErrorPath ? { isErrorPath: true } : {}),
  };
}

/** Where the top/bottom handles sit from a card's left edge — the x a vertical spine/
 *  reference cable plugs into. Must match the node component's handle offset. */
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
    // The switch-case edit target travels onto the case's entry card so its condition chip is
    // clickable (selects the case → SwitchCaseEditor). Distinct from `editTarget` (component).
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
// One left-to-right DAG with control flow fully flattened: each switch/branch/try/parallel becomes
// a "split" node whose branches fan out as labelled edges and reconverge at a "merge" node. A flat
// semantic graph goes to Dagre for ranks + edge routing, then maps to React Flow nodes/edges.
// Editing affordances and the resource lane are placed after layout so they don't perturb ranks.
// ============================================================================

const GRAPH_SPLIT_W = FLOW_CARD_WIDTH;
const GRAPH_SPLIT_H = 56;
// A fan construct (switch / broker / parallel) hosts its "Add case / Add input" affordance as
// a footer row INSIDE the card (edit mode) — reserve a row for it.
const GRAPH_SPLIT_FOOTER_H = 34;
const GRAPH_MERGE_W = 48;
const GRAPH_MERGE_H = 32;
const GRAPH_INSERT_W = 150;
const GRAPH_INSERT_H = 24;
// Dagre spacing: gap between ranks (horizontal) and between nodes in a rank (vertical).
// Deliberately roomy (well above the original 64/38) so Dagre can route edges AROUND nodes
// (fewer lines crossing cards) and on-edge condition labels sit in clear space between ranks.
const GRAPH_RANKSEP = 120;
// Generous vertical spacing between stacked branches so routing-condition labels (which sit
// on the fan-out edges) have room, and so adjacent control-flow constructs' scope-region boxes
// sit far enough apart not to overlap.
const GRAPH_NODESEP = 84;
const GRAPH_EDGESEP = 16;
const GRAPH_MARGIN = 24;
// Resource dependency lane: a horizontal bus just below the flow, with the resource cards
// in a row beneath it. Cables drop from each user's bottom, along the bus, into the resource.
const RES_BUS_GAP = 48;
const RES_ROW_GAP = 32;
const RES_BUS_STAGGER = 7;
// Spacing between resource cards in the lane — tighter than a flow colGap so a
// cluster of resources (common when a container is collapsed) doesn't spread far.
const RESOURCE_GAP = 28;
// The bottom/top handle's x offset from a card's left edge (matches NodeHandles).
const HANDLE_X = FLOW_SPINE_HANDLE_LEFT;

type GraphEdgeType = 'flow' | 'conditional' | 'error' | 'reference';

type GraphNodeSpec = {
  id: string;
  kind: 'card' | 'split' | 'merge';
  node?: PipelineFlowNode;
  w: number;
  h: number;
  /** For split (control-flow) markers: how many direct children (cases / steps / stages)
      the construct contains, surfaced on the card as a descriptor. */
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
  // A nested-insert affordance carried ON this edge — rendered as an on-line "+" that
  // inserts into a control-flow body (a switch case, branch, try/catch, …).
  slot?: FlowInsertPayload;
  // A clickable routing-condition label: clicking it selects the case to edit its
  // condition (the SwitchCaseEditor). `selectId` is the node id reported as selected.
  selectId?: string;
  selectTarget?: EditTarget;
};
// An editing affordance placed AFTER layout, just below its anchor node (so it never
// affects Dagre's ranks). Rendered as a dashed "+ Add …" pill (edit mode only).
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
  // Edit mode: node-based add affordances (ghost branches) are only emitted when true so
  // read-only diagrams show nothing dangling. (On-edge "+" slots are view-safe already.)
  editable: boolean;
};

function addGraphCard(ctx: GraphCtx, node: PipelineFlowNode): string {
  ctx.gnodes.push({ id: node.id, kind: 'card', node, w: ctx.dims.cardW, h: leafCardHeight(node, ctx.dims) });
  return node.id;
}
// A fan construct's in-card add affordance: "Add case" for a switch, "Add <input/output>" for a
// broker/sequence/parallel. Computed at parse time (edit mode), rendered as a footer in the card.
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
  return;
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
    // A control-flow construct that is itself a switch-case ENTRY shows the case's routing
    // condition on its own row beneath the header (like a leaf card); a fan construct hosts its
    // add affordance as a footer row — reserve a row for each that's present.
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

// Whether a fan's direct children are structural wrappers to unwrap into a lane (a
// switch's / group_by's cases) rather than items that are each their own lane.
function fanUnwrapsChildren(node: PipelineFlowNode): boolean {
  return CASE_CONTAINER_LABELS.has(node.label) && node.section === 'processor';
}

type FanLane = { owner: PipelineFlowNode; bodySteps: PipelineFlowNode[] };

// A switch case's body steps with the case's routing condition + edit target stamped onto the
// FIRST step, so that step's card renders the condition chip (clickable to edit the case). For
// an output switch the owner IS the first step, so this is idempotent; for a processor switch
// the owner is the case wrapper and the first body processor inherits the chip. Returns a
// shallow clone of the first step (same id → selection/edges/childrenOf still resolve).
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

// A control-flow fan: a split (when data fans out) → each branch's sub-graph → a merge
// (when branches reconverge). Branch = single copy/merge lane; input broker = merge only;
// output fan = split only (sinks terminate).
function emitFan(
  node: PipelineFlowNode,
  kids: PipelineFlowNode[],
  sides: { out: boolean; in: boolean },
  ctx: GraphCtx
): GraphSegment {
  // The construct's "Add case / Add input" affordance renders as a footer INSIDE the fan card
  // (edit mode only) — tied to the node, not a floating pill below it.
  const footerAdd = ctx.editable ? splitAddAction(node, kids.length) : undefined;
  const split = sides.out ? addGraphSplit(ctx, node, footerAdd) : undefined;
  // A fan-in WITHOUT a split (an input broker/sequence) reconverges at the construct
  // itself — render it as a LABELED hub (the broker), not a generic merge dot, so it's
  // clear the inputs feed a broker. A reconverging processor fan keeps a plain merge dot.
  const merge = sides.in
    ? split
      ? addGraphMerge(ctx, `${node.id}-merge`)
      : addGraphSplit(ctx, node, footerAdd)
    : undefined;
  const lanes = fanLaneList(node, kids, ctx);
  const carriesCaseChips = CASE_CONTAINER_LABELS.has(node.label);

  for (const lane of lanes) {
    // For switch/group_by cases the routing condition lives on the case's ENTRY card as a clickable
    // chip (single source of truth, editable in place) — not as a floating edge label that duplicates
    // it and crowds the fan. So push the condition + edit target onto the first body step and
    // drop the edge label. An empty-bodied case (no card yet) keeps the edge label as a fallback.
    const carriesChip = carriesCaseChips && lane.bodySteps.length > 0;
    const body = emitSequence(carriesChip ? caseEntrySteps(lane) : lane.bodySteps, ctx);
    const info = branchEdgeInfo(lane.owner);
    // The "add a step into this body" affordance rides ON the body's terminal edge as an
    // on-line "+" (chain-style lanes only: a switch/group_by case).
    const bodySlot = lane.owner.insertSlot;
    const appendSlot = (atEnd: boolean): FlowInsertPayload | undefined =>
      bodySlot ? { kind: 'insert', ...bodySlot, index: atEnd ? ctx.childrenOf(lane.owner.id).length : 0 } : undefined;
    // The case edit target rides the fan-out edge ONLY when the chip can't host it (empty case);
    // otherwise the entry card's chip owns selection/editing.
    const selectTarget = carriesChip ? undefined : lane.owner.caseEditTarget;
    const fanoutId = `fanout-${lane.owner.id}`;
    if (split) {
      addGraphEdge(ctx, {
        id: fanoutId,
        from: split,
        to: body ? body.entry : (merge ?? split),
        type: info.type,
        ...(carriesChip ? {} : { label: info.label }),
        ...(selectTarget ? { selectId: lane.owner.id, selectTarget } : {}),
        // Empty body: the "+" to add its first step sits on the split→merge edge.
        ...(body ? {} : { slot: appendSlot(false) }),
      });
    }
    if (merge && body) {
      addGraphEdge(ctx, {
        id: `fanin-${lane.owner.id}`,
        from: body.exit,
        to: merge,
        type: lane.owner.isErrorPath ? 'error' : 'flow',
        slot: appendSlot(true),
      });
    }
  }

  const entry = split ?? merge ?? node.id;
  const exit = merge ?? split ?? node.id;
  return { entry, exit };
}

// A sequential construct rendered as a leading marker node (try / catch / for_each / …)
// followed by its body chain. The marker name conveys the construct (e.g. a loop body).
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

// A try immediately followed by a catch: success path = try body, error path = catch body
// (red), both converging at a merge — the canonical dead-letter pattern.
function emitTryCatch(tryNode: PipelineFlowNode, catchNode: PipelineFlowNode, ctx: GraphCtx): GraphSegment {
  const tryHead = addGraphSplit(ctx, tryNode);
  const tryBody = emitSequence(ctx.childrenOf(tryNode.id), ctx);
  const catchHead = addGraphSplit(ctx, catchNode);
  const catchBody = emitSequence(ctx.childrenOf(catchNode.id), ctx);
  const merge = addGraphMerge(ctx, `${tryNode.id}-merge`);

  const trySuccessFrom = tryBody ? tryBody.exit : tryHead;
  if (tryBody) {
    addGraphEdge(ctx, { id: `flow-${tryHead}-${tryBody.entry}`, from: tryHead, to: tryBody.entry, type: 'flow' });
  }
  const trySlot: FlowInsertPayload | undefined = tryNode.insertSlot
    ? { kind: 'insert', ...tryNode.insertSlot, index: ctx.childrenOf(tryNode.id).length }
    : undefined;
  addGraphEdge(ctx, {
    id: `flow-${trySuccessFrom}-${merge}`,
    from: trySuccessFrom,
    to: merge,
    type: 'flow',
    slot: trySlot,
  });
  addGraphEdge(ctx, {
    id: `error-${tryNode.id}-${catchNode.id}`,
    from: tryHead,
    to: catchHead,
    type: 'error',
    label: 'on error',
  });
  const catchSuccessFrom = catchBody ? catchBody.exit : catchHead;
  if (catchBody) {
    addGraphEdge(ctx, {
      id: `flow-${catchHead}-${catchBody.entry}`,
      from: catchHead,
      to: catchBody.entry,
      type: 'error',
    });
  }
  const catchSlot: FlowInsertPayload | undefined = catchNode.insertSlot
    ? { kind: 'insert', ...catchNode.insertSlot, index: ctx.childrenOf(catchNode.id).length }
    : undefined;
  addGraphEdge(ctx, {
    id: `flow-${catchSuccessFrom}-${merge}`,
    from: catchSuccessFrom,
    to: merge,
    type: 'error',
    slot: catchSlot,
  });
  return { entry: tryHead, exit: merge };
}

function emitGraphStep(node: PipelineFlowNode, ctx: GraphCtx): GraphSegment {
  if (node.kind === 'leaf') {
    addGraphCard(ctx, node);
    return { entry: node.id, exit: node.id };
  }
  const kids = ctx.childrenOf(node.id);
  // A `branch` operates on a copy and merges the result back, but visually it reads
  // cleanest as a marker → body → continue (the branch node conveys the copy/merge; its
  // request/result maps are on the card). No separate merge node, no dashed copy/merge
  // edges — those produced redundant merges-in-a-row and a confusing dashed→solid flip.
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

// A top-level processor step's ACTUAL index into `pipeline.processors` — the splice index
// mutations use. Rendered position drifts from it when unparseable entries (`- null`, `- {}`)
// are skipped, so on-edge inserts must carry the YAML index, not a rendered count.
const topLevelProcessorIndex = (n?: PipelineFlowNode): number | undefined =>
  n?.editTarget?.kind === 'processor' ? n.editTarget.index : undefined;

// Chain a list of steps with flow edges. At the top level the connecting edges carry the
// processor-insert index so the spine "+" works. A try immediately followed by a catch is
// fused into one success/error structure.
function emitSequence(steps: PipelineFlowNode[], ctx: GraphCtx, topLevel = false): GraphSegment {
  let entry: string | undefined;
  let prevExit: string | undefined;
  let lastProcessorIndex = -1;
  let i = 0;
  while (i < steps.length) {
    const step = steps[i];
    let seg: GraphSegment;
    let consumed = 1;
    if (isTryStep(step) && isCatchStep(steps[i + 1])) {
      seg = emitTryCatch(step, steps[i + 1], ctx);
      consumed = 2;
    } else {
      seg = emitGraphStep(step, ctx);
    }
    if (seg) {
      if (entry === undefined) {
        entry = seg.entry;
      }
      if (prevExit !== undefined) {
        // Inserting on the edge INTO a processor splices right before it (its YAML index);
        // on the edge into the output it lands right after the last processor.
        const insertIndex = topLevelProcessorIndex(step) ?? lastProcessorIndex + 1;
        addGraphEdge(ctx, {
          id: `flow-${prevExit}-${seg.entry}`,
          from: prevExit,
          to: seg.entry,
          type: 'flow',
          ...(topLevel ? { insertIndex } : {}),
        });
      }
      prevExit = seg.exit;
    }
    if (topLevel) {
      for (let k = 0; k < consumed; k += 1) {
        lastProcessorIndex = topLevelProcessorIndex(steps[i + k]) ?? lastProcessorIndex;
      }
    }
    i += consumed;
  }
  return entry !== undefined && prevExit !== undefined ? { entry, exit: prevExit } : null;
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
  // Resources are NOT in the Dagre flow graph — they're laid out below the flow and wired
  // from each user's BOTTOM as dependency cables (see placeResourceDependencies).
  return ctx;
}

// Smoothly route a polyline through a set of waypoints (the Dagre edge points, capped by
// the real handle endpoints) using quadratic segments through midpoints.
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

// Resources are shared DEPENDENCIES, not flow steps: lay them in a row below the flow,
// each near its user's x, and drop a dashed cable out of each user's BOTTOM, along a bus
// just below the flow, into the resource's TOP. This reads as "this node uses this
// resource" — never out of the flow-output side.
function placeResourceDependencies(
  nodes: PipelineFlowNode[],
  rfNodes: Node[],
  rfEdges: Edge[],
  boxes: Map<string, NodeBox>,
  bounds: { minX: number; maxX: number; maxY: number }
): { right: number; bottom: number } {
  const childrenMap = buildChildrenMap(nodes);
  const resources = sectionChildren(nodes, childrenMap, 'resource');
  if (resources.length === 0) {
    return { right: bounds.maxX, bottom: bounds.maxY };
  }
  const resolve = buildResourceRefResolver(resources);
  // Every (placed user → resource) dependency, and each resource's desired x (its nearest user).
  const refs: { userId: string; resourceId: string }[] = [];
  const desiredX = new Map<string, number>();
  const seen = new Set<string>();
  for (const node of nodes) {
    const resource = node.resourceRef ? resolve(node, node.resourceRef) : undefined;
    const userBox = resource ? boxes.get(node.id) : undefined;
    if (!(resource && userBox)) {
      continue;
    }
    const key = `${node.id}->${resource.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    refs.push({ userId: node.id, resourceId: resource.id });
    const left = userBox.x - userBox.w / 2;
    desiredX.set(resource.id, Math.min(desiredX.get(resource.id) ?? Number.POSITIVE_INFINITY, left));
  }

  // Lay resources left→right (referenced ones at their user's x, then any unreferenced),
  // de-overlapping so no two cards collide.
  const ordered = [
    ...resources
      .filter((r) => desiredX.has(r.id))
      .sort((a, b) => (desiredX.get(a.id) ?? 0) - (desiredX.get(b.id) ?? 0)),
    ...resources.filter((r) => !desiredX.has(r.id)),
  ];
  const laneY = bounds.maxY + RES_BUS_GAP + RES_ROW_GAP;
  const resLeft = new Map<string, number>();
  let cursor = bounds.minX;
  let right = bounds.maxX;
  let bottom = bounds.maxY;
  for (const resource of ordered) {
    const x = Math.max(desiredX.get(resource.id) ?? cursor, cursor);
    resLeft.set(resource.id, x);
    const h = leafCardHeight(resource, FULL_DIMS);
    rfNodes.push({
      id: resource.id,
      type: 'flowCard',
      position: { x, y: laneY },
      initialWidth: FULL_DIMS.cardW,
      initialHeight: h,
      zIndex: 8,
      style: { pointerEvents: 'all', transition: 'transform 200ms ease' },
      data: makeFlowNodeData(resource, false, 0),
    });
    cursor = x + FULL_DIMS.cardW + RESOURCE_GAP;
    right = Math.max(right, x + FULL_DIMS.cardW);
    bottom = Math.max(bottom, laneY + h);
  }

  // Dependency cables: out of the user's bottom, JOG into the clear inter-rank gap nearest
  // the resource (so the drop never crosses the nodes stacked in the user's column), down
  // a staggered bus just below the flow, across to the resource, then into its top.
  refs.forEach((ref, i) => {
    const user = boxes.get(ref.userId);
    const rx = resLeft.get(ref.resourceId);
    if (!(user && rx !== undefined)) {
      return;
    }
    const startX = user.x - user.w / 2 + HANDLE_X;
    const startY = user.y + user.h / 2;
    const endX = rx + HANDLE_X;
    // Drop in the rank gap on whichever side faces the resource — gaps between ranks are
    // node-free, so the vertical run is guaranteed clear of other cards.
    const toLeft = endX < user.x;
    const gapX = toLeft ? user.x - user.w / 2 - GRAPH_RANKSEP / 2 : user.x + user.w / 2 + GRAPH_RANKSEP / 2;
    const busY = bounds.maxY + RES_BUS_GAP + (i % 4) * RES_BUS_STAGGER;
    rfEdges.push(
      refEdge(`ref-${ref.userId}-${ref.resourceId}`, ref.userId, ref.resourceId, [
        { x: startX, y: startY },
        { x: startX, y: startY + 14 },
        { x: gapX, y: startY + 14 },
        { x: gapX, y: busY },
        { x: endX, y: busY },
        { x: endX, y: laneY },
      ])
    );
  });
  return { right, bottom };
}

// Place the editing affordances after layout: a dashed "+ Add …" pill just below its
// control-flow node (close, so it clearly belongs to that node).
function placeGraphInserts(
  ctx: GraphCtx,
  rfNodes: Node[],
  boxes: Map<string, NodeBox>
): { maxX: number; maxY: number } {
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const ins of ctx.inserts) {
    const anchor = boxes.get(ins.anchorId);
    if (!anchor) {
      continue;
    }
    const cx = anchor.x;
    const cy = anchor.y + anchor.h / 2 + 10 + GRAPH_INSERT_H / 2;
    rfNodes.push({
      id: ins.id,
      type: 'flowInsert',
      position: { x: cx - GRAPH_INSERT_W / 2, y: cy - GRAPH_INSERT_H / 2 },
      initialWidth: GRAPH_INSERT_W,
      initialHeight: GRAPH_INSERT_H,
      selectable: false,
      draggable: false,
      zIndex: 8,
      style: { pointerEvents: 'all' },
      data: { payload: ins.payload, label: ins.label, ghost: true },
    });
    maxX = Math.max(maxX, cx + GRAPH_INSERT_W / 2);
    maxY = Math.max(maxY, cy + GRAPH_INSERT_H / 2);
  }
  return { maxX, maxY };
}

const GRAPH_EDGE_TONE: Record<GraphEdgeType, 'primary' | 'muted' | 'error'> = {
  flow: 'primary',
  conditional: 'primary',
  error: 'error',
  reference: 'muted',
};

// Forward longest-path rank for each graph node: distance (in edges) from the nearest source. A
// node's rank is one past its LATEST-arriving predecessor, so nodes hug their predecessors (the
// split) on the left rather than their successors (the merge) on the right. Memoised; the cycle
// guard is defensive (the flow graph is a DAG — loops render as chained bodies, no loopback edge).
function forwardRanks(gnodes: GraphNodeSpec[], gedges: GraphEdgeSpec[]): Map<string, number> {
  const predecessors = new Map<string, string[]>();
  for (const edge of gedges) {
    const list = predecessors.get(edge.to);
    if (list) {
      list.push(edge.from);
    } else {
      predecessors.set(edge.to, [edge.from]);
    }
  }
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
    const preds = predecessors.get(id) ?? [];
    const value = preds.length === 0 ? 0 : Math.max(...preds.map((p) => rankOf(p) + 1));
    inProgress.delete(id);
    rank.set(id, value);
    return value;
  };
  for (const gn of gnodes) {
    rankOf(gn.id);
  }
  return rank;
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
  for (const gn of ctx.gnodes) {
    g.setNode(gn.id, { width: gn.w, height: gn.h });
  }
  // SOURCE-align the layout: pin each node to its forward longest-path rank (distance from input)
  // via per-edge `minlen`, so fanned cases sit just right of their split instead of being pulled
  // right to the merge the way Dagre's successor-based rankers would place them.
  const ranks = forwardRanks(ctx.gnodes, ctx.gedges);
  for (const ge of ctx.gedges) {
    const minlen = Math.max(1, (ranks.get(ge.to) ?? 0) - (ranks.get(ge.from) ?? 0));
    g.setEdge(ge.from, ge.to, { minlen }, ge.id);
  }
  dagreLayout(g);

  const rfNodes: Node[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const centerById = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const gn of ctx.gnodes) {
    const dn = g.node(gn.id);
    if (!dn) {
      continue;
    }
    const cx = dn.x ?? 0;
    const cy = dn.y ?? 0;
    const x = cx - gn.w / 2;
    const y = cy - gn.h / 2;
    centerById.set(gn.id, { x: cx, y: cy, w: gn.w, h: gn.h });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + gn.w);
    maxY = Math.max(maxY, y + gn.h);
    if (gn.kind === 'merge') {
      rfNodes.push({
        id: gn.id,
        type: 'flowMerge',
        position: { x, y },
        initialWidth: gn.w,
        initialHeight: gn.h,
        zIndex: 8,
        style: { pointerEvents: 'all', transition: 'transform 200ms ease' },
        data: makeMergeData(gn.id.replace(/-merge$/, '')),
      });
      continue;
    }
    const node = gn.node as PipelineFlowNode;
    rfNodes.push({
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
    });
  }

  const rfEdges: Edge[] = [];
  for (const ge of ctx.gedges) {
    const points = graphEdgePoints(ge, g);
    const tone = GRAPH_EDGE_TONE[ge.type];
    const dashed = ge.type === 'error' || ge.type === 'reference';
    rfEdges.push({
      id: ge.id,
      source: ge.from,
      target: ge.to,
      sourceHandle: 'r',
      targetHandle: 'l',
      type: 'flowGraphEdge',
      zIndex: 4,
      data: {
        tone,
        dashed,
        label: ge.label,
        points,
        ...(ge.insertIndex === undefined ? {} : { insertIndex: ge.insertIndex }),
        ...(ge.slot ? { slotPayload: ge.slot } : {}),
        ...(ge.selectId && ge.selectTarget ? { selectId: ge.selectId, selectTarget: ge.selectTarget } : {}),
        // Condition labels ride the MIDPOINT of the (roomy) rank gap so they sit in clear space
        // between the split and the target card — not poking into the card nor piling up at the split.
        ...((ge.type === 'conditional' || ge.type === 'error') && ge.label ? { labelT: 0.5 } : {}),
      },
    });
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = FULL_DIMS.cardW;
    maxY = FULL_DIMS.leafBaseH;
  }

  // Editing affordances (ghost branches / inserts) then the resource dependency lane.
  const inserts = placeGraphInserts(ctx, rfNodes, centerById);
  maxX = Math.max(maxX, inserts.maxX);
  maxY = Math.max(maxY, inserts.maxY);
  const { right, bottom } = placeResourceDependencies(nodes, rfNodes, rfEdges, centerById, { minX, maxX, maxY });
  return { rfNodes, rfEdges, width: Math.max(right, maxX) - minX, height: Math.max(bottom, maxY) };
}
