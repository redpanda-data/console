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

import { summarizeComponent } from './pipeline-flow-meta';
import type { PipelineFlowNode, ResourceRefCandidate } from './pipeline-flow-nodes';
import type { EditTarget } from './yaml-edit-target';
import { resourceKindForFieldName } from './yaml-resources';
import { firstKey } from './yaml-values';
import { isNonEmptyString } from '../../../../utils/string-utils';
import { isObject, isUnknownArray } from '../../../../utils/type-guards';

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

export function pathEditTarget(section: 'input' | 'processor' | 'output', path: (string | number)[]): EditTarget {
  return { kind: 'path', path, componentType: SECTION_COMPONENT_TYPE[section] };
}

// Switch cases enumerated for display: null/scalar entries are skipped without leaving ordinal
// gaps ("case 1", "case 3"), while `index` keeps the raw YAML position so edit paths never shift.
export function enumerateSwitchCases(
  cases: unknown[]
): { index: number; ordinal: number; record: Record<string, unknown> }[] {
  const entries: { index: number; ordinal: number; record: Record<string, unknown> }[] = [];
  for (const [i, c] of cases.entries()) {
    if (isObject(c)) {
      entries.push({ index: i, ordinal: entries.length + 1, record: c });
    }
  }
  return entries;
}

export function extractLabel(obj: Record<string, unknown>): string | undefined {
  return typeof obj.label === 'string' && obj.label !== '' ? obj.label : undefined;
}

export function extractTopics(componentConfig: unknown): string[] | undefined {
  if (!isObject(componentConfig)) {
    return;
  }
  const config = componentConfig;
  if (isUnknownArray(config.topics)) {
    const topics = config.topics.filter((t): t is string => typeof t === 'string' && t !== '');
    return topics.length > 0 ? topics : undefined;
  }
  if (typeof config.topic === 'string' && config.topic !== '') {
    return [config.topic];
  }
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
  if (!isUnknownArray(value)) {
    return;
  }
  const entries: ProcessorEntry[] = [];
  for (const [i, v] of value.entries()) {
    if (isObject(v)) {
      entries.push([i, v]);
    }
  }
  return entries;
}

// A resource reference is a string `resource:` field (cache/rate_limit processors);
// surfaced so the canvas draws a dashed edge to the matching resource node.
function extractResourceRef(componentValue: unknown): string | undefined {
  if (!isObject(componentValue) || isUnknownArray(componentValue)) {
    return;
  }
  const ref = componentValue.resource;
  return typeof ref === 'string' && ref !== '' ? ref : undefined;
}

// A `resource:` indirection component (e.g. `input: { resource: foo }`) runs a named
// *_resources entry. Capture that label so the canvas links to its definition.
export function indirectionResourceRef(componentName: string | undefined, componentValue: unknown): string | undefined {
  return componentName === 'resource' && typeof componentValue === 'string' && componentValue !== ''
    ? componentValue
    : undefined;
}

