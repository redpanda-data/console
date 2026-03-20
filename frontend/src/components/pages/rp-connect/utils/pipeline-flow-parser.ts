/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import { parse as parseYaml } from 'yaml';

import { firstKey, parseMultiInputs, parseMultiOutputs } from './yaml';

// ============================================================================
// Types
// ============================================================================

type ParsedYamlConfig = {
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  pipeline?: { processors?: Record<string, unknown>[] };
  cache_resources?: unknown[];
  rate_limit_resources?: unknown[];
  buffer?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  tracer?: Record<string, unknown>;
  logger?: Record<string, unknown>;
  redpanda?: Record<string, unknown>;
};

export type FlowNodeKind = 'section' | 'group' | 'leaf';

export type PipelineFlowNode = {
  id: string;
  kind: FlowNodeKind;
  label: string;
  labelText?: string;
  topics?: string[];
  section?: 'input' | 'processor' | 'output' | 'resource';
  parentId?: string;
  collapsible?: boolean;
};

type BranchContext = {
  section: 'input' | 'processor' | 'output';
  parentId: string;
  idPrefix: string;
  depth: number;
};

// ============================================================================
// Tree Parser
// ============================================================================

type GroupSpec = {
  groupId: string;
  groupLabel: string;
  section: 'input' | 'output';
  sectionId: string;
};

function buildGroupWithChildren(spec: GroupSpec, childNames: string[]): PipelineFlowNode[] {
  return [
    {
      id: spec.groupId,
      kind: 'group',
      label: spec.groupLabel,
      section: spec.section,
      parentId: spec.sectionId,
      collapsible: true,
    },
    ...childNames.map(
      (name, i): PipelineFlowNode => ({
        id: `${spec.groupId}-${i}`,
        kind: 'leaf',
        label: name,
        section: spec.section,
        parentId: spec.groupId,
      })
    ),
  ];
}

function extractLabel(obj: Record<string, unknown>): string | undefined {
  return typeof obj.label === 'string' && obj.label !== '' ? obj.label : undefined;
}

function extractTopics(componentConfig: unknown): string[] | undefined {
  if (!componentConfig || typeof componentConfig !== 'object') {
    return;
  }
  const config = componentConfig as Record<string, unknown>;
  if (Array.isArray(config.topics)) {
    const topics = config.topics.filter((t): t is string => typeof t === 'string' && t !== '');
    return topics.length > 0 ? topics : undefined;
  }
  if (typeof config.topic === 'string' && config.topic !== '') {
    return [config.topic];
  }
  return;
}

function parseInputNodes(inputObj: Record<string, unknown>, sectionId: string): PipelineFlowNode[] {
  const inputKey = firstKey(inputObj);
  if (!inputKey) {
    return [];
  }

  const childNames = parseMultiInputs(inputKey, inputObj[inputKey]);
  if (childNames && childNames.length > 0) {
    return buildGroupWithChildren(
      { groupId: `input-${inputKey}`, groupLabel: inputKey, section: 'input', sectionId },
      childNames
    );
  }

  const labelText = extractLabel(inputObj);
  const topics = extractTopics(inputObj[inputKey]);
  return [{ id: 'input-0', kind: 'leaf', label: inputKey, labelText, topics, section: 'input', parentId: sectionId }];
}

const BRANCHING_FIELDS = new Set([
  'while',
  'workflow',
  'switch',
  'catch',
  'try',
  'for_each',
  'parallel',
  'branch',
  'cached',
  'retry',
  'group_by',
  'group_by_value',
  'processors',
]);

const MAX_BRANCH_DEPTH = 3;

function extractProcessorArray(value: unknown): Record<string, unknown>[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((v) => v && typeof v === 'object') as Record<string, unknown>[];
  }
  return;
}

function makeLeaf(name: string, ctx: BranchContext): PipelineFlowNode {
  return { id: ctx.idPrefix, kind: 'leaf', label: name, section: ctx.section, parentId: ctx.parentId };
}

function makeGroup(name: string, ctx: BranchContext): PipelineFlowNode {
  return {
    id: ctx.idPrefix,
    kind: 'group',
    label: name,
    section: ctx.section,
    parentId: ctx.parentId,
    collapsible: true,
  };
}

