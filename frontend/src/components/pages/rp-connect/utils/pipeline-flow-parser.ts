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

import {
  Graph as DagreGraph,
  layout as dagreLayout,
  type EdgeLabel,
  type GraphLabel,
  type NodeLabel,
} from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import { parse as parseYaml } from 'yaml';

import { type NodeMetaEntry, summarizeComponent, truncate } from './pipeline-flow-meta';
import { type EditTarget, firstKey, parseMultiInputs, parseMultiOutputs, type ResourceArrayKey } from './yaml';
import { REDPANDA_TOPIC_AND_USER_COMPONENTS } from '../types/constants';

type ParsedYamlConfig = {
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  pipeline?: { processors?: Record<string, unknown>[] };
  cache_resources?: unknown[];
  rate_limit_resources?: unknown[];
  // Inputs/outputs/processors declared as named resources, referenced via `resource:`
  // indirection. Rendered in the resource lane with reference links drawn to them.
  input_resources?: unknown[];
  output_resources?: unknown[];
  processor_resources?: unknown[];
  buffer?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  tracer?: Record<string, unknown>;
  logger?: Record<string, unknown>;
  redpanda?: Record<string, unknown>;
};

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
  // Only on top-level editable nodes (input/output/top-level processor/array resource).
  // Drives edit & delete; nested nodes have none and stay read-only.
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
  // Error / dead-letter path (catch handler, `errored()` route, fallback). Drawn red/dashed.
  isErrorPath?: boolean;
  // A `branch` processor: request_map copy-out / result_map merge-back. Rendered inline as a marker.
  branch?: { request: boolean; result: boolean };
  // Label of a resource this component references (cache/rate_limit `resource`); draws a
  // dashed reference edge to the matching resource node.
  resourceRef?: string;
  // String values that MIGHT be resource labels (non-`resource` fields). The post-pass promotes
  // whichever matches a real resource label to `resourceRef`.
  resourceRefCandidates?: string[];
  // A `switch` case wrapper — structural sub-node (not editable); selecting it picks the parent.
  isCase?: boolean;
  // Edit target for the case's routing condition (`{ check, … }`); see the chip-clickability note
  // where this is forwarded to the entry card.
  caseEditTarget?: EditTarget;
  // Id of the (non-rendered) case-wrapper node a processor-switch case entry stands in for, so a
  // condition edit (which changes the wrapper's config) marks THIS entry card as unsaved.
  caseOwnerId?: string;
  // Container accepting new children: the array's YAML path and the component kind it holds.
  // Drives in-container "+" (add a processor into a switch case, an input into a broker, …).
  insertSlot?: { containerPath: (string | number)[]; accepts: 'input' | 'processor' | 'output' };
  // For a `switch`: path of its `cases`/value array + section, so we can append a fresh case.
  addChildSlot?: { containerPath: (string | number)[]; section: 'processor' | 'output' };
  // References a `resource:` whose label has no matching `*_resources` entry — a dangling
  // link. Drives an error badge + quick-fix.
  danglingRef?: boolean;
  // For a resource node: how many components reference its label (for "Used by N").
  usedByCount?: number;
  // For an array-resource node: the `*_resources` key it was defined under, so references
  // resolve kind-aware (a cache ref never links to a same-labelled rate_limit).
  resourceKey?: string;
};

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
  condition?: string;
  isDefault?: boolean;
  isErrorPath?: boolean;
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
function memberMeta(section: 'input' | 'output', key: string, value: unknown): NodeMetaEntry[] | undefined {
  const summary = NESTED_MEMBER_SUMMARY[key];
  if (summary) {
    const names = section === 'input' ? parseMultiInputs(key, value) : parseMultiOutputs(key, value);
    if (names && names.length > 0) {
      return [{ label: summary.label, value: truncate(names.join(summary.sep)) }];
    }
  }
  const meta = summarizeComponent(key, value);
  return meta.length > 0 ? meta : undefined;
}

// Resolve a container member object (e.g. `{ aws_s3: {…} }`) to its display name + summary.
function memberNameAndMeta(section: 'input' | 'output', obj: unknown): { name: string; meta?: NodeMetaEntry[] } {
  const key = firstKey(obj);
  if (!key) {
    return { name: section };
  }
  const inner = obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;
  return { name: key, meta: memberMeta(section, key, inner) };
}

