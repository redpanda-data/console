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

import { type Document, type LineCounter, parseDocument, parse as parseYaml } from 'yaml';

import { type NodeMetaEntry, summarizeComponent, truncate } from './pipeline-flow-meta';
import {
  type EditTarget,
  firstKey,
  type ParsedYamlConfig,
  parseMultiInputs,
  type ResourceArrayKey,
  type ResourceKind,
  resourceArrayKey,
  resourceKindForComponentName,
  resourceKindForFieldName,
} from './yaml';
import { REDPANDA_TOPIC_AND_USER_COMPONENTS } from '../types/constants';

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
  // How this node is edited/deleted; nested components carry path-based targets.
  editTarget?: EditTarget;
  // Key config values surfaced on the canvas card.
  meta?: NodeMetaEntry[];
  // Group child data flow: `sequential` chains them (sub-pipeline, e.g. branch/catch);
  // `parallel` fans out (alternatives, e.g. switch cases, broker inputs). Default sequential.
  childFlow?: 'sequential' | 'parallel';
  // Routing condition selecting this branch (switch `check`, fallback "on failure"),
  // shown as a label on the fan-out edge entering this node.
  condition?: string;
  // Catch-all / else branch (a switch case with no `check`).
  isDefault?: boolean;
  // Error / dead-letter path (catch handler, `errored()` route, fallback).
  isErrorPath?: boolean;
  // A `branch` processor: request_map copy-out / result_map merge-back. Rendered inline as a marker.
  branch?: { request: boolean; result: boolean };
  // Label of a resource this component references (cache/rate_limit `resource`).
  resourceRef?: string;
  // Kind of a candidate-promoted `resourceRef` (from its field name), so resolution stays
  // kind-aware — a `checkpoint_cache` ref never links to a same-labelled rate_limit.
  resourceRefKind?: ResourceKind;
  // Name-referencing field values that MIGHT be resource labels (`cache:`, `checkpoint_cache:`, …).
  // The post-pass promotes whichever matches a real resource label to `resourceRef`.
  resourceRefCandidates?: ResourceRefCandidate[];
  // A `switch` case wrapper — structural sub-node (not editable); selecting it picks the parent.
  isCase?: boolean;
  // Edit target for the case's routing condition (`{ check, … }`), forwarded to the case's entry card.
  caseEditTarget?: EditTarget;
  // Id of the (non-rendered) case-wrapper node a processor-switch case entry stands in for, so a
  // condition edit (which changes the wrapper's config) marks THIS entry card as unsaved.
  caseOwnerId?: string;
  // Container accepting new children (array YAML path + kind it holds); drives the in-container "+".
  insertSlot?: { containerPath: (string | number)[]; accepts: 'input' | 'processor' | 'output' };
  // For a `switch`: path of its `cases`/value array + section, so we can append a fresh case.
  addChildSlot?: { containerPath: (string | number)[]; section: 'processor' | 'output' };
  // A `resource:` ref whose label has no matching `*_resources` entry (dangling); drives an error badge + quick-fix.
  danglingRef?: boolean;
  // For a resource node: how many components reference its label (for "Used by N").
  usedByCount?: number;
  // For an array-resource node: the `*_resources` key it was defined under, so references
  // resolve kind-aware (a cache ref never links to a same-labelled rate_limit).
  resourceKey?: string;
};

// Human label for a node's section (canvas card kind chips, command-palette rows).
export const SECTION_LABEL: Record<NonNullable<PipelineFlowNode['section']>, string> = {
  input: 'Input',
  processor: 'Processor',
  output: 'Output',
  resource: 'Resource',
};

// SECTION_LABEL lookup tolerant of untyped values — card data carries `section` as a bare string.
export function sectionLabel(section?: string): string {
  return SECTION_LABEL[section as NonNullable<PipelineFlowNode['section']>] ?? '';
}

type BranchContext = {
  section: 'input' | 'processor' | 'output';
  parentId: string;
  idPrefix: string;
  depth: number;
  // YAML path to this context's component object (e.g. ['pipeline','processors',1]).
  // Gives nested components a path-based editTarget so they're editable in the same dialog.
  path: (string | number)[];
};

