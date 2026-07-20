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

import type { ConnectComponentSpec, RawFieldSpec } from '../types/schema';

/**
 * Enriches proto-derived component specs with per-field signals only present in the raw config
 * schema JSON served by GetPipelineServiceConfigSchema (benthos MarshalJSONSchema output):
 *
 * - `required` arrays: benthos computes required-ness knowing every default value, while the proto
 *   FieldSpec only serializes string defaults — so a field whose int/bool/collection/empty-string
 *   default was dropped is indistinguishable from a truly required field on the proto side.
 * - `is_secret`: the proto FieldSpec has no secret field at all.
 *
 * The JSON-Schema shape walked here (per benthos internal/docs/json_schema.go):
 *   definitions.<componentType>.allOf[].anyOf[].properties.<componentName> — an object node per
 *   component; object nodes carry `properties` + `required`; array/2darray fields wrap their
 *   element under `items` (twice for 2darray); map fields wrap under `patternProperties["."]`;
 *   component-typed fields are `$ref`s (no children on the proto side either).
 */

type JsonSchemaNode = {
  is_optional?: boolean;
  is_secret?: boolean;
  type?: string;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  patternProperties?: Record<string, JsonSchemaNode>;
  required?: string[];
  allOf?: JsonSchemaNode[];
  anyOf?: JsonSchemaNode[];
};

// Unwrap array/map wrappers so the node's `properties` line up with the proto field's `children`.
function unwrapStructural(node: JsonSchemaNode): JsonSchemaNode {
  let current = node;
  while (current.items) {
    current = current.items;
  }
  return current.patternProperties?.['.'] ?? current;
}

function stampFields(fields: RawFieldSpec[] | undefined, parent: JsonSchemaNode): RawFieldSpec[] | undefined {
  if (!fields?.length) {
    return fields;
  }
  const props = parent.properties ?? {};
  const required = new Set(parent.required ?? []);
  return fields.map((field) => {
    const node = field.name ? props[field.name] : undefined;
    if (!node) {
      return field;
    }
    return {
      ...field,
      secret: node.is_secret === true,
      requiredBySchema: required.has(field.name),
      children: stampFields(field.children, unwrapStructural(node)),
    };
  });
}

function collectComponentNodes(definitions: Record<string, JsonSchemaNode>): Map<string, JsonSchemaNode> {
  const nodes = new Map<string, JsonSchemaNode>();
  for (const [componentType, definition] of Object.entries(definitions)) {
    for (const branch of definition.allOf ?? []) {
      for (const option of branch.anyOf ?? []) {
        for (const [name, node] of Object.entries(option.properties ?? {})) {
          nodes.set(`${componentType}:${name}`, node);
        }
      }
    }
  }
  return nodes;
}

// Fields the engine's schema can't mark required because a runtime lint enforces a conditional
// rule instead — e.g. the redpanda input lints "either topics or regexp_topics_include must be
// specified" and "a consumer group is mandatory when not using explicit topic partitions", yet
// its schema flags both fields optional. The common case is unconditional in practice, so the
// console surfaces them as required rather than burying a pipeline's primary knobs under
// "Optional" while lint demands them. Keyed `type:name`, listing top-level field names.
const LINT_REQUIRED_FIELDS: Record<string, readonly string[]> = {
  'input:redpanda': ['topics', 'consumer_group'],
};

// Stamps `requiredBySchema: true` on the curated fields. Runs even when the raw schema is
// missing or too old to stamp from (the flags are console knowledge, not schema knowledge).
function applyLintRequiredFields(components: ConnectComponentSpec[]): ConnectComponentSpec[] {
  return components.map((component) => {
    const fieldNames = LINT_REQUIRED_FIELDS[`${component.type}:${component.name}`];
    if (!(fieldNames && component.config?.children)) {
      return component;
    }
    return {
      ...component,
      config: {
        ...component.config,
        children: component.config.children.map((field) =>
          fieldNames.includes(field.name) ? { ...field, requiredBySchema: true } : field
        ),
      } as ConnectComponentSpec['config'],
    };
  });
}

// Stamps from the raw schema; returns the input untouched when the schema is missing, unparsable,
// or predates per-field flag serialization (benthos < 4.59 emitted no `is_optional` — treat the
// whole document as unreliable rather than stamping `required: undefined` everywhere).
function stampFromConfigSchema(
  components: ConnectComponentSpec[],
  configSchema: string | undefined
): ConnectComponentSpec[] {
  if (!configSchema?.includes('"is_optional"')) {
    return components;
  }
  let definitions: Record<string, JsonSchemaNode> | undefined;
  try {
    definitions = (JSON.parse(configSchema) as { definitions?: Record<string, JsonSchemaNode> }).definitions;
  } catch {
    return components;
  }
  if (!definitions) {
    return components;
  }

  const nodes = collectComponentNodes(definitions);
  return components.map((component) => {
    const node = nodes.get(`${component.type}:${component.name}`);
    if (!(node && component.config)) {
      return component;
    }
    return {
      ...component,
      config: {
        ...component.config,
        children: stampFields(component.config.children, node),
      } as ConnectComponentSpec['config'],
    };
  });
}

/**
 * Returns specs with `secret` / `requiredBySchema` stamped onto every field the raw schema knows,
 * then overlays the curated lint-required flags (which win — they exist precisely because the
 * schema calls those fields optional).
 */
export function enrichComponentsWithConfigSchema(
  components: ConnectComponentSpec[],
  configSchema: string | undefined
): ConnectComponentSpec[] {
  return applyLintRequiredFields(stampFromConfigSchema(components, configSchema));
}
