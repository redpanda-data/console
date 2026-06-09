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

import { type NodeMetaEntry, summarizeComponent } from './pipeline-flow-meta';
import { type EditTarget, firstKey, parseMultiInputs, parseMultiOutputs, type ResourceArrayKey } from './yaml';
import { REDPANDA_TOPIC_AND_USER_COMPONENTS } from '../types/constants';

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

const REDPANDA_COMPONENTS: ReadonlySet<string> = new Set(REDPANDA_TOPIC_AND_USER_COMPONENTS);

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
  missingTopic?: boolean;
  missingSasl?: boolean;
  // Set only on top-level, visually editable nodes (input/output/top-level
  // processor/array resource). Drives the visual editor's edit & delete actions;
  // nested nodes intentionally have none and stay read-only.
  editTarget?: EditTarget;
  // Key config values surfaced on the expanded canvas card (ignored by the mini lane).
  meta?: NodeMetaEntry[];
  // For group nodes: how the data flows through the children. `sequential` chains
  // them (a sub-pipeline, e.g. branch/catch processors); `parallel` fans out to all
  // of them (alternatives/merges, e.g. switch cases, broker inputs). Defaults to
  // sequential when unset.
  childFlow?: 'sequential' | 'parallel';
};

type BranchContext = {
  section: 'input' | 'processor' | 'output';
  parentId: string;
  idPrefix: string;
  depth: number;
};

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
      // A `sequence` input runs its children in order; broker/switch/fallback fan out.
      childFlow: spec.groupLabel === 'sequence' ? 'sequential' : 'parallel',
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

function hasNonEmptySasl(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  const sasl = (obj as Record<string, unknown>).sasl;
  if (!sasl) {
    return false;
  }
  if (Array.isArray(sasl)) {
    return sasl.length > 0;
  }
  if (typeof sasl === 'object') {
    return Object.keys(sasl as object).length > 0;
  }
  return false;
}

function hasSaslConfig(componentConfig: unknown, rootConfig: ParsedYamlConfig): boolean {
  if (hasNonEmptySasl(componentConfig)) {
    return true;
  }
  if (hasNonEmptySasl(rootConfig.redpanda)) {
    return true;
  }
  return false;
}

