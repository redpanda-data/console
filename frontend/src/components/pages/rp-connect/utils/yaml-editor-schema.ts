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

function schemaNodes(nodes: readonly (SchemaNode | boolean)[] | undefined): SchemaNode[] {
  return (nodes ?? []).filter((node): node is SchemaNode => Boolean(node) && typeof node === 'object');
}

function addComponentDescriptions(
  option: SchemaNode,
  type: string,
  componentIndex: ReadonlyMap<string, ConnectComponentSpec>
) {
  for (const [name, node] of Object.entries(option.properties ?? {})) {
    const component = componentIndex.get(`${type}:${name}`);
    if (!(component && node) || typeof node !== 'object') {
      continue;
    }
    addDescription(node, component.summary);
    addFieldDescriptions(unwrapField(node), component.config?.children ?? []);
  }
}

export function withYamlDocumentation<T extends SchemaNode>(schema: T, components: readonly ConnectComponentSpec[]): T {
  const documented = structuredClone(schema);
  const componentIndex = new Map(components.map((component) => [`${component.type}:${component.name}`, component]));

  for (const [type, definition] of Object.entries(documented.definitions ?? {})) {
    for (const option of schemaNodes(definition?.allOf).flatMap((branch) => schemaNodes(branch.anyOf))) {
      addComponentDescriptions(option, type, componentIndex);
    }
  }
  return documented;
}
