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

function unwrapStructural(node: JsonSchemaNode) {
  let current = node;
  while (current.items) {
    current = current.items;
  }
  return current.patternProperties?.['.'] ?? current;
}

const stampFields: (fields: RawFieldSpec[] | undefined, parent: JsonSchemaNode) => RawFieldSpec[] | undefined = (
  fields,
  parent
) => {
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
};

function collectComponentNodes(definitions: Record<string, JsonSchemaNode>) {
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

const LINT_REQUIRED_FIELDS: Record<string, readonly string[]> = {
  'input:redpanda': ['topics', 'consumer_group'],
};

function applyLintRequiredFields(components: ConnectComponentSpec[]) {
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

function stampFromConfigSchema(components: ConnectComponentSpec[], configSchema: string | undefined) {
  if (!configSchema?.includes('"required"')) {
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
 *
 * Reads required arrays and per-field secret markers from the raw JSON schema, following object, array, and map wrappers. If required arrays are missing entirely, do not stamp fields as optional: older schemas omit that data.
 *
 * The curated conditional lint requirements still apply without that JSON. Missing secret metadata falls back to the field-name heuristic.
 */
export function enrichComponentsWithConfigSchema(components: ConnectComponentSpec[], configSchema: string | undefined) {
  return applyLintRequiredFields(stampFromConfigSchema(components, configSchema));
}
