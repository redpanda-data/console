import { parseDocument, stringify as yamlStringify } from 'yaml';

import { getCategoryDisplayName, inferComponentCategory } from './categories';
import benthosSchema from '../../../../assets/rp-connect-schema.json';
import { CONNECT_WIZARD_TOPIC_KEY, CONNECT_WIZARD_USER_KEY } from '../../../../state/connect/state';
import { generateDefaultFromJsonSchema } from '../../../../utils/json-schema';
import {
  CONNECT_COMPONENT_TYPE,
  type ConnectComponentSpec,
  type ConnectComponentType,
  type ConnectFieldSpec,
  type ConnectNodeCategory,
  type ExtendedConnectComponentSpec,
} from '../types/schema';
import type { AddTopicFormData, AddUserFormData } from '../types/wizard';

/**
 * Extracts lightweight metadata from JSON Schema component variants
 * No complex transformation - just metadata for display + raw schema reference
 */
const extractComponentMetadata = (componentType: string, definition: any): ConnectComponentSpec[] => {
  const components: ConnectComponentSpec[] = [];

  if (!definition.allOf || !Array.isArray(definition.allOf)) {
    return components;
  }

  // The first element of allOf contains anyOf with component variants
  const variantsSection = definition.allOf[0];
  if (!variantsSection.anyOf || !Array.isArray(variantsSection.anyOf)) {
    return components;
  }

  // Extract metadata from each variant
  for (const variant of variantsSection.anyOf) {
    if (!variant.properties) continue;

    // Each variant has a single property key which is the component name
    const componentNames = Object.keys(variant.properties);
    for (const componentName of componentNames) {
      const componentSchema = variant.properties[componentName];

      // Simple metadata extraction - no transformation
      const componentSpec: ConnectComponentSpec = {
        name: componentName,
        type: componentType as ConnectComponentType,
        status: 'stable',
        plugin: false,
        summary: `${componentName} ${componentType}`,
        description: componentSchema.description || `${componentName} ${componentType} component`,
        categories: inferComponentCategory(componentName),
        // Minimal config with raw JSON Schema reference
        config: {
          name: componentName,
          type: 'object',
          kind: 'scalar',
          // Store raw JSON Schema for on-demand YAML generation
          _jsonSchema: componentSchema,
        } as ConnectFieldSpec,
        version: '1.0.0',
      };

      components.push(componentSpec);
    }
  }

  return components;
};

/**
 * Phase 0: Parses benthos schema and returns all components with metadata
 */
const parseSchema = () => {
  const schemaData = benthosSchema as any;
  const allComponents: ConnectComponentSpec[] = [];

  // Check if schema has the new JSON Schema format with definitions
  if (!schemaData.definitions) {
    console.error('Schema does not have definitions structure. Expected JSON Schema format.');
    return allComponents;
  }

  // Parse each component type from definitions
  for (const componentType of CONNECT_COMPONENT_TYPE) {
    const definition = schemaData.definitions[componentType];
    if (!definition) continue;

    // Extract lightweight metadata from the JSON Schema definition
    const components = extractComponentMetadata(componentType, definition);

    if (components.length > 0) {
      allComponents.push(...components);
    }
  }

  return allComponents;
};

// Cache the parsed schema data (built-in components only)
// Exported for use by categories.ts and getAllComponents()
export const builtInComponents = parseSchema();

/**
 * Phase 1: Converts a component specification to a config object structure with default values
 * following the Redpanda Connect YAML schema structure
 */
export const schemaToConfig = (componentSpec?: ConnectComponentSpec, showOptionalFields?: boolean) => {
  if (!componentSpec?.config) {
    return undefined;
  }

  // Generate the configuration object from the component's FieldSpec
  const connectionConfig = generateDefaultValue(componentSpec.config, showOptionalFields);

  const config: any = {};

  // Structure the config according to Redpanda Connect schema
  switch (componentSpec.type) {
    case 'input':
      config.input = {
        [componentSpec.name]: connectionConfig,
      };
      break;

    case 'output':
      config.output = {
        [componentSpec.name]: connectionConfig,
      };
      break;

    case 'processor':
      config.pipeline = {
        processors: [
          {
            [componentSpec.name]: connectionConfig,
          },
        ],
      };
      break;

    case 'buffer':
      config.buffer = {
        [componentSpec.name]: connectionConfig,
      };
      break;

    case 'metrics':
      config.metrics = {
        [componentSpec.name]: connectionConfig,
      };
      break;

    case 'tracer':
      config.tracer = {
        [componentSpec.name]: connectionConfig,
      };
      break;

    case 'cache':
      config.cache_resources = [
        {
          label: componentSpec.name,
          [componentSpec.name]: connectionConfig,
        },
      ];
      break;

    case 'rate_limit':
      config.rate_limit_resources = [
        {
          label: componentSpec.name,
          [componentSpec.name]: connectionConfig,
        },
      ];
      break;

    case 'scanner':
      // Scanners are embedded in inputs, return config directly
      return { [componentSpec.name]: connectionConfig };

    default:
      config[componentSpec.name] = connectionConfig;
      break;
  }

  return config;
};