// A resource ref may live in a non-`resource` field (e.g. `checkpoint_cache`). Only fields whose
// NAME marks them as a reference are collected — a coincidental value match on an unrelated field
// (e.g. `client_id` equal to a resource label) must not draw a dependency edge. The post-pass
// promotes candidates that resolve to a real resource of the field's kind.
export function extractRefCandidates(componentValue: unknown): ResourceRefCandidate[] | undefined {
  if (!isObject(componentValue) || isUnknownArray(componentValue)) {
    return;
  }
  const candidates: ResourceRefCandidate[] = [];
  for (const [key, value] of Object.entries(componentValue)) {
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
export function caseRouting(check: unknown): Pick<PipelineFlowNode, 'condition' | 'isDefault' | 'isErrorPath'> {
  const hasCheck = typeof check === 'string' && check !== '';
  return {
    condition: hasCheck ? check : undefined,
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
    if (!isNonEmptyString(procName)) {
      continue;
    }
    const childNodes = parseComponentWithBranching(procName, proc[procName], {
      ...ctx,
      parentId: ctx.parentId,
      idPrefix: `${ctx.idPrefix}-p${pi}`,
      depth: ctx.depth + 1,
      path: [...ctx.path, pi],
    });
    // Surface a nested component's `label:` on its node, like top-level processors.
    const labelText = extractLabel(proc);
    if (childNodes.length > 0 && labelText !== null && labelText !== undefined && labelText !== '') {
      childNodes[0] = { ...childNodes[0], labelText };
    }
    nodes.push(...childNodes);
  }
}

// The nodes for a processor array's entries, parented and pathed by `ctx`.
function processorChildNodes(procs: ProcessorEntry[], ctx: BranchContext): PipelineFlowNode[] {
  const nodes: PipelineFlowNode[] = [];
  pushProcessorChildren(nodes, procs, ctx);
  return nodes;
}

const PROCESSORS_FIELD_KEYS = new Set(['while', 'branch', 'group_by', 'group_by_value']);

function parseBranchingField(key: string, fieldValue: unknown, ctx: BranchContext): PipelineFlowNode[] {
  // ctx.path is the inner config; the field value lives at [...ctx.path, key].
  if (key === 'switch' && isUnknownArray(fieldValue)) {
    return parseSwitchCases(fieldValue, { ...ctx, path: [...ctx.path, key] });
  }
  if (PROCESSORS_FIELD_KEYS.has(key) && isObject(fieldValue)) {
    const innerProcs = extractProcessorEntries(fieldValue.processors);
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

// A switch/group_by processor: its group, then each case wrapper with its body.
function caseContainerNodes(
  componentName: string,
  cases: unknown[],
  ctx: BranchContext,
  valuePath: (string | number)[]
): PipelineFlowNode[] {
  const caseNodes = parseSwitchCases(cases, { ...ctx, path: valuePath });
  const group = makeGroup(componentName, ctx);
  // Can grow a new case appended to its value array, even with no cases yet.
  group.addChildSlot = { containerPath: valuePath, section: 'processor' };
  return [group, ...caseNodes];
}

function parseComponentWithBranching(
  componentName: string,
  componentValue: unknown,
  ctx: BranchContext
): PipelineFlowNode[] {
  if (ctx.depth >= MAX_BRANCH_DEPTH || !isObject(componentValue)) {
    return [makeLeaf(componentName, ctx, componentValue)];
  }

  if (isUnknownArray(componentValue) && BRANCHING_FIELDS.has(componentName)) {
    return parseDirectArrayBranching(componentName, componentValue, ctx);
  }

  const config = componentValue;
  const childNodes = parseBranchingKeys(config, ctx, componentName);
  if (childNodes.length === 0) {
    return childlessComponentNodes(componentName, config, ctx);
  }

  return [withBranchMeta(makeGroup(componentName, ctx), componentName, config), ...childNodes];
}

// A component with no branching children. An empty branch/while/parallel still accepts children —
// render a fillable group, not a dead-end leaf; anything else is a plain leaf.
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

export function parseProcessorNodes(processors: unknown[], sectionId: string): PipelineFlowNode[] {
  return processors.flatMap((proc, i): PipelineFlowNode[] => {
    if (!isObject(proc)) {
      return [];
    }
    const name = firstKey(proc);
    if (!(name !== null && name !== undefined && name !== '')) {
      return [];
    }
    const ctx: BranchContext = {
      section: 'processor',
      parentId: sectionId,
      idPrefix: `proc-${i}`,
      depth: 0,
      path: ['pipeline', 'processors', i],
    };
    const nodes = parseComponentWithBranching(name, proc[name], ctx);
    return withProcessorRootMetadata(nodes, proc, name, i);
  });
}

// Only the first node is the top-level processor; descendants keep their path-based targets.
function withProcessorRootMetadata(
  nodes: PipelineFlowNode[],
  proc: Record<string, unknown>,
  name: string,
  index: number
): PipelineFlowNode[] {
  const labelText = extractLabel(proc);
  if (nodes.length > 0) {
    nodes[0] = {
      ...nodes[0],
      ...(isNonEmptyString(labelText) ? { labelText } : {}),
      editTarget: { kind: 'processor', index },
      meta: summarizeComponent(name, proc[name]),
    };
  }
  return nodes;
}
