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
  // The routing condition that selects this branch (switch `check`, fallback "on
  // failure"). Shown as a label on the fan-out edge that enters this node.
  condition?: string;
  // A catch-all / else branch (a switch case with no `check`, drawn explicitly).
  isDefault?: boolean;
  // An error / dead-letter path (catch handler, `errored()` route, fallback). Drawn
  // with a distinct (red, dashed) edge style.
  isErrorPath?: boolean;
  // Marks a `branch` processor container: data is copied out (request_map), run
  // through the sub-pipeline, then merged back (result_map). Drives copy/merge edges.
  branch?: { request: boolean; result: boolean };
  // Label of a resource this component references (cache/rate_limit `resource`), used
  // to draw a dashed reference edge to the matching resource node.
  resourceRef?: string;
};

type BranchContext = {
  section: 'input' | 'processor' | 'output';
  parentId: string;
  idPrefix: string;
  depth: number;
  // YAML path to the component object this context represents (e.g. the switch
  // processor at ['pipeline','processors',1]). Used to give nested components a
  // path-based editTarget so they're editable in the same dialog.
  path: (string | number)[];
};

// A nested component is editable at its YAML path; its schema type follows the
// section it lives in (processors are 'processor', broker inputs are 'input', …).
const SECTION_COMPONENT_TYPE = {
  input: 'input',
  processor: 'processor',
  output: 'output',
} as const;

function pathEditTarget(section: 'input' | 'processor' | 'output', path: (string | number)[]): EditTarget {
  return { kind: 'path', path, componentType: SECTION_COMPONENT_TYPE[section] };
}

type GroupSpec = {
  groupId: string;
  groupLabel: string;
  section: 'input' | 'output';
  sectionId: string;
};

type GroupChildSpec = { name: string; condition?: string; isDefault?: boolean; isErrorPath?: boolean };

// YAML path to the i-th child of a multi-input/output component, so nested
// broker/switch/fallback/sequence members are individually editable.
function multiChildPath(section: 'input' | 'output', groupLabel: string, i: number): (string | number)[] {
  if (section === 'input') {
    return ['input', groupLabel, 'inputs', i];
  }
  if (groupLabel === 'switch') {
    return ['output', 'switch', 'cases', i, 'output'];
  }
  if (groupLabel === 'fallback') {
    return ['output', 'fallback', i];
  }
  return ['output', 'broker', 'outputs', i];
}

function buildGroupWithChildren(spec: GroupSpec, children: GroupChildSpec[]): PipelineFlowNode[] {
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
    ...children.map(
      (child, i): PipelineFlowNode => ({
        id: `${spec.groupId}-${i}`,
        kind: 'leaf',
        label: child.name,
        section: spec.section,
        parentId: spec.groupId,
        condition: child.condition,
        isDefault: child.isDefault,
        isErrorPath: child.isErrorPath,
        editTarget: pathEditTarget(spec.section, multiChildPath(spec.section, spec.groupLabel, i)),
      })
    ),
  ];
}

