import type { Document } from 'yaml';

import type { ConnectComponentSpec, ConnectConfigObject, ConnectFieldSpec } from '../types/schema';

export const mergeProcessor = (
  doc: Document.Parsed,
  newDoc: Document.Parsed | undefined,
  newConfigObject: ConnectConfigObject
): void => {
  const processorsNode = doc.getIn(['pipeline', 'processors']) as { toJSON?: () => unknown } | undefined;
  const processors = (processorsNode?.toJSON?.() as unknown[]) || [];

  const newProcessorNode = newDoc?.getIn(['pipeline', 'processors', 0]);
  const configObj = newConfigObject as Record<string, { processors?: unknown[] }>;
  const processorsArray = configObj?.pipeline?.processors;
  const newProcessor = newProcessorNode || (Array.isArray(processorsArray) ? processorsArray[0] : undefined);

  if (newProcessor) {
    if (Array.isArray(processors)) {
      doc.setIn(['pipeline', 'processors'], [...processors, newProcessor]);
    } else {
      doc.setIn(['pipeline', 'processors'], [newProcessor]);
    }
  }
};

export const mergeCacheResource = (
  doc: Document.Parsed,
  newDoc: Document.Parsed | undefined,
  newConfigObject: ConnectConfigObject
): void => {
  const cacheResourcesNode = doc.getIn(['cache_resources']) as { toJSON?: () => unknown } | undefined;
  const cacheResources = (cacheResourcesNode?.toJSON?.() as unknown[]) || [];

  const newResourceNode = newDoc?.getIn(['cache_resources', 0]) as
    | { toJSON?: () => unknown; set?: (key: string, value: unknown) => void }
    | undefined;
  const cacheConfigObj = newConfigObject as Record<string, unknown[]>;
  // biome-ignore lint/style/useConst: newResource.label is mutated below
  let newResource =
    (newResourceNode?.toJSON?.() as Record<string, unknown>) ||
    (cacheConfigObj?.cache_resources?.[0] as Record<string, unknown>);

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

      if (newResourceNode?.set) {
        newResourceNode.set('label', uniqueLabel);
      }
    }

    doc.setIn(['cache_resources'], [...(cacheResources as unknown[]), newResourceNode || newResource]);
  }
};

export const mergeRateLimitResource = (
  doc: Document.Parsed,
  newDoc: Document.Parsed | undefined,
  newConfigObject: ConnectConfigObject
): void => {
  const rateLimitResourcesNode = doc.getIn(['rate_limit_resources']) as { toJSON?: () => unknown } | undefined;
  const rateLimitResources = (rateLimitResourcesNode?.toJSON?.() as unknown[]) || [];

  const newResourceNode = newDoc?.getIn(['rate_limit_resources', 0]) as
    | { toJSON?: () => unknown; set?: (key: string, value: unknown) => void }
    | undefined;
  const rateLimitConfigObj = newConfigObject as Record<string, unknown[]>;
  // biome-ignore lint/style/useConst: newResource.label is mutated below
  let newResource =
    (newResourceNode?.toJSON?.() as Record<string, unknown>) ||
    (rateLimitConfigObj?.rate_limit_resources?.[0] as Record<string, unknown>);

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

      if (newResourceNode?.set) {
        newResourceNode.set('label', uniqueLabel);
      }
    }

    doc.setIn(['rate_limit_resources'], [...(rateLimitResources as unknown[]), newResourceNode || newResource]);
  }
};

export const mergeRootComponent = (
  doc: Document.Parsed,
  newDoc: Document.Parsed | undefined,
  newConfigObject: ConnectConfigObject
): void => {
  if (newConfigObject) {
    for (const [key, value] of Object.entries(newConfigObject)) {
      const newNode = newDoc?.get(key);
      doc.set(key, newNode || value);
    }
  }
};

export const mergeScanner = (
  doc: Document.Parsed,
  newDoc: Document.Parsed | undefined,
  newConfigObject: ConnectConfigObject
): Document.Parsed => {
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

  const newScannerNode = newDoc?.get(scannerName);

  doc.setIn(['input', inputType, 'scanner'], newScannerNode || scannerConfig);
  return doc;
};

const buildFieldMap = (fields: ConnectFieldSpec[] | undefined): Map<string, ConnectFieldSpec> => {
  const map = new Map<string, ConnectFieldSpec>();

  if (!fields) {
    return map;
  }

  const traverse = (fieldList: ConnectFieldSpec[]) => {
    for (const field of fieldList) {
      map.set(field.name, field);

      if (field.children && field.children.length > 0) {
        traverse(field.children);
      }
    }
  };

  traverse(fields);
  return map;
};

const keyValueRegex = /^(\s*)([^:#\n]+):\s*(.*)$/;

/**
 * Comments indicate:
 * - "# Required" for required fields without defaults
 * - "# Default: <value>" for fields with default values
 */
export const addSchemaComments = (yamlString: string, componentSpec: ConnectComponentSpec): string => {
  const fieldMap = buildFieldMap(componentSpec.config.children);

  if (fieldMap.size === 0) {
    return yamlString;
  }

  const lines = yamlString.split('\n');
  const processedLines: string[] = [];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#') || line.includes('#')) {
      processedLines.push(line);
      continue;
    }

    const keyValueMatch = keyValueRegex.exec(line);
    if (!keyValueMatch) {
      processedLines.push(line);
      continue;
    }

    const [, indent, key, value] = keyValueMatch;
    const cleanKey = key.trim();

    const fieldSpec = fieldMap.get(cleanKey);
    if (!fieldSpec) {
      processedLines.push(line);
      continue;
    }

    let comment = '';

    const trimmedValue = value.trim();
    const hasValue = trimmedValue.length > 0 && trimmedValue !== '{}' && trimmedValue !== '[]';

    if (hasValue) {
      if (fieldSpec.default !== undefined) {
        comment = ` # Default: ${JSON.stringify(fieldSpec.default)}`;
      } else if (!fieldSpec.is_optional) {
        comment = ' # Required';
      }
    }

    processedLines.push(`${indent}${cleanKey}: ${value}${comment}`);
  }

  return processedLines.join('\n');
};

const keyMatchRegex = /^([^:#\n]+):/;

export const addRootSpacing = (yamlString: string): string => {
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
