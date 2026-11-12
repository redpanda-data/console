import { isNonEmptyString } from '../../../../utils/string-utils';
import { hasStopSlot, type PipelineFlowNode } from '../utils/pipeline-flow-nodes';
/** Leaf card width on the full canvas; the node component must match this. */
export const FLOW_CARD_WIDTH = 256;
const FLOW_MAX_META_ROWS = 4;

export type FlowDims = {
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
export const FULL_DIMS: FlowDims = {
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
export const FLOW_CONDITION_ROW_H = 30;
// An input's stop-condition row (StopRow), at the foot of its card or its broker/sequence marker.
export const FLOW_STOP_ROW_H = 30;

// Label badge and meta block are separately-padded rows; sum individually to track the rendered card.
function labelAndMetaRowsHeight(node: PipelineFlowNode, dims: FlowDims): number {
  const metaRows = Math.min(
    (node.meta?.length ?? 0) +
      (node.topics && node.topics.length > 0 ? 1 : 0) +
      (node.missingTopic === true ? 1 : 0) +
      (node.missingSasl === true ? 1 : 0),
    FLOW_MAX_META_ROWS
  );
  let h = 0;
  if (isNonEmptyString(node.labelText)) {
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

export function leafCardHeight(node: PipelineFlowNode, dims: FlowDims): number {
  if (node.label === 'none') {
    return FLOW_PLACEHOLDER_LEAF_H;
  }
  const conditionRowH = node.caseEditTarget ? FLOW_CONDITION_ROW_H : 0;
  return dims.leafBaseH + conditionRowH + labelAndMetaRowsHeight(node, dims);
}

// A parallel processor container's alternatives reconverge, unlike output fans which terminate at sinks.
export function reconverges(node: PipelineFlowNode): boolean {
  return node.childFlow === 'parallel' && node.section === 'processor';
}

// Which sides of a container carry routed edges: `out` = fan-out (entry), `in` = fan-in (merge-back).
export function fanSides(node: PipelineFlowNode): { out: boolean; in: boolean } {
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
    ...(isNonEmptyString(node.condition) ? { condition: node.condition } : {}),
    ...(node.isDefault === true ? { isDefault: true } : {}),
    ...(node.isErrorPath === true ? { isErrorPath: true } : {}),
  };
}

/** X offset of a card's top/bottom handles from its left edge; must match the node component. */
export const FLOW_SPINE_HANDLE_LEFT = 18;

function flowIdentityData(node: PipelineFlowNode) {
  return {
    ...(node.editTarget ? { editTarget: node.editTarget } : {}),
    // Travels onto the case's entry card so its condition chip is clickable; distinct from `editTarget`.
    ...(node.caseEditTarget ? { caseEditTarget: node.caseEditTarget } : {}),
    ...(isNonEmptyString(node.caseOwnerId) ? { caseOwnerId: node.caseOwnerId } : {}),
    ...(node.insertSlot ? { insertSlot: node.insertSlot } : {}),
    ...(node.addChildSlot ? { addChildSlot: node.addChildSlot } : {}),
    ...(node.danglingRef === true ? { danglingRef: true } : {}),
  };
}

export function makeFlowNodeData(node: PipelineFlowNode, collapsed: boolean, childCount: number) {
  return {
    label: node.label,
    collapsible: node.collapsible ?? false,
    collapsed,
    ...(node.section ? { section: node.section } : {}),
    ...(isNonEmptyString(node.labelText) ? { labelText: node.labelText } : {}),
    ...(node.topics ? { topics: node.topics } : {}),
    ...(node.meta && node.meta.length > 0 ? { meta: node.meta } : {}),
    ...(node.missingTopic === true ? { missingTopic: true } : {}),
    ...(node.missingSasl === true ? { missingSasl: true } : {}),
    ...(node.isCase === true ? { isCase: true } : {}),
    ...flowIdentityData(node),
    ...(node.stopSlot ? { stopSlot: node.stopSlot } : {}),
    ...(node.endBehavior ? { endBehavior: node.endBehavior } : {}),
    ...(typeof node.usedByCount === 'number' ? { usedByCount: node.usedByCount } : {}),
    ...(childCount > 0 ? { childCount } : {}),
    ...routingData(node),
  };
}
