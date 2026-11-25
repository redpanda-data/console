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
import type { PipelineFlowNode } from './pipeline-flow-nodes';
import { extractLabel } from './processor-flow';
import type { ParsedYamlConfig } from './yaml';
import type { EditTarget } from './yaml-edit-target';
import { asRecord, firstKey } from './yaml-values';
import { isObject, isUnknownArray } from '../../../../utils/type-guards';

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
  if (key === 'cache_resources' || key === 'rate_limit_resources') {
    return { kind: 'resource', resourceKey: key, index };
  }
  const componentType = RESOURCE_KEY_COMPONENT_TYPE[key];
  return componentType ? { kind: 'path', path: [key, index], componentType } : undefined;
}

function parseArrayResource(value: unknown[], key: string, sectionId: string): PipelineFlowNode[] {
  const nodes: PipelineFlowNode[] = [];
  for (const [i, item] of value.entries()) {
    if (!isObject(item)) {
      continue;
    }
    const itemObj = item;
    const itemName = firstKey(itemObj);
    const labelText = extractLabel(itemObj);
    nodes.push({
      id: `resource-${key}-${i}`,
      kind: 'leaf',
      label: (itemName ?? '') || key,
      labelText,
      section: 'resource',
      parentId: sectionId,
      resourceKey: key,
      editTarget: resourceItemEditTarget(key, i),
      meta:
        itemName !== null && itemName !== undefined && itemName !== ''
          ? summarizeComponent(itemName, itemObj[itemName])
          : undefined,
    });
  }
  return nodes;
}

export function parseResourceNodes(config: ParsedYamlConfig, sectionId: string): PipelineFlowNode[] {
  const nodes: PipelineFlowNode[] = [];
  for (const key of RESOURCE_YAML_KEYS) {
    const value = config[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (isUnknownArray(value)) {
      nodes.push(...parseArrayResource(value, key, sectionId));
    } else {
      nodes.push(singletonResourceNode(key, value, sectionId));
    }
  }
  return nodes;
}

function singletonResourceNode(key: string, value: unknown, sectionId: string): PipelineFlowNode {
  const componentType = SINGLETON_RESOURCE_COMPONENT_TYPE[key];
  const valueObj = asRecord(value);
  const implName = componentType ? firstKey(valueObj) : undefined;
  return {
    id: `resource-${key}`,
    kind: 'leaf',
    label: key,
    section: 'resource',
    parentId: sectionId,
    editTarget: componentType ? { kind: 'path', path: [key], componentType } : undefined,
    meta:
      implName !== null && implName !== undefined && implName !== ''
        ? summarizeComponent(implName, valueObj?.[implName])
        : undefined,
  };
}