/**
 * Phase 2: Merges a new component config object into existing YAML configuration
 * using Document API to PRESERVE COMMENTS
 *
 * IMPORTANT:
 * - Converts YAML nodes to JavaScript before array operations to fix spreading issues
 * - Converts new config to YAML with comments first, then merges to preserve those comments
 */
export const mergeConnectConfigs = (
  existingYaml: string,
  newConfigObject: ReturnType<typeof schemaToConfig>,
  componentSpec: ConnectComponentSpec
) => {
  // If no existing YAML, return new config object
  if (!existingYaml.trim()) {
    return newConfigObject;
  }

  // Parse existing YAML as Document (preserves comments!)
  let doc: any;
  try {
    doc = parseDocument(existingYaml);
  } catch (error) {
    console.warn('Failed to parse existing YAML, starting with empty config:', error);
    return newConfigObject;
  }

  // Convert new component to YAML with comments first
  // This ensures the newly added component has schema comments
  let newYamlWithComments: string;
  try {
    newYamlWithComments = yamlStringify(newConfigObject, {
      indent: 2,
      lineWidth: 120,
      minContentWidth: 20,
      doubleQuotedAsJSON: false,
    });
    // Add schema comments
    newYamlWithComments = addSchemaComments(newYamlWithComments, componentSpec);
  } catch (error) {
    console.warn('Failed to generate YAML with comments, using plain object:', error);
    // Fallback to plain object if YAML generation fails
    newYamlWithComments = '';
  }

  // Parse the new YAML as a Document to extract commented nodes
  let newDoc: any;
  if (newYamlWithComments) {
    try {
      newDoc = parseDocument(newYamlWithComments);
    } catch (error) {
      console.warn('Failed to parse new YAML with comments:', error);
    }
  }

  // Apply merging rules based on component type using Document API
  switch (componentSpec.type) {
    case 'processor': {
      // Processors: append to pipeline.processors[] array
      // IMPORTANT: Convert YAML node to JS with .toJSON() before spreading
      const processorsNode = doc.getIn(['pipeline', 'processors']);
      const processors = processorsNode?.toJSON?.() || [];

      // Get the new processor from the commented Document (or fallback to plain object)
      const newProcessorNode = newDoc?.getIn(['pipeline', 'processors', 0]);
      const newProcessor = newProcessorNode || newConfigObject.pipeline?.processors?.[0];

      if (newProcessor) {
        if (!Array.isArray(processors)) {
          doc.setIn(['pipeline', 'processors'], [newProcessor]);
        } else {
          // Spread existing processors and append new one
          doc.setIn(['pipeline', 'processors'], [...processors, newProcessor]);
        }
      }
      break;
    }

    case 'cache': {
      // Cache: append to cache_resources[] array
      const cacheResourcesNode = doc.getIn(['cache_resources']);
      const cacheResources = cacheResourcesNode?.toJSON?.() || [];

      // Get the new resource from the commented Document (or fallback to plain object)
      const newResourceNode = newDoc?.getIn(['cache_resources', 0]);
      let newResource = newResourceNode || newConfigObject.cache_resources?.[0];

      if (newResource) {
        // If we got a node, convert to JS for label manipulation
        if (newResourceNode) {
          newResource = newResourceNode.toJSON();
        }

        // Check for label conflicts
        const existingLabels = Array.isArray(cacheResources)
          ? cacheResources.map((r: any) => r?.label).filter(Boolean)
          : [];

        if (existingLabels.includes(newResource.label)) {
          let counter = 1;
          let uniqueLabel = `${newResource.label}_${counter}`;
          while (existingLabels.includes(uniqueLabel)) {
            counter++;
            uniqueLabel = `${newResource.label}_${counter}`;
          }
          newResource.label = uniqueLabel;

          // Update the node with the new label if we're using the commented node
          if (newResourceNode) {
            newResourceNode.set('label', uniqueLabel);
          }
        }

        doc.setIn(['cache_resources'], [...cacheResources, newResourceNode || newResource]);
      }
      break;
    }

    case 'rate_limit': {
      // Rate limit: append to rate_limit_resources[] array
      const rateLimitResourcesNode = doc.getIn(['rate_limit_resources']);
      const rateLimitResources = rateLimitResourcesNode?.toJSON?.() || [];

      // Get the new resource from the commented Document (or fallback to plain object)
      const newResourceNode = newDoc?.getIn(['rate_limit_resources', 0]);
      let newResource = newResourceNode || newConfigObject.rate_limit_resources?.[0];

      if (newResource) {
        // If we got a node, convert to JS for label manipulation
        if (newResourceNode) {
          newResource = newResourceNode.toJSON();
        }

        // Check for label conflicts
        const existingLabels = Array.isArray(rateLimitResources)
          ? rateLimitResources.map((r: any) => r?.label).filter(Boolean)
          : [];

        if (existingLabels.includes(newResource.label)) {
          let counter = 1;
          let uniqueLabel = `${newResource.label}_${counter}`;
          while (existingLabels.includes(uniqueLabel)) {
            counter++;
            uniqueLabel = `${newResource.label}_${counter}`;
          }
          newResource.label = uniqueLabel;

          // Update the node with the new label if we're using the commented node
          if (newResourceNode) {
            newResourceNode.set('label', uniqueLabel);
          }
        }

        doc.setIn(['rate_limit_resources'], [...rateLimitResources, newResourceNode || newResource]);
      }
      break;
    }

    case 'input':
    case 'output':
    case 'buffer':
    case 'metrics':
    case 'tracer': {
      // Root level components: replace existing
      // Use commented nodes from newDoc if available
      for (const [key] of Object.entries(newConfigObject)) {
        const newNode = newDoc?.get(key);
        doc.set(key, newNode || newConfigObject[key]);
      }
      break;
    }

    case 'scanner':
      // Scanners are embedded, return as-is for manual handling
      return newConfigObject;

    default:
      // Unknown component type: merge at root level
      // Use commented nodes from newDoc if available
      for (const [key] of Object.entries(newConfigObject)) {
        const newNode = newDoc?.get(key);
        doc.set(key, newNode || newConfigObject[key]);
      }
      break;
  }

  // Return the modified Document (will be converted to YAML string in configToYaml)
  return doc;
};