function parseSwitchCases(cases: unknown[], ctx: BranchContext): PipelineFlowNode[] {
  const nodes: PipelineFlowNode[] = [];
  for (const [ci, caseObj] of cases.entries()) {
    if (!caseObj || typeof caseObj !== 'object') {
      continue;
    }
    const caseRecord = caseObj as Record<string, unknown>;
    const caseProcs = extractProcessorArray(caseRecord.processors);
    if (!caseProcs) {
      continue;
    }
    const caseId = `${ctx.idPrefix}-case-${ci + 1}`;
    const caseLabel = `case ${ci + 1}`;
    nodes.push({
      id: caseId,
      kind: 'group',
      label: caseLabel,
      section: ctx.section,
      parentId: ctx.idPrefix,
      collapsible: true,
    });
    pushProcessorChildren(nodes, caseProcs, { ...ctx, parentId: caseId, idPrefix: caseId });
  }
  return nodes;
}

function parseWorkflowStages(fieldValue: unknown, ctx: BranchContext): PipelineFlowNode[] {
  if (!fieldValue || typeof fieldValue !== 'object') {
    return [];
  }
  const stages = (fieldValue as Record<string, unknown>).stages;
  if (!stages || typeof stages !== 'object') {
    return [];
  }
  const nodes: PipelineFlowNode[] = [];
  for (const [stageName, stageValue] of Object.entries(stages as Record<string, unknown>)) {
    if (!stageValue || typeof stageValue !== 'object') {
      continue;
    }
    const stageProcs = extractProcessorArray((stageValue as Record<string, unknown>).processors);
    if (!stageProcs) {
      continue;
    }
    const stageId = `${ctx.idPrefix}-stage-${stageName}`;
    nodes.push({
      id: stageId,
      kind: 'group',
      label: stageName,
      section: ctx.section,
      parentId: ctx.idPrefix,
      collapsible: true,
    });
    pushProcessorChildren(nodes, stageProcs, { ...ctx, parentId: stageId, idPrefix: stageId });
  }
  return nodes;
}

function pushProcessorChildren(nodes: PipelineFlowNode[], procs: Record<string, unknown>[], ctx: BranchContext): void {
  for (const [pi, proc] of procs.entries()) {
    const procName = firstKey(proc);
    if (procName) {
      nodes.push(
        ...parseComponentWithBranching(procName, proc[procName], {
          ...ctx,
          parentId: ctx.parentId,
          idPrefix: `${ctx.idPrefix}-p${pi}`,
          depth: ctx.depth + 1,
        })
      );
    }
  }
}

function parseWrappedProcessor(fieldValue: unknown, ctx: BranchContext, key: string): PipelineFlowNode[] {
  if (!fieldValue || typeof fieldValue !== 'object') {
    return [];
  }
  const wrappedConfig = fieldValue as Record<string, unknown>;
  for (const [innerKey, innerValue] of Object.entries(wrappedConfig)) {
    if (
      innerKey !== 'key' &&
      innerKey !== 'count' &&
      innerKey !== 'backoff' &&
      innerValue &&
      typeof innerValue === 'object'
    ) {
      return parseComponentWithBranching(innerKey, innerValue, {
        ...ctx,
        idPrefix: `${ctx.idPrefix}-${key}-inner`,
        depth: ctx.depth + 1,
      });
    }
  }
  return [];
}

const PROCESSORS_FIELD_KEYS = new Set(['while', 'branch', 'group_by', 'group_by_value']);

function parseBranchingField(key: string, fieldValue: unknown, ctx: BranchContext): PipelineFlowNode[] {
  if (key === 'switch' && Array.isArray(fieldValue)) {
    return parseSwitchCases(fieldValue, ctx);
  }
  if (key === 'workflow') {
    return parseWorkflowStages(fieldValue, ctx);
  }
  if (PROCESSORS_FIELD_KEYS.has(key) && fieldValue && typeof fieldValue === 'object') {
    const innerProcs = extractProcessorArray((fieldValue as Record<string, unknown>).processors);
    if (innerProcs) {
      const nodes: PipelineFlowNode[] = [];
      pushProcessorChildren(nodes, innerProcs, { ...ctx, idPrefix: `${ctx.idPrefix}-${key}` });
      return nodes;
    }
    return [];
  }
  const procArray = extractProcessorArray(fieldValue);
  if (procArray) {
    const nodes: PipelineFlowNode[] = [];
    pushProcessorChildren(nodes, procArray, { ...ctx, idPrefix: `${ctx.idPrefix}-${key}` });
    return nodes;
  }
  if (key === 'cached' || key === 'retry') {
    return parseWrappedProcessor(fieldValue, ctx, key);
  }
  return [];
}

