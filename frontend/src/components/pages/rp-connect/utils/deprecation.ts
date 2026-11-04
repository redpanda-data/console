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

import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Range, type Scalar } from 'yaml';

import { getConnectorDocsUrl } from './connector-docs';
import {
  CONNECT_COMPONENT_TYPE,
  type ConnectComponentSpec,
  type ConnectComponentType,
  type RawFieldSpec,
} from '../types/schema';

type ComponentRef = { name: string; type: ConnectComponentType };

export type DeprecationNotice = ComponentRef & {
  /** The component to use instead, when this dataplane serves it. */
  replacement?: ComponentRef;
  /** The replacement's docs, or the deprecated component's own when there is no replacement. */
  docsUrl?: string;
};

export function isDeprecatedComponent(component: Pick<ConnectComponentSpec, 'status'>): boolean {
  return component.status === ComponentStatus.DEPRECATED;
}

// What to use instead, per upstream's deprecation notes: ComponentSpec has no field for it.
const REPLACEMENTS: Record<string, ComponentRef> = {
  'input:kafka': { name: 'redpanda', type: 'input' },
  'input:kafka_franz': { name: 'redpanda', type: 'input' },
  'input:redpanda_common': { name: 'redpanda', type: 'input' },
  'input:pg_stream': { name: 'postgres_cdc', type: 'input' },
  'output:kafka': { name: 'redpanda', type: 'output' },
  'output:kafka_franz': { name: 'redpanda', type: 'output' },
  'output:redpanda_common': { name: 'redpanda', type: 'output' },
  'processor:jira': { name: 'jira', type: 'input' },
};

export function deprecationNotice(
  component: ConnectComponentSpec,
  catalog: readonly ConnectComponentSpec[]
): DeprecationNotice {
  const named = REPLACEMENTS[`${component.type}:${component.name}`];
  const replacement =
    named && catalog.some((c) => c.type === named.type && c.name === named.name && !isDeprecatedComponent(c))
      ? named
      : undefined;
  const docsTarget = replacement ?? component;
  return {
    name: component.name,
    type: component.type,
    replacement,
    docsUrl: getConnectorDocsUrl(docsTarget.type, docsTarget.name),
  };
}

/** The warning every surface shows. */
export function deprecationMessage({ name, replacement }: DeprecationNotice): string {
  return replacement
    ? `${name} is deprecated. Use the ${replacement.name} ${replacement.type.replace(/_/g, ' ')} instead.`
    : `${name} is deprecated and may be removed in a future release.`;
}

export type DeprecatedUsage = {
  notice: DeprecationNotice;
  /** 1-based range of the component's name key in the YAML. */
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
};

type FieldShape = Pick<RawFieldSpec, 'name' | 'type' | 'kind'> & { children?: readonly FieldShape[] };

const COMPONENT_TYPES: ReadonlySet<string> = new Set(CONNECT_COMPONENT_TYPE);
const PROCESSORS: FieldShape = { name: 'processors', type: 'processor', kind: 'array' };

// Where components sit at the top level of a config.
const CONFIG_ROOT: FieldShape = {
  name: '',
  type: 'object',
  kind: 'scalar',
  children: [
    { name: 'input', type: 'input', kind: 'scalar' },
    { name: 'buffer', type: 'buffer', kind: 'scalar' },
    { name: 'pipeline', type: 'object', kind: 'scalar', children: [PROCESSORS] },
    { name: 'output', type: 'output', kind: 'scalar' },
    { name: 'input_resources', type: 'input', kind: 'array' },
    { name: 'processor_resources', type: 'processor', kind: 'array' },
    { name: 'output_resources', type: 'output', kind: 'array' },
    { name: 'cache_resources', type: 'cache', kind: 'array' },
    { name: 'rate_limit_resources', type: 'rate_limit', kind: 'array' },
    { name: 'metrics', type: 'metrics', kind: 'scalar' },
    { name: 'tracer', type: 'tracer', kind: 'scalar' },
  ],
};

type Walk = { catalog: readonly ConnectComponentSpec[]; lineCounter: LineCounter; usages: DeprecatedUsage[] };

// The values a field holds, by its kind.
function fieldValues(node: unknown, kind: string): unknown[] {
  switch (kind) {
    case 'array':
      return isSeq(node) ? node.items : [];
    case '2darray':
      return isSeq(node) ? node.items.flatMap((row) => (isSeq(row) ? row.items : [])) : [];
    case 'map':
      return isMap(node) ? node.items.map((pair) => pair.value) : [];
    default:
      return [node];
  }
}

// Follows the schema's component-typed fields, so nested components are found wherever they sit.
function walkField(walk: Walk, node: unknown, field: FieldShape): void {
  for (const value of fieldValues(node, field.kind)) {
    if (COMPONENT_TYPES.has(field.type)) {
      walkComponent(walk, value, field.type as ConnectComponentType);
    } else if (isMap(value)) {
      for (const child of field.children ?? []) {
        walkField(walk, value.get(child.name, true), child);
      }
    }
  }
}

// A component slot: `{ <name>: config }` plus `label`, and `processors` on inputs and outputs.
function walkComponent(walk: Walk, node: unknown, type: ConnectComponentType): void {
  if (!isMap(node)) {
    return;
  }
  for (const { key, value } of node.items) {
    if (isScalar(key) && typeof key.value === 'string') {
      walkSlotKey(walk, key as Scalar<string>, value, type);
    }
  }
}

function walkSlotKey(walk: Walk, key: Scalar<string>, value: unknown, type: ConnectComponentType): void {
  if (key.value === 'processors' && (type === 'input' || type === 'output')) {
    walkField(walk, value, PROCESSORS);
    return;
  }
  const spec = walk.catalog.find((c) => c.type === type && c.name === key.value);
  if (spec && isDeprecatedComponent(spec) && key.range) {
    walk.usages.push({ notice: deprecationNotice(spec, walk.catalog), range: lineRange(key.range, walk.lineCounter) });
  }
  if (spec?.config) {
    walkField(walk, value, spec.config);
  }
}

function lineRange([startOffset, endOffset]: Range, lineCounter: LineCounter): DeprecatedUsage['range'] {
  const start = lineCounter.linePos(startOffset);
  const end = lineCounter.linePos(endOffset);
  return { startLineNumber: start.line, startColumn: start.col, endLineNumber: end.line, endColumn: end.col };
}

/** Every deprecated component the YAML uses, nested ones included, in document order. */
export function findDeprecatedUsages(yaml: string, components: readonly ConnectComponentSpec[]): DeprecatedUsage[] {
  // Most configs use none; skip the parse unless a deprecated name appears at all.
  if (!components.some((c) => isDeprecatedComponent(c) && yaml.includes(c.name))) {
    return [];
  }
  const lineCounter = new LineCounter();
  const walk: Walk = { catalog: components, lineCounter, usages: [] };
  walkField(walk, parseDocument(yaml, { lineCounter }).contents, CONFIG_ROOT);
  return walk.usages;
}