/**
 * Phase 3: Converts config object to formatted YAML string
 */
export const configToYaml = (configObject: any, componentSpec: ConnectComponentSpec): string => {
  try {
    let yamlString: string;

    // Check if this is a YAML Document (from mergeConnectConfigs with existing YAML)
    if (configObject && typeof configObject.toString === 'function' && typeof configObject.getIn === 'function') {
      // It's a Document - convert to string (preserves comments!)
      yamlString = configObject.toString();
    } else {
      // It's a plain object - stringify to YAML
      yamlString = yamlStringify(configObject, {
        indent: 2,
        lineWidth: 120,
        minContentWidth: 20,
        doubleQuotedAsJSON: false,
      });

      // Add schema comments
      yamlString = addSchemaComments(yamlString, componentSpec);

      // Add spacing between root-level components for readability
      yamlString = addRootSpacing(yamlString);
    }

    return yamlString;
  } catch (error) {
    console.error('Error converting config to YAML:', error);
    return JSON.stringify(configObject, null, 2);
  }
};

// ===============================
// Helper functions
// ===============================

/**
 * Reads persisted wizard data from session storage
 */
const getPersistedWizardData = () => {
  let topicData: AddTopicFormData | null = null;
  let userData: AddUserFormData | null = null;

  try {
    const topicJson = sessionStorage.getItem(CONNECT_WIZARD_TOPIC_KEY);
    if (topicJson) {
      topicData = JSON.parse(topicJson);
    }
  } catch (error) {
    console.warn('Failed to parse topic data from session storage:', error);
  }

  try {
    const userJson = sessionStorage.getItem(CONNECT_WIZARD_USER_KEY);
    if (userJson) {
      userData = JSON.parse(userJson);
    }
  } catch (error) {
    console.warn('Failed to parse user data from session storage:', error);
  }

  return { topicData, userData };
};