function parseInputNodes(
  inputObj: Record<string, unknown>,
  sectionId: string,
  config: ParsedYamlConfig
): PipelineFlowNode[] {
  const inputKey = firstKey(inputObj);
  if (!inputKey) {
    return [];
  }

  const childNames = parseMultiInputs(inputKey, inputObj[inputKey]);
  if (childNames && childNames.length > 0) {
    const groupNodes = buildGroupWithChildren(
      { groupId: `input-${inputKey}`, groupLabel: inputKey, section: 'input', sectionId },
      childNames
    );
    groupNodes[0] = { ...groupNodes[0], editTarget: { kind: 'input' } };
    return groupNodes;
  }

  const labelText = extractLabel(inputObj);
  const topics = extractTopics(inputObj[inputKey]);
  const isRedpanda = REDPANDA_COMPONENTS.has(inputKey);
  return [
    {
      id: 'input-0',
      kind: 'leaf',
      label: inputKey,
      labelText,
      topics,
      section: 'input',
      parentId: sectionId,
      missingTopic: isRedpanda && !topics ? true : undefined,
      missingSasl: isRedpanda && !hasSaslConfig(inputObj[inputKey], config) ? true : undefined,
      editTarget: { kind: 'input' },
      meta: summarizeComponent(inputKey, inputObj[inputKey]),
    },
  ];
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

// Components whose children are alternatives/parallel branches rather than a
// sequential sub-pipeline.
const PARALLEL_GROUP_COMPONENTS: ReadonlySet<string> = new Set(['switch', 'workflow', 'parallel']);

function makeGroup(name: string, ctx: BranchContext): PipelineFlowNode {
  return {
    id: ctx.idPrefix,
    kind: 'group',
    label: name,
    section: ctx.section,
    parentId: ctx.parentId,
    collapsible: true,
    childFlow: PARALLEL_GROUP_COMPONENTS.has(name) ? 'parallel' : 'sequential',
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
      childFlow: 'sequential',
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
      childFlow: 'sequential',
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
    // The first node is the top-level processor; mark it editable by array index.
    if (nodes.length > 0) {
      nodes[0] = {
        ...nodes[0],
        ...(labelText ? { labelText } : {}),
        editTarget: { kind: 'processor', index: i },
        meta: summarizeComponent(name, proc[name]),
      };
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

// Array resources addressable by the visual editor (cache/rate-limit). Singleton
// root resources (buffer/metrics/tracer/…) are read-only for now.
const EDITABLE_RESOURCE_KEYS: ReadonlySet<string> = new Set(['cache_resources', 'rate_limit_resources']);

function parseArrayResource(value: unknown[], key: string, sectionId: string): PipelineFlowNode[] {
  const nodes: PipelineFlowNode[] = [];
  const editable = EDITABLE_RESOURCE_KEYS.has(key);
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
        editTarget: editable ? { kind: 'resource', resourceKey: key as ResourceArrayKey, index: i } : undefined,
        meta: itemName ? summarizeComponent(itemName, itemObj[itemName]) : undefined,
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

function parseOutputNodes(
  outputObj: Record<string, unknown>,
  sectionId: string,
  config: ParsedYamlConfig
): PipelineFlowNode[] {
  const outputKey = firstKey(outputObj);
  if (!outputKey) {
    return [];
  }

  const childNames = parseMultiOutputs(outputKey, outputObj[outputKey]);
  if (childNames && childNames.length > 0) {
    const groupNodes = buildGroupWithChildren(
      { groupId: `output-${outputKey}`, groupLabel: outputKey, section: 'output', sectionId },
      childNames
    );
    groupNodes[0] = { ...groupNodes[0], editTarget: { kind: 'output' } };
    return groupNodes;
  }

  const labelText = extractLabel(outputObj);
  const topics = extractTopics(outputObj[outputKey]);
  const isRedpanda = REDPANDA_COMPONENTS.has(outputKey);
  return [
    {
      id: 'output-0',
      kind: 'leaf',
      label: outputKey,
      labelText,
      topics,
      section: 'output',
      parentId: sectionId,
      missingTopic: isRedpanda && !topics ? true : undefined,
      missingSasl: isRedpanda && !hasSaslConfig(outputObj[outputKey], config) ? true : undefined,
      editTarget: { kind: 'output' },
      meta: summarizeComponent(outputKey, outputObj[outputKey]),
    },
  ];
}

function buildInputSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig): void {
  const sectionId = 'section-input';
  nodes.push({ id: sectionId, kind: 'section', label: 'input', section: 'input' });
  if (config.input && typeof config.input === 'object') {
    nodes.push(...parseInputNodes(config.input as Record<string, unknown>, sectionId, config));
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
    nodes.push(...parseOutputNodes(config.output as Record<string, unknown>, sectionId, config));
  } else {
    nodes.push({ id: 'output-placeholder', kind: 'leaf', label: 'none', section: 'output', parentId: sectionId });
  }
}

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
// Shared data-flow model
// ----------------------------------------------------------------------------
// Both layouts draw the same flow: the main data path runs input → each
// top-level processor → output, and every group threads its own children
// (sequential sub-pipelines chain; parallel branches fan out). Positioning is
// layout-specific, but the connections come from these helpers so the mini lane
// and the expanded canvas agree on how data moves through the graph.
// ============================================================================

function buildChildrenMap(nodes: PipelineFlowNode[]): Map<string | undefined, PipelineFlowNode[]> {
  const map = new Map<string | undefined, PipelineFlowNode[]>();
  for (const node of nodes) {
    const siblings = map.get(node.parentId);
    if (siblings) {
      siblings.push(node);
    } else {
      map.set(node.parentId, [node]);
    }
  }
  return map;
}

/** The linear data path: input component(s) → top-level processors → output(s). */
export function mainFlowSequence(nodes: PipelineFlowNode[]): PipelineFlowNode[] {
  const map = buildChildrenMap(nodes);
  const childrenOf = (id: string) => map.get(id) ?? [];
  return [...childrenOf('section-input'), ...childrenOf('section-processors'), ...childrenOf('section-output')];
}

export type FlowConnection = { from: string; to: string };

// Connections for a single group's children based on how its data flows.
function groupChildConnections(node: PipelineFlowNode, kids: PipelineFlowNode[]): FlowConnection[] {
  // Inputs are merged: each child input flows INTO the broker/sequence.
  if (node.section === 'input') {
    return kids.map((kid) => ({ from: kid.id, to: node.id }));
  }
  // Alternatives / parallel branches: the group fans out to each child.
  if (node.childFlow === 'parallel') {
    return kids.map((kid) => ({ from: node.id, to: kid.id }));
  }
  // Sequential sub-pipeline: enter the first child, then chain the rest.
  const connections: FlowConnection[] = [{ from: node.id, to: kids[0].id }];
  for (let i = 0; i < kids.length - 1; i += 1) {
    connections.push({ from: kids[i].id, to: kids[i + 1].id });
  }
  return connections;
}

/** Connections inside each group/branch: sequential children chain, parallel fan out. */
export function subFlowConnections(nodes: PipelineFlowNode[]): FlowConnection[] {
  const map = buildChildrenMap(nodes);
  const connections: FlowConnection[] = [];
  for (const node of nodes) {
    if (node.kind !== 'group') {
      continue;
    }
    const kids = map.get(node.id) ?? [];
    if (kids.length > 0) {
      connections.push(...groupChildConnections(node, kids));
    }
  }
  return connections;
}

const INDENT_X = 40;
export const MAX_NESTING_DEPTH = 5;
const NODE_H_DEFAULT = 28;
const NODE_H_LEAF = 36;
const ROW_GAP = 8;
const SECTION_GAP = 16;
// Left gutter for the whole tree. The section spine (an edge anchored to the
// left-0 handles of nodes in this column) sits at ROOT_X, so this also keeps the
// vertical line off the visualizer's left edge.
const ROOT_X = 12;
const ROOT_Y = 4;

// Must stay in sync with TreeLeafNode's `gap-1.5` (6px) + chip/badge height (~24px).
const LEAF_EXTRA_ROW_H = 28;
const LEAF_EXTRA_TOP_GAP = 8;

function countLeafExtraRows(node: PipelineFlowNode): number {
  let n = 0;
  if (node.labelText) {
    n++;
  }
  if (node.topics && node.topics.length > 0) {
    n++;
  }
  if (node.missingTopic) {
    n++;
  }
  if (node.missingSasl) {
    n++;
  }
  return n;
}

function leafHeight(node: PipelineFlowNode): number {
  const extras = countLeafExtraRows(node);
  if (extras === 0) {
    return NODE_H_LEAF;
  }
  return NODE_H_LEAF + LEAF_EXTRA_TOP_GAP + extras * LEAF_EXTRA_ROW_H;
}

const NODE_TYPE_MAP: Record<FlowNodeKind, string> = {
  section: 'treeSection',
  group: 'treeGroup',
  leaf: 'treeLeaf',
};

type LayoutState = {
  rfNodes: Node[];
  rfEdges: Edge[];
  y: number;
  maxDepth: number;
  childrenMap: Map<string | undefined, PipelineFlowNode[]>;
  collapsedIds: ReadonlySet<string>;
  // Ids of nodes hidden because an ancestor is collapsed; their flow edges are hidden too.
  hiddenIds: Set<string>;
};

type RfNodeParams = {
  node: PipelineFlowNode;
  depth: number;
  nodeY: number;
  isHidden: boolean;
  isCollapsed: boolean;
};

function countDescendants(nodeId: string, childrenMap: Map<string | undefined, PipelineFlowNode[]>): number {
  const children = childrenMap.get(nodeId);
  if (!children) {
    return 0;
  }
  let count = children.length;
  for (const child of children) {
    count += countDescendants(child.id, childrenMap);
  }
  return count;
}

function createRfNode(params: RfNodeParams, state: LayoutState): Node {
  const { node, depth, nodeY, isHidden, isCollapsed } = params;
  return {
    id: node.id,
    type: NODE_TYPE_MAP[node.kind],
    position: { x: ROOT_X + depth * INDENT_X, y: ROOT_Y + nodeY },
    style: {
      opacity: isHidden ? 0 : 1,
      pointerEvents: isHidden ? 'none' : undefined,
      transition: 'transform 200ms ease, opacity 150ms ease',
    },
    data: {
      label: node.label,
      collapsed: isCollapsed,
      collapsible: node.collapsible ?? false,
      ...(node.labelText ? { labelText: node.labelText } : {}),
      ...(node.topics ? { topics: node.topics } : {}),
      ...(node.section ? { section: node.section } : {}),
      ...(node.missingTopic ? { missingTopic: true } : {}),
      ...(node.missingSasl ? { missingSasl: true } : {}),
      ...(node.editTarget ? { editTarget: node.editTarget } : {}),
      ...(isCollapsed ? { childCount: countDescendants(node.id, state.childrenMap) } : {}),
    },
  };
}

// Mini-lane edges: the main data path as a primary spine (sectionEdge) plus each
// group's sub-flow as branch edges (treeEdge). Edges to collapsed-away nodes hide.
function buildTreeFlowEdges(nodes: PipelineFlowNode[], hiddenIds: Set<string>): Edge[] {
  const edges: Edge[] = [];
  const isHidden = (a: string, b: string) => hiddenIds.has(a) || hiddenIds.has(b);

  const main = mainFlowSequence(nodes);
  for (let i = 0; i < main.length - 1; i += 1) {
    const source = main[i].id;
    const target = main[i + 1].id;
    edges.push({
      id: `flow-main-${source}-${target}`,
      source,
      target,
      type: 'sectionEdge',
      hidden: isHidden(source, target),
      markerEnd: { type: MarkerType.Arrow, width: 14, height: 14, color: 'var(--color-primary)' },
    });
  }

  for (const { from, to } of subFlowConnections(nodes)) {
    edges.push({
      id: `flow-branch-${from}-${to}`,
      source: from,
      target: to,
      type: 'treeEdge',
      hidden: isHidden(from, to),
      markerEnd: { type: MarkerType.Arrow, width: 16, height: 16, color: 'var(--color-border)' },
    });
  }

  return edges;
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

  if (depth > state.maxDepth) {
    state.maxDepth = depth;
  }

  const autoCollapsed = node.kind === 'group' && depth >= MAX_NESTING_DEPTH;
  const isCollapsed = state.collapsedIds.has(node.id) || autoCollapsed;

  const nodeY = hiddenByParent ? snapY : state.y;
  if (hiddenByParent) {
    state.hiddenIds.add(node.id);
  }
  state.rfNodes.push(
    createRfNode(
      {
        node: autoCollapsed ? { ...node, collapsible: false } : node,
        depth,
        nodeY,
        isHidden: hiddenByParent,
        isCollapsed,
      },
      state
    )
  );

  if (!hiddenByParent) {
    const nodeH = node.kind === 'leaf' ? leafHeight(node) : NODE_H_DEFAULT;
    state.y += nodeH + ROW_GAP;
  }

  const children = state.childrenMap.get(node.id);
  if (children) {
    const childHidden = hiddenByParent || isCollapsed;
    for (const child of children) {
      layoutDfs({ node: child, depth: depth + 1, hiddenByParent: childHidden, snapY: nodeY }, state);
    }
  }
}

export function computeTreeLayout(
  nodes: PipelineFlowNode[],
  collapsedIds: ReadonlySet<string> = new Set()
): { rfNodes: Node[]; rfEdges: Edge[]; height: number; maxDepth: number } {
  if (nodes.length === 0) {
    return { rfNodes: [], rfEdges: [], height: 200, maxDepth: 0 };
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

  const state: LayoutState = {
    rfNodes: [],
    rfEdges: [],
    y: 0,
    maxDepth: 0,
    childrenMap,
    collapsedIds,
    hiddenIds: new Set(),
  };

  const roots = childrenMap.get(undefined);
  if (roots) {
    for (const root of roots) {
      layoutDfs({ node: root, depth: 0, hiddenByParent: false, snapY: 0 }, state);
    }
  }

  state.rfEdges.push(...buildTreeFlowEdges(nodes, state.hiddenIds));

  const MIN_HEIGHT = 200;
  return {
    rfNodes: state.rfNodes,
    rfEdges: state.rfEdges,
    height: Math.max(MIN_HEIGHT, state.y + 8),
    maxDepth: state.maxDepth,
  };
}

// ============================================================================
// Expanded canvas layout (left → right flow with nested containers)
// ----------------------------------------------------------------------------
// The main data path runs left→right: input → each top-level processor → output.
// A processor that wraps a sub-pipeline (branch/try/catch/for_each/while/retry),
// runs alternatives/branches (switch/workflow/parallel), or a multi-input broker
// is rendered as a titled CONTAINER that visually encloses its children — the
// message enters the container, its inner steps run, then flow continues to the
// next top-level step. This mirrors how Step Functions / NiFi show nested flows.
// Container children are real React Flow child nodes (parentId + relative
// position). Shares node IDs with `computeTreeLayout`.
// ============================================================================

/** Leaf card width on the canvas; the node component must match this. */
export const FLOW_CARD_WIDTH = 240;
const FLOW_LEAF_BASE_H = 56;
const FLOW_META_ROW_H = 22;
const FLOW_CONTAINER_HEADER_H = 48;
const FLOW_PAD = 16;
const FLOW_STACK_GAP = 18;
const FLOW_COL_GAP = 72;
const FLOW_MAX_META_ROWS = 4;

function leafCardHeight(node: PipelineFlowNode): number {
  const rows = Math.min(
    (node.meta?.length ?? 0) +
      (node.topics && node.topics.length > 0 ? 1 : 0) +
      (node.missingTopic ? 1 : 0) +
      (node.missingSasl ? 1 : 0),
    FLOW_MAX_META_ROWS
  );
  return FLOW_LEAF_BASE_H + (rows > 0 ? 8 + rows * FLOW_META_ROW_H : 0);
}

type SizedNode = {
  node: PipelineFlowNode;
  w: number;
  h: number;
  collapsed: boolean;
  children: SizedNode[];
};

// Recursively measure a node: leaves get a content-sized card, containers wrap a
// vertical stack of their children (header + padding + stacked child heights).
function measureFlowNode(
  node: PipelineFlowNode,
  childrenOf: (id: string) => PipelineFlowNode[],
  collapsedIds: ReadonlySet<string>
): SizedNode {
  const collapsed = collapsedIds.has(node.id);
  const kids = node.kind === 'group' && !collapsed ? childrenOf(node.id) : [];
  if (kids.length === 0) {
    const h = node.kind === 'group' ? FLOW_CONTAINER_HEADER_H : leafCardHeight(node);
    return { node, w: FLOW_CARD_WIDTH, h, collapsed, children: [] };
  }
  const children = kids.map((kid) => measureFlowNode(kid, childrenOf, collapsedIds));
  const innerW = Math.max(...children.map((c) => c.w));
  const innerH = children.reduce((sum, c) => sum + c.h, 0) + FLOW_STACK_GAP * (children.length - 1);
  return { node, w: innerW + 2 * FLOW_PAD, h: FLOW_CONTAINER_HEADER_H + innerH + 2 * FLOW_PAD, children, collapsed };
}

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
    ...(node.editTarget ? { editTarget: node.editTarget } : {}),
    ...(childCount > 0 ? { childCount } : {}),
  };
}

type EmitContext = {
  rfNodes: Node[];
  rfEdges: Edge[];
  childrenMap: Map<string | undefined, PipelineFlowNode[]>;
};

// Emit a node (and recursively its children) at a position relative to `parentId`
// (or absolute for top-level steps). Containers stack children and chain
// sequential sub-pipelines; alternatives/parallel/inputs are shown enclosed only.
function emitFlowNode(
  sized: SizedNode,
  parentId: string | undefined,
  pos: { x: number; y: number },
  ctx: EmitContext
): void {
  const { node, w, h, collapsed, children } = sized;
  const isContainer = children.length > 0;
  const childCount = collapsed ? countDescendants(node.id, ctx.childrenMap) : 0;

  ctx.rfNodes.push({
    id: node.id,
    type: isContainer ? 'flowContainer' : 'flowCard',
    position: pos,
    ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    // node.style overrides React Flow's pointer-events default so in-card controls stay clickable.
    style: isContainer
      ? { width: w, height: h, pointerEvents: 'all', transition: 'transform 200ms ease' }
      : { pointerEvents: 'all', transition: 'transform 200ms ease' },
    data: makeFlowNodeData(node, collapsed, childCount),
  });

  let childY = FLOW_CONTAINER_HEADER_H + FLOW_PAD;
  for (const child of children) {
    emitFlowNode(child, node.id, { x: FLOW_PAD, y: childY }, ctx);
    childY += child.h + FLOW_STACK_GAP;
  }

  // Chain the inner steps of a sequential sub-pipeline so the order is explicit.
  // Alternatives (switch/workflow/parallel) and merged inputs are shown enclosed
  // by the container box without inter-child arrows.
  const isSequential = node.childFlow !== 'parallel' && node.section !== 'input';
  if (isContainer && isSequential && children.length > 1) {
    for (let i = 0; i < children.length - 1; i += 1) {
      ctx.rfEdges.push({
        id: `chain-${children[i].node.id}-${children[i + 1].node.id}`,
        source: children[i].node.id,
        target: children[i + 1].node.id,
        sourceHandle: 'b',
        targetHandle: 't',
        type: 'flowChain',
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--color-border)' },
      });
    }
  }
}

export function computeFlowLayout(
  nodes: PipelineFlowNode[],
  collapsedIds: ReadonlySet<string> = new Set()
): { rfNodes: Node[]; rfEdges: Edge[]; width: number; height: number } {
  const childrenMap = buildChildrenMap(nodes);
  const childrenOf = (id: string) => childrenMap.get(id) ?? [];

  const mainSequence = mainFlowSequence(nodes);
  const sized = mainSequence.map((node) => measureFlowNode(node, childrenOf, collapsedIds));

  const ctx: EmitContext = { rfNodes: [], rfEdges: [], childrenMap };

  // Place each top-level step left→right, top-aligned so the main spine is level.
  let x = 0;
  let maxStepHeight = 0;
  for (const step of sized) {
    emitFlowNode(step, undefined, { x, y: 0 }, ctx);
    x += step.w + FLOW_COL_GAP;
    maxStepHeight = Math.max(maxStepHeight, step.h);
  }
  const flowWidth = x - FLOW_COL_GAP;

  // Main-path edges between consecutive top-level steps; each carries the index a
  // processor insertion at that gap would use (count of processors at or before it).
  let processorsSeen = 0;
  for (let i = 0; i < mainSequence.length - 1; i += 1) {
    if (mainSequence[i].section === 'processor') {
      processorsSeen += 1;
    }
    ctx.rfEdges.push({
      id: `spine-${mainSequence[i].id}-${mainSequence[i + 1].id}`,
      source: mainSequence[i].id,
      target: mainSequence[i + 1].id,
      sourceHandle: 'r',
      targetHandle: 'l',
      type: 'flowSpine',
      data: { insertIndex: processorsSeen },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'var(--color-primary)' },
    });
  }

  // Resources lane below the flow (referenced by label, so no flow edges).
  const resources = childrenOf('section-resources');
  const laneY = maxStepHeight + 2 * FLOW_STACK_GAP + 24;
  for (const [i, resource] of resources.entries()) {
    ctx.rfNodes.push({
      id: resource.id,
      type: 'flowCard',
      position: { x: i * (FLOW_CARD_WIDTH + FLOW_COL_GAP), y: laneY },
      style: { pointerEvents: 'all', transition: 'transform 200ms ease' },
      data: makeFlowNodeData(resource, false, 0),
    });
  }

  const width = Math.max(flowWidth, resources.length * (FLOW_CARD_WIDTH + FLOW_COL_GAP), FLOW_CARD_WIDTH);
  const height =
    resources.length > 0 ? laneY + leafCardHeight(resources[0]) : Math.max(maxStepHeight, FLOW_LEAF_BASE_H);
  return { rfNodes: ctx.rfNodes, rfEdges: ctx.rfEdges, width, height };
}
