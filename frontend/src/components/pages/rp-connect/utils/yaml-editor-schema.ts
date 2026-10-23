import { asciidocToMarkdown } from './asciidoc';
import type { ConnectComponentSpec, RawFieldSpec } from '../types/schema';

type SchemaNode = {
  type?: string | string[];
  $ref?: string;
  description?: string;
  markdownDescription?: string;
  definitions?: Record<string, SchemaNode | undefined>;
  properties?: Record<string, SchemaNode | boolean | undefined>;
  patternProperties?: Record<string, SchemaNode | boolean | undefined>;
  items?: SchemaNode | boolean | (SchemaNode | boolean)[];
  allOf?: (SchemaNode | boolean)[];
  anyOf?: (SchemaNode | boolean)[];
};

function addDescription(node: SchemaNode, description: string) {
  if (!(node.description || node.markdownDescription) && description.trim()) {
    node.markdownDescription = asciidocToMarkdown(description);
  }
}

function unwrapField(node: SchemaNode): SchemaNode {
  let current = node;
  while (current.items && typeof current.items === 'object' && !Array.isArray(current.items)) {
    current = current.items;
  }
  const mapValues = current.patternProperties?.['.'];
  return mapValues && typeof mapValues === 'object' ? mapValues : current;
}

function addFieldDescriptions(node: SchemaNode, fields: readonly RawFieldSpec[]) {
  for (const field of fields) {
    const child = node.properties?.[field.name];
    if (!child || typeof child !== 'object') {
      continue;
    }
    addDescription(child, field.description || field.shortDescription || '');
    addFieldDescriptions(unwrapField(child), field.children ?? []);
  }
}

export function withYamlDocumentation<T extends SchemaNode>(schema: T, components: readonly ConnectComponentSpec[]): T {
  const documented = structuredClone(schema);
  const componentIndex = new Map(components.map((component) => [`${component.type}:${component.name}`, component]));

  for (const [type, definition] of Object.entries(documented.definitions ?? {})) {
    for (const branch of definition?.allOf ?? []) {
      if (!branch || typeof branch !== 'object') {
        continue;
      }
      for (const option of branch.anyOf ?? []) {
        if (!option || typeof option !== 'object') {
          continue;
        }
        for (const [name, node] of Object.entries(option.properties ?? {})) {
          const component = componentIndex.get(`${type}:${name}`);
          if (!(component && node) || typeof node !== 'object') {
            continue;
          }
          addDescription(node, component.summary);
          addFieldDescriptions(unwrapField(node), component.config?.children ?? []);
        }
      }
    }
  }
  return documented;
}
