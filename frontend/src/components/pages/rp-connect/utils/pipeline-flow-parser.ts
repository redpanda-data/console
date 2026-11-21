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
import { CHILDLESS_WRAPPER, type PipelineFlowNode, type StopSlot } from './pipeline-flow-nodes';
import {
  caseRouting,
  enumerateSwitchCases,
  extractLabel,
  extractRefCandidates,
  extractTopics,
  indirectionResourceRef,
  parseProcessorNodes,
  pathEditTarget,
} from './processor-flow';
import { stopSlotLock, unwrapLock } from './read-until';
import { parseResourceNodes } from './resource-flow';
import { type ParsedYamlConfig, parseMultiInputs } from './yaml';
import type { EditTarget } from './yaml-edit-target';
import { hasSeedBrokers } from './yaml-redpanda';
import { resourceArrayKey, resourceKindForComponentName } from './yaml-resources';
import { asRecord, firstKey, READ_UNTIL, type StopCondition, slotComponentKey, unwrapReadUntil } from './yaml-values';
import { isNonEmptyString } from '../../../../utils/string-utils';
import { isObject, isPresent, isUnknownArray } from '../../../../utils/type-guards';
import { REDPANDA_TOPIC_AND_USER_COMPONENTS, SHARED_CLIENT_FALLBACK_COMPONENTS } from '../types/constants';

const REDPANDA_COMPONENTS: ReadonlySet<string> = new Set(REDPANDA_TOPIC_AND_USER_COMPONENTS);

// The stop slot of the input held by `slot`; `component` is that input with any `read_until` peeled off.
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
  // A `read_until` left over after peeling is childless, unless it wraps an input of its own (nested).
  const childless =
    isObject(component) && slotComponentKey(component) === READ_UNTIL && !unwrapReadUntil(component).stop;
  return {
    stopSlot: childless ? { ...base, locked: CHILDLESS_WRAPPER } : base,
    endBehavior: condition ? classifyInputSlot(slot, config) : ownEnd,
  };
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

