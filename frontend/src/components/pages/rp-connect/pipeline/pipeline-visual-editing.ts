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

import type { LintHint } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';

import type { InspectorChildItem } from './node-config-form';
import { nonzeroNumber } from '../../../../utils/number-utils';
import { isNonEmptyString } from '../../../../utils/string-utils';
import { isObject } from '../../../../utils/type-guards';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import type { PipelineFlowNode } from '../utils/pipeline-flow-nodes';
import { buildInsertableComponent, createResourceAndReturnLabel } from '../utils/yaml';
import {
  appendResource,
  getComponentAt,
  insertComponentAt,
  seqLengthAt,
  setComponentAt,
} from '../utils/yaml-component-editing';
import { componentKeyAt, type EditTarget, type ResourceArrayKey } from '../utils/yaml-edit-target';
import { type ResourceKind, resourceArrayKey } from '../utils/yaml-resources';
import { firstKey } from '../utils/yaml-values';

// Types the insert (+) picker offers: pipeline steps plus the resources they reference.
export const INSERTABLE_TYPES = ['processor', 'cache', 'rate_limit'] satisfies ConnectComponentType[];

// Stable empty set so the "no unsaved nodes" case doesn't churn the canvas layout memo.
export const EMPTY_NODE_IDS: ReadonlySet<string> = new Set();

export const INSERT_KIND_LABEL: Record<'input' | 'processor' | 'output', string> = {
  input: 'an input',
  output: 'an output',
  processor: 'a processor',
};

// Where a chosen connector lands: a top-level spine slot or a nested container array.
export type PendingInsert =
  | { context: 'spine'; index: number }
  | { context: 'slot'; containerPath: (string | number)[]; accepts: 'input' | 'processor' | 'output'; index: number }
  // Switch "add case": the picked step is wrapped as `{ check, output }` or `{ check, processors: [step] }`.
  | { context: 'switchCase'; containerPath: (string | number)[]; section: 'processor' | 'output' }
  // "Create new resource": create the cache/rate_limit and link it to `target`'s `resource:` field.
  | { context: 'resourceForNode'; kind: ResourceKind; target: EditTarget };

export type InsertParams = {
  yaml: string;
  connectionName: string;
  connectionType: ConnectComponentType;
  target: PendingInsert;
  components: ConnectComponentSpec[];
};

// Routing-condition target for a node: output switch — the node owns it; processor switch — the
// case wrapper owns it and this node is the wrapper's first child.
export function caseTargetForNode(
  node: PipelineFlowNode | undefined,
  flowNodes: PipelineFlowNode[]
): EditTarget | undefined {
  if (node?.caseEditTarget) {
    return node.caseEditTarget;
  }
  if (!isNonEmptyString(node?.parentId)) {
    return;
  }
  const parent = flowNodes.find((n) => n.id === node.parentId);
  const firstChild = flowNodes.find((n) => n.parentId === node.parentId);
  return parent?.caseEditTarget && firstChild?.id === node.id ? parent.caseEditTarget : undefined;
}

// A processor-switch case has no rendered card, so jump to its first body step (carrying the
// case's condition target); every other node jumps to itself. Null if unjumpable.
export function resolveJumpTarget(
  node: PipelineFlowNode,
  flowNodes: PipelineFlowNode[]
): { id: string; target: EditTarget; caseTarget?: EditTarget } | null {
  if (node.editTarget?.kind === 'switchCase') {
    const entry = flowNodes.find((n) => n.parentId === node.id);
    if (entry?.editTarget) {
      return { id: entry.id, target: entry.editTarget, caseTarget: node.caseEditTarget };
    }
  }
  return node.editTarget ? { id: node.id, target: node.editTarget, caseTarget: node.caseEditTarget } : null;
}

// Direct children (cases / steps) of a control-flow node as clickable inspector items; an
// output-switch case is its own entry, a processor-switch case resolves to its first body step.
function inspectorChildItem(
  child: PipelineFlowNode,
  flowNodes: PipelineFlowNode[],
  lintByNode: Map<string, LintHint[]>
): InspectorChildItem | null {
  const entry =
    child.editTarget?.kind === 'switchCase' ? (flowNodes.find((node) => node.parentId === child.id) ?? child) : child;
  if (!entry.editTarget) {
    return null;
  }
  const lintCount =
    (lintByNode.get(entry.id)?.length ?? 0) + (child.id === entry.id ? 0 : (lintByNode.get(child.id)?.length ?? 0));
  return {
    id: entry.id,
    target: entry.editTarget,
    caseTarget: child.caseEditTarget ?? entry.caseEditTarget,
    name: entry.label,
    condition: child.condition ?? entry.condition,
    isDefault: child.isDefault ?? entry.isDefault,
    isErrorPath: child.isErrorPath ?? entry.isErrorPath,
    lintCount: nonzeroNumber(lintCount) ?? undefined,
  };
}

export function buildChildItems(
  selectedId: string,
  flowNodes: PipelineFlowNode[],
  lintByNode: Map<string, LintHint[]>
): InspectorChildItem[] {
  return flowNodes
    .filter((child) => child.parentId === selectedId)
    .flatMap((child) => {
      const item = inspectorChildItem(child, flowNodes, lintByNode);
      return item ? [item] : [];
    });
}