function parseBranchingKeys(config: Record<string, unknown>, ctx: BranchContext): PipelineFlowNode[] {
  const branchingKeys = Object.keys(config).filter((k) => BRANCHING_FIELDS.has(k));
  if (branchingKeys.length === 0) {
    return [];
  }
  // Children of the group node use ctx.idPrefix as their parentId
  const childCtx: BranchContext = { ...ctx, parentId: ctx.idPrefix };
  return branchingKeys.flatMap((key) => parseBranchingField(key, config[key], childCtx));
}

function parseDirectArrayBranching(
  componentName: string,
  componentValue: unknown[],
  ctx: BranchContext
): PipelineFlowNode[] {
  if (componentName === 'switch') {
    const caseNodes = parseSwitchCases(componentValue, ctx);
    if (caseNodes.length > 0) {
      return [makeGroup(componentName, ctx), ...caseNodes];
    }
    return [makeLeaf(componentName, ctx)];
  }

  const procArray = extractProcessorArray(componentValue);
  if (procArray && procArray.length > 0) {
    const nodes: PipelineFlowNode[] = [makeGroup(componentName, ctx)];
    pushProcessorChildren(nodes, procArray, { ...ctx, parentId: ctx.idPrefix });
    return nodes;
  }
  return [makeLeaf(componentName, ctx)];
}

function parseComponentWithBranching(
  componentName: string,
  componentValue: unknown,
  ctx: BranchContext
): PipelineFlowNode[] {
  if (ctx.depth >= MAX_BRANCH_DEPTH || !componentValue || typeof componentValue !== 'object') {
    return [makeLeaf(componentName, ctx)];
  }

  if (Array.isArray(componentValue) && BRANCHING_FIELDS.has(componentName)) {
    return parseDirectArrayBranching(componentName, componentValue, ctx);
  }

  const config = componentValue as Record<string, unknown>;
  const childNodes = parseBranchingKeys(config, ctx);
  if (childNodes.length === 0) {
    return [makeLeaf(componentName, ctx)];
  }

  return [makeGroup(componentName, ctx), ...childNodes];
}

function parseProcessorNodes(processors: Record<string, unknown>[], sectionId: string): PipelineFlowNode[] {
  return processors.flatMap((proc, i): PipelineFlowNode[] => {
    const name = firstKey(proc);
    if (!name) {
      return [];
    }
    const labelText = extractLabel(proc);
    const ctx: BranchContext = { section: 'processor', parentId: sectionId, idPrefix: `proc-${i}`, depth: 0 };
    const nodes = parseComponentWithBranching(name, proc[name], ctx);
    if (labelText && nodes.length > 0) {
      nodes[0] = { ...nodes[0], labelText };
    }
    return nodes;
  });
}

const RESOURCE_YAML_KEYS = [
  'cache_resources',
  'rate_limit_resources',
  'buffer',
  'metrics',
  'tracer',
  'logger',
  'redpanda',
] as const;

function parseArrayResource(value: unknown[], key: string, sectionId: string): PipelineFlowNode[] {
  const nodes: PipelineFlowNode[] = [];
  for (const [i, item] of value.entries()) {
    if (item && typeof item === 'object') {
      const itemObj = item as Record<string, unknown>;
      const itemName = firstKey(itemObj);
      const labelText = extractLabel(itemObj);
      nodes.push({
        id: `resource-${key}-${i}`,
        kind: 'leaf',
        label: itemName || key,
        labelText,
        section: 'resource',
        parentId: sectionId,
      });
    }
  }
  return nodes;
}

function parseResourceNodes(config: ParsedYamlConfig, sectionId: string): PipelineFlowNode[] {
  const nodes: PipelineFlowNode[] = [];
  for (const key of RESOURCE_YAML_KEYS) {
    const value = config[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      nodes.push(...parseArrayResource(value, key, sectionId));
    } else {
      nodes.push({ id: `resource-${key}`, kind: 'leaf', label: key, section: 'resource', parentId: sectionId });
    }
  }
  return nodes;
}

function parseOutputNodes(outputObj: Record<string, unknown>, sectionId: string): PipelineFlowNode[] {
  const outputKey = firstKey(outputObj);
  if (!outputKey) {
    return [];
  }

  const childNames = parseMultiOutputs(outputKey, outputObj[outputKey]);
  if (childNames && childNames.length > 0) {
    return buildGroupWithChildren(
      { groupId: `output-${outputKey}`, groupLabel: outputKey, section: 'output', sectionId },
      childNames
    );
  }

  const labelText = extractLabel(outputObj);
  const topics = extractTopics(outputObj[outputKey]);
  return [
    { id: 'output-0', kind: 'leaf', label: outputKey, labelText, topics, section: 'output', parentId: sectionId },
  ];
}

