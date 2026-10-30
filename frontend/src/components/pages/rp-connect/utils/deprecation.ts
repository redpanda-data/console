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
import { type Document, isMap, isScalar, LineCounter, type Range, type Scalar } from 'yaml';

import { getConnectorDocsUrl } from './connector-docs';
import { type PipelineFlowNode, parseEditableNodes } from './pipeline-flow-parser';
import { editTargetPath, RESERVED_COMPONENT_KEYS, targetComponentType } from './yaml';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';

type ComponentRef = { name: string; type: ConnectComponentType };

export type DeprecationNotice = ComponentRef & {
  /** The component the schema recommends instead, when this dataplane serves it. */
  replacement?: ComponentRef;
  /** The replacement's docs, or the deprecated component's own when there is no replacement. */
  docsUrl?: string;
};

export function isDeprecatedComponent(component: Pick<ConnectComponentSpec, 'status'>): boolean {
  return component.status === ComponentStatus.DEPRECATED;
}

// Docs directory → component type, for `xref:components:<dir>/<name>.adoc` links.
const DOCS_DIR_TYPE: Record<string, ConnectComponentType> = {
  inputs: 'input',
  outputs: 'output',
  processors: 'processor',
  caches: 'cache',
  rate_limits: 'rate_limit',
  buffers: 'buffer',
  metrics: 'metrics',
  tracers: 'tracer',
  scanners: 'scanner',
};

// What upstream names as the replacement from 4.114 on; older schemas flag these deprecated but name none.
const KNOWN_REPLACEMENTS: Record<string, ComponentRef> = {
  'input:kafka': { name: 'redpanda', type: 'input' },
  'input:kafka_franz': { name: 'redpanda', type: 'input' },
  'input:redpanda_common': { name: 'redpanda', type: 'input' },
  'input:pg_stream': { name: 'postgres_cdc', type: 'input' },
  'output:kafka': { name: 'redpanda', type: 'output' },
  'output:kafka_franz': { name: 'redpanda', type: 'output' },
  'output:redpanda_common': { name: 'redpanda', type: 'output' },
  'processor:jira': { name: 'jira', type: 'input' },
};

const PARAGRAPH_BREAK = /\n\s*\n/;
const DEPRECATED_WORD = /deprecated/i;
const COMPONENT_XREF = /xref:components:([a-z_]+)\/([a-z0-9_]+)\.adoc/g;
const RENAMED_TO = /renamed to `([a-z0-9_]+)`/;

// The replacement named by the description's deprecation paragraph: a component xref
// ("Use the xref:components:inputs/redpanda.adoc[…] instead") or a rename ("renamed to `postgres_cdc`").
function namedReplacement(component: ConnectComponentSpec): ComponentRef | undefined {
  const paragraph = (component.description ?? '').split(PARAGRAPH_BREAK).find((p) => DEPRECATED_WORD.test(p));
  if (!paragraph) {
    return;
  }
  for (const [, dir, name] of paragraph.matchAll(COMPONENT_XREF)) {
    const type = DOCS_DIR_TYPE[dir];
    if (type) {
      return { name, type };
    }
  }
  const renamed = RENAMED_TO.exec(paragraph);
  return renamed ? { name: renamed[1], type: component.type } : undefined;
}

export function deprecationNotice(
  component: ConnectComponentSpec,
  catalog: readonly ConnectComponentSpec[]
): DeprecationNotice {
  const named = namedReplacement(component) ?? KNOWN_REPLACEMENTS[`${component.type}:${component.name}`];
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

/** Plain-text warning, for tooltips and editor markers. */
export function deprecationMessage({ name, replacement }: DeprecationNotice): string {
  return replacement
    ? `${name} is deprecated. Use the ${replacement.name} ${replacement.type.replace(/_/g, ' ')} instead.`
    : `${name} is deprecated and may be removed in a future release.`;
}

export type DeprecatedUsage = {
  /** Flow-node id of the component, for selecting it on the canvas. */
  nodeId: string;
  notice: DeprecationNotice;
  /** 1-based range of the component's name key in the YAML. */
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
};

// The component-name key of the map at an edit target: its first key that isn't `label`/`<<`.
function componentNameKey(node: unknown): Scalar<string> | undefined {
  if (!isMap(node)) {
    return;
  }
  const pair = node.items.find(
    ({ key }) => isScalar(key) && typeof key.value === 'string' && !RESERVED_COMPONENT_KEYS.has(key.value)
  );
  return pair?.key as Scalar<string> | undefined;
}

// The usage at one flow node, when its component is deprecated.
function usageAtNode(
  node: PipelineFlowNode,
  doc: Document,
  lineCounter: LineCounter,
  catalog: readonly ConnectComponentSpec[]
): DeprecatedUsage | undefined {
  const target = node.editTarget;
  if (!target || target.kind === 'switchCase') {
    return;
  }
  const key = componentNameKey(doc.getIn(editTargetPath(target), true));
  const type = targetComponentType(target);
  const component = key && catalog.find((c) => c.type === type && c.name === key.value && isDeprecatedComponent(c));
  if (!(component && key.range)) {
    return;
  }
  return {
    nodeId: node.id,
    notice: deprecationNotice(component, catalog),
    range: lineRange(key.range, lineCounter),
  };
}

function lineRange([startOffset, endOffset]: Range, lineCounter: LineCounter): DeprecatedUsage['range'] {
  const start = lineCounter.linePos(startOffset);
  const end = lineCounter.linePos(endOffset);
  return { startLineNumber: start.line, startColumn: start.col, endLineNumber: end.line, endColumn: end.col };
}

/** Every deprecated component the YAML uses, in document order. */
export function findDeprecatedUsages(yaml: string, components: readonly ConnectComponentSpec[]): DeprecatedUsage[] {
  // Most configs use none; skip the parse unless a deprecated name appears at all.
  if (!components.some((c) => isDeprecatedComponent(c) && yaml.includes(c.name))) {
    return [];
  }
  const lineCounter = new LineCounter();
  const { doc, nodes } = parseEditableNodes(yaml, lineCounter);
  return nodes.flatMap((node) => usageAtNode(node, doc, lineCounter, components) ?? []);
}