// A nested component's schema type follows the section it lives in.
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

type GroupChildSpec = {
  name: string;
  /** Original index in the source array — drives the child id + edit path. */
  index?: number;
  meta?: NodeMetaEntry[];
};

// A container member may itself be a container (e.g. a `fallback` output). Summarize what
// it wraps, routing-aware, so the collapsed leaf shows where data goes — not just "fallback".
const NESTED_MEMBER_SUMMARY: Record<string, { label: string; sep: string }> = {
  fallback: { label: 'tries', sep: ' → ' },
  sequence: { label: 'then', sep: ' → ' },
  broker: { label: 'fans out', sep: ', ' },
  switch: { label: 'routes', sep: ' | ' },
};

// Display summary (config preview, or wrapped-member chain) for one container member.
function memberMeta(key: string, value: unknown): NodeMetaEntry[] | undefined {
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

// Resolve a container member object (e.g. `{ aws_s3: {…} }`) to its display name + summary.
function memberNameAndMeta(key: string, obj: unknown): { name: string; meta?: NodeMetaEntry[] } {
  return { name: key, meta: memberMeta(key, (obj as Record<string, unknown>)[key]) };
}

// Member specs (name + summary) for a `broker`/`sequence` input, from its `inputs` array.
function multiMemberSpecs(value: unknown): GroupChildSpec[] | undefined {
  if (!value || typeof value !== 'object') {
    return;
  }
  const items = (value as { inputs?: unknown[] }).inputs;
  if (!Array.isArray(items)) {
    return;
  }
  // Skip entries with no component key (null/scalar, or reserved-only stubs like `- label: x`) —
  // matching parseMultiInputs — but keep original indices so edit paths never land on a neighbour.
  const specs: GroupChildSpec[] = [];
  for (const [i, item] of items.entries()) {
    const key = firstKey(item);
    if (key) {
      specs.push({ index: i, ...memberNameAndMeta(key, item) });
    }
  }
  return specs;
}

// YAML path to the i-th child of a multi-input component (nested members are editable).
function multiChildPath(groupLabel: string, i: number): (string | number)[] {
  return ['input', groupLabel, 'inputs', i];
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
      // Original array index (falls back to render position) so ids/paths survive skipped entries.
      const idx = child.index ?? i;
      return {
        id: `${spec.groupId}-${idx}`,
        kind: 'leaf',
        label: child.name,
        section: spec.section,
        parentId: spec.groupId,
        meta: child.meta,
        editTarget: pathEditTarget(spec.section, multiChildPath(spec.groupLabel, idx)),
      };
    }),
  ];
}

// ── Empty container affordances ──────────────────────────────────────────
// Containers normally derive their insert "+" from a child's path; an empty array has none,
// so emit an explicit slot — else a freshly-added broker is a dead-end leaf.
type ContainerSlot =
  | { insertSlot: NonNullable<PipelineFlowNode['insertSlot']> }
  | { addChildSlot: NonNullable<PipelineFlowNode['addChildSlot']> };

const EMPTY_INPUT_CONTAINERS: Record<string, ContainerSlot> = {
  broker: { insertSlot: { containerPath: ['input', 'broker', 'inputs'], accepts: 'input' } },
  sequence: { insertSlot: { containerPath: ['input', 'sequence', 'inputs'], accepts: 'input' } },
};

// Empty-container group for a top-level input, or null if not a recognised container. Empty output
// containers don't need this — buildOutputNodes always returns a (possibly empty) member list.
function emptyInputContainerGroup(key: string, sectionId: string, labelText?: string): PipelineFlowNode[] | null {
  const slot = EMPTY_INPUT_CONTAINERS[key];
  if (!slot) {
    return null;
  }
  return [
    {
      id: `input-${key}`,
      kind: 'group',
      label: key,
      section: 'input',
      parentId: sectionId,
      collapsible: true,
      childFlow: 'parallel',
      editTarget: { kind: 'input' },
      ...(labelText ? { labelText } : {}),
      ...slot,
    },
  ];
}