// ============================================================================
// Section Builders
// ============================================================================

function buildInputSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig): void {
  const sectionId = 'section-input';
  nodes.push({ id: sectionId, kind: 'section', label: 'input', section: 'input' });
  if (config.input && typeof config.input === 'object') {
    nodes.push(...parseInputNodes(config.input as Record<string, unknown>, sectionId));
  } else {
    nodes.push({ id: 'input-placeholder', kind: 'leaf', label: 'none', section: 'input', parentId: sectionId });
  }
}

function buildProcessorSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig): void {
  if (!(config.pipeline && Array.isArray(config.pipeline.processors))) {
    return;
  }
  const sectionId = 'section-processors';
  nodes.push({ id: sectionId, kind: 'section', label: 'processors', section: 'processor' });
  nodes.push(...parseProcessorNodes(config.pipeline.processors as Record<string, unknown>[], sectionId));
}

function buildResourceSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig): void {
  const resourceNodes = parseResourceNodes(config, 'section-resources');
  if (resourceNodes.length === 0) {
    return;
  }
  const sectionId = 'section-resources';
  nodes.push({ id: sectionId, kind: 'section', label: 'resources', section: 'resource' });
  nodes.push(...resourceNodes);
}

function buildOutputSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig): void {
  const sectionId = 'section-output';
  nodes.push({ id: sectionId, kind: 'section', label: 'output', section: 'output' });
  if (config.output && typeof config.output === 'object') {
    nodes.push(...parseOutputNodes(config.output as Record<string, unknown>, sectionId));
  } else {
    nodes.push({ id: 'output-placeholder', kind: 'leaf', label: 'none', section: 'output', parentId: sectionId });
  }
}

// ============================================================================
// Public API
// ============================================================================

export type ParsePipelineFlowTreeResult = { nodes: PipelineFlowNode[]; error?: string };

export type ParsePipelineFlowTreeOptions = {
  /** Prefix all node/edge IDs to avoid collisions when multiple diagrams are mounted. */
  idPrefix?: string;
};

const EMPTY_CONFIG_NODES: PipelineFlowNode[] = [
  { id: 'section-input', kind: 'section', label: 'input', section: 'input' },
  { id: 'input-placeholder', kind: 'leaf', label: 'none', section: 'input', parentId: 'section-input' },
  { id: 'section-output', kind: 'section', label: 'output', section: 'output' },
  { id: 'output-placeholder', kind: 'leaf', label: 'none', section: 'output', parentId: 'section-output' },
];

function prefixNodeIds(nodes: PipelineFlowNode[], prefix: string): PipelineFlowNode[] {
  return nodes.map((n) => ({
    ...n,
    id: `${prefix}${n.id}`,
    parentId: n.parentId ? `${prefix}${n.parentId}` : undefined,
  }));
}

export function parsePipelineFlowTree(
  configYaml: string,
  options?: ParsePipelineFlowTreeOptions
): ParsePipelineFlowTreeResult {
  const prefix = options?.idPrefix ? `${options.idPrefix}-` : '';

  if (!configYaml) {
    return { nodes: prefix ? prefixNodeIds(EMPTY_CONFIG_NODES, prefix) : EMPTY_CONFIG_NODES };
  }

  try {
    const config = (parseYaml(configYaml) as ParsedYamlConfig | null) ?? {};
    const nodes: PipelineFlowNode[] = [];

    buildInputSection(nodes, config);
    buildProcessorSection(nodes, config);
    buildResourceSection(nodes, config);
    buildOutputSection(nodes, config);

    return { nodes: prefix ? prefixNodeIds(nodes, prefix) : nodes };
  } catch (err) {
    return { nodes: [], error: err instanceof Error ? err.message : 'Invalid YAML' };
  }
}

// ============================================================================
// Tree Layout Algorithm
// ============================================================================

const INDENT_X = 40;
const NODE_H_DEFAULT = 28;
const NODE_H_LEAF = 36;
const ROW_GAP = 8;
const SECTION_GAP = 16;
const ROOT_X = 8;

const NODE_TYPE_MAP: Record<FlowNodeKind, string> = {
  section: 'treeSection',
  group: 'treeGroup',
  leaf: 'treeLeaf',
};

