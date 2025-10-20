import { Document, parseDocument, stringify as yamlStringify } from 'yaml';

import { getBuiltInComponents, schemaToConfig } from './schema';
import type { ConnectConfigObject } from '../types/schema';

const mergeProcessor = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  const processorsNode = doc.getIn(['pipeline', 'processors']) as { toJSON?: () => unknown } | undefined;
  const processors = (processorsNode?.toJSON?.() as unknown[]) || [];

  const configObj = newConfigObject as Record<string, { processors?: unknown[] }>;
  const processorsArray = configObj?.pipeline?.processors;
  const newProcessor = Array.isArray(processorsArray) ? processorsArray[0] : undefined;

  if (newProcessor) {
    if (Array.isArray(processors)) {
      doc.setIn(['pipeline', 'processors'], [...processors, newProcessor]);
    } else {
      doc.setIn(['pipeline', 'processors'], [newProcessor]);
    }
  }
};

const mergeCacheResource = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  const cacheResourcesNode = doc.getIn(['cache_resources']) as { toJSON?: () => unknown } | undefined;
  const cacheResources = (cacheResourcesNode?.toJSON?.() as unknown[]) || [];

  const cacheConfigObj = newConfigObject as Record<string, unknown[]>;
  // biome-ignore lint/style/useConst: newResource.label is mutated below
  let newResource = cacheConfigObj?.cache_resources?.[0] as Record<string, unknown> | undefined;

  if (newResource) {
    const existingLabels = Array.isArray(cacheResources)
      ? (cacheResources as Record<string, unknown>[]).map((r) => r?.label).filter(Boolean)
      : [];

    if (existingLabels.includes(newResource.label as string)) {
      let counter = 1;
      let uniqueLabel = `${newResource.label}_${counter}`;
      while (existingLabels.includes(uniqueLabel)) {
        counter++;
        uniqueLabel = `${newResource.label}_${counter}`;
      }
      newResource.label = uniqueLabel;
    }

    doc.setIn(['cache_resources'], [...(cacheResources as unknown[]), newResource]);
  }
};

const mergeRateLimitResource = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  const rateLimitResourcesNode = doc.getIn(['rate_limit_resources']) as { toJSON?: () => unknown } | undefined;
  const rateLimitResources = (rateLimitResourcesNode?.toJSON?.() as unknown[]) || [];

  const rateLimitConfigObj = newConfigObject as Record<string, unknown[]>;
  // biome-ignore lint/style/useConst: newResource.label is mutated below
  let newResource = rateLimitConfigObj?.rate_limit_resources?.[0] as Record<string, unknown> | undefined;

  if (newResource) {
    const existingLabels = Array.isArray(rateLimitResources)
      ? (rateLimitResources as Record<string, unknown>[]).map((r) => r?.label).filter(Boolean)
      : [];

    if (existingLabels.includes(newResource.label as string)) {
      let counter = 1;
      let uniqueLabel = `${newResource.label}_${counter}`;
      while (existingLabels.includes(uniqueLabel)) {
        counter++;
        uniqueLabel = `${newResource.label}_${counter}`;
      }
      newResource.label = uniqueLabel;
    }

    doc.setIn(['rate_limit_resources'], [...(rateLimitResources as unknown[]), newResource]);
  }
};

const mergeRootComponent = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  if (newConfigObject) {
    for (const [key, value] of Object.entries(newConfigObject)) {
      // Skip 'redpanda' key if it already exists (for redpanda_common components)
      // This prevents duplicate top-level redpanda blocks when using multiple redpanda_common components
      if (key === 'redpanda' && doc.has('redpanda')) {
        continue;
      }
      doc.set(key, value);
    }
  }
};

const mergeScanner = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): Document.Parsed => {
  const inputNode = doc.get('input') as { toJSON?: () => unknown } | undefined;
  if (!inputNode) {
    return doc;
  }

  const inputObj = (inputNode.toJSON?.() as Record<string, unknown>) || {};
  const inputType = Object.keys(inputObj)[0];
  if (!inputType) {
    return doc;
  }

  const scannerName = Object.keys(newConfigObject as Record<string, unknown>)[0];
  const scannerConfig = (newConfigObject as Record<string, unknown>)[scannerName];

  doc.setIn(['input', inputType, 'scanner'], scannerConfig);
  return doc;
};