// One member of an output container, with the YAML path to its component object and the
// routing that selects it, so `buildOutputNodes` can recurse into it.
type OutputMemberSpec = {
  obj: unknown;
  path: (string | number)[];
  condition?: string;
  isDefault?: boolean;
  isErrorPath?: boolean;
  caseEditTarget?: EditTarget;
  // Display ordinal from enumerateSwitchCases — NOT the raw YAML index.
  caseNumber?: number;
};

// Switch cases enumerated for display: null/scalar entries are skipped without leaving ordinal
// gaps ("case 1", "case 3"), while `index` keeps the raw YAML position so edit paths never shift.
function enumerateSwitchCases(cases: unknown[]): { index: number; ordinal: number; record: Record<string, unknown> }[] {
  const entries: { index: number; ordinal: number; record: Record<string, unknown> }[] = [];
  for (const [i, c] of cases.entries()) {
    if (c && typeof c === 'object') {
      entries.push({ index: i, ordinal: entries.length + 1, record: c as Record<string, unknown> });
    }
  }
  return entries;
}

// Members of an output container (broker/switch/fallback), or undefined if `key` isn't one. Member
// paths derive from `path` (the container object) so nesting composes into deep, editable paths.
function outputContainerMembers(
  key: string,
  value: unknown,
  path: (string | number)[]
): OutputMemberSpec[] | undefined {
  // A recognised container always returns a (possibly empty) member list, so a malformed or
  // empty one still renders as a fan-out container with its "Add …" affordance, never a leaf.
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
    const cases = (value as { cases?: unknown[] } | undefined)?.cases;
    if (!Array.isArray(cases)) {
      return [];
    }
    const members: OutputMemberSpec[] = enumerateSwitchCases(cases).map(({ index, ordinal, record }) => ({
      obj: record.output,
      path: [...path, key, 'cases', index, 'output'],
      ...caseRouting(record.check),
      caseEditTarget: { kind: 'switchCase', path: [...path, key, 'cases', index] },
      caseNumber: ordinal,
    }));
    return members;
  }
  if (key === 'broker') {
    const outputs = (value as { outputs?: unknown[] } | undefined)?.outputs;
    return (Array.isArray(outputs) ? outputs : []).map((obj, i) => ({ obj, path: [...path, key, 'outputs', i] }));
  }
  return;
}

// The in-place "grow" affordance for an output container: switch appends a `{ check, output }`
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
  return hasNonEmptySasl(componentConfig) || hasNonEmptySasl(rootConfig.redpanda);
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
      multiMemberSpecs(inputObj[inputKey]) ?? childNames.map((name) => ({ name }))
    );
    groupNodes[0] = { ...groupNodes[0], editTarget: { kind: 'input' }, labelText: extractLabel(inputObj) };
    return groupNodes;
  }

  const emptyContainer = emptyInputContainerGroup(inputKey, sectionId, extractLabel(inputObj));
  if (emptyContainer) {
    return emptyContainer;
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
      resourceRef: indirectionResourceRef(inputKey, inputObj[inputKey]),
      resourceRefCandidates: extractRefCandidates(inputObj[inputKey]),
    },
  ];
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

// Processor containers whose value IS a flat processor array — inserting appends to it.
// (`switch`/`group_by` are arrays too but of structural case objects, handled separately.)
const DIRECT_ARRAY_PROC_CONTAINERS: ReadonlySet<string> = new Set(['try', 'catch', 'for_each']);

// Processor containers that nest children under a `processors:` field — an empty one
// accepts a processor into `<name>.processors`.
const NESTED_PROC_CONTAINERS: ReadonlySet<string> = new Set(['branch', 'while', 'parallel']);

// A parseable processor entry paired with its ORIGINAL YAML index.
type ProcessorEntry = [number, Record<string, unknown>];

