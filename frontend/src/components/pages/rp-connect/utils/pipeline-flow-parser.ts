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

import { type Document, type LineCounter, parseDocument } from 'yaml';

import { classifyInputSlot, type InputEndBehavior } from './input-end-behavior';
import { type NodeMetaEntry, summarizeComponent, truncate } from './pipeline-flow-meta';
import { stopSlotLock, unwrapLock } from './read-until';
import {
  type EditTarget,
  firstKey,
  hasSeedBrokers,
  type ParsedYamlConfig,
  parseMultiInputs,
  READ_UNTIL,
  type ResourceArrayKey,
  type ResourceKind,
  resourceArrayKey,
  resourceKindForComponentName,
  resourceKindForFieldName,
  type StopCondition,
  slotComponentKey,
  unwrapReadUntil,
} from './yaml';
import { REDPANDA_TOPIC_AND_USER_COMPONENTS, SHARED_CLIENT_FALLBACK_COMPONENTS } from '../types/constants';

const REDPANDA_COMPONENTS: ReadonlySet<string> = new Set(REDPANDA_TOPIC_AND_USER_COMPONENTS);

type FlowNodeKind = 'section' | 'group' | 'leaf';

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
  editTarget?: EditTarget;
  meta?: NodeMetaEntry[];
  childFlow?: 'sequential' | 'parallel';
  /** Condition that selects this branch when the flow reaches its parent. */
  condition?: string;
  isDefault?: boolean;
  /** Marks a catch or fallback path, rather than a normal branch. */
  isErrorPath?: boolean;
  branch?: { request: boolean; result: boolean };
  resourceRef?: string;
  resourceRefKind?: ResourceKind;
  resourceRefCandidates?: ResourceRefCandidate[];
  isCase?: boolean;
  caseEditTarget?: EditTarget;
  caseOwnerId?: string;
  insertSlot?: { containerPath: (string | number)[]; accepts: 'input' | 'processor' | 'output' };
  addChildSlot?: { containerPath: (string | number)[]; section: 'processor' | 'output' };
  danglingRef?: boolean;
  usedByCount?: number;
  resourceKey?: string;
  stopSlot?: StopSlot;
  /** End-of-stream behavior for inputs; other sections do not set this. */
  endBehavior?: InputEndBehavior;
};

export type StopSlot = {
  path: (string | number)[];
  condition?: StopCondition;
  /** How the input ends without the stop condition. */
  ownEnd: InputEndBehavior;
  /** Why the condition can only be read here, not edited: a `read_until` with no input yet. */
  locked?: string;
  /** Why its `read_until` can only be removed in the YAML, though its settings can change here. */
  unwrapLock?: string;
};

/** Whether a node (or a canvas card's data) is an input that takes a stop condition: it has a slot and a known end. */
export function hasStopSlot<T extends { section?: string; stopSlot?: StopSlot; endBehavior?: InputEndBehavior }>(
  node: T
): node is T & { stopSlot: StopSlot; endBehavior: InputEndBehavior } {
  return node.section === 'input' && node.stopSlot !== undefined && node.endBehavior !== undefined;
}

export type InputEndRow = {
  id: string;
  name: string;
  labelText?: string;
  /** Broker/sequence members are indented under their group. */
  nested: boolean;
  slot: StopSlot;
  effective: InputEndBehavior;
};

/** The pipeline's inputs that can take a stop condition, in canvas order. */
export function inputEndRows(nodes: PipelineFlowNode[]) {
  const rows: InputEndRow[] = [];
  for (const node of nodes) {
    if (hasStopSlot(node)) {
      rows.push({
        id: node.id,
        name: node.label,
        labelText: node.labelText,
        nested: node.parentId !== 'section-input',
        slot: node.stopSlot,
        effective: node.endBehavior,
      });
    }
  }
  return rows;
}

/** The lock on a `read_until` with no input yet. */
export const CHILDLESS_WRAPPER = 'Its `read_until` has no input to read from yet. Add one in the YAML first.';

function stopSlotFor(
  {
    path,
    slot,
    component,
    condition,
  }: { path: (string | number)[]; slot: unknown; component: unknown; condition?: StopCondition },
  config: ParsedYamlConfig
) {
  const ownEnd = classifyInputSlot(component, config);
  const base: StopSlot = condition ? { path, condition, ownEnd } : { path, ownEnd };
  const childless =
    slotComponentKey(component) === READ_UNTIL && !unwrapReadUntil(component as Record<string, unknown>).stop;
  return {
    stopSlot: childless ? { ...base, locked: CHILDLESS_WRAPPER } : base,
    endBehavior: condition ? classifyInputSlot(slot, config) : ownEnd,
  } satisfies { stopSlot: StopSlot; endBehavior: InputEndBehavior };
}

export const SECTION_LABEL: Record<NonNullable<PipelineFlowNode['section']>, string> = {
  input: 'Input',
  processor: 'Processor',
  output: 'Output',
  resource: 'Resource',
};

export function sectionLabel(section?: string) {
  return SECTION_LABEL[section as NonNullable<PipelineFlowNode['section']>] ?? '';
}

type BranchContext = {
  section: 'input' | 'processor' | 'output';
  parentId: string;
  idPrefix: string;
  depth: number;
  path: (string | number)[];
};

const SECTION_COMPONENT_TYPE = {
  input: 'input',
  processor: 'processor',
  output: 'output',
} as const;