// Output branches with their routing semantics: switch cases carry a `check`
// condition (no check ⇒ default), fallback tiers route "on failure" of the prior.
function parseOutputBranches(outputKey: string, value: unknown): GroupChildSpec[] | undefined {
  if (outputKey === 'switch' && value && typeof value === 'object' && 'cases' in value) {
    const cases = (value as { cases?: Record<string, unknown>[] }).cases;
    if (!Array.isArray(cases)) {
      return;
    }
    return cases.map((c) => {
      const check = c.check;
      const hasCheck = typeof check === 'string' && check !== '';
      return {
        name: firstKey(c.output) ?? 'output',
        condition: hasCheck ? (check as string) : undefined,
        isDefault: hasCheck ? undefined : true,
        isErrorPath: isErroredCheck(check) ? true : undefined,
      };
    });
  }
  if (outputKey === 'fallback' && Array.isArray(value)) {
    return value.map((item, i) => ({
      name: firstKey(item) ?? 'output',
      condition: i === 0 ? undefined : 'on failure',
      isErrorPath: i === 0 ? undefined : true,
    }));
  }
  return;
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
      childNames.map((name) => ({ name }))
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

// A reference to a resource is expressed as a string `resource:` field on the
// component (cache/rate_limit processors). We surface it so the canvas can draw a
// dashed edge to the matching resource node.
function extractResourceRef(componentValue: unknown): string | undefined {
  if (!componentValue || typeof componentValue !== 'object' || Array.isArray(componentValue)) {
    return;
  }
  const ref = (componentValue as Record<string, unknown>).resource;
  return typeof ref === 'string' && ref !== '' ? ref : undefined;
}

// A Bloblang check references the error flag (`errored()`), i.e. this branch handles
// failed messages — a dead-letter path.
const ERRORED_CHECK_RE = /errored\s*\(/;
function isErroredCheck(check: unknown): boolean {
  return typeof check === 'string' && ERRORED_CHECK_RE.test(check);
}

function makeLeaf(name: string, ctx: BranchContext, componentValue?: unknown): PipelineFlowNode {
  return {
    id: ctx.idPrefix,
    kind: 'leaf',
    label: name,
    section: ctx.section,
    parentId: ctx.parentId,
    resourceRef: extractResourceRef(componentValue),
    editTarget: pathEditTarget(ctx.section, ctx.path),
  };
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
    // `catch` runs only when an upstream processor errored — a dead-letter handler.
    isErrorPath: name === 'catch' ? true : undefined,
    editTarget: pathEditTarget(ctx.section, ctx.path),
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
    const check = caseRecord.check;
    const hasCheck = typeof check === 'string' && check !== '';
    const caseLabel = `case ${ci + 1}`;
    nodes.push({
      id: caseId,
      kind: 'group',
      label: caseLabel,
      section: ctx.section,
      parentId: ctx.idPrefix,
      collapsible: true,
      childFlow: 'sequential',
      condition: hasCheck ? (check as string) : undefined,
      isDefault: hasCheck ? undefined : true,
      isErrorPath: isErroredCheck(check) ? true : undefined,
    });
    pushProcessorChildren(nodes, caseProcs, {
      ...ctx,
      parentId: caseId,
      idPrefix: caseId,
      path: [...ctx.path, ci, 'processors'],
    });
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
    pushProcessorChildren(nodes, stageProcs, {
      ...ctx,
      parentId: stageId,
      idPrefix: stageId,
      path: [...ctx.path, 'stages', stageName, 'processors'],
    });
  }
  return nodes;
}

function pushProcessorChildren(nodes: PipelineFlowNode[], procs: Record<string, unknown>[], ctx: BranchContext): void {
  // ctx.path is the processors array; each child component sits at [...path, index].
  for (const [pi, proc] of procs.entries()) {
    const procName = firstKey(proc);
    if (procName) {
      nodes.push(
        ...parseComponentWithBranching(procName, proc[procName], {
          ...ctx,
          parentId: ctx.parentId,
          idPrefix: `${ctx.idPrefix}-p${pi}`,
          depth: ctx.depth + 1,
          path: [...ctx.path, pi],
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
        path: [...ctx.path, innerKey],
      });
    }
  }
  return [];
}

const PROCESSORS_FIELD_KEYS = new Set(['while', 'branch', 'group_by', 'group_by_value']);

function parseBranchingField(key: string, fieldValue: unknown, ctx: BranchContext): PipelineFlowNode[] {
  // ctx.path is the inner config; the field value lives at [...ctx.path, key].
  if (key === 'switch' && Array.isArray(fieldValue)) {
    return parseSwitchCases(fieldValue, { ...ctx, path: [...ctx.path, key] });
  }
  if (key === 'workflow') {
    return parseWorkflowStages(fieldValue, { ...ctx, path: [...ctx.path, key] });
  }
  if (PROCESSORS_FIELD_KEYS.has(key) && fieldValue && typeof fieldValue === 'object') {
    const innerProcs = extractProcessorArray((fieldValue as Record<string, unknown>).processors);
    if (innerProcs) {
      const nodes: PipelineFlowNode[] = [];
      pushProcessorChildren(nodes, innerProcs, {
        ...ctx,
        idPrefix: `${ctx.idPrefix}-${key}`,
        path: [...ctx.path, key, 'processors'],
      });
      return nodes;
    }
    return [];
  }
  const procArray = extractProcessorArray(fieldValue);
  if (procArray) {
    const nodes: PipelineFlowNode[] = [];
    pushProcessorChildren(nodes, procArray, { ...ctx, idPrefix: `${ctx.idPrefix}-${key}`, path: [...ctx.path, key] });
    return nodes;
  }
  if (key === 'cached' || key === 'retry') {
    return parseWrappedProcessor(fieldValue, { ...ctx, path: [...ctx.path, key] }, key);
  }
  return [];
}

function parseBranchingKeys(
  config: Record<string, unknown>,
  ctx: BranchContext,
  componentName: string
): PipelineFlowNode[] {
  const branchingKeys = Object.keys(config).filter((k) => BRANCHING_FIELDS.has(k));
  if (branchingKeys.length === 0) {
    return [];
  }
  // Children parent off the group node; the branching keys live inside the named
  // config, so descend the YAML path into that component name.
  const childCtx: BranchContext = { ...ctx, parentId: ctx.idPrefix, path: [...ctx.path, componentName] };
  return branchingKeys.flatMap((key) => parseBranchingField(key, config[key], childCtx));
}

function parseDirectArrayBranching(
  componentName: string,
  componentValue: unknown[],
  ctx: BranchContext
): PipelineFlowNode[] {
  // The component's value array lives at [...ctx.path, componentName].
  const valuePath = [...ctx.path, componentName];
  if (componentName === 'switch') {
    const caseNodes = parseSwitchCases(componentValue, { ...ctx, path: valuePath });
    if (caseNodes.length > 0) {
      return [makeGroup(componentName, ctx), ...caseNodes];
    }
    return [makeLeaf(componentName, ctx)];
  }

  const procArray = extractProcessorArray(componentValue);
  if (procArray && procArray.length > 0) {
    const nodes: PipelineFlowNode[] = [makeGroup(componentName, ctx)];
    pushProcessorChildren(nodes, procArray, { ...ctx, parentId: ctx.idPrefix, path: valuePath });
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
    return [makeLeaf(componentName, ctx, componentValue)];
  }

  if (Array.isArray(componentValue) && BRANCHING_FIELDS.has(componentName)) {
    return parseDirectArrayBranching(componentName, componentValue, ctx);
  }

  const config = componentValue as Record<string, unknown>;
  const childNodes = parseBranchingKeys(config, ctx, componentName);
  if (childNodes.length === 0) {
    return [makeLeaf(componentName, ctx, componentValue)];
  }

  return [withBranchMeta(makeGroup(componentName, ctx), componentName, config), ...childNodes];
}

// A `branch` processor copies a portion of the message out (request_map), runs the
// sub-pipeline, then merges the result back (result_map). Mark the container so the
// canvas can draw copy/merge edges instead of a plain sequential chain.
function withBranchMeta(
  group: PipelineFlowNode,
  componentName: string,
  config: Record<string, unknown>
): PipelineFlowNode {
  if (componentName !== 'branch') {
    return group;
  }
  return {
    ...group,
    branch: {
      request: typeof config.request_map === 'string' && config.request_map !== '',
      result: typeof config.result_map === 'string' && config.result_map !== '',
    },
  };
}

function parseProcessorNodes(processors: Record<string, unknown>[], sectionId: string): PipelineFlowNode[] {
  return processors.flatMap((proc, i): PipelineFlowNode[] => {
    const name = firstKey(proc);
    if (!name) {
      return [];
    }
    const labelText = extractLabel(proc);
    const ctx: BranchContext = {
      section: 'processor',
      parentId: sectionId,
      idPrefix: `proc-${i}`,
      depth: 0,
      path: ['pipeline', 'processors', i],
    };
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
    const branches = parseOutputBranches(outputKey, outputObj[outputKey]);
    const children = branches ?? childNames.map((name) => ({ name }));
    const groupNodes = buildGroupWithChildren(
      { groupId: `output-${outputKey}`, groupLabel: outputKey, section: 'output', sectionId },
      children
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

// Children of a section, found by kind+section so it works whether or not node
// IDs are prefixed (the mini lane parses with an idPrefix).
function sectionChildren(
  nodes: PipelineFlowNode[],
  map: Map<string | undefined, PipelineFlowNode[]>,
  section: NonNullable<PipelineFlowNode['section']>
): PipelineFlowNode[] {
  const sectionNode = nodes.find((n) => n.kind === 'section' && n.section === section);
  return sectionNode ? (map.get(sectionNode.id) ?? []) : [];
}

/** The linear data path: input component(s) → top-level processors → output(s). */
export function mainFlowSequence(nodes: PipelineFlowNode[]): PipelineFlowNode[] {
  const map = buildChildrenMap(nodes);
  return [
    ...sectionChildren(nodes, map, 'input'),
    ...sectionChildren(nodes, map, 'processor'),
    ...sectionChildren(nodes, map, 'output'),
  ];
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

/** Leaf card width on the full canvas; the node component must match this. */
export const FLOW_CARD_WIDTH = 240;
/** Leaf card width on the compact (sidebar) canvas. */
export const FLOW_COMPACT_CARD_WIDTH = 188;
const FLOW_MAX_META_ROWS = 4;

// Spacing/sizing differs between the full Visual lane and the compact sidebar.
type FlowDims = {
  cardW: number;
  leafBaseH: number;
  metaRowH: number; // 0 in compact (meta hidden)
  headerH: number;
  pad: number;
  stackGap: number;
  colGap: number;
  // Wider inner inset reserved as a routing gutter on the side a container fans
  // out (gs) or merges back / fans in (gt), plus the extra vertical spacing
  // between fanned children, so the lines and arrows aren't cramped.
  fanGutter: number;
  fanGap: number;
  // The compact sidebar lane: a minimal vertical overview (no fan-out / copy /
  // merge routing — just the spine + nested sub-pipeline chains).
  compact: boolean;
};
const FULL_DIMS: FlowDims = {
  cardW: FLOW_CARD_WIDTH,
  leafBaseH: 56,
  metaRowH: 22,
  headerH: 48,
  pad: 16,
  stackGap: 18,
  colGap: 72,
  fanGutter: 72,
  fanGap: 32,
  compact: false,
};
const COMPACT_DIMS: FlowDims = {
  cardW: FLOW_COMPACT_CARD_WIDTH,
  leafBaseH: 32,
  metaRowH: 0,
  headerH: 32,
  pad: 8,
  stackGap: 10,
  colGap: 26,
  fanGutter: 18,
  fanGap: 12,
  compact: true,
};

// Section dividers ("INPUT" / "PROCESSORS" / "OUTPUT" / "RESOURCES") shown in the
// compact (vertical) lane, like the original mini diagram.
const SECTION_TITLES: Record<string, string> = {
  input: 'INPUT',
  processor: 'PROCESSORS',
  output: 'OUTPUT',
  resource: 'RESOURCES',
};
const FLOW_SECTION_LABEL_H = 18;
const FLOW_SECTION_LABEL_GAP = 6;
// Indent labels so they align with the card's text and sit clear (to the right) of
// the spine connector, which runs near the card's left edge.
const FLOW_SECTION_LABEL_INDENT = 30;

// Empty-state "Add input/output" cards are taller and more prominent than a regular
// leaf. The height is 2× the spine-handle offset (SPINE_HANDLE_TOP = 36) so the
// connecting arrow lands on the card's vertical center rather than near its bottom.
const FLOW_PLACEHOLDER_LEAF_H = 72;

function leafCardHeight(node: PipelineFlowNode, dims: FlowDims): number {
  if (dims.metaRowH === 0) {
    return dims.leafBaseH;
  }
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
  // The label badge (e.g. a resource's label) gets its own row so it isn't truncated.
  const rows = metaRows + (node.labelText ? 1 : 0);
  return dims.leafBaseH + (rows > 0 ? 8 + rows * dims.metaRowH : 0);
}

type SizedNode = {
  node: PipelineFlowNode;
  w: number;
  h: number;
  collapsed: boolean;
  children: SizedNode[];
};

// Inner spacing of a container, widened on the side(s) that carry routed edges so
// the fan-out / copy / merge / fan-in lines and labels have room to breathe:
//   left  — the `gs` source side (entry / copy / fan-out)
//   right — the `gt` target side (merge-back / fan-in)
//   gap   — vertical spacing between children
// Which sides of a container carry routed edges: `out` is the `gs` source side
// (entry / copy / fan-out), `in` is the `gt` target side (merge-back / fan-in).
function fanSides(node: PipelineFlowNode): { out: boolean; in: boolean } {
  return {
    out: Boolean(node.branch) || (node.childFlow === 'parallel' && node.section !== 'input'),
    in: Boolean(node.branch) || node.section === 'input',
  };
}

function containerInsets(node: PipelineFlowNode, dims: FlowDims): { left: number; right: number; gap: number } {
  // The compact lane draws no fan-out/copy/merge edges, so it needs no routing
  // gutters — children just nest in by a consistent small inset.
  if (dims.compact) {
    return { left: dims.fanGutter, right: dims.pad, gap: dims.stackGap };
  }
  const sides = fanSides(node);
  return {
    left: sides.out ? dims.fanGutter : dims.pad,
    right: sides.in ? dims.fanGutter : dims.pad,
    gap: sides.out || sides.in ? dims.fanGap : dims.stackGap,
  };
}

// Recursively measure a node: leaves get a content-sized card, containers wrap a
// vertical stack of their children (header + insets + stacked child heights).
function measureFlowNode(
  node: PipelineFlowNode,
  childrenOf: (id: string) => PipelineFlowNode[],
  collapsedIds: ReadonlySet<string>,
  dims: FlowDims
): SizedNode {
  const collapsed = collapsedIds.has(node.id);
  const kids = node.kind === 'group' && !collapsed ? childrenOf(node.id) : [];
  if (kids.length === 0) {
    const h = node.kind === 'group' ? dims.headerH : leafCardHeight(node, dims);
    return { node, w: dims.cardW, h, collapsed, children: [] };
  }
  const children = kids.map((kid) => measureFlowNode(kid, childrenOf, collapsedIds, dims));
  const insets = containerInsets(node, dims);
  const innerW = Math.max(...children.map((c) => c.w));
  const innerH = children.reduce((sum, c) => sum + c.h, 0) + insets.gap * (children.length - 1);
  return {
    node,
    w: innerW + insets.left + insets.right,
    h: dims.headerH + innerH + 2 * dims.pad,
    children,
    collapsed,
  };
}

// Routing condition shown as a chip on the receiving card (not a floating edge
// label) so fanned branches stay readable. Hidden in the compact lane.
function routingData(node: PipelineFlowNode, compact: boolean) {
  if (compact) {
    return {};
  }
  return {
    ...(node.condition ? { condition: node.condition } : {}),
    ...(node.isDefault ? { isDefault: true } : {}),
    ...(node.isErrorPath ? { isErrorPath: true } : {}),
  };
}

// Center the routing port (gs/gt) so fanned branches diverge from the middle of the
// box instead of running parallel down a gutter from the header.
function fanData(node: PipelineFlowNode) {
  if (node.kind !== 'group') {
    return {};
  }
  const sides = fanSides(node);
  return {
    ...(sides.out ? { fanOut: true } : {}),
    ...(sides.in ? { fanIn: true } : {}),
  };
}

function makeFlowNodeData(node: PipelineFlowNode, collapsed: boolean, childCount: number, compact: boolean) {
  return {
    label: node.label,
    collapsible: node.collapsible ?? false,
    collapsed,
    ...fanData(node),
    ...(compact ? { compact: true } : {}),
    ...(node.section ? { section: node.section } : {}),
    ...(node.labelText ? { labelText: node.labelText } : {}),
    ...(node.topics ? { topics: node.topics } : {}),
    ...(node.meta && node.meta.length > 0 ? { meta: node.meta } : {}),
    ...(node.missingTopic ? { missingTopic: true } : {}),
    ...(node.missingSasl ? { missingSasl: true } : {}),
    ...(node.editTarget ? { editTarget: node.editTarget } : {}),
    ...(childCount > 0 ? { childCount } : {}),
    ...routingData(node, compact),
  };
}

type EmitContext = {
  rfNodes: Node[];
  rfEdges: Edge[];
  childrenMap: Map<string | undefined, PipelineFlowNode[]>;
  dims: FlowDims;
  compact: boolean;
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
  // A group is always a container (so a collapsed group keeps its header + toggle,
  // letting it be expanded again); leaves render as plain cards.
  const isContainer = node.kind === 'group';
  const childCount = collapsed ? countDescendants(node.id, ctx.childrenMap) : 0;

  // Anchor the fanning ports at the vertical centre of the *children area* (below
  // the header) so copy/merge/fan-out edges leave/enter level with the children
  // rather than offset by the header — keeping them horizontal, not diagonal.
  const sides = isContainer ? fanSides(node) : { out: false, in: false };
  const portY = children.length > 0 && (sides.out || sides.in) ? (ctx.dims.headerH + h) / 2 : undefined;

  ctx.rfNodes.push({
    id: node.id,
    type: isContainer ? 'flowContainer' : 'flowCard',
    position: pos,
    ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    // node.style overrides React Flow's pointer-events default so in-card controls stay clickable.
    style: isContainer
      ? { width: w, height: h, pointerEvents: 'all', transition: 'transform 200ms ease' }
      : { pointerEvents: 'all', transition: 'transform 200ms ease' },
    data: { ...makeFlowNodeData(node, collapsed, childCount, ctx.compact), ...(portY === undefined ? {} : { portY }) },
  });

  const insets = containerInsets(node, ctx.dims);
  let childY = ctx.dims.headerH + ctx.dims.pad;
  for (const child of children) {
    emitFlowNode(child, node.id, { x: insets.left, y: childY }, ctx);
    childY += child.h + insets.gap;
  }

  if (isContainer && children.length > 0) {
    emitContainerEdges(node, children, ctx);
  }
}

type LinkTone = 'primary' | 'muted' | 'error';

const LINK_TONE_COLOR: Record<LinkTone, string> = {
  primary: 'var(--color-primary)',
  muted: 'var(--color-border)',
  error: 'var(--color-destructive)',
};

function linkEdge(params: {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  tone: LinkTone;
  label?: string;
  // Nudge the label off the line (px); used to lift copy/merge labels above their
  // (horizontal) edge so they don't sit on it.
  labelOffsetY?: number;
  dashed?: boolean;
  // Distinct vertical lane (px offset from the container edge) so sibling fan-out /
  // fan-in edges don't overlap on a shared bend. From the source for fan-out, from
  // the target for fan-in.
  laneFromSource?: number;
  laneFromTarget?: number;
}): Edge {
  return {
    id: params.id,
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle,
    targetHandle: params.targetHandle,
    type: 'flowLink',
    data: {
      label: params.label,
      labelOffsetY: params.labelOffsetY,
      tone: params.tone,
      dashed: params.dashed ?? false,
      laneFromSource: params.laneFromSource,
      laneFromTarget: params.laneFromTarget,
    },
    markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color: LINK_TONE_COLOR[params.tone] },
  };
}

// Each fanned sibling gets its own vertical lane inside the routing gutter, capped
// so the lanes stay clear of the children (and of the container edge).
function laneOffset(index: number, count: number, dims: FlowDims): number {
  const usable = dims.fanGutter - 14;
  const step = count > 1 ? Math.min(12, usable / count) : 0;
  return 14 + index * step;
}

function chainChildren(children: SizedNode[], ctx: EmitContext): void {
  for (let i = 0; i < children.length - 1; i += 1) {
    ctx.rfEdges.push(
      linkEdge({
        id: `chain-${children[i].node.id}-${children[i + 1].node.id}`,
        source: children[i].node.id,
        target: children[i + 1].node.id,
        sourceHandle: 'b',
        targetHandle: 't',
        tone: 'muted',
      })
    );
  }
}

// Edges that show how data threads through a container's children:
//   branch   → copy out (request_map) ⇒ sub-pipeline ⇒ merge back (result_map)
//   input    → child sources fan in (merge) to the broker/sequence
//   parallel → fan out to each alternative, labeled with its routing condition
//   sequential → enter the first child, then chain in order
function emitContainerEdges(node: PipelineFlowNode, children: SizedNode[], ctx: EmitContext): void {
  // Compact lane: a minimal vertical overview — no copy/merge/fan-out/fan-in
  // routing (and no right-side arrows). Sub-pipelines that run in order keep a
  // simple nested vertical chain; alternatives/sources just nest inside the box.
  if (ctx.compact) {
    if (node.childFlow !== 'parallel' && node.section !== 'input') {
      chainChildren(children, ctx);
    }
    return;
  }
  emitFullContainerEdges(node, children, ctx);
}

function emitFullContainerEdges(node: PipelineFlowNode, children: SizedNode[], ctx: EmitContext): void {
  const first = children[0].node.id;
  const last = children.at(-1)?.node.id ?? first;
  const label = (text: string) => (ctx.compact ? undefined : text);

  if (node.branch) {
    ctx.rfEdges.push(
      linkEdge({
        id: `copy-${node.id}`,
        source: node.id,
        target: first,
        sourceHandle: 'gs',
        targetHandle: 'l',
        tone: 'primary',
        dashed: true,
        label: label('copy'),
        labelOffsetY: -18,
      })
    );
    chainChildren(children, ctx);
    ctx.rfEdges.push(
      linkEdge({
        id: `merge-${node.id}`,
        source: last,
        target: node.id,
        sourceHandle: 'r',
        targetHandle: 'gt',
        tone: 'primary',
        dashed: true,
        label: label('merge'),
        labelOffsetY: -18,
      })
    );
    return;
  }

  if (node.section === 'input') {
    for (const [i, child] of children.entries()) {
      ctx.rfEdges.push(
        linkEdge({
          id: `fanin-${child.node.id}`,
          source: child.node.id,
          target: node.id,
          sourceHandle: 'r',
          targetHandle: 'gt',
          tone: 'primary',
          laneFromTarget: laneOffset(children.length - 1 - i, children.length, ctx.dims),
        })
      );
    }
    return;
  }

  if (node.childFlow === 'parallel') {
    // The routing condition is rendered as a chip on each receiving card, so the
    // fan-out edge stays a clean unlabeled line (red dashed for error branches).
    // Each branch routes down its own lane so siblings never overlap.
    for (const [i, child] of children.entries()) {
      ctx.rfEdges.push(
        linkEdge({
          id: `fanout-${child.node.id}`,
          source: node.id,
          target: child.node.id,
          sourceHandle: 'gs',
          targetHandle: 'l',
          tone: child.node.isErrorPath ? 'error' : 'primary',
          dashed: child.node.isErrorPath,
          laneFromSource: laneOffset(i, children.length, ctx.dims),
        })
      );
    }
    return;
  }

  // Sequential sub-pipeline.
  ctx.rfEdges.push(
    linkEdge({
      id: `entry-${node.id}`,
      source: node.id,
      target: first,
      sourceHandle: 'gs',
      targetHandle: 'l',
      tone: node.isErrorPath ? 'error' : 'primary',
      dashed: node.isErrorPath,
    })
  );
  chainChildren(children, ctx);
}

// Dashed edges from a component to the resource it references (cache/rate_limit
// `resource:`). Matched by the resource's label. Skipped in the compact lane.
function buildReferenceEdges(nodes: PipelineFlowNode[], placedIds: Set<string>): Edge[] {
  const resourceByLabel = new Map<string, string>();
  for (const node of nodes) {
    if (node.section === 'resource' && node.labelText) {
      resourceByLabel.set(node.labelText, node.id);
    }
  }
  const edges: Edge[] = [];
  for (const node of nodes) {
    if (!node.resourceRef) {
      continue;
    }
    const targetId = resourceByLabel.get(node.resourceRef);
    if (!(targetId && placedIds.has(node.id) && placedIds.has(targetId))) {
      continue;
    }
    // No label — the legend documents the dashed muted line as "uses resource".
    edges.push(
      linkEdge({
        id: `ref-${node.id}-${targetId}`,
        source: node.id,
        target: targetId,
        sourceHandle: 'b',
        targetHandle: 't',
        tone: 'muted',
        dashed: true,
      })
    );
  }
  return edges;
}

export type FlowOrientation = 'horizontal' | 'vertical';

// Main-path edges between consecutive top-level steps; each carries the processor
// index an insertion at that gap would use (count of processors at or before it).
function buildSpineEdges(mainSequence: PipelineFlowNode[], isVertical: boolean): Edge[] {
  const edges: Edge[] = [];
  let processorsSeen = 0;
  for (let i = 0; i < mainSequence.length - 1; i += 1) {
    if (mainSequence[i].section === 'processor') {
      processorsSeen += 1;
    }
    edges.push({
      id: `spine-${mainSequence[i].id}-${mainSequence[i + 1].id}`,
      source: mainSequence[i].id,
      target: mainSequence[i + 1].id,
      sourceHandle: isVertical ? 'b' : 'r',
      targetHandle: isVertical ? 't' : 'l',
      type: 'flowSpine',
      data: { insertIndex: processorsSeen },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'var(--color-primary)' },
    });
  }
  return edges;
}

export function computeFlowLayout(
  nodes: PipelineFlowNode[],
  collapsedIds: ReadonlySet<string> = new Set(),
  orientation: FlowOrientation = 'horizontal',
  compact = false
): { rfNodes: Node[]; rfEdges: Edge[]; width: number; height: number } {
  const childrenMap = buildChildrenMap(nodes);
  const childrenOf = (id: string) => childrenMap.get(id) ?? [];
  const isVertical = orientation === 'vertical';
  const dims = compact ? COMPACT_DIMS : FULL_DIMS;

  const mainSequence = mainFlowSequence(nodes);
  const sized = mainSequence.map((node) => measureFlowNode(node, childrenOf, collapsedIds, dims));

  const ctx: EmitContext = { rfNodes: [], rfEdges: [], childrenMap, dims, compact };

  const { mainExtent, maxCross } = placeTopLevelSteps(sized, isVertical, ctx);
  ctx.rfEdges.push(...buildSpineEdges(mainSequence, isVertical));
  // The resource lane sits past the main flow along the cross axis: below the row
  // in horizontal layout (maxCross), after the column in vertical layout (mainExtent).
  const laneStart = (isVertical ? mainExtent : maxCross) + 2 * dims.stackGap + 24;
  const { resources, resourceRight } = placeResourceLane({ nodes, childrenMap, isVertical, laneStart, ctx });

  // Resource-reference edges (cache/rate_limit → resource). Skipped in the compact
  // lane to keep it clean, and only between nodes that were actually placed.
  if (!compact) {
    const placedIds = new Set(ctx.rfNodes.map((n) => n.id));
    ctx.rfEdges.push(...buildReferenceEdges(nodes, placedIds));
  }

  return {
    rfNodes: ctx.rfNodes,
    rfEdges: ctx.rfEdges,
    ...flowDimensions({ isVertical, mainExtent, maxCross, laneStart, resources, resourceRight, dims }),
  };
}

// Lay the top-level steps along the main axis (left→right or top→bottom), each
// aligned to the cross-axis start so the spine reads as one line.
function placeTopLevelSteps(
  sized: SizedNode[],
  isVertical: boolean,
  ctx: EmitContext
): { mainExtent: number; maxCross: number } {
  let cursor = 0;
  let maxCross = 0;
  let prevSection: PipelineFlowNode['section'];
  // Steps are separated by the main-axis gap (colGap) in both orientations; the
  // tighter stackGap is reserved for children inside a container.
  const gap = ctx.dims.colGap;
  for (const step of sized) {
    const section = step.node.section;
    // In the compact (vertical) lane, divide sections with a small label.
    if (isVertical && section && section !== prevSection) {
      ctx.rfNodes.push({
        id: `section-label-${section}`,
        type: 'flowSectionLabel',
        position: { x: FLOW_SECTION_LABEL_INDENT, y: cursor },
        selectable: false,
        draggable: false,
        data: { label: SECTION_TITLES[section] ?? '' },
      });
      cursor += FLOW_SECTION_LABEL_H + FLOW_SECTION_LABEL_GAP;
    }
    prevSection = section;
    emitFlowNode(step, undefined, isVertical ? { x: 0, y: cursor } : { x: cursor, y: 0 }, ctx);
    cursor += (isVertical ? step.h : step.w) + gap;
    maxCross = Math.max(maxCross, isVertical ? step.w : step.h);
  }
  return { mainExtent: cursor - gap, maxCross };
}

// Absolute x of a placed node (sum its position up the parent chain), or undefined
// if it (or an ancestor) was not placed — e.g. hidden inside a collapsed container.
function absoluteX(id: string, placed: Map<string, { x: number; parentId?: string }>): number | undefined {
  let cur = placed.get(id);
  if (!cur) {
    return;
  }
  let x = 0;
  while (cur) {
    x += cur.x;
    cur = cur.parentId ? placed.get(cur.parentId) : undefined;
  }
  return x;
}

// In horizontal layout, pick each resource's x so it sits roughly under the node
// that references it (short reference edges), falling back to left-to-right order
// for unreferenced resources. A left→right sweep then de-overlaps the cards.
function resourceLaneX(
  resources: PipelineFlowNode[],
  nodes: PipelineFlowNode[],
  ctx: EmitContext
): Map<string, number> {
  const placed = new Map(ctx.rfNodes.map((n) => [n.id, { x: n.position.x, parentId: n.parentId }]));
  const desired = resources.map((resource, i) => {
    const ref = resource.labelText ? nodes.find((n) => n.resourceRef === resource.labelText) : undefined;
    const refX = ref ? absoluteX(ref.id, placed) : undefined;
    return { id: resource.id, x: refX ?? i * (ctx.dims.cardW + ctx.dims.colGap) };
  });
  desired.sort((a, b) => a.x - b.x);
  const step = ctx.dims.cardW + ctx.dims.colGap;
  const out = new Map<string, number>();
  let prevX = Number.NEGATIVE_INFINITY;
  for (const d of desired) {
    const x = Math.max(d.x, prevX === Number.NEGATIVE_INFINITY ? d.x : prevX + step);
    out.set(d.id, x);
    prevX = x;
  }
  return out;
}

// Resources lane after the flow (referenced by label, so no flow edges).
function placeResourceLane({
  nodes,
  childrenMap,
  isVertical,
  laneStart,
  ctx,
}: {
  nodes: PipelineFlowNode[];
  childrenMap: Map<string | undefined, PipelineFlowNode[]>;
  isVertical: boolean;
  laneStart: number;
  ctx: EmitContext;
}): { resources: PipelineFlowNode[]; resourceRight: number } {
  const resources = sectionChildren(nodes, childrenMap, 'resource');
  const laneX = isVertical ? null : resourceLaneX(resources, nodes, ctx);
  let stackY = laneStart;
  let resourceRight = 0;
  for (const [i, resource] of resources.entries()) {
    const x = isVertical ? 0 : (laneX?.get(resource.id) ?? i * (ctx.dims.cardW + ctx.dims.colGap));
    ctx.rfNodes.push({
      id: resource.id,
      type: 'flowCard',
      position: { x, y: isVertical ? stackY : laneStart },
      style: { pointerEvents: 'all', transition: 'transform 200ms ease' },
      data: makeFlowNodeData(resource, false, 0, ctx.compact),
    });
    resourceRight = Math.max(resourceRight, x + ctx.dims.cardW);
    stackY += leafCardHeight(resource, ctx.dims) + ctx.dims.stackGap;
  }
  return { resources, resourceRight };
}

function flowDimensions({
  isVertical,
  mainExtent,
  maxCross,
  laneStart,
  resources,
  resourceRight,
  dims,
}: {
  isVertical: boolean;
  mainExtent: number;
  maxCross: number;
  laneStart: number;
  resources: PipelineFlowNode[];
  resourceRight: number;
  dims: FlowDims;
}): { width: number; height: number } {
  if (isVertical) {
    const resourcesExtent = resources.reduce((sum, r) => sum + leafCardHeight(r, dims) + dims.stackGap, 0);
    return {
      width: Math.max(maxCross, dims.cardW),
      height: resources.length > 0 ? laneStart + resourcesExtent : Math.max(mainExtent, dims.leafBaseH),
    };
  }
  return {
    width: Math.max(mainExtent, resourceRight, dims.cardW),
    height: resources.length > 0 ? laneStart + leafCardHeight(resources[0], dims) : Math.max(maxCross, dims.leafBaseH),
  };
}