// A processor array's parseable entries with their ORIGINAL YAML indices: unparseable entries
// (`- null`, mid-edit scalars) are skipped, but edit paths must never land on a neighbouring entry.
function extractProcessorEntries(value: unknown): ProcessorEntry[] | undefined {
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

// A resource reference is a string `resource:` field (cache/rate_limit processors);
// surfaced so the canvas draws a dashed edge to the matching resource node.
function extractResourceRef(componentValue: unknown): string | undefined {
  if (!componentValue || typeof componentValue !== 'object' || Array.isArray(componentValue)) {
    return;
  }
  const ref = (componentValue as Record<string, unknown>).resource;
  return typeof ref === 'string' && ref !== '' ? ref : undefined;
}

// A `resource:` indirection component (e.g. `input: { resource: foo }`) runs a named
// *_resources entry. Capture that label so the canvas links to its definition.
function indirectionResourceRef(componentName: string | undefined, componentValue: unknown): string | undefined {
  return componentName === 'resource' && typeof componentValue === 'string' && componentValue !== ''
    ? componentValue
    : undefined;
}

// A possible resource reference held in a name-referencing field, with the kind that name implies.
export type ResourceRefCandidate = { label: string; kind: ResourceKind };

// A resource ref may live in a non-`resource` field (e.g. `checkpoint_cache`). Only fields whose
// NAME marks them as a reference are collected — a coincidental value match on an unrelated field
// (e.g. `client_id` equal to a resource label) must not draw a dependency edge. The post-pass
// promotes candidates that resolve to a real resource of the field's kind.
function extractRefCandidates(componentValue: unknown): ResourceRefCandidate[] | undefined {
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

// A Bloblang check referencing `errored()` — this branch handles failed messages (dead-letter).
const ERRORED_CHECK_RE = /errored\s*\(/;
function isErroredCheck(check: unknown): boolean {
  return typeof check === 'string' && ERRORED_CHECK_RE.test(check);
}

// Routing that a switch/case entry's `check` selects: a non-empty check is the branch condition,
// its absence marks the default (else) case, and an `errored()` check is the error path.
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
    // Surface key config on nested leaves too, like top-level processors.
    ...(meta.length > 0 ? { meta } : {}),
    ...(topics ? { topics } : {}),
    editTarget: pathEditTarget(ctx.section, ctx.path),
  };
}

// Components whose children are alternatives/parallel branches, not a sequential sub-pipeline.
const PARALLEL_GROUP_COMPONENTS: ReadonlySet<string> = new Set(['switch', 'parallel', 'group_by']);

// Processors that are arrays of `{ check, processors }` cases (routing vs grouping) — rendered as
// a fan of condition-labelled case lanes with an "Add case" affordance.
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

function parseSwitchCases(cases: unknown[], ctx: BranchContext): PipelineFlowNode[] {
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
      // The case object is editable for its `check` condition; its processors are their own nodes.
      editTarget: { kind: 'switchCase', path: [...ctx.path, ci] },
      caseEditTarget: { kind: 'switchCase', path: [...ctx.path, ci] },
      // Explicit so even an empty case (no children to derive from) is fillable.
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

function pushProcessorChildren(nodes: PipelineFlowNode[], procs: ProcessorEntry[], ctx: BranchContext): void {
  // ctx.path is the processors array; each child component sits at [...path, index], where
  // `pi` is the entry's ORIGINAL YAML index (unparseable siblings don't shift it).
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
      // Surface a nested component's `label:` on its node, like top-level processors.
      const labelText = extractLabel(proc);
      if (childNodes.length > 0 && labelText) {
        childNodes[0] = { ...childNodes[0], labelText };
      }
      nodes.push(...childNodes);
    }
  }
}

const PROCESSORS_FIELD_KEYS = new Set(['while', 'branch', 'group_by', 'group_by_value']);