function pathEditTarget(section: 'input' | 'processor' | 'output', path: (string | number)[]) {
  return { kind: 'path', path, componentType: SECTION_COMPONENT_TYPE[section] } satisfies EditTarget;
}

type GroupSpec = {
  groupId: string;
  groupLabel: string;
  section: 'input' | 'output';
  sectionId: string;
  componentPath: (string | number)[];
};

type GroupChildSpec = {
  name: string;
  index?: number;
  meta?: NodeMetaEntry[];
  stop?: { stopSlot: StopSlot; endBehavior: InputEndBehavior };
};

const NESTED_MEMBER_SUMMARY: Record<string, { label: string; sep: string }> = {
  fallback: { label: 'tries', sep: ' → ' },
  sequence: { label: 'then', sep: ' → ' },
  broker: { label: 'fans out', sep: ', ' },
  switch: { label: 'routes', sep: ' | ' },
};

function memberMeta(key: string, value: unknown) {
  const summary = NESTED_MEMBER_SUMMARY[key];
  if (summary) {
    const names = parseMultiInputs(key, value);
    if (names && names.length > 0) {
      return [{ label: summary.label, value: truncate(names.join(summary.sep)) }];
    }
  }
  const meta = summarizeComponent(key, value);
  return meta.length > 0 ? meta : undefined;
}

function memberNameAndMeta(key: string, obj: unknown) {
  return { name: key, meta: memberMeta(key, (obj as Record<string, unknown>)[key]) } satisfies {
    name: string;
    meta?: NodeMetaEntry[];
  };
}

function multiMemberSpecs(value: unknown, membersPath: (string | number)[], config: ParsedYamlConfig) {
  if (!value || typeof value !== 'object') {
    return;
  }
  const items = (value as { inputs?: unknown[] }).inputs;
  return Array.isArray(items) ? memberSpecsWithIndices(items, membersPath, config) : undefined;
}