// Member specs (name + summary) for a `broker`/`sequence`, from its `inputs`/`outputs` array.
// `switch`/`fallback` outputs carry routing and go through `parseOutputBranches` instead.
function multiMemberSpecs(section: 'input' | 'output', value: unknown): GroupChildSpec[] | undefined {
  if (!value || typeof value !== 'object') {
    return;
  }
  const items = (value as { inputs?: unknown[]; outputs?: unknown[] })[section === 'input' ? 'inputs' : 'outputs'];
  if (!Array.isArray(items)) {
    return;
  }
  // Skip null/scalar entries but keep each member's original index, so edit paths never land on a
  // neighbour (mapping every element would emit a phantom leaf pointing at the null slot).
  const specs: GroupChildSpec[] = [];
  for (const [i, item] of items.entries()) {
    if (item && typeof item === 'object') {
      specs.push({ index: i, ...memberNameAndMeta(section, item) });
    }
  }
  return specs;
}

// YAML path to the i-th child of a multi-input/output component (nested members are editable).
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
      // A `sequence` input runs children in order; broker/switch/fallback fan out.
      childFlow: spec.groupLabel === 'sequence' ? 'sequential' : 'parallel',
      // An output `switch` grows by appending a case; its cases hold one output each, so
      // they take no child inserts (unlike a processor switch).
      ...(spec.section === 'output' && spec.groupLabel === 'switch'
        ? { addChildSlot: { containerPath: ['output', 'switch', 'cases'], section: 'output' as const } }
        : {}),
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
        condition: child.condition,
        isDefault: child.isDefault,
        isErrorPath: child.isErrorPath,
        meta: child.meta,
        editTarget: pathEditTarget(spec.section, multiChildPath(spec.section, spec.groupLabel, idx)),
        // An output-switch case's condition is editable as a switch case (the leaf still
        // edits its output). Other multi-output/input members have no case.
        ...(spec.section === 'output' && spec.groupLabel === 'switch'
          ? { caseEditTarget: { kind: 'switchCase' as const, path: ['output', 'switch', 'cases', idx] } }
          : {}),
      };
    }),
  ];
}

// ── Empty container affordances ──────────────────────────────────────────
// Containers normally derive their insert "+" from a child's path. With an empty array
// there's no child, so emit the group with an explicit slot — otherwise a freshly-added
// broker would be a dead-end leaf with no way to add its first member.
type ContainerSlot =
  | { insertSlot: NonNullable<PipelineFlowNode['insertSlot']> }
  | { addChildSlot: NonNullable<PipelineFlowNode['addChildSlot']> };

const EMPTY_OUTPUT_CONTAINERS: Record<string, ContainerSlot> = {
  broker: { insertSlot: { containerPath: ['output', 'broker', 'outputs'], accepts: 'output' } },
  fallback: { insertSlot: { containerPath: ['output', 'fallback'], accepts: 'output' } },
  // A `switch` grows by appending a structural `{ check, output }` case.
  switch: { addChildSlot: { containerPath: ['output', 'switch', 'cases'], section: 'output' } },
};

const EMPTY_INPUT_CONTAINERS: Record<string, ContainerSlot> = {
  broker: { insertSlot: { containerPath: ['input', 'broker', 'inputs'], accepts: 'input' } },
  sequence: { insertSlot: { containerPath: ['input', 'sequence', 'inputs'], accepts: 'input' } },
};