// Display summary (config preview, or wrapped-member chain) for one container member.
function memberMeta(key: string, value: unknown): NodeMetaEntry[] | undefined {
  const summary = NESTED_MEMBER_SUMMARY[key];
  if (isPresent(summary)) {
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
  return { name: key, meta: memberMeta(key, asRecord(obj)?.[key]) };
}

// Member specs (name + summary) for a `broker`/`sequence` input, from its `inputs` array.
function multiMemberSpecs(
  value: unknown,
  membersPath: (string | number)[],
  config: ParsedYamlConfig
): GroupChildSpec[] | undefined {
  if (!isObject(value)) {
    return;
  }
  const items = value.inputs;
  return isUnknownArray(items) ? memberSpecsWithIndices(items, membersPath, config) : undefined;
}

// Skip entries with no component key (null/scalar, or reserved-only stubs like `- label: x`) —
// matching parseMultiInputs — but keep original indices so edit paths never land on a neighbour.
// A `read_until` member is shown as the input it wraps.
function memberSpecsWithIndices(
  items: unknown[],
  membersPath: (string | number)[],
  config: ParsedYamlConfig
): GroupChildSpec[] {
  const specs: GroupChildSpec[] = [];
  for (const [i, item] of items.entries()) {
    if (!isObject(item) || isUnknownArray(item)) {
      continue;
    }
    const { component, stop } = unwrapReadUntil(item);
    const key = slotComponentKey(component);
    if (key !== null && key !== undefined && key !== '') {
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
      // Original array index (falls back to render position) so ids/paths survive skipped entries.
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

// ── Empty container affordances ──────────────────────────────────────────
// Containers normally derive their insert "+" from a child's path; an empty array has none,
// so emit an explicit slot — else a freshly-added broker is a dead-end leaf.
type ContainerSlot =
  | { insertSlot: NonNullable<PipelineFlowNode['insertSlot']> }
  | { addChildSlot: NonNullable<PipelineFlowNode['addChildSlot']> };

const MULTI_INPUT_CONTAINERS: ReadonlySet<string> = new Set(['broker', 'sequence']);

// The top-level input as rendered: its component (looking through a `read_until`), how it's edited,
// and the slot its stop condition attaches to.
type TopLevelInput = {
  key: string;
  value: unknown;
  componentPath: (string | number)[];
  editTarget: EditTarget;
  stopSlot: StopSlot;
  endBehavior: InputEndBehavior;
  labelText?: string;
};

// Empty-container group for a top-level input, or null if not a recognised container. Empty output
// containers don't need this — buildOutputNodes always returns a (possibly empty) member list.
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
      ...(isNonEmptyString(input.labelText) ? { labelText: input.labelText } : {}),
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
    return (isUnknownArray(value) ? value : []).map((obj, i) => ({
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
    const outputs = asRecord(value)?.outputs;
    return (isUnknownArray(outputs) ? outputs : []).map((obj, i) => ({ obj, path: [...path, key, 'outputs', i] }));
  }
}

// An output switch's cases, each routing to its `output` (switchPath is the `switch` object's path).
function switchOutputMembers(value: unknown, switchPath: (string | number)[]): OutputMemberSpec[] {
  const cases = asRecord(value)?.cases;
  if (!isUnknownArray(cases)) {
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
}

function hasNonEmptySasl(obj: unknown): boolean {
  if (!isObject(obj)) {
    return false;
  }
  const sasl = obj.sasl;
  if (isUnknownArray(sasl)) {
    return sasl.length > 0;
  }
  if (isObject(sasl)) {
    return Object.keys(sasl).length > 0;
  }
  return false;
}

function hasSaslConfig(componentName: string, componentConfig: unknown, rootConfig: ParsedYamlConfig): boolean {
  const ownSaslIsUsed =
    hasNonEmptySasl(componentConfig) &&
    (!SHARED_CLIENT_FALLBACK_COMPONENTS.has(componentName) || hasSeedBrokers(componentConfig));
  return ownSaslIsUsed || hasNonEmptySasl(rootConfig.redpanda);
}

// A `read_until` input renders as the input it wraps; the wrapper's settings ride the node as its stop
// condition.
function resolveTopLevelInput(inputObj: Record<string, unknown>, config: ParsedYamlConfig): TopLevelInput | undefined {
  const { component, innerPath, stop } = unwrapReadUntil(inputObj);
  const key = slotComponentKey(component);
  if (!(key !== null && key !== undefined && key !== '')) {
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

// A broker/sequence input: the group (edited as the whole input) followed by its member leaves.
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
  const key = firstKey(args.obj);
  if (!(key !== null && key !== undefined && key !== '')) {
    return checkOnlyOutputCaseNodes(args);
  }
  const value = asRecord(args.obj)?.[key];
  const members = outputContainerMembers(key, value, args.path);
  return members ? outputContainerNodes(args, key, members) : [outputLeafNode(args, key, value)];
}

// A check-only switch case (no `output:` body yet) still renders as an empty, condition-editable
// case — mirroring processor switches, so a case never silently vanishes from the canvas.
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
    ...(labelText !== null && labelText !== undefined && labelText !== '' ? { labelText } : {}),
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
    ...(labelText !== null && labelText !== undefined && labelText !== '' ? { labelText } : {}),
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
  if (!(outputKey !== null && outputKey !== undefined && outputKey !== '')) {
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
  const parsed = isObject(config.input) ? parseInputNodes(config.input, sectionId, config) : [];
  if (parsed.length > 0) {
    nodes.push(...parsed);
  } else {
    // No parseable component (absent or `input: []`) — keep the placeholder so "Add input" exists.
    nodes.push({ id: 'input-placeholder', kind: 'leaf', label: 'none', section: 'input', parentId: sectionId });
  }
}

function buildProcessorSection(nodes: PipelineFlowNode[], config: ParsedYamlConfig): void {
  const processors = asRecord(config.pipeline)?.processors;
  if (!isUnknownArray(processors)) {
    return;
  }
  const sectionId = 'section-processors';
  nodes.push({ id: sectionId, kind: 'section', label: 'processors', section: 'processor' });
  nodes.push(...parseProcessorNodes(processors, sectionId));
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
  const parsed = isObject(config.output) ? parseOutputNodes(config.output, sectionId, config) : [];
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

// The lock on a single input slot; an editable wrapper may still be unsafe to unwrap.
function lockedStopSlot(slot: StopSlot, doc: Document) {
  const locked = stopSlotLock(doc, slot.path);
  if (isNonEmptyString(locked)) {
    return { ...slot, locked };
  }
  const unwrap = slot.condition ? unwrapLock(doc, slot.path) : undefined;
  return isNonEmptyString(unwrap) ? { ...slot, unwrapLock: unwrap } : slot;
}

// Lock the stop conditions the YAML can't take a rewrite of (an aliased or merged input, say).
function lockStopSlots(nodes: PipelineFlowNode[], doc: Document): void {
  for (const node of nodes) {
    if (node.stopSlot && !isNonEmptyString(node.stopSlot.locked)) {
      node.stopSlot = lockedStopSlot(node.stopSlot, doc);
    }
  }
}

// Build the flow-node tree from `doc`'s merge-resolved config object.
function buildFlowTree(config: ParsedYamlConfig, doc: Document): PipelineFlowNode[] {
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
    // `merge: true` resolves `<<: *anchor` keys so merged fields (topics, sasl, …) render
    // as part of the component instead of a literal `<<` node with false missing-* badges.
    const doc = parseDocument(configYaml, { merge: true });
    // As `parse` does: the first error throws.
    if (doc.errors.length > 0) {
      throw doc.errors[0];
    }
    const parsed: unknown = doc.toJS();
    const config = asRecord(parsed) ?? {};
    return { nodes: buildFlowTree(config, doc) };
  } catch (error) {
    return { nodes: [], error: error instanceof Error ? error.message : 'Invalid YAML' };
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
    const parsed: unknown = doc.toJS();
    const config = asRecord(parsed) ?? {};
    return { doc, nodes: buildFlowTree(config, doc) };
  } catch {
    return { doc, nodes: [] };
  }
}

/** True when the pipeline has no real components — only section labels / `none` placeholders. */
export function isPipelineEmpty(nodes: PipelineFlowNode[]): boolean {
  return nodes.every((n) => n.kind !== 'group' && (n.kind !== 'leaf' || n.label === 'none'));
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
    if (
      child &&
      child.editTarget?.kind === 'path' &&
      (child.editTarget.componentType === 'input' ||
        child.editTarget.componentType === 'processor' ||
        child.editTarget.componentType === 'output')
    ) {
      node.insertSlot = {
        containerPath: child.editTarget.path.slice(0, -1),
        accepts: child.editTarget.componentType,
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
}

type ResourceRefResolver = (node: PipelineFlowNode, label: string) => PipelineFlowNode | undefined;

// Kind-aware lookup from a referencing node + label to the resource card it plugs into,
// so a cache processor's dependency can't land on a same-labelled rate_limit resource.
export function buildResourceRefResolver(resources: PipelineFlowNode[]): ResourceRefResolver {
  const byKeyAndLabel = new Map<string, PipelineFlowNode>();
  const byLabel = new Map<string, PipelineFlowNode>();
  for (const resource of resources) {
    if (!isNonEmptyString(resource.labelText)) {
      continue;
    }
    if (isNonEmptyString(resource.resourceKey)) {
      byKeyAndLabel.set(`${resource.resourceKey}\u0000${resource.labelText}`, resource);
    }
    if (!byLabel.has(resource.labelText)) {
      byLabel.set(resource.labelText, resource);
    }
  }
  return (node, label) => {
    const key = expectedResourceKey(node);
    return key !== null && key !== undefined && key !== ''
      ? byKeyAndLabel.get(`${key}\u0000${label}`)
      : byLabel.get(label);
  };
}

// Promote the first candidate that resolves to a real resource label — catches refs in non-`resource`
// fields. `resourceRefKind` is set BEFORE probing so `resolve` matches kind-aware, and it stays
// set on success so later resolutions (usage counting, layout edges) agree on the target.
function promoteRefCandidate(node: PipelineFlowNode, resolve: ResourceRefResolver): void {
  const resourceCandidates = node.resourceRefCandidates ?? [];
  for (const candidate of resourceCandidates) {
    node.resourceRefKind = candidate.kind;
    if (resolve(node, candidate.label)) {
      node.resourceRef = candidate.label;
      return;
    }
    node.resourceRefKind = undefined;
  }
}

// Flags each non-resource node whose ref dangles; returns how many references each resource has.
function linkResourceRefs(nodes: PipelineFlowNode[], resolve: ResourceRefResolver): Map<string, number> {
  const usedBy = new Map<string, number>();
  for (const node of nodes) {
    if (!isNonEmptyString(node.resourceRef) || node.section === 'resource') {
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

// Resource references: promote field candidates, flag dangling links, and count usages via the kind-aware resolver.
function annotateResourceRefs(nodes: PipelineFlowNode[]): void {
  const resolve = buildResourceRefResolver(nodes.filter((n) => n.section === 'resource'));
  for (const node of nodes) {
    if (!isNonEmptyString(node.resourceRef)) {
      promoteRefCandidate(node, resolve);
    }
  }
  const usedBy = linkResourceRefs(nodes, resolve);
  for (const node of nodes) {
    if (node.section === 'resource' && isNonEmptyString(node.labelText)) {
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