/**
 * Checks if a field name is topic-related
 */
const isTopicField = (fieldName: string): boolean => {
  const normalizedName = fieldName.toLowerCase();
  return (
    normalizedName === 'topic' ||
    normalizedName === 'topics' ||
    normalizedName === 'target_topic' ||
    normalizedName === 'target_topics' ||
    normalizedName === 'source_topic' ||
    normalizedName === 'source_topics' ||
    normalizedName.endsWith('_topic') ||
    normalizedName.endsWith('_topics')
  );
};

/**
 * Checks if a field name is user/authentication-related
 */
const isUserField = (fieldName: string): boolean => {
  const normalizedName = fieldName.toLowerCase();
  return (
    normalizedName === 'user' ||
    normalizedName === 'username' ||
    normalizedName === 'sasl_user' ||
    normalizedName.endsWith('.user') ||
    normalizedName.endsWith('.username')
  );
};

/**
 * Checks if a field name is password-related
 */
const isPasswordField = (fieldName: string): boolean => {
  const normalizedName = fieldName.toLowerCase();
  return normalizedName === 'password' || normalizedName === 'sasl_password' || normalizedName.endsWith('.password');
};

/**
 * Checks if a schema has any nested fields matching topic/user/password patterns
 */
const hasRelevantNestedFields = (schema: any, topicData: any, userData: any): boolean => {
  // Check object properties
  if (schema?.type === 'object' && schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties) as [string, any][]) {
      if (isTopicField(propName) && topicData?.topicName) return true;
      if (isUserField(propName) && userData?.username) return true;
      if (isPasswordField(propName) && userData?.password) return true;

      if (propSchema.type === 'object' && hasRelevantNestedFields(propSchema, topicData, userData)) {
        return true;
      }

      // Check array items
      if (propSchema.type === 'array' && propSchema.items) {
        if (hasRelevantNestedFields(propSchema.items, topicData, userData)) {
          return true;
        }
      }
    }
  }

  return false;
};

/**
 * Recursively populates persisted topic/user data in the generated defaults object
 * Also creates optional nested objects when they contain relevant fields
 */
const populatePersistedData = (defaults: any, jsonSchema: any, rootFieldName?: string): any => {
  const { topicData, userData } = getPersistedWizardData();

  if (jsonSchema.type === 'object' && jsonSchema.properties) {
    const hasRelevant = hasRelevantNestedFields(jsonSchema, topicData, userData);

    if (!defaults || typeof defaults !== 'object') {
      if (hasRelevant) {
        defaults = {};
      } else {
        return defaults;
      }
    }

    const result = { ...defaults };
    const requiredFields = jsonSchema.required || [];

    for (const [propName, propSchema] of Object.entries(jsonSchema.properties) as [string, any][]) {
      const isRequired = requiredFields.includes(propName);
      const existsInResult = propName in result;

      const hasTopic = isTopicField(propName) && topicData?.topicName;
      const hasUser = isUserField(propName) && userData?.username;
      const hasPassword = isPasswordField(propName) && userData?.password;
      const hasNestedRelevant =
        (propSchema.type === 'object' && hasRelevantNestedFields(propSchema, topicData, userData)) ||
        (propSchema.type === 'array' &&
          propSchema.items &&
          hasRelevantNestedFields(propSchema.items, topicData, userData));

      if (existsInResult || isRequired || hasTopic || hasUser || hasPassword || hasNestedRelevant) {
        if (isTopicField(propName) && topicData?.topicName) {
          if (propSchema.type === 'array') {
            result[propName] = [topicData.topicName];
          } else if (propSchema.type === 'string') {
            result[propName] = topicData.topicName;
          }
        } else if (isUserField(propName) && userData?.username) {
          result[propName] = '$' + '{secrets.REDPANDA_USERNAME}';
        } else if (isPasswordField(propName) && userData?.password) {
          result[propName] = '$' + '{secrets.REDPANDA_PASSWORD}';
        } else if (propSchema.type === 'object') {
          const nestedDefaults = existsInResult ? result[propName] : {};
          const populated = populatePersistedData(nestedDefaults, propSchema, propName);
          if (Object.keys(populated).length > 0) {
            result[propName] = populated;
          }
        } else if (propSchema.type === 'array' && propSchema.items) {
          // Handle arrays that contain objects with relevant fields (e.g., sasl array)
          if (hasRelevantNestedFields(propSchema.items, topicData, userData)) {
            const itemDefaults = {};
            const populated = populatePersistedData(itemDefaults, propSchema.items, propName);
            if (Object.keys(populated).length > 0) {
              result[propName] = [populated];
            }
          }
        }
      }
    }

    return result;
  }

  if (Array.isArray(defaults)) {
    return defaults.map((item) => {
      if (typeof item === 'object' && jsonSchema.items) {
        return populatePersistedData(item, jsonSchema.items, rootFieldName);
      }
      return item;
    });
  }

  return defaults;
};