type DetectedComponentType = 'processor' | 'cache' | 'rate_limit' | 'root' | 'scanner' | 'unknown';

const detectComponentType = (
  newConfigObject: Partial<ConnectConfigObject>,
  doc?: Document.Parsed
): DetectedComponentType => {
  if (newConfigObject.pipeline) {
    return 'processor';
  }

  if (newConfigObject.cache_resources) {
    return 'cache';
  }

  if (newConfigObject.rate_limit_resources) {
    return 'rate_limit';
  }

  if (
    newConfigObject.input ||
    newConfigObject.output ||
    newConfigObject.buffer ||
    newConfigObject.metrics ||
    newConfigObject.tracer
  ) {
    return 'root';
  }

  // Check if this might be a scanner
  const keys = Object.keys(newConfigObject);
  if (
    keys.length === 1 &&
    doc?.has('input') &&
    keys[0] &&
    keys[0] !== 'input' &&
    keys[0] !== 'output' &&
    keys[0] !== 'buffer' &&
    keys[0] !== 'metrics' &&
    keys[0] !== 'tracer'
  ) {
    return 'scanner';
  }

  return 'unknown';
};

const keyMatchRegex = /^([^:#\n]+):/;

const addRootSpacing = (yamlString: string): string => {
  const lines = yamlString.split('\n');
  const processedLines: string[] = [];
  let previousRootKey: string | null = null;
  for (const line of lines) {
    if (!line.trim()) {
      processedLines.push(line);
      continue;
    }
    // Check if this is a root-level key
    const currentIndent = line.length - line.trimStart().length;
    if (currentIndent === 0 && line.includes(':')) {
      const keyMatch = line.match(keyMatchRegex);
      if (keyMatch) {
        const cleanKey = keyMatch[1].trim();
        // Add spacing before root components (except first)
        if (
          previousRootKey !== null &&
          cleanKey !== previousRootKey &&
          processedLines.length > 0 &&
          processedLines.at(-1)?.trim() !== ''
        ) {
          processedLines.push('');
        }
        previousRootKey = cleanKey;
      }
    }
    processedLines.push(line);
  }
  return processedLines.join('\n');
};

export const mergeConnectConfigs = (
  existingYaml: string,
  newConfigObject: Partial<ConnectConfigObject>
): Document.Parsed | Partial<ConnectConfigObject> | undefined => {
  if (!existingYaml.trim()) {
    return newConfigObject;
  }

  let doc: Document.Parsed;
  try {
    doc = parseDocument(existingYaml);
  } catch (_error) {
    return newConfigObject;
  }

  const componentType = detectComponentType(newConfigObject, doc);

  switch (componentType) {
    case 'processor':
      mergeProcessor(doc, newConfigObject);
      break;
    case 'cache':
      mergeCacheResource(doc, newConfigObject);
      break;
    case 'rate_limit':
      mergeRateLimitResource(doc, newConfigObject);
      break;
    case 'root':
      mergeRootComponent(doc, newConfigObject);
      break;
    case 'scanner':
      mergeScanner(doc, newConfigObject);
      break;
    case 'unknown':
      mergeRootComponent(doc, newConfigObject);
      break;
    default:
      mergeRootComponent(doc, newConfigObject);
      break;
  }

  return doc;
};

const yamlConfig = {
  indent: 2,
  lineWidth: 120,
  minContentWidth: 20,
  doubleQuotedAsJSON: false,
};

type YAMLNode = { items?: unknown[]; comment?: string; commentBefore?: string };
type YAMLKey = { value?: string; comment?: string };
type YAMLPair = { key?: YAMLKey; value?: YAMLNode };

function addCommentsRecursive(node: YAMLNode, spec: import('../types/schema').RawFieldSpec): void {
  if (!node.items) {
    return;
  }

  if (!spec.children) {
    return;
  }

  for (const item of node.items) {
    const pair = item as YAMLPair;
    const key = pair?.key?.value;
    if (!key) {
      continue;
    }

    const fieldSpec = spec.children.find((child) => child.name === key);
    if (!fieldSpec) {
      continue;
    }

    // Determine if this is a parent object (has nested children) vs an array or leaf
    const isParentObject = pair.value?.items && fieldSpec.children;
    const isArray = pair.value?.items && !fieldSpec.children;

    if (fieldSpec.comment) {
      // For arrays, add comment to the key (inline with the field name)
      // For leaf values, add to the value (inline with the value)
      // For parent objects, skip (they get comments on their children)
      if (isArray && pair.key) {
        pair.key.comment = ` ${fieldSpec.comment}`;
      } else if (!isParentObject && pair.value) {
        pair.value.comment = ` ${fieldSpec.comment}`;
      }
    }

    if (isParentObject && pair.value) {
      addCommentsRecursive(pair.value, fieldSpec);
    }
  }
}

function addCommentsFromSpec(
  doc: Document.Parsed | Document,
  componentSpec: import('../types/schema').ConnectComponentSpec
): void {
  if (!componentSpec.config) {
    return;
  }

  const componentName = componentSpec.name;
  let configPath: string[] = [];

  switch (componentSpec.type) {
    case 'input':
    case 'output':
    case 'buffer':
    case 'metrics':
    case 'tracer':
      configPath = [componentSpec.type, componentName];
      break;
    case 'processor':
      configPath = ['pipeline', 'processors', '0', componentName];
      break;
    case 'cache':
    case 'rate_limit': {
      const resourceKey = componentSpec.type === 'cache' ? 'cache_resources' : 'rate_limit_resources';
      configPath = [resourceKey, '0', componentName];
      break;
    }
    case 'scanner':
      configPath = [componentName];
      break;
    default:
      return;
  }

  let currentNode: YAMLNode | undefined = doc.contents as YAMLNode;
  for (const segment of configPath) {
    if (!currentNode?.items) {
      break;
    }

    const foundPair: YAMLPair | undefined = (currentNode.items as YAMLPair[]).find(
      (item) => item?.key?.value === segment
    );
    if (foundPair?.value) {
      currentNode = foundPair.value;
    } else if (Number.isNaN(Number(segment))) {
      // Not a valid key or array index - stop navigation
      break;
    } else {
      // It's an array index
      currentNode = (currentNode.items as YAMLNode[])[Number(segment)];
    }
  }

  if (currentNode && componentSpec.config) {
    addCommentsRecursive(currentNode, componentSpec.config);
  }
}

export const configToYaml = (
  configObject: Document.Parsed | Partial<ConnectConfigObject> | undefined,
  componentSpec?: import('../types/schema').ConnectComponentSpec
): string => {
  try {
    if (!configObject) {
      return '';
    }

    let doc: Document.Parsed | Document;

    if (typeof (configObject as Document.Parsed).getIn === 'function') {
      // It's a merged document - regenerate to ensure consistent structure
      // This fixes navigation issues with nodes added via doc.set()
      const tempYaml = yamlStringify(configObject, yamlConfig);
      doc = parseDocument(tempYaml);
    } else {
      doc = new Document(configObject);
    }

    if (componentSpec) {
      addCommentsFromSpec(doc, componentSpec);
    }

    let yamlString = yamlStringify(doc, yamlConfig);
    yamlString = addRootSpacing(yamlString);
    return yamlString;
  } catch (_error) {
    return JSON.stringify(configObject, null, 2);
  }
};

export const getConnectTemplate = ({
  connectionName,
  connectionType,
  showOptionalFields,
  existingYaml,
}: {
  connectionName: string;
  connectionType: string;
  showOptionalFields?: boolean;
  existingYaml?: string;
}) => {
  // Phase 0: Find the component spec for the selected connectionName and connectionType
  const builtInComponents = getBuiltInComponents();
  const componentSpec =
    connectionName && connectionType
      ? builtInComponents.find((comp) => comp.type === connectionType && comp.name === connectionName)
      : undefined;

  if (!componentSpec) {
    return;
  }

  // Phase 1: Generate config object for new component
  const result = schemaToConfig(componentSpec, showOptionalFields);
  if (!result) {
    return;
  }

  const { config: newConfigObject, spec } = result;

  // Phase 2 & 3: Merge with existing (if any) and convert to YAML
  if (existingYaml) {
    const mergedConfig = mergeConnectConfigs(existingYaml, newConfigObject);
    return configToYaml(mergedConfig, spec);
  }

  return configToYaml(newConfigObject, spec);
};