function parseBranchingField(key: string, fieldValue: unknown, ctx: BranchContext): PipelineFlowNode[] {
  // ctx.path is the inner config; the field value lives at [...ctx.path, key].
  if (key === 'switch' && Array.isArray(fieldValue)) {
    return parseSwitchCases(fieldValue, { ...ctx, path: [...ctx.path, key] });
  }
  if (PROCESSORS_FIELD_KEYS.has(key) && fieldValue && typeof fieldValue === 'object') {
    const innerProcs = extractProcessorEntries((fieldValue as Record<string, unknown>).processors);
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
  const procArray = extractProcessorEntries(fieldValue);
  if (procArray) {
    const nodes: PipelineFlowNode[] = [];
    pushProcessorChildren(nodes, procArray, { ...ctx, idPrefix: `${ctx.idPrefix}-${key}`, path: [...ctx.path, key] });
    return nodes;
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
  // Children parent off the group node; descend the path into the named config.
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
  if (CASE_CONTAINER_LABELS.has(componentName)) {
    const caseNodes = parseSwitchCases(componentValue, { ...ctx, path: valuePath });
    const group = makeGroup(componentName, ctx);
    // Can grow a new case appended to its value array, even with no cases yet.
    group.addChildSlot = { containerPath: valuePath, section: 'processor' };
    return [group, ...caseNodes];
  }

  const procArray = extractProcessorEntries(componentValue);
  // try/catch/for_each: keep the group (with insert slot) even when empty so a first processor can be added.
  if (procArray && DIRECT_ARRAY_PROC_CONTAINERS.has(componentName)) {
    const group = makeGroup(componentName, ctx);
    group.insertSlot = { containerPath: valuePath, accepts: 'processor' };
    const nodes: PipelineFlowNode[] = [group];
    pushProcessorChildren(nodes, procArray, { ...ctx, parentId: ctx.idPrefix, path: valuePath });
    return nodes;
  }
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
    // An empty branch/while/parallel still accepts children — render a fillable group, not a dead-end leaf.
    if (NESTED_PROC_CONTAINERS.has(componentName)) {
      const group = withBranchMeta(makeGroup(componentName, ctx), componentName, config);
      group.insertSlot = { containerPath: [...ctx.path, componentName, 'processors'], accepts: 'processor' };
      return [group];
    }
    return [makeLeaf(componentName, ctx, componentValue)];
  }

  return [withBranchMeta(makeGroup(componentName, ctx), componentName, config), ...childNodes];
}

// A `branch` copies part of the message out (request_map), runs the sub-pipeline, then
// merges back (result_map). Mark it so the canvas draws copy/merge edges, not a plain chain.
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
    // The first node is the top-level processor; editable by array index.
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

// Array resources addressed by the dedicated `resource` target (cache/rate-limit). Other resources
// are editable via path targets (RESOURCE_KEY_COMPONENT_TYPE / SINGLETON_RESOURCE_COMPONENT_TYPE).
const EDITABLE_RESOURCE_KEYS: ReadonlySet<string> = new Set(['cache_resources', 'rate_limit_resources']);

// input/output/processor resources hold a real component, inspectable via a path edit
// target whose schema follows the matching component type.
const RESOURCE_KEY_COMPONENT_TYPE: Record<string, 'input' | 'processor' | 'output'> = {
  input_resources: 'input',
  processor_resources: 'processor',
  output_resources: 'output',
};

// Singleton root resources that ARE components (e.g. `buffer: { memory: … }`) get a path edit target;
// `logger`/`redpanda` are plain config, not components, so they stay display-only.
const SINGLETON_RESOURCE_COMPONENT_TYPE: Record<string, 'buffer' | 'metrics' | 'tracer'> = {
  buffer: 'buffer',
  metrics: 'metrics',
  tracer: 'tracer',
};

// Edit target for the i-th resource-array item (dedicated `resource` target or path target, per above).
function resourceItemEditTarget(key: string, index: number): EditTarget | undefined {
  if (EDITABLE_RESOURCE_KEYS.has(key)) {
    return { kind: 'resource', resourceKey: key as ResourceArrayKey, index };
  }
  const componentType = RESOURCE_KEY_COMPONENT_TYPE[key];
  return componentType ? { kind: 'path', path: [key, index], componentType } : undefined;
}

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
        resourceKey: key,
        editTarget: resourceItemEditTarget(key, i),
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
      const componentType = SINGLETON_RESOURCE_COMPONENT_TYPE[key];
      const valueObj = value as Record<string, unknown>;
      const implName = componentType ? firstKey(valueObj) : undefined;
      nodes.push({
        id: `resource-${key}`,
        kind: 'leaf',
        label: key,
        section: 'resource',
        parentId: sectionId,
        editTarget: componentType ? { kind: 'path', path: [key], componentType } : undefined,
        meta: implName ? summarizeComponent(implName, valueObj[implName]) : undefined,
      });
    }
  }
  return nodes;
}