// Empty-container group for a top-level input/output, or null if not a recognised container.
function emptySectionContainerGroup(
  key: string,
  section: 'input' | 'output',
  sectionId: string,
  labelText?: string
): PipelineFlowNode[] | null {
  const slot = section === 'output' ? EMPTY_OUTPUT_CONTAINERS[key] : EMPTY_INPUT_CONTAINERS[key];
  if (!slot) {
    return null;
  }
  return [
    {
      id: `${section}-${key}`,
      kind: 'group',
      label: key,
      section,
      parentId: sectionId,
      collapsible: true,
      childFlow: 'parallel',
      editTarget: section === 'output' ? { kind: 'output' } : { kind: 'input' },
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
};

// Members of an output container (broker/switch/fallback), or undefined if `key` isn't one.
// `path` points to the container object `{ key: value }`; each member's path is derived from
// it so nesting composes (a fallback inside a switch case gets a deep, editable path).
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
    const cases = (value as { cases?: Record<string, unknown>[] } | undefined)?.cases;
    if (!Array.isArray(cases)) {
      return [];
    }
    return cases.map((c, i) => {
      const check = c.check;
      const hasCheck = typeof check === 'string' && check !== '';
      return {
        obj: c.output,
        path: [...path, key, 'cases', i, 'output'],
        condition: hasCheck ? (check as string) : undefined,
        isDefault: hasCheck ? undefined : true,
        isErrorPath: isErroredCheck(check) ? true : undefined,
        caseEditTarget: { kind: 'switchCase', path: [...path, key, 'cases', i] },
      };
    });
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
      multiMemberSpecs('input', inputObj[inputKey]) ?? childNames.map((name) => ({ name }))
    );
    groupNodes[0] = { ...groupNodes[0], editTarget: { kind: 'input' }, labelText: extractLabel(inputObj) };
    return groupNodes;
  }

  const emptyContainer = emptySectionContainerGroup(inputKey, 'input', sectionId, extractLabel(inputObj));
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

// A processor array's parseable entries WITH their original YAML indices. Unparseable
// entries (`- null`, scalars mid-edit) are skipped for rendering, but each kept entry's
// source index still feeds its editTarget path — an edit/delete must never land on a
// neighbouring entry because the rendered positions were compacted.
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

// A resource ref may live in a non-`resource` field (e.g. a CDC input's `checkpoint_cache`).
// Without the schema here we can't know field types, so collect every top-level string as a
// candidate; the post-pass promotes those matching an actual resource label.
function extractRefCandidates(componentValue: unknown): string[] | undefined {
  if (!componentValue || typeof componentValue !== 'object' || Array.isArray(componentValue)) {
    return;
  }
  const values = Object.values(componentValue as Record<string, unknown>).filter(
    (v): v is string => typeof v === 'string' && v !== ''
  );
  return values.length > 0 ? values : undefined;
}