function memberSpecsWithIndices(items: unknown[], membersPath: (string | number)[], config: ParsedYamlConfig) {
  const specs: GroupChildSpec[] = [];
  for (const [i, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const { component, stop } = unwrapReadUntil(item as Record<string, unknown>);
    const key = slotComponentKey(component);
    if (key) {
      specs.push({
        index: i,
        ...memberNameAndMeta(key, component),
        stop: stopSlotFor({ path: [...membersPath, i], slot: item, component, condition: stop }, config),
      });
    }
  }
  return specs;
}

function buildGroupWithChildren(spec: GroupSpec, children: GroupChildSpec[]) {
  return [
    {
      id: spec.groupId,
      kind: 'group',
      label: spec.groupLabel,
      section: spec.section,
      parentId: spec.sectionId,
      collapsible: true,
      childFlow: spec.groupLabel === 'sequence' ? 'sequential' : 'parallel',
    },
    ...children.map((child, i) => {
      const idx = child.index ?? i;
      const slotPath = [...spec.componentPath, spec.groupLabel, 'inputs', idx];
      return {
        id: `${spec.groupId}-${idx}`,
        kind: 'leaf',
        label: child.name,
        section: spec.section,
        parentId: spec.groupId,
        meta: child.meta,
        editTarget: pathEditTarget(spec.section, slotPath),
        ...child.stop,
      } satisfies PipelineFlowNode;
    }),
  ] satisfies PipelineFlowNode[];
}

type ContainerSlot =
  | { insertSlot: NonNullable<PipelineFlowNode['insertSlot']> }
  | { addChildSlot: NonNullable<PipelineFlowNode['addChildSlot']> };

const MULTI_INPUT_CONTAINERS: ReadonlySet<string> = new Set(['broker', 'sequence']);

type TopLevelInput = {
  key: string;
  value: unknown;
  componentPath: (string | number)[];
  editTarget: EditTarget;
  stopSlot: StopSlot;
  endBehavior: InputEndBehavior;
  labelText?: string;
};

function emptyInputContainerGroup(input: TopLevelInput, sectionId: string) {
  if (!MULTI_INPUT_CONTAINERS.has(input.key)) {
    return null;
  }
  const slot: ContainerSlot = {
    insertSlot: { containerPath: [...input.componentPath, input.key, 'inputs'], accepts: 'input' },
  };
  return [
    {
      id: `input-${input.key}`,
      kind: 'group',
      label: input.key,
      section: 'input',
      parentId: sectionId,
      collapsible: true,
      childFlow: 'parallel',
      editTarget: input.editTarget,
      stopSlot: input.stopSlot,
      endBehavior: input.endBehavior,
      ...(input.labelText ? { labelText: input.labelText } : {}),
      ...slot,
    },
  ] satisfies PipelineFlowNode[];
}

type OutputMemberSpec = {
  obj: unknown;
  path: (string | number)[];
  condition?: string;
  isDefault?: boolean;
  isErrorPath?: boolean;
  caseEditTarget?: EditTarget;
  caseNumber?: number;
};

function enumerateSwitchCases(cases: unknown[]) {
  const entries: { index: number; ordinal: number; record: Record<string, unknown> }[] = [];
  for (const [i, c] of cases.entries()) {
    if (c && typeof c === 'object') {
      entries.push({ index: i, ordinal: entries.length + 1, record: c as Record<string, unknown> });
    }
  }
  return entries;
}

function outputContainerMembers(key: string, value: unknown, path: (string | number)[]) {
  if (key === 'fallback') {
    return (Array.isArray(value) ? value : []).map((obj, i) => ({
      obj,
      path: [...path, key, i],
      condition: i === 0 ? undefined : 'on failure',
      isErrorPath: i === 0 ? undefined : true,
    }));
  }
  if (key === 'switch') {
    return switchOutputMembers(value, [...path, key]);
  }
  if (key === 'broker') {
    const outputs = (value as { outputs?: unknown[] } | undefined)?.outputs;
    return (Array.isArray(outputs) ? outputs : []).map((obj, i) => ({ obj, path: [...path, key, 'outputs', i] }));
  }
  return null;
}

function switchOutputMembers(value: unknown, switchPath: (string | number)[]) {
  const cases = (value as { cases?: unknown[] } | undefined)?.cases;
  if (!Array.isArray(cases)) {
    return [];
  }
  return enumerateSwitchCases(cases).map(({ index, ordinal, record }) => ({
    obj: record.output,
    path: [...switchPath, 'cases', index, 'output'],
    ...caseRouting(record.check),
    caseEditTarget: { kind: 'switchCase', path: [...switchPath, 'cases', index] },
    caseNumber: ordinal,
  }));
}

function outputContainerSlot(key: string, path: (string | number)[]) {
  if (key === 'switch') {
    return { addChildSlot: { containerPath: [...path, 'switch', 'cases'], section: 'output' } } satisfies ContainerSlot;
  }
  if (key === 'fallback') {
    return { insertSlot: { containerPath: [...path, 'fallback'], accepts: 'output' } } satisfies ContainerSlot;
  }
  if (key === 'broker') {
    return { insertSlot: { containerPath: [...path, 'broker', 'outputs'], accepts: 'output' } } satisfies ContainerSlot;
  }
}

function extractLabel(obj: Record<string, unknown>) {
  return typeof obj.label === 'string' && obj.label !== '' ? obj.label : undefined;
}

function extractTopics(componentConfig: unknown) {
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
}

function hasNonEmptySasl(obj: unknown) {
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

function hasSaslConfig(componentName: string, componentConfig: unknown, rootConfig: ParsedYamlConfig) {
  const ownSaslIsUsed =
    hasNonEmptySasl(componentConfig) &&
    (!SHARED_CLIENT_FALLBACK_COMPONENTS.has(componentName) || hasSeedBrokers(componentConfig));
  return ownSaslIsUsed || hasNonEmptySasl(rootConfig.redpanda);
}

function resolveTopLevelInput(inputObj: Record<string, unknown>, config: ParsedYamlConfig) {
  const { component, innerPath, stop } = unwrapReadUntil(inputObj);
  const key = slotComponentKey(component);
  if (!key) {
    return;
  }
  const componentPath = ['input', ...innerPath];
  return {
    key,
    value: component[key],
    componentPath,
    editTarget: { kind: 'input' },
    ...stopSlotFor({ path: ['input'], slot: inputObj, component, condition: stop }, config),
    labelText: extractLabel(component) ?? extractLabel(inputObj),
  } satisfies TopLevelInput;
}

function parseInputNodes(inputObj: Record<string, unknown>, sectionId: string, config: ParsedYamlConfig) {
  const input = resolveTopLevelInput(inputObj, config);
  if (!input) {
    return [];
  }

  const childNames = parseMultiInputs(input.key, input.value);
  if (childNames && childNames.length > 0) {
    return multiInputNodes(input, childNames, sectionId, config);
  }

  return emptyInputContainerGroup(input, sectionId) ?? [inputLeafNode(input, sectionId, config)];
}

function multiInputNodes(input: TopLevelInput, childNames: string[], sectionId: string, config: ParsedYamlConfig) {
  const { key: inputKey, componentPath } = input;
  const membersPath = [...componentPath, inputKey, 'inputs'];
  const groupNodes: PipelineFlowNode[] = buildGroupWithChildren(
    { groupId: `input-${inputKey}`, groupLabel: inputKey, section: 'input', sectionId, componentPath },
    multiMemberSpecs(input.value, membersPath, config) ?? childNames.map((name) => ({ name }))
  );
  groupNodes[0] = {
    ...groupNodes[0],
    editTarget: input.editTarget,
    labelText: input.labelText,
    stopSlot: input.stopSlot,
    endBehavior: input.endBehavior,
  };
  return groupNodes;
}

function inputLeafNode(input: TopLevelInput, sectionId: string, config: ParsedYamlConfig) {
  const { key: inputKey, value } = input;
  const topics = extractTopics(value);
  const isRedpanda = REDPANDA_COMPONENTS.has(inputKey);
  return {
    id: 'input-0',
    kind: 'leaf',
    label: inputKey,
    labelText: input.labelText,
    topics,
    section: 'input',
    parentId: sectionId,
    missingTopic: isRedpanda && !topics ? true : undefined,
    missingSasl: isRedpanda && !hasSaslConfig(inputKey, value, config) ? true : undefined,
    editTarget: input.editTarget,
    stopSlot: input.stopSlot,
    endBehavior: input.endBehavior,
    meta: summarizeComponent(inputKey, value),
    resourceRef: indirectionResourceRef(inputKey, value),
    resourceRefCandidates: extractRefCandidates(value),
  } satisfies PipelineFlowNode;
}

const BRANCHING_FIELDS = new Set([
  'while',
  'switch',
  'catch',
  'try',
  'for_each',
  'parallel',
  'branch',
  'group_by',
  'group_by_value',
  'processors',
]);

const MAX_BRANCH_DEPTH = 3;

const DIRECT_ARRAY_PROC_CONTAINERS: ReadonlySet<string> = new Set(['try', 'catch', 'for_each']);

const NESTED_PROC_CONTAINERS: ReadonlySet<string> = new Set(['branch', 'while', 'parallel']);

type ProcessorEntry = [number, Record<string, unknown>];

function extractProcessorEntries(value: unknown) {
  if (!Array.isArray(value)) {
    return;
  }
  const entries: ProcessorEntry[] = [];
  for (const [i, v] of value.entries()) {
    if (v && typeof v === 'object') {
      entries.push([i, v as Record<string, unknown>]);
    }
  }
  return entries;
}

function extractResourceRef(componentValue: unknown) {
  if (!componentValue || typeof componentValue !== 'object' || Array.isArray(componentValue)) {
    return;
  }
  const ref = (componentValue as Record<string, unknown>).resource;
  return typeof ref === 'string' && ref !== '' ? ref : undefined;
}

function indirectionResourceRef(componentName: string | undefined, componentValue: unknown) {
  return componentName === 'resource' && typeof componentValue === 'string' && componentValue !== ''
    ? componentValue
    : undefined;
}

export type ResourceRefCandidate = { label: string; kind: ResourceKind };

function extractRefCandidates(componentValue: unknown) {
  if (!componentValue || typeof componentValue !== 'object' || Array.isArray(componentValue)) {
    return;
  }
  const candidates: ResourceRefCandidate[] = [];
  for (const [key, value] of Object.entries(componentValue as Record<string, unknown>)) {
    const kind = resourceKindForFieldName(key);
    if (kind && typeof value === 'string' && value !== '') {
      candidates.push({ label: value, kind });
    }
  }
  return candidates.length > 0 ? candidates : undefined;
}

const ERRORED_CHECK_RE = /errored\s*\(/u;
function isErroredCheck(check: unknown) {
  return typeof check === 'string' && ERRORED_CHECK_RE.test(check);
}

function caseRouting(check: unknown) {
  const hasCheck = typeof check === 'string' && check !== '';
  return {
    condition: hasCheck ? (check as string) : undefined,
    isDefault: hasCheck ? undefined : true,
    isErrorPath: isErroredCheck(check) ? true : undefined,
  } satisfies Pick<PipelineFlowNode, 'condition' | 'isDefault' | 'isErrorPath'>;
}

function makeLeaf(name: string, ctx: BranchContext, componentValue?: unknown) {
  const meta = summarizeComponent(name, componentValue);
  const topics = extractTopics(componentValue);
  return {
    id: ctx.idPrefix,
    kind: 'leaf',
    label: name,
    section: ctx.section,
    parentId: ctx.parentId,
    resourceRef: extractResourceRef(componentValue) ?? indirectionResourceRef(name, componentValue),
    resourceRefCandidates: extractRefCandidates(componentValue),
    ...(meta.length > 0 ? { meta } : {}),
    ...(topics ? { topics } : {}),
    editTarget: pathEditTarget(ctx.section, ctx.path),
  } satisfies PipelineFlowNode;
}

const PARALLEL_GROUP_COMPONENTS: ReadonlySet<string> = new Set(['switch', 'parallel', 'group_by']);

export const CASE_CONTAINER_LABELS: ReadonlySet<string> = new Set(['switch', 'group_by']);

function makeGroup(name: string, ctx: BranchContext) {
  return {
    id: ctx.idPrefix,
    kind: 'group',
    label: name,
    section: ctx.section,
    parentId: ctx.parentId,
    collapsible: true,
    childFlow: PARALLEL_GROUP_COMPONENTS.has(name) ? 'parallel' : 'sequential',
    isErrorPath: name === 'catch' ? true : undefined,
    editTarget: pathEditTarget(ctx.section, ctx.path),
  } satisfies PipelineFlowNode;
}

function parseSwitchCases(cases: unknown[], ctx: BranchContext) {
  const nodes: PipelineFlowNode[] = [];
  for (const { index: ci, ordinal, record: caseRecord } of enumerateSwitchCases(cases)) {
    const caseProcs = extractProcessorEntries(caseRecord.processors) ?? [];
    const caseId = `${ctx.idPrefix}-case-${ci + 1}`;
    nodes.push({
      id: caseId,
      kind: 'group',
      label: `case ${ordinal}`,
      section: ctx.section,
      parentId: ctx.idPrefix,
      collapsible: true,
      childFlow: 'sequential',
      ...caseRouting(caseRecord.check),
      isCase: true,
      editTarget: { kind: 'switchCase', path: [...ctx.path, ci] },
      caseEditTarget: { kind: 'switchCase', path: [...ctx.path, ci] },
      insertSlot: { containerPath: [...ctx.path, ci, 'processors'], accepts: 'processor' },
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

function pushProcessorChildren(nodes: PipelineFlowNode[], procs: ProcessorEntry[], ctx: BranchContext) {
  for (const [pi, proc] of procs) {
    const procName = firstKey(proc);
    if (procName) {
      const childNodes = parseComponentWithBranching(procName, proc[procName], {
        ...ctx,
        parentId: ctx.parentId,
        idPrefix: `${ctx.idPrefix}-p${pi}`,
        depth: ctx.depth + 1,
        path: [...ctx.path, pi],
      });
      const labelText = extractLabel(proc);
      if (childNodes.length > 0 && labelText) {
        childNodes[0] = { ...childNodes[0], labelText };
      }
      nodes.push(...childNodes);
    }
  }
}

function processorChildNodes(procs: ProcessorEntry[], ctx: BranchContext) {
  const nodes: PipelineFlowNode[] = [];
  pushProcessorChildren(nodes, procs, ctx);
  return nodes;
}

const PROCESSORS_FIELD_KEYS = new Set(['while', 'branch', 'group_by', 'group_by_value']);

function parseBranchingField(key: string, fieldValue: unknown, ctx: BranchContext) {
  if (key === 'switch' && Array.isArray(fieldValue)) {
    return parseSwitchCases(fieldValue, { ...ctx, path: [...ctx.path, key] });
  }
  if (PROCESSORS_FIELD_KEYS.has(key) && fieldValue && typeof fieldValue === 'object') {
    const innerProcs = extractProcessorEntries((fieldValue as Record<string, unknown>).processors);
    return innerProcs
      ? processorChildNodes(innerProcs, {
          ...ctx,
          idPrefix: `${ctx.idPrefix}-${key}`,
          path: [...ctx.path, key, 'processors'],
        })
      : [];
  }
  const procArray = extractProcessorEntries(fieldValue);
  return procArray
    ? processorChildNodes(procArray, { ...ctx, idPrefix: `${ctx.idPrefix}-${key}`, path: [...ctx.path, key] })
    : [];
}

function parseBranchingKeys(config: Record<string, unknown>, ctx: BranchContext, componentName: string) {
  const branchingKeys = Object.keys(config).filter((k) => BRANCHING_FIELDS.has(k));
  if (branchingKeys.length === 0) {
    return [];
  }
  const childCtx: BranchContext = { ...ctx, parentId: ctx.idPrefix, path: [...ctx.path, componentName] };
  return branchingKeys.flatMap((key) => parseBranchingField(key, config[key], childCtx));
}

function parseDirectArrayBranching(componentName: string, componentValue: unknown[], ctx: BranchContext) {
  const valuePath = [...ctx.path, componentName];
  if (CASE_CONTAINER_LABELS.has(componentName)) {
    return caseContainerNodes(componentName, componentValue, ctx, valuePath);
  }

  const procArray = extractProcessorEntries(componentValue);
  const childCtx: BranchContext = { ...ctx, parentId: ctx.idPrefix, path: valuePath };
  if (procArray && DIRECT_ARRAY_PROC_CONTAINERS.has(componentName)) {
    return [
      { ...makeGroup(componentName, ctx), insertSlot: { containerPath: valuePath, accepts: 'processor' } },
      ...processorChildNodes(procArray, childCtx),
    ] satisfies PipelineFlowNode[];
  }
  if (procArray && procArray.length > 0) {
    return [makeGroup(componentName, ctx), ...processorChildNodes(procArray, childCtx)];
  }
  return [makeLeaf(componentName, ctx)];
}

function caseContainerNodes(
  componentName: string,
  cases: unknown[],
  ctx: BranchContext,
  valuePath: (string | number)[]
) {
  const caseNodes = parseSwitchCases(cases, { ...ctx, path: valuePath });
  const group: PipelineFlowNode = makeGroup(componentName, ctx);
  group.addChildSlot = { containerPath: valuePath, section: 'processor' };
  return [group, ...caseNodes];
}

function parseComponentWithBranching(componentName: string, componentValue: unknown, ctx: BranchContext) {
  if (ctx.depth >= MAX_BRANCH_DEPTH || !componentValue || typeof componentValue !== 'object') {
    return [makeLeaf(componentName, ctx, componentValue)];
  }

  if (Array.isArray(componentValue) && BRANCHING_FIELDS.has(componentName)) {
    return parseDirectArrayBranching(componentName, componentValue, ctx);
  }

  const config = componentValue as Record<string, unknown>;
  const childNodes = parseBranchingKeys(config, ctx, componentName);
  if (childNodes.length === 0) {
    return childlessComponentNodes(componentName, config, ctx);
  }

  return [
    withBranchMeta(makeGroup(componentName, ctx), componentName, config),
    ...childNodes,
  ] satisfies PipelineFlowNode[];
}

function childlessComponentNodes(componentName: string, config: Record<string, unknown>, ctx: BranchContext) {
  if (!NESTED_PROC_CONTAINERS.has(componentName)) {
    return [makeLeaf(componentName, ctx, config)];
  }
  const group = withBranchMeta(makeGroup(componentName, ctx), componentName, config);
  group.insertSlot = { containerPath: [...ctx.path, componentName, 'processors'], accepts: 'processor' };
  return [group];
}

function withBranchMeta(group: PipelineFlowNode, componentName: string, config: Record<string, unknown>) {
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

function parseProcessorNodes(processors: Record<string, unknown>[], sectionId: string) {
  return processors.flatMap<PipelineFlowNode>((proc, i) => {
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
  'input_resources',
  'processor_resources',
  'output_resources',
  'buffer',
  'metrics',
  'tracer',
  'logger',
  'redpanda',
] as const;

const EDITABLE_RESOURCE_KEYS: ReadonlySet<string> = new Set(['cache_resources', 'rate_limit_resources']);

const RESOURCE_KEY_COMPONENT_TYPE: Record<string, 'input' | 'processor' | 'output'> = {
  input_resources: 'input',
  processor_resources: 'processor',
  output_resources: 'output',
};

const SINGLETON_RESOURCE_COMPONENT_TYPE: Record<string, 'buffer' | 'metrics' | 'tracer'> = {
  buffer: 'buffer',
  metrics: 'metrics',
  tracer: 'tracer',
};

function resourceItemEditTarget(key: string, index: number) {
  if (EDITABLE_RESOURCE_KEYS.has(key)) {
    return { kind: 'resource', resourceKey: key as ResourceArrayKey, index } satisfies EditTarget;
  }
  const componentType = RESOURCE_KEY_COMPONENT_TYPE[key];
  return (componentType ? { kind: 'path', path: [key, index], componentType } : undefined) satisfies
    | EditTarget
    | undefined;
}

function parseArrayResource(value: unknown[], key: string, sectionId: string) {
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
        resourceKey: key,
        editTarget: resourceItemEditTarget(key, i),
        meta: itemName ? summarizeComponent(itemName, itemObj[itemName]) : undefined,
      });
    }
  }
  return nodes;
}

function parseResourceNodes(config: ParsedYamlConfig, sectionId: string) {
  const nodes: PipelineFlowNode[] = [];
  for (const key of RESOURCE_YAML_KEYS) {
    const value = config[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      nodes.push(...parseArrayResource(value, key, sectionId));
    } else {
      nodes.push(singletonResourceNode(key, value, sectionId));
    }
  }
  return nodes;
}

function singletonResourceNode(key: string, value: unknown, sectionId: string) {
  const componentType = SINGLETON_RESOURCE_COMPONENT_TYPE[key];
  const valueObj = value as Record<string, unknown>;
  const implName = componentType ? firstKey(valueObj) : undefined;
  return {
    id: `resource-${key}`,
    kind: 'leaf',
    label: key,
    section: 'resource',
    parentId: sectionId,
    editTarget: componentType ? { kind: 'path', path: [key], componentType } : undefined,
    meta: implName ? summarizeComponent(implName, valueObj[implName]) : undefined,
  } satisfies PipelineFlowNode;
}

type OutputNodeArgs = {
  obj: unknown;
  id: string;
  parentId: string;
  path: (string | number)[];
  editTarget: EditTarget;
  routing?: Pick<OutputMemberSpec, 'condition' | 'isDefault' | 'isErrorPath' | 'caseEditTarget'>;
  caseNumber?: OutputMemberSpec['caseNumber'];
  labelText?: string;
  config: ParsedYamlConfig;
};

function buildOutputNodes(args: OutputNodeArgs) {
  const key = firstKey(args.obj);
  if (!key) {
    return checkOnlyOutputCaseNodes(args);
  }
  const value = (args.obj as Record<string, unknown>)[key];
  const members = outputContainerMembers(key, value, args.path);
  if (members === null) {
    return [outputLeafNode(args, key, value)];
  }
  return outputContainerNodes(args, key, members);
}

function checkOnlyOutputCaseNodes({ id, parentId, routing, caseNumber }: OutputNodeArgs) {
  if (!routing?.caseEditTarget) {
    return [];
  }
  return [
    {
      id,
      kind: 'group',
      label: caseNumber === undefined ? 'case' : `case ${caseNumber}`,
      section: 'output',
      parentId,
      collapsible: true,
      childFlow: 'sequential',
      ...routing,
      isCase: true,
      editTarget: routing.caseEditTarget,
    },
  ] satisfies PipelineFlowNode[];
}

function outputContainerNodes(args: OutputNodeArgs, key: string, members: OutputMemberSpec[]) {
  const { id, parentId, path, editTarget, routing, labelText, config } = args;
  const group: PipelineFlowNode = {
    id,
    kind: 'group',
    label: key,
    section: 'output',
    parentId,
    collapsible: true,
    childFlow: 'parallel',
    editTarget,
    ...(labelText ? { labelText } : {}),
    ...routing,
    ...outputContainerSlot(key, path),
  };
  const children: PipelineFlowNode[] = members.flatMap((member, i) =>
    buildOutputNodes({
      obj: member.obj,
      id: `${id}-${i}`,
      parentId: id,
      path: member.path,
      editTarget: pathEditTarget('output', member.path),
      routing: {
        condition: member.condition,
        isDefault: member.isDefault,
        isErrorPath: member.isErrorPath,
        caseEditTarget: member.caseEditTarget,
      },
      caseNumber: member.caseNumber,
      config,
    })
  );
  return [group, ...children];
}

function outputLeafNode(args: OutputNodeArgs, key: string, value: unknown) {
  const { id, parentId, editTarget, routing, labelText, config } = args;
  const topics = extractTopics(value);
  const isRedpanda = REDPANDA_COMPONENTS.has(key);
  return {
    id,
    kind: 'leaf',
    label: key,
    section: 'output',
    parentId,
    ...(labelText ? { labelText } : {}),
    ...(topics ? { topics } : {}),
    missingTopic: isRedpanda && !topics ? true : undefined,
    missingSasl: isRedpanda && !hasSaslConfig(key, value, config) ? true : undefined,
    editTarget,
    meta: summarizeComponent(key, value),
    resourceRef: indirectionResourceRef(key, value),
    resourceRefCandidates: extractRefCandidates(value),
    ...routing,
  } satisfies PipelineFlowNode;
}

function parseOutputNodes(outputObj: Record<string, unknown>, sectionId: string, config: ParsedYamlConfig) {
  const outputKey = firstKey(outputObj);
  if (!outputKey) {
    return [];
  }
  const isContainer = Boolean(outputContainerMembers(outputKey, outputObj[outputKey], ['output']));
  return buildOutputNodes({
    obj: outputObj,
    id: isContainer ? `output-${outputKey}` : 'output-0',
    parentId: sectionId,
    path: ['output'],
    editTarget: { kind: 'output' },
    labelText: extractLabel(outputObj),
    config,
  });
}

function buildInputSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig) {
  const sectionId = 'section-input';
  nodes.push({ id: sectionId, kind: 'section', label: 'input', section: 'input' });
  const parsed =
    config.input && typeof config.input === 'object'
      ? parseInputNodes(config.input as Record<string, unknown>, sectionId, config)
      : [];
  if (parsed.length > 0) {
    nodes.push(...parsed);
  } else {
    nodes.push({ id: 'input-placeholder', kind: 'leaf', label: 'none', section: 'input', parentId: sectionId });
  }
}

function buildProcessorSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig) {
  if (!(config.pipeline && Array.isArray(config.pipeline.processors))) {
    return;
  }
  const sectionId = 'section-processors';
  nodes.push({ id: sectionId, kind: 'section', label: 'processors', section: 'processor' });
  nodes.push(...parseProcessorNodes(config.pipeline.processors as Record<string, unknown>[], sectionId));
}

function buildResourceSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig) {
  const sectionId = 'section-resources';
  const resourceNodes = parseResourceNodes(config, sectionId);
  if (resourceNodes.length === 0) {
    return;
  }
  nodes.push({ id: sectionId, kind: 'section', label: 'resources', section: 'resource' });
  nodes.push(...resourceNodes);
}

function buildOutputSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig) {
  const sectionId = 'section-output';
  nodes.push({ id: sectionId, kind: 'section', label: 'output', section: 'output' });
  const parsed =
    config.output && typeof config.output === 'object'
      ? parseOutputNodes(config.output as Record<string, unknown>, sectionId, config)
      : [];
  if (parsed.length > 0) {
    nodes.push(...parsed);
  } else {
    nodes.push({ id: 'output-placeholder', kind: 'leaf', label: 'none', section: 'output', parentId: sectionId });
  }
}

type ParsePipelineFlowTreeResult = { nodes: PipelineFlowNode[]; error?: string };

function emptyConfigNodes() {
  const nodes: PipelineFlowNode[] = [
    { id: 'section-input', kind: 'section', label: 'input', section: 'input' },
    { id: 'input-placeholder', kind: 'leaf', label: 'none', section: 'input', parentId: 'section-input' },
    { id: 'section-output', kind: 'section', label: 'output', section: 'output' },
    { id: 'output-placeholder', kind: 'leaf', label: 'none', section: 'output', parentId: 'section-output' },
  ];
  return nodes;
}

function lockStopSlots(nodes: PipelineFlowNode[], doc: Document) {
  for (const node of nodes) {
    const slot = node.stopSlot;
    if (!slot || slot.locked) {
      continue;
    }
    const locked = stopSlotLock(doc, slot.path);
    const unwrap = locked || !slot.condition ? undefined : unwrapLock(doc, slot.path);
    if (locked || unwrap) {
      node.stopSlot = { ...slot, ...(locked ? { locked } : { unwrapLock: unwrap }) };
    }
  }
}

function buildFlowTree(config: ParsedYamlConfig, doc: Document) {
  const nodes: PipelineFlowNode[] = [];
  buildInputSection(nodes, config);
  buildProcessorSection(nodes, config);
  buildResourceSection(nodes, config);
  buildOutputSection(nodes, config);
  annotateFlowMeta(nodes);
  lockStopSlots(nodes, doc);
  return nodes;
}

/**
 * Build the graph without losing YAML source indices when unparseable entries
 * are omitted. Check-only branches still get edit targets. Resolve YAML merges
 * at parse time so alias-derived fields participate in the same graph.
 */
export function parsePipelineFlowTree(configYaml: string) {
  if (!configYaml) {
    return { nodes: emptyConfigNodes() } satisfies ParsePipelineFlowTreeResult;
  }

  try {
    const doc = parseDocument(configYaml, { merge: true });
    if (doc.errors.length > 0) {
      throw doc.errors[0];
    }
    const config = (doc.toJS() as ParsedYamlConfig | null) ?? {};
    return { nodes: buildFlowTree(config, doc) } satisfies ParsePipelineFlowTreeResult;
  } catch (err) {
    return {
      nodes: [],
      error: err instanceof Error ? err.message : 'Invalid YAML',
    } satisfies ParsePipelineFlowTreeResult;
  }
}

/**
 * Parse YAML once into both the editable node tree AND the `yaml` Document whose `getIn` resolves an
 * `editTargetPath` (with ranges when a LineCounter is supplied), so diff/lint don't parse twice.
 */
export function parseEditableNodes(configYaml: string, lineCounter?: LineCounter) {
  const doc = parseDocument(configYaml, { merge: true, ...(lineCounter ? { lineCounter } : {}) });
  if (!configYaml) {
    return { doc, nodes: emptyConfigNodes() } satisfies { doc: Document; nodes: PipelineFlowNode[] };
  }
  try {
    const config = (doc.toJS() as ParsedYamlConfig | null) ?? {};
    return { doc, nodes: buildFlowTree(config, doc) } satisfies { doc: Document; nodes: PipelineFlowNode[] };
  } catch {
    return { doc, nodes: [] } satisfies { doc: Document; nodes: PipelineFlowNode[] };
  }
}

/** True when the pipeline has no real components — only section labels / `none` placeholders. */
export function isPipelineEmpty(nodes: PipelineFlowNode[]) {
  return !nodes.some((n) => n.kind === 'group' || (n.kind === 'leaf' && n.label !== 'none'));
}

/** True when the config text is only whitespace, `#` comments, or an empty `{}` document — i.e. genuinely blank. */
export function isConfigTextEmpty(configYaml: string) {
  return configYaml.split('\n').every((line) => {
    const trimmed = line.trim();
    return trimmed === '' || trimmed.startsWith('#') || trimmed === '{}';
  });
}

/**
 * Offer "Start from a template" ONLY for a genuinely blank config: text that parses to no components
 * (invalid YAML, or lost sections) is NOT empty — a template there would clobber the user's work.
 */
export function shouldOfferTemplate(configYaml: string, nodes: PipelineFlowNode[]) {
  return isPipelineEmpty(nodes) && isConfigTextEmpty(configYaml);
}

function annotateFlowMeta(nodes: PipelineFlowNode[]) {
  const childrenByParent = buildChildrenMap(nodes);

  for (const node of nodes) {
    if (node.kind !== 'group' || node.insertSlot) {
      continue;
    }
    const child = childrenByParent
      .get(node.id)
      ?.find((c) => c.editTarget?.kind === 'path' && typeof c.editTarget.path.at(-1) === 'number');
    if (child && child.editTarget?.kind === 'path') {
      node.insertSlot = {
        containerPath: child.editTarget.path.slice(0, -1),
        accepts: child.editTarget.componentType as 'input' | 'processor' | 'output',
      };
    }
  }

  annotateResourceRefs(nodes);
}

function expectedResourceKey(node: PipelineFlowNode) {
  if (node.resourceRefKind) {
    return resourceArrayKey(node.resourceRefKind);
  }
  const kind = resourceKindForComponentName(node.label);
  if (kind) {
    return resourceArrayKey(kind);
  }
  if (node.label === 'resource' && node.section && node.section !== 'resource') {
    return `${node.section}_resources`;
  }
}

type ResourceRefResolver = (node: PipelineFlowNode, label: string) => PipelineFlowNode | undefined;

/**
 * Resolve known component kinds only within their resource array, even when a
 * resource of a different kind shares the same label.
 */
export function buildResourceRefResolver(resources: PipelineFlowNode[]) {
  const byKeyAndLabel = new Map<string, PipelineFlowNode>();
  const byLabel = new Map<string, PipelineFlowNode>();
  for (const resource of resources) {
    if (!resource.labelText) {
      continue;
    }
    if (resource.resourceKey) {
      byKeyAndLabel.set(`${resource.resourceKey}\u0000${resource.labelText}`, resource);
    }
    if (!byLabel.has(resource.labelText)) {
      byLabel.set(resource.labelText, resource);
    }
  }
  return ((node, label) => {
    const key = expectedResourceKey(node);
    return key ? byKeyAndLabel.get(`${key}\u0000${label}`) : byLabel.get(label);
  }) satisfies ResourceRefResolver;
}

function promoteRefCandidate(node: PipelineFlowNode, resolve: ResourceRefResolver) {
  for (const candidate of node.resourceRefCandidates ?? []) {
    node.resourceRefKind = candidate.kind;
    if (resolve(node, candidate.label)) {
      node.resourceRef = candidate.label;
      return;
    }
    node.resourceRefKind = undefined;
  }
}

function linkResourceRefs(nodes: PipelineFlowNode[], resolve: ResourceRefResolver) {
  const usedBy = new Map<string, number>();
  for (const node of nodes) {
    if (!node.resourceRef || node.section === 'resource') {
      continue;
    }
    const target = resolve(node, node.resourceRef);
    if (target) {
      usedBy.set(target.id, (usedBy.get(target.id) ?? 0) + 1);
    } else {
      node.danglingRef = true;
    }
  }
  return usedBy;
}

function annotateResourceRefs(nodes: PipelineFlowNode[]) {
  const resolve = buildResourceRefResolver(nodes.filter((n) => n.section === 'resource'));
  for (const node of nodes) {
    if (!node.resourceRef) {
      promoteRefCandidate(node, resolve);
    }
  }
  const usedBy = linkResourceRefs(nodes, resolve);
  for (const node of nodes) {
    if (node.section === 'resource' && node.labelText) {
      node.usedByCount = usedBy.get(node.id) ?? 0;
    }
  }
}

export function buildChildrenMap(nodes: PipelineFlowNode[]) {
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

export function sectionChildren(
  nodes: PipelineFlowNode[],
  map: Map<string | undefined, PipelineFlowNode[]>,
  section: NonNullable<PipelineFlowNode['section']>
) {
  const sectionNode = nodes.find((n) => n.kind === 'section' && n.section === section);
  return sectionNode ? (map.get(sectionNode.id) ?? []) : [];
}

/** The linear data path: input component(s) → top-level processors → output(s). */
export function mainFlowSequence(nodes: PipelineFlowNode[]) {
  const map = buildChildrenMap(nodes);
  return [
    ...sectionChildren(nodes, map, 'input'),
    ...sectionChildren(nodes, map, 'processor'),
    ...sectionChildren(nodes, map, 'output'),
  ];
}