type OutputNodeArgs = {
  obj: unknown;
  id: string;
  parentId: string;
  // YAML path to `obj` (the component object being built).
  path: (string | number)[];
  // How to edit this node: `{ kind: 'output' }` at the top level, a path when nested.
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
  const { obj, id, parentId, path, editTarget, routing, caseNumber, labelText, config } = args;
  const key = firstKey(obj);
  if (!key) {
    // A check-only switch case (no `output:` body yet) still renders as an empty, condition-editable
    // case — mirroring processor switches, so a case never silently vanishes from the canvas.
    if (routing?.caseEditTarget) {
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
    return [];
  }
  const value = (obj as Record<string, unknown>)[key];
  const members = outputContainerMembers(key, value, path);
  if (members) {
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

  const topics = extractTopics(value);
  const isRedpanda = REDPANDA_COMPONENTS.has(key);
  return [
    {
      id,
      kind: 'leaf',
      label: key,
      section: 'output',
      parentId,
      ...(labelText ? { labelText } : {}),
      ...(topics ? { topics } : {}),
      missingTopic: isRedpanda && !topics ? true : undefined,
      missingSasl: isRedpanda && !hasSaslConfig(value, config) ? true : undefined,
      editTarget,
      meta: summarizeComponent(key, value),
      resourceRef: indirectionResourceRef(key, value),
      resourceRefCandidates: extractRefCandidates(value),
      ...routing,
    },
  ];
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
  // A container's top-level id keeps its `output-<key>` form (children `output-<key>-<i>`);
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

function buildInputSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig): void {
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

function buildProcessorSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig): void {
  if (!(config.pipeline && Array.isArray(config.pipeline.processors))) {
    return;
  }
  const sectionId = 'section-processors';
  nodes.push({ id: sectionId, kind: 'section', label: 'processors', section: 'processor' });
  nodes.push(...parseProcessorNodes(config.pipeline.processors as Record<string, unknown>[], sectionId));
}

function buildResourceSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig): void {
  const sectionId = 'section-resources';
  const resourceNodes = parseResourceNodes(config, sectionId);
  if (resourceNodes.length === 0) {
    return;
  }
  nodes.push({ id: sectionId, kind: 'section', label: 'resources', section: 'resource' });
  nodes.push(...resourceNodes);
}

function buildOutputSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig): void {
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

// Fresh placeholder graph per call, so a downstream mutation can't leak across parses.
const emptyConfigNodes = (): PipelineFlowNode[] => [
  { id: 'section-input', kind: 'section', label: 'input', section: 'input' },
  { id: 'input-placeholder', kind: 'leaf', label: 'none', section: 'input', parentId: 'section-input' },
  { id: 'section-output', kind: 'section', label: 'output', section: 'output' },
  { id: 'output-placeholder', kind: 'leaf', label: 'none', section: 'output', parentId: 'section-output' },
];

// Build the flow-node tree from an already merge-resolved config object.
function buildFlowTree(config: ParsedYamlConfig): PipelineFlowNode[] {
  const nodes: PipelineFlowNode[] = [];
  buildInputSection(nodes, config);
  buildProcessorSection(nodes, config);
  buildResourceSection(nodes, config);
  buildOutputSection(nodes, config);
  annotateFlowMeta(nodes);
  return nodes;
}

export function parsePipelineFlowTree(configYaml: string): ParsePipelineFlowTreeResult {
  if (!configYaml) {
    return { nodes: emptyConfigNodes() };
  }

  try {
    // `merge: true` resolves `<<: *anchor` keys so merged fields (topics, sasl, …) render
    // as part of the component instead of a literal `<<` node with false missing-* badges.
    const config = (parseYaml(configYaml, { merge: true }) as ParsedYamlConfig | null) ?? {};
    return { nodes: buildFlowTree(config) };
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
  // `<<: *anchor` keys would survive unresolved, hiding anchored fields from this tree.
  const doc = parseDocument(configYaml, { merge: true, ...(lineCounter ? { lineCounter } : {}) });
  if (!configYaml) {
    return { doc, nodes: emptyConfigNodes() };
  }
  try {
    const config = (doc.toJS() as ParsedYamlConfig | null) ?? {};
    return { doc, nodes: buildFlowTree(config) };
  } catch {
    return { doc, nodes: [] };
  }
}

/** True when the pipeline has no real components — only section labels / `none` placeholders. */
export function isPipelineEmpty(nodes: PipelineFlowNode[]): boolean {
  return !nodes.some((n) => n.kind === 'group' || (n.kind === 'leaf' && n.label !== 'none'));
}

/** True when the config text is only whitespace, `#` comments, or an empty `{}` document — i.e. genuinely blank. */
export function isConfigTextEmpty(configYaml: string): boolean {
  return configYaml.split('\n').every((line) => {
    const trimmed = line.trim();
    return trimmed === '' || trimmed.startsWith('#') || trimmed === '{}';
  });
}

/**
 * Offer "Start from a template" ONLY for a genuinely blank config: text that parses to no components
 * (invalid YAML, or lost sections) is NOT empty — a template there would clobber the user's work.
 */
export function shouldOfferTemplate(configYaml: string, nodes: PipelineFlowNode[]): boolean {
  return isPipelineEmpty(nodes) && isConfigTextEmpty(configYaml);
}

// Post-parse pass deriving cross-node metadata the per-node parsers can't see in isolation:
// which containers accept inserts, which resource refs dangle, and per-resource usage counts.
function annotateFlowMeta(nodes: PipelineFlowNode[]): void {
  const childrenByParent = buildChildrenMap(nodes);

  // Insert slots: a container whose children sit at numeric YAML-array indices can accept a
  // new child into that array. Derived from any one child's path; parse-site slots untouched.
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
// kind its field name implies; `cache`/`rate_limit` name their kind; a `resource:` indirection
// uses its own section.
function expectedResourceKey(node: PipelineFlowNode): string | undefined {
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
  return;
}

type ResourceRefResolver = (node: PipelineFlowNode, label: string) => PipelineFlowNode | undefined;

// Kind-aware lookup from a referencing node + label to the resource card it plugs into,
// so a cache processor's dependency can't land on a same-labelled rate_limit resource.
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

// Resource references: promote field candidates, flag dangling links, and count usages via the kind-aware resolver.
function annotateResourceRefs(nodes: PipelineFlowNode[]): void {
  const resolve = buildResourceRefResolver(nodes.filter((n) => n.section === 'resource'));
  // Promote candidates that resolve to a real resource label — catches refs in non-`resource`
  // fields. `resourceRefKind` is set BEFORE probing so `resolve` matches kind-aware, and it stays
  // set on success so later resolutions (usage counting, layout edges) agree on the target.
  for (const node of nodes) {
    if (node.resourceRef || !node.resourceRefCandidates) {
      continue;
    }
    for (const candidate of node.resourceRefCandidates) {
      node.resourceRefKind = candidate.kind;
      if (resolve(node, candidate.label)) {
        node.resourceRef = candidate.label;
        break;
      }
      node.resourceRefKind = undefined;
    }
  }
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
  for (const node of nodes) {
    if (node.section === 'resource' && node.labelText) {
      node.usedByCount = usedBy.get(node.id) ?? 0;
    }
  }
}

// ============================================================================
// Shared data-flow model
// ----------------------------------------------------------------------------
// Helpers supplying the flow connections (input → processors → output), separate from layout.
// ============================================================================

export function buildChildrenMap(nodes: PipelineFlowNode[]): Map<string | undefined, PipelineFlowNode[]> {
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

// Children of a section, found by kind + section.
export function sectionChildren(
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
