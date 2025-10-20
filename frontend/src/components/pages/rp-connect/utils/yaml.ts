import { type Document, parseDocument, stringify as yamlStringify } from 'yaml';

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

export const configToYaml = (configObject: Document.Parsed | Partial<ConnectConfigObject> | undefined): string => {
  try {
    let yamlString: string;

    // Check if this is a YAML Document (from mergeConnectConfigs with existing YAML)
    // Type guard: Document.Parsed has getIn method
    if (configObject && typeof (configObject as Document.Parsed).getIn === 'function') {
      // It's a Document - convert to string (preserves comments!)
      yamlString = (configObject as Document.Parsed).toString();
      // Apply root spacing for readability (adds newlines between root-level keys)
      yamlString = addRootSpacing(yamlString);
    } else {
      // It's a plain object - stringify to YAML
      yamlString = yamlStringify(configObject, {
        indent: 2,
        lineWidth: 120,
        minContentWidth: 20,
        doubleQuotedAsJSON: false,
      });

      yamlString = addRootSpacing(yamlString);
    }

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
  const newConfigObject = schemaToConfig(componentSpec, showOptionalFields);
  if (!newConfigObject) {
    return;
  }

  // Phase 2 & 3: Merge with existing (if any) and convert to YAML
  if (existingYaml) {
    const mergedConfig = mergeConnectConfigs(existingYaml, newConfigObject);
    return configToYaml(mergedConfig);
  }

  return configToYaml(newConfigObject);
};
