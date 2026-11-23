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
  // Routing condition selecting this branch (switch `check`, fallback "on failure"),
  condition?: string;
  isDefault?: boolean;
  // Error / dead-letter path (catch handler, `errored()` route, fallback).
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
  // How the input ends — a stop condition, once its data runs out, or never (inputs only).
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
): { stopSlot: StopSlot; endBehavior: InputEndBehavior } {
  const ownEnd = classifyInputSlot(component, config);
  const base: StopSlot = condition ? { path, condition, ownEnd } : { path, ownEnd };
  const childless =
    slotComponentKey(component) === READ_UNTIL && !unwrapReadUntil(component as Record<string, unknown>).stop;
  return {
    stopSlot: childless ? { ...base, locked: CHILDLESS_WRAPPER } : base,
    endBehavior: condition ? classifyInputSlot(slot, config) : ownEnd,
  };
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

function pathEditTarget(section: 'input' | 'processor' | 'output', path: (string | number)[]): EditTarget {
  return { kind: 'path', path, componentType: SECTION_COMPONENT_TYPE[section] };
}

type GroupSpec = {
  groupId: string;
  groupLabel: string;
  section: 'input' | 'output';
  sectionId: string;
  /** YAML path of the object holding the group component (`['input']`, or inside a `read_until`). */
  componentPath: (string | number)[];
};

type GroupChildSpec = {
  name: string;
  /** Original index in the source array — drives the child id + edit path. */
  index?: number;
  meta?: NodeMetaEntry[];
  stop?: { stopSlot: StopSlot; endBehavior: InputEndBehavior };
};

// A container member may itself be a container (e.g. a `fallback` output). Summarize what
// it wraps, routing-aware, so the collapsed leaf shows where data goes — not just "fallback".
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

function memberNameAndMeta(key: string, obj: unknown): { name: string; meta?: NodeMetaEntry[] } {
  return { name: key, meta: memberMeta(key, (obj as Record<string, unknown>)[key]) };
}

function multiMemberSpecs(value: unknown, membersPath: (string | number)[], config: ParsedYamlConfig) {
  if (!value || typeof value !== 'object') {
    return;
  }
  const items = (value as { inputs?: unknown[] }).inputs;
  return Array.isArray(items) ? memberSpecsWithIndices(items, membersPath, config) : undefined;
}

// Skip entries with no component key (null/scalar, or reserved-only stubs like `- label: x`) —
// matching parseMultiInputs — but keep original indices so edit paths never land on a neighbour.
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

function buildGroupWithChildren(spec: GroupSpec, children: GroupChildSpec[]): PipelineFlowNode[] {
  return [
    {
      id: spec.groupId,
      kind: 'group',
      label: spec.groupLabel,
      section: spec.section,
      parentId: spec.sectionId,
      collapsible: true,
      // A `sequence` input runs children in order; broker/switch/fallback fan out.
      childFlow: spec.groupLabel === 'sequence' ? 'sequential' : 'parallel',
    },
    ...children.map((child, i): PipelineFlowNode => {
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
      };
    }),
  ];
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

function emptyInputContainerGroup(input: TopLevelInput, sectionId: string): PipelineFlowNode[] | null {
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
  ];
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

// Members of an output container (broker/switch/fallback), or undefined if `key` isn't one. Member
function outputContainerMembers(
  key: string,
  value: unknown,
  path: (string | number)[]
): OutputMemberSpec[] | undefined {
  if (key === 'fallback') {
    // Tier 0 is primary; each later tier runs only "on failure" of the prior.
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
}

function switchOutputMembers(value: unknown, switchPath: (string | number)[]): OutputMemberSpec[] {
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

// case; broker/fallback append a bare output.
function outputContainerSlot(key: string, path: (string | number)[]): ContainerSlot | undefined {
  if (key === 'switch') {
    return { addChildSlot: { containerPath: [...path, 'switch', 'cases'], section: 'output' } };
  }
  if (key === 'fallback') {
    return { insertSlot: { containerPath: [...path, 'fallback'], accepts: 'output' } };
  }
  if (key === 'broker') {
    return { insertSlot: { containerPath: [...path, 'broker', 'outputs'], accepts: 'output' } };
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

function resolveTopLevelInput(inputObj: Record<string, unknown>, config: ParsedYamlConfig): TopLevelInput | undefined {
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
    // The input's own label is the one the inspector edits; a label on the wrapper is a fallback.
    labelText: extractLabel(component) ?? extractLabel(inputObj),
  };
}

function parseInputNodes(
  inputObj: Record<string, unknown>,
  sectionId: string,
  config: ParsedYamlConfig
): PipelineFlowNode[] {
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

function multiInputNodes(
  input: TopLevelInput,
  childNames: string[],
  sectionId: string,
  config: ParsedYamlConfig
): PipelineFlowNode[] {
  const { key: inputKey, componentPath } = input;
  const membersPath = [...componentPath, inputKey, 'inputs'];
  const groupNodes = buildGroupWithChildren(
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

function inputLeafNode(input: TopLevelInput, sectionId: string, config: ParsedYamlConfig): PipelineFlowNode {
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
  };
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

// (`- null`, mid-edit scalars) are skipped, but edit paths must never land on a neighbouring entry.
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

// A resource ref may live in a non-`resource` field (e.g. `checkpoint_cache`). Only fields whose
// (e.g. `client_id` equal to a resource label) must not draw a dependency edge. The post-pass
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

function caseRouting(check: unknown): Pick<PipelineFlowNode, 'condition' | 'isDefault' | 'isErrorPath'> {
  const hasCheck = typeof check === 'string' && check !== '';
  return {
    condition: hasCheck ? (check as string) : undefined,
    isDefault: hasCheck ? undefined : true,
    isErrorPath: isErroredCheck(check) ? true : undefined,
  };
}

function makeLeaf(name: string, ctx: BranchContext, componentValue?: unknown): PipelineFlowNode {
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
  };
}

const PARALLEL_GROUP_COMPONENTS: ReadonlySet<string> = new Set(['switch', 'parallel', 'group_by']);

export const CASE_CONTAINER_LABELS: ReadonlySet<string> = new Set(['switch', 'group_by']);

function makeGroup(name: string, ctx: BranchContext): PipelineFlowNode {
  return {
    id: ctx.idPrefix,
    kind: 'group',
    label: name,
    section: ctx.section,
    parentId: ctx.parentId,
    collapsible: true,
    childFlow: PARALLEL_GROUP_COMPONENTS.has(name) ? 'parallel' : 'sequential',
    // `catch` runs only on upstream error — a dead-letter handler.
    isErrorPath: name === 'catch' ? true : undefined,
    editTarget: pathEditTarget(ctx.section, ctx.path),
  };
}

function parseSwitchCases(cases: unknown[], ctx: BranchContext) {
  const nodes: PipelineFlowNode[] = [];
  for (const { index: ci, ordinal, record: caseRecord } of enumerateSwitchCases(cases)) {
    // A check-only case (no `processors` array) still renders as an empty case — never silently vanishes.
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

function parseDirectArrayBranching(
  componentName: string,
  componentValue: unknown[],
  ctx: BranchContext
): PipelineFlowNode[] {
  const valuePath = [...ctx.path, componentName];
  if (CASE_CONTAINER_LABELS.has(componentName)) {
    return caseContainerNodes(componentName, componentValue, ctx, valuePath);
  }

  const procArray = extractProcessorEntries(componentValue);
  const childCtx: BranchContext = { ...ctx, parentId: ctx.idPrefix, path: valuePath };
  // try/catch/for_each: keep the group (with insert slot) even when empty so a first processor can be added.
  if (procArray && DIRECT_ARRAY_PROC_CONTAINERS.has(componentName)) {
    return [
      { ...makeGroup(componentName, ctx), insertSlot: { containerPath: valuePath, accepts: 'processor' } },
      ...processorChildNodes(procArray, childCtx),
    ];
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
): PipelineFlowNode[] {
  const caseNodes = parseSwitchCases(cases, { ...ctx, path: valuePath });
  const group = makeGroup(componentName, ctx);
  group.addChildSlot = { containerPath: valuePath, section: 'processor' };
  return [group, ...caseNodes];
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
    return childlessComponentNodes(componentName, config, ctx);
  }

  return [withBranchMeta(makeGroup(componentName, ctx), componentName, config), ...childNodes];
}

function childlessComponentNodes(
  componentName: string,
  config: Record<string, unknown>,
  ctx: BranchContext
): PipelineFlowNode[] {
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

// `logger`/`redpanda` are plain config, not components, so they stay display-only.
const SINGLETON_RESOURCE_COMPONENT_TYPE: Record<string, 'buffer' | 'metrics' | 'tracer'> = {
  buffer: 'buffer',
  metrics: 'metrics',
  tracer: 'tracer',
};

function resourceItemEditTarget(key: string, index: number): EditTarget | undefined {
  if (EDITABLE_RESOURCE_KEYS.has(key)) {
    return { kind: 'resource', resourceKey: key as ResourceArrayKey, index };
  }
  const componentType = RESOURCE_KEY_COMPONENT_TYPE[key];
  return componentType ? { kind: 'path', path: [key, index], componentType } : undefined;
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

function singletonResourceNode(key: string, value: unknown, sectionId: string): PipelineFlowNode {
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
  };
}

type OutputNodeArgs = {
  obj: unknown;
  id: string;
  parentId: string;
  path: (string | number)[];
  editTarget: EditTarget;
  // Routing that selects this node (a switch case's check, a fallback tier's "on failure").
  routing?: Pick<OutputMemberSpec, 'condition' | 'isDefault' | 'isErrorPath' | 'caseEditTarget'>;
  caseNumber?: OutputMemberSpec['caseNumber'];
  labelText?: string;
  config: ParsedYamlConfig;
};

// Node subtree for an output component: broker/switch/fallback become a fan-out GROUP whose members
// recurse (nested containers keep editable members + grow affordances); anything else is a leaf.
function buildOutputNodes(args: OutputNodeArgs): PipelineFlowNode[] {
  const key = firstKey(args.obj);
  if (!key) {
    return checkOnlyOutputCaseNodes(args);
  }
  const value = (args.obj as Record<string, unknown>)[key];
  const members = outputContainerMembers(key, value, args.path);
  return members ? outputContainerNodes(args, key, members) : [outputLeafNode(args, key, value)];
}

// A check-only switch case (no `output:` body yet) still renders as an empty, condition-editable
function checkOnlyOutputCaseNodes({ id, parentId, routing, caseNumber }: OutputNodeArgs): PipelineFlowNode[] {
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
  ];
}

// A broker/switch/fallback output: a fan-out group whose members recurse into their own subtrees.
function outputContainerNodes(args: OutputNodeArgs, key: string, members: OutputMemberSpec[]): PipelineFlowNode[] {
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
  const children = members.flatMap((member, i) =>
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

function outputLeafNode(args: OutputNodeArgs, key: string, value: unknown): PipelineFlowNode {
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
  };
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
  // a plain output stays `output-0`. Tests and selection depend on these ids.
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
    // No parseable component (absent or `input: []`) — keep the placeholder so "Add input" exists.
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

const emptyConfigNodes = (): PipelineFlowNode[] => [
  { id: 'section-input', kind: 'section', label: 'input', section: 'input' },
  { id: 'input-placeholder', kind: 'leaf', label: 'none', section: 'input', parentId: 'section-input' },
  { id: 'section-output', kind: 'section', label: 'output', section: 'output' },
  { id: 'output-placeholder', kind: 'leaf', label: 'none', section: 'output', parentId: 'section-output' },
];

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

export function parsePipelineFlowTree(configYaml: string): ParsePipelineFlowTreeResult {
  if (!configYaml) {
    return { nodes: emptyConfigNodes() };
  }

  try {
    const doc = parseDocument(configYaml, { merge: true });
    if (doc.errors.length > 0) {
      throw doc.errors[0];
    }
    const config = (doc.toJS() as ParsedYamlConfig | null) ?? {};
    return { nodes: buildFlowTree(config, doc) };
  } catch (err) {
    return { nodes: [], error: err instanceof Error ? err.message : 'Invalid YAML' };
  }
}

/**
 * Parse YAML once into both the editable node tree AND the `yaml` Document whose `getIn` resolves an
 * `editTargetPath` (with ranges when a LineCounter is supplied), so diff/lint don't parse twice.
 */
export function parseEditableNodes(
  configYaml: string,
  lineCounter?: LineCounter
): { doc: Document; nodes: PipelineFlowNode[] } {
  // `merge` must be enabled at PARSE time — as a toJS option it is silently ignored and
  const doc = parseDocument(configYaml, { merge: true, ...(lineCounter ? { lineCounter } : {}) });
  if (!configYaml) {
    return { doc, nodes: emptyConfigNodes() };
  }
  try {
    const config = (doc.toJS() as ParsedYamlConfig | null) ?? {};
    return { doc, nodes: buildFlowTree(config, doc) };
  } catch {
    return { doc, nodes: [] };
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

// The `*_resources` array a node's ref must resolve into: a candidate-promoted ref carries the
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

export function buildResourceRefResolver(resources: PipelineFlowNode[]): ResourceRefResolver {
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
  return (node, label) => {
    const key = expectedResourceKey(node);
    return key ? byKeyAndLabel.get(`${key}\u0000${label}`) : byLabel.get(label);
  };
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