// A Bloblang check referencing `errored()` — this branch handles failed messages (dead-letter).
const ERRORED_CHECK_RE = /errored\s*\(/;
function isErroredCheck(check: unknown): boolean {
  return typeof check === 'string' && ERRORED_CHECK_RE.test(check);
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
const CASE_CONTAINER_LABELS: ReadonlySet<string> = new Set(['switch', 'group_by']);

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
  // Label counter — skipped (null) cases shouldn't leave gaps ("case 1", "case 3"). Ids/paths keep
  // the raw YAML index `ci`.
  let caseNum = 0;
  for (const [ci, caseObj] of cases.entries()) {
    if (!caseObj || typeof caseObj !== 'object') {
      continue;
    }
    caseNum += 1;
    const caseRecord = caseObj as Record<string, unknown>;
    // A case without a `processors` array (e.g. hand-written check-only) still renders —
    // as an empty case with its condition and an add slot — never silently vanishes.
    const caseProcs = extractProcessorEntries(caseRecord.processors) ?? [];
    const caseId = `${ctx.idPrefix}-case-${ci + 1}`;
    const check = caseRecord.check;
    const hasCheck = typeof check === 'string' && check !== '';
    const caseLabel = `case ${caseNum}`;
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
      isCase: true,
      // The case object is editable for its `check` condition; its processors are their own
      // nodes. Selecting the case opens the condition editor.
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
  // Children parent off the group node; branching keys live inside the named config,
  // so descend the path into that component name.
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
  // `switch` and `group_by` are both arrays of `{ check, processors }` cases (routing vs grouping),
  // so both render as case groups — not a flat processor array.
  if (CASE_CONTAINER_LABELS.has(componentName)) {
    const caseNodes = parseSwitchCases(componentValue, { ...ctx, path: valuePath });
    const group = makeGroup(componentName, ctx);
    // Can grow a new case appended to its value array, even with no cases yet.
    group.addChildSlot = { containerPath: valuePath, section: 'processor' };
    return [group, ...caseNodes];
  }

  const procArray = extractProcessorEntries(componentValue);
  // try/catch/for_each hold a flat processor array — keep the group (with insert slot)
  // even when empty so the first processor can be added.
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
    // An empty branch/while/parallel still accepts a child into its `processors` array —
    // render as a fillable group, not a dead-end leaf.
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

// Array resources addressed by the dedicated `resource` target (cache/rate-limit). Other
// resources are editable too, but via path targets: input/output/processor resource arrays
// (RESOURCE_KEY_COMPONENT_TYPE) and component-shaped singletons (SINGLETON_RESOURCE_COMPONENT_TYPE).
const EDITABLE_RESOURCE_KEYS: ReadonlySet<string> = new Set(['cache_resources', 'rate_limit_resources']);

// input/output/processor resources hold a real component, inspectable via a path edit
// target whose schema follows the matching component type.
const RESOURCE_KEY_COMPONENT_TYPE: Record<string, 'input' | 'processor' | 'output'> = {
  input_resources: 'input',
  processor_resources: 'processor',
  output_resources: 'output',
};

// Singleton root resources that ARE components (each wraps one impl, e.g. `buffer: { memory: … }`)
// become editable via a path target carrying their component type. The remaining root blocks
// (`logger`, `redpanda`) are plain config, not components, so they stay display-only.
const SINGLETON_RESOURCE_COMPONENT_TYPE: Record<string, 'buffer' | 'metrics' | 'tracer'> = {
  buffer: 'buffer',
  metrics: 'metrics',
  tracer: 'tracer',
};

// Edit target for the i-th resource-array item: cache/rate-limit use the dedicated
// `resource` target; input/output/processor resources use a path target (shared editing).
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
      // A component-shaped singleton (buffer/metrics/tracer) gets an edit target + impl meta so it
      // isn't an inert card; plain config blocks (logger/redpanda) remain display-only.
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
  labelText?: string;
  config: ParsedYamlConfig;
};

// Build the node subtree for an output component. broker/switch/fallback become a fan-out
// GROUP whose members recurse — so a fallback nested inside a switch case (or a broker, …) is
// itself a branching container with per-member editable nodes and a grow affordance, not a
// summary leaf. Anything else is an editable leaf.
function buildOutputNodes(args: OutputNodeArgs): PipelineFlowNode[] {
  const { obj, id, parentId, path, editTarget, routing, labelText, config } = args;
  const key = firstKey(obj);
  if (!key) {
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
    // No parseable component (absent, or unrenderable like `input: []`) — always keep the
    // placeholder so the "Add input" affordance exists.
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

export function parsePipelineFlowTree(configYaml: string): ParsePipelineFlowTreeResult {
  if (!configYaml) {
    return { nodes: emptyConfigNodes() };
  }

  try {
    // `merge: true` resolves `<<: *anchor` keys so merged fields (topics, sasl, …) render
    // as part of the component instead of a literal `<<` node with false missing-* badges.
    const config = (parseYaml(configYaml, { merge: true }) as ParsedYamlConfig | null) ?? {};
    const nodes: PipelineFlowNode[] = [];

    buildInputSection(nodes, config);
    buildProcessorSection(nodes, config);
    buildResourceSection(nodes, config);
    buildOutputSection(nodes, config);

    annotateFlowMeta(nodes);

    return { nodes };
  } catch (err) {
    return { nodes: [], error: err instanceof Error ? err.message : 'Invalid YAML' };
  }
}

/** True when the pipeline has no real components — only section labels / `none` placeholders. */
export function isPipelineEmpty(nodes: PipelineFlowNode[]): boolean {
  return !nodes.some((n) => n.kind === 'group' || (n.kind === 'leaf' && n.label !== 'none'));
}

/** True when the config text is only whitespace and `#` comments — i.e. genuinely blank. */
export function isConfigTextEmpty(configYaml: string): boolean {
  return configYaml.split('\n').every((line) => {
    const trimmed = line.trim();
    return trimmed === '' || trimmed.startsWith('#');
  });
}

/**
 * Offer "Start from a template" ONLY for a genuinely blank config. Text that parses to no components
 * — invalid YAML, or valid YAML that lost its input/output/pipeline sections — is NOT empty: a
 * template there would clobber the user's work. Callers pass their already-parsed nodes to reuse them.
 */
export function shouldOfferTemplate(configYaml: string, nodes: PipelineFlowNode[]): boolean {
  return isPipelineEmpty(nodes) && isConfigTextEmpty(configYaml);
}

// Post-parse pass deriving cross-node metadata the per-node parsers can't see in isolation:
// which containers accept inserts, which resource refs dangle, and per-resource usage counts.
function annotateFlowMeta(nodes: PipelineFlowNode[]): void {
  const childrenByParent = new Map<string, PipelineFlowNode[]>();
  for (const node of nodes) {
    if (node.parentId) {
      const list = childrenByParent.get(node.parentId);
      if (list) {
        list.push(node);
      } else {
        childrenByParent.set(node.parentId, [node]);
      }
    }
  }

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

// The `*_resources` array a node's reference must resolve into, from the referencing
// component itself: `cache`/`rate_limit` processors name their kind; a `resource:`
// indirection resolves within its own section. Undefined = kind unknown (candidate-promoted
// refs from arbitrary fields) — those match a resource of any kind.
function expectedResourceKey(node: PipelineFlowNode): string | undefined {
  if (node.label === 'cache') {
    return 'cache_resources';
  }
  if (node.label === 'rate_limit') {
    return 'rate_limit_resources';
  }
  if (node.label === 'resource' && node.section && node.section !== 'resource') {
    return `${node.section}_resources`;
  }
  return;
}

type ResourceRefResolver = (node: PipelineFlowNode, label: string) => PipelineFlowNode | undefined;

// Kind-aware lookup from a referencing node + label to the resource card it plugs into,
// so a cache processor's dependency can't land on a same-labelled rate_limit resource.
function buildResourceRefResolver(resources: PipelineFlowNode[]): ResourceRefResolver {
  const byKeyAndLabel = new Map<string, PipelineFlowNode>();
  const byLabel = new Map<string, PipelineFlowNode>();
  for (const resource of resources) {
    if (!resource.labelText) {
      continue;
    }
    if (resource.resourceKey) {
      byKeyAndLabel.set(`${resource.resourceKey} ${resource.labelText}`, resource);
    }
    if (!byLabel.has(resource.labelText)) {
      byLabel.set(resource.labelText, resource);
    }
  }
  return (node, label) => {
    const key = expectedResourceKey(node);
    return key ? byKeyAndLabel.get(`${key} ${label}`) : byLabel.get(label);
  };
}

// Resource references: promote field candidates, flag dangling links, and count usages —
// all through the kind-aware resolver.
function annotateResourceRefs(nodes: PipelineFlowNode[]): void {
  const resolve = buildResourceRefResolver(nodes.filter((n) => n.section === 'resource'));
  // Promote a candidate resolving to a resource label into a real reference — catches refs in
  // non-`resource` fields and on input/output nodes that carry no explicit `resource` field.
  for (const node of nodes) {
    if (!node.resourceRef && node.resourceRefCandidates) {
      node.resourceRef = node.resourceRefCandidates.find((c) => resolve(node, c));
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
// The canvas draws the flow (input → top-level processors → output; each group threads its
// children: sequential chains, parallel fans out). These helpers supply the connections,
// separate from layout positioning.
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

// Children of a section, found by kind + section.
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

// ============================================================================
// Expanded canvas layout (left → right flow with nested containers)
// ----------------------------------------------------------------------------
// Main path runs left→right (input → top-level processors → output). A processor wrapping a
// sub-pipeline (branch/try/catch/…), alternatives (switch/workflow/parallel), or a multi-input
// broker renders as a titled CONTAINER enclosing its children — flow enters, runs its steps,
// then continues to the next top-level step (à la Step Functions / NiFi). Container children
// are real React Flow child nodes (parentId + relative position).
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
        // between the split and the target card — not poking into the card (was ≈0.72, which
        // overlapped the card's left edge once the gap widened) nor piling up at the split.
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