export const getAllCategories = (additionalComponents?: ExtendedConnectComponentSpec[]): ConnectNodeCategory[] => {
  const categorySet = new Set<string>();

  // Collect categories from built-in components
  for (const component of builtInComponents) {
    if (component.categories) {
      for (const categoryId of component.categories) {
        categorySet.add(categoryId);
      }
    }
  }

  // Collect categories from external components
  if (additionalComponents) {
    for (const component of additionalComponents) {
      if (component.categories) {
        for (const categoryId of component.categories) {
          categorySet.add(categoryId);
        }
      }
    }
  }

  // Convert to ConnectNodeCategory array with display names
  return Array.from(categorySet).map((categoryId) => ({
    id: categoryId,
    name: getCategoryDisplayName(categoryId),
  }));
};

/**
 * Adds helpful schema comments to NEW YAML configs
 */
const addSchemaComments = (yamlString: string, componentSpec: ConnectComponentSpec): string => {
  // Get the JSON Schema for this component
  const jsonSchema = componentSpec.config._jsonSchema;
  if (!jsonSchema || !jsonSchema.properties) {
    return yamlString;
  }

  const lines = yamlString.split('\n');
  const processedLines: string[] = [];

  lines.forEach((line) => {
    // Skip empty lines and existing comments
    if (!line.trim() || line.trim().startsWith('#') || line.includes('#')) {
      processedLines.push(line);
      return;
    }

    // Match YAML key-value pairs
    const keyValueMatch = line.match(/^(\s*)([^:#\n]+):\s*(.*)$/);
    if (!keyValueMatch) {
      processedLines.push(line);
      return;
    }

    const [, indent, key, value] = keyValueMatch;
    const cleanKey = key.trim();

    // Look up field in JSON Schema properties
    const fieldSchema = jsonSchema.properties[cleanKey];
    if (!fieldSchema) {
      processedLines.push(line);
      return;
    }

    // Generate comment based on JSON Schema
    let comment = '';
    const requiredFields = jsonSchema.required || [];
    const isRequired = requiredFields.includes(cleanKey);

    // Only add comments to lines with actual values (not structural keys)
    // Skip if value is empty (array/object on next line) to prevent comment displacement
    const hasValue = value.trim().length > 0 && value.trim() !== '{}' && value.trim() !== '[]';

    if (hasValue) {
      if (isRequired) {
        comment = ' # Required';
      } else if (fieldSchema.default !== undefined) {
        comment = ` # Default: ${JSON.stringify(fieldSchema.default)}`;
      } else {
        comment = ' # Optional';
      }
    }

    processedLines.push(`${indent}${cleanKey}: ${value}${comment}`);
  });

  return processedLines.join('\n');
};

const addRootSpacing = (yamlString: string): string => {
  const lines = yamlString.split('\n');
  const processedLines: string[] = [];
  let previousRootKey: string | null = null;

  lines.forEach((line) => {
    if (!line.trim()) {
      processedLines.push(line);
      return;
    }

    // Check if this is a root-level key
    const currentIndent = line.length - line.trimStart().length;
    if (currentIndent === 0 && line.includes(':')) {
      const keyMatch = line.match(/^([^:#\n]+):/);
      if (keyMatch) {
        const cleanKey = keyMatch[1].trim();

        // Add spacing before root components (except first)
        if (previousRootKey !== null && cleanKey !== previousRootKey) {
          if (processedLines.length > 0 && processedLines[processedLines.length - 1].trim() !== '') {
            processedLines.push('');
          }
        }
        previousRootKey = cleanKey;
      }
    }

    processedLines.push(line);
  });

  return processedLines.join('\n');
};

/**
 * Recursively removes null values from arrays and objects
 */
const cleanupNullValues = (obj: any): any => {
  if (Array.isArray(obj)) {
    // Remove null/undefined values from arrays
    const filtered = obj.filter((item) => item !== null && item !== undefined);
    // Recursively clean nested items
    return filtered.map((item) => cleanupNullValues(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = cleanupNullValues(value);
      // Keep non-null values, or empty arrays/objects
      if (cleanedValue !== null && cleanedValue !== undefined) {
        cleaned[key] = cleanedValue;
      }
    }
    return cleaned;
  }

  return obj;
};

/**
 * Generates default values from ConnectFieldSpec
 * Uses shared JSON Schema utility when _jsonSchema is available
 * Populates topic/user fields from session storage when applicable
 */
export function generateDefaultValue(spec: ConnectFieldSpec, showOptionalFields?: boolean): unknown {
  if (spec._jsonSchema) {
    if (showOptionalFields) {
      const allFields = generateAllFieldsFromJsonSchema(spec._jsonSchema, spec.name);
      return cleanupNullValues(allFields);
    }
    const defaults = generateDefaultFromJsonSchema(spec._jsonSchema);
    const populated = populatePersistedData(defaults, spec._jsonSchema, spec.name);
    return cleanupNullValues(populated);
  }

  // Fallback to legacy behavior for backward compatibility (external components without _jsonSchema)
  const isOptionalField = spec.default !== undefined || spec.is_optional === true;
  if (isOptionalField && !showOptionalFields) {
    return undefined;
  }

  if (spec.default !== undefined) {
    return spec.default;
  }

  switch (spec.kind) {
    case 'scalar':
      switch (spec.type) {
        case 'string':
          return '';
        case 'int':
        case 'float':
          return 0;
        case 'bool':
          return false;
        case 'object':
          if (spec.children) {
            const obj = {} as Record<string, unknown>;
            for (const child of spec.children) {
              const childValue = generateDefaultValue(child, showOptionalFields);
              if (childValue !== undefined) {
                obj[child.name] = childValue;
              }
            }
            return obj;
          }
          return {};
        default:
          return '';
      }
    case 'array':
      return [];
    case '2darray':
      return [];
    case 'map':
      return {};
    default:
      return undefined;
  }
}

/**
 * Helper to generate ALL fields from JSON Schema (including optional ones)
 * Used when showOptionalFields is true
 * Also populates topic/user defaults from session storage when applicable
 */
function generateAllFieldsFromJsonSchema(jsonSchema: any, fieldName?: string): unknown {
  if (jsonSchema.default !== undefined) {
    return jsonSchema.default;
  }

  const { topicData, userData } = getPersistedWizardData();

  if (fieldName) {
    if (isTopicField(fieldName) && topicData?.topicName) {
      if (jsonSchema.type === 'array') {
        return [topicData.topicName];
      }
      if (jsonSchema.type === 'string') {
        return topicData.topicName;
      }
    }

    if (isUserField(fieldName) && userData?.username) {
      return '$' + '{secrets.REDPANDA_USERNAME}';
    }

    if (isPasswordField(fieldName) && userData?.password) {
      return '$' + '{secrets.REDPANDA_PASSWORD}';
    }
  }

  if (jsonSchema.type === 'string') return '';
  if (jsonSchema.type === 'number' || jsonSchema.type === 'integer') return 0;
  if (jsonSchema.type === 'boolean') return false;
  if (jsonSchema.type === 'array') return [];

  if (jsonSchema.type === 'object') {
    const obj: Record<string, unknown> = {};

    if (jsonSchema.patternProperties) {
      return {};
    }

    if (jsonSchema.properties) {
      for (const [propName, propSchema] of Object.entries(jsonSchema.properties)) {
        const value = generateAllFieldsFromJsonSchema(propSchema, propName);
        if (value !== undefined) {
          obj[propName] = value;
        }
      }
    }

    return obj;
  }

  if (jsonSchema.$ref) {
    return {};
  }

  return undefined;
}

/**
 * Get all components (built-in + external)
 * Used by connect-tiles.tsx for filtering and yaml.ts for template generation
 */
export const getAllComponents = (additionalComponents?: ExtendedConnectComponentSpec[]): ConnectComponentSpec[] => {
  return [...builtInComponents, ...(additionalComponents || [])];
};