// The component's name (its single top-level key) at a target, or undefined when unresolvable.
export function componentNameAt(yaml: string, target: EditTarget): string | undefined {
  const comp = getComponentAt(yaml, target);
  return comp ? componentKeyAt(target, comp) : undefined;
}

// The next YAML plus the edit target of the node that was just added, so the caller can select it.
export type InsertResult = { yaml: string; selectTarget?: EditTarget };

type SwitchCaseInsert = Extract<PendingInsert, { context: 'switchCase' }>;
type ResourceForNodeInsert = Extract<PendingInsert, { context: 'resourceForNode' }>;
type IndexedInsert = Extract<PendingInsert, { context: 'spine' | 'slot' }>;

// A new case with an empty condition, wrapping the chosen step.
function wrapAsCase(section: SwitchCaseInsert['section'], step: Record<string, unknown>): Record<string, unknown> {
  return section === 'output' ? { check: '', output: step } : { check: '', processors: [step] };
}

// Where the wrapped step sits inside the case at `caseIndex`.
function caseStepPath(target: SwitchCaseInsert, caseIndex: number): (string | number)[] {
  return target.section === 'output'
    ? [...target.containerPath, caseIndex, 'output']
    : [...target.containerPath, caseIndex, 'processors', 0];
}

// Append a new case (empty condition) wrapping the chosen step; select the step for configuring.
function insertSwitchCase(
  { yaml, connectionName, connectionType, components }: InsertParams,
  target: SwitchCaseInsert
): InsertResult | null {
  if (connectionType !== target.section) {
    return null;
  }
  const step = buildInsertableComponent(connectionName, target.section, components);
  if (!step) {
    return null;
  }
  const next = insertComponentAt(yaml, target.containerPath, Number.MAX_SAFE_INTEGER, wrapAsCase(target.section, step));
  if (next === null) {
    return null;
  }
  const caseIndex = seqLengthAt(next, target.containerPath) - 1;
  return {
    yaml: next,
    selectTarget: { kind: 'path', path: caseStepPath(target, caseIndex), componentType: target.section },
  };
}

// Point the node's `resource:` at `label`; the YAML is unchanged when the node has no object config.
function linkResourceToNode(yaml: string, target: EditTarget, label: string): string {
  const comp = getComponentAt(yaml, target);
  const name = comp ? firstKey(comp) : undefined;
  const inner = name !== null && name !== undefined && name !== '' ? comp?.[name] : undefined;
  if (!(comp && name !== null && name !== undefined && name !== '' && isObject(inner) && !Array.isArray(inner))) {
    return yaml;
  }
  inner.resource = label;
  return setComponentAt(yaml, target, comp) ?? yaml;
}

// Create the resource and link it to the node's `resource:` in one commit, so it's never left unlinked.
function insertLinkedResource(
  { yaml, connectionName, connectionType, components }: InsertParams,
  target: ResourceForNodeInsert
): InsertResult | null {
  if (connectionType !== target.kind) {
    return null;
  }
  const created = createResourceAndReturnLabel(yaml, target.kind, connectionName, components);
  if (!created) {
    return null;
  }
  return { yaml: linkResourceToNode(created.yaml, target.target, created.label) };
}

// Caches/rate limits append to their top-level resource array.
function insertResource(
  { yaml, connectionName, components }: InsertParams,
  connectionType: 'cache' | 'rate_limit'
): InsertResult | null {
  const resource = buildInsertableComponent(connectionName, connectionType, components);
  const resourceKey: ResourceArrayKey = resourceArrayKey(connectionType);
  if (!resource) {
    return null;
  }
  const next = appendResource(yaml, resourceKey, resource);
  return next === null
    ? null
    : { yaml: next, selectTarget: { kind: 'resource', resourceKey, index: seqLengthAt(next, [resourceKey]) - 1 } };
}

// Spine or slot insert — both carry an index; the spine targets the top-level processors array.
function insertStep(
  { yaml, connectionName, components }: InsertParams,
  target: IndexedInsert,
  connectionType: 'processor' | 'input' | 'output'
): InsertResult | null {
  const component = buildInsertableComponent(connectionName, connectionType, components);
  if (!component) {
    return null;
  }
  const containerPath = target.context === 'slot' ? target.containerPath : ['pipeline', 'processors'];
  const next = insertComponentAt(yaml, containerPath, target.index, component);
  if (next === null) {
    return null;
  }
  // insertComponentAt clamps the index to the array length; mirror that to locate the new node.
  const insertedIndex = Math.min(target.index, seqLengthAt(next, containerPath) - 1);
  const selectTarget: EditTarget =
    target.context === 'slot'
      ? { kind: 'path', path: [...containerPath, insertedIndex], componentType: target.accepts }
      : { kind: 'processor', index: insertedIndex };
  return { yaml: next, selectTarget };
}

// Resolve the chosen connector + target to the next YAML (null on failure). Caches/rate limits
// append to their top-level resource arrays; everything else splices into the target container.
export function buildInsertedYaml(params: InsertParams): InsertResult | null {
  const { target, connectionType } = params;
  if (target.context === 'switchCase') {
    return insertSwitchCase(params, target);
  }
  if (target.context === 'resourceForNode') {
    return insertLinkedResource(params, target);
  }
  if (connectionType === 'cache' || connectionType === 'rate_limit') {
    return insertResource(params, connectionType);
  }
  if (connectionType === 'processor' || connectionType === 'input' || connectionType === 'output') {
    return insertStep(params, target, connectionType);
  }
  return null;
}