type LayoutState = {
  rfNodes: Node[];
  rfEdges: Edge[];
  y: number;
  childrenMap: Map<string | undefined, PipelineFlowNode[]>;
  collapsedIds: ReadonlySet<string>;
};

type RfNodeParams = {
  node: PipelineFlowNode;
  depth: number;
  nodeY: number;
  isHidden: boolean;
};

function createRfNode(params: RfNodeParams, state: LayoutState): Node {
  const { node, depth, nodeY, isHidden } = params;
  return {
    id: node.id,
    type: NODE_TYPE_MAP[node.kind],
    position: { x: ROOT_X + depth * INDENT_X, y: nodeY },
    style: {
      opacity: isHidden ? 0 : 1,
      pointerEvents: isHidden ? 'none' : undefined,
      transition: 'transform 200ms ease, opacity 150ms ease',
    },
    data: {
      label: node.label,
      collapsed: state.collapsedIds.has(node.id),
      collapsible: node.collapsible ?? false,
      ...(node.labelText ? { labelText: node.labelText } : {}),
      ...(node.topics ? { topics: node.topics } : {}),
      ...(node.section ? { section: node.section } : {}),
      ...(state.collapsedIds.has(node.id) ? { childCount: state.childrenMap.get(node.id)?.length ?? 0 } : {}),
    },
  };
}

function createTreeEdge(parentId: string, node: PipelineFlowNode, isHidden: boolean): Edge {
  return {
    id: `e-${parentId}-${node.id}`,
    source: parentId,
    target: node.id,
    type: 'treeEdge',
    hidden: isHidden,
    markerEnd: { type: MarkerType.Arrow, width: 16, height: 16, color: 'var(--color-border)' },
  };
}

type DfsParams = {
  node: PipelineFlowNode;
  depth: number;
  hiddenByParent: boolean;
  snapY: number;
};

function layoutDfs(params: DfsParams, state: LayoutState): void {
  const { node, depth, hiddenByParent, snapY } = params;

  if (!hiddenByParent && node.kind === 'section' && state.y > 0) {
    state.y += SECTION_GAP;
  }

  const nodeY = hiddenByParent ? snapY : state.y;
  state.rfNodes.push(createRfNode({ node, depth, nodeY, isHidden: hiddenByParent }, state));

  if (node.parentId) {
    state.rfEdges.push(createTreeEdge(node.parentId, node, hiddenByParent));
  }

  if (!hiddenByParent) {
    const nodeH = node.kind === 'leaf' ? NODE_H_LEAF : NODE_H_DEFAULT;
    state.y += nodeH + ROW_GAP;
  }

  const children = state.childrenMap.get(node.id);
  if (children) {
    const childHidden = hiddenByParent || state.collapsedIds.has(node.id);
    for (const child of children) {
      layoutDfs({ node: child, depth: depth + 1, hiddenByParent: childHidden, snapY: nodeY }, state);
    }
  }
}

export function computeTreeLayout(
  nodes: PipelineFlowNode[],
  collapsedIds: ReadonlySet<string> = new Set()
): { rfNodes: Node[]; rfEdges: Edge[]; height: number } {
  if (nodes.length === 0) {
    return { rfNodes: [], rfEdges: [], height: 200 };
  }

  const childrenMap = new Map<string | undefined, PipelineFlowNode[]>();
  for (const node of nodes) {
    const siblings = childrenMap.get(node.parentId);
    if (siblings) {
      siblings.push(node);
    } else {
      childrenMap.set(node.parentId, [node]);
    }
  }

  const state: LayoutState = { rfNodes: [], rfEdges: [], y: 0, childrenMap, collapsedIds };

  const roots = childrenMap.get(undefined);
  if (roots) {
    for (const root of roots) {
      layoutDfs({ node: root, depth: 0, hiddenByParent: false, snapY: 0 }, state);
    }
  }

  // Add section-to-section edges
  const sectionNodes = state.rfNodes.filter((n) => n.type === 'treeSection');
  for (let i = 0; i < sectionNodes.length - 1; i++) {
    state.rfEdges.push({
      id: `section-edge-${i}`,
      source: sectionNodes[i].id,
      target: sectionNodes[i + 1].id,
      type: 'sectionEdge',
      markerEnd: { type: MarkerType.Arrow, width: 14, height: 14, color: 'var(--color-primary)' },
    });
  }

  const MIN_HEIGHT = 200;
  return { rfNodes: state.rfNodes, rfEdges: state.rfEdges, height: Math.max(MIN_HEIGHT, state.y + 8) };
}
