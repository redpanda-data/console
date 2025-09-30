import { parseDocument, stringify as yamlStringify } from 'yaml';
import { generateDefaultFromJsonSchema } from 'utils/json-schema-utils';
import benthosSchema from '../../../../assets/rp-connect-schema.json';
import {
  COMPONENT_CATEGORIES,
  CONNECT_COMPONENT_TYPE,
  type ConnectComponentSpec,
  type ConnectComponentType,
  type ConnectFieldSpec,
  type ConnectNodeCategory,
  type ExtendedConnectComponentSpec,
  type InternalConnectComponentSpec,
} from '../types/rpcn-schema';

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
 * Phase 0: Parses benthos schema and returns categories and all components
 */
const parseSchema = () => {
  const schemaData = benthosSchema as any;
  const categories = new Map<string, ConnectNodeCategory>();
  const allComponents: ConnectComponentSpec[] = [];

  // Check if schema has the new JSON Schema format with definitions
  if (!schemaData.definitions) {
    console.error('Schema does not have definitions structure. Expected JSON Schema format.');
    return { categories, allComponents };
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

  // Create semantic category collections for the category filter
  const semanticCategoryMap = new Map<string, Set<string>>();

  for (const component of allComponents) {
    if (component.categories) {
      for (const categoryId of component.categories) {
        if (!semanticCategoryMap.has(categoryId)) {
          semanticCategoryMap.set(categoryId, new Set());
        }
      }
    }
  }

  // Convert to NodeCategory format for semantic categories
  for (const categoryId of semanticCategoryMap.keys()) {
    const categoryData: ConnectNodeCategory = {
      id: categoryId,
      name: getCategoryDisplayName(categoryId),
    };
    categories.set(categoryId, categoryData);
  }

  return { categories, allComponents };
};

// Cache the parsed schema data
const { categories, allComponents } = parseSchema();

/**
 * Phase 1: Converts a component specification to a config object structure
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
 */
export const mergeConnectConfigs = (
  existingYaml: string,
  newConfigObject: any,
  componentSpec: ConnectComponentSpec,
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

  // Apply merging rules based on component type using Document API
  switch (componentSpec.type) {
    case 'processor': {
      // Processors: append to pipeline.processors[] array
      const processors = doc.getIn(['pipeline', 'processors']) || [];
      const newProcessor = newConfigObject.pipeline?.processors?.[0];

      if (newProcessor) {
        if (!Array.isArray(processors)) {
          doc.setIn(['pipeline', 'processors'], [newProcessor]);
        } else {
          doc.setIn(['pipeline', 'processors'], [...processors, newProcessor]);
        }
      }
      break;
    }

    case 'cache': {
      // Cache: append to cache_resources[] array
      const cacheResources = doc.getIn(['cache_resources']) || [];
      const newResource = newConfigObject.cache_resources?.[0];

      if (newResource) {
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
        }

        doc.setIn(['cache_resources'], [...cacheResources, newResource]);
      }
      break;
    }

    case 'rate_limit': {
      // Rate limit: append to rate_limit_resources[] array
      const rateLimitResources = doc.getIn(['rate_limit_resources']) || [];
      const newResource = newConfigObject.rate_limit_resources?.[0];

      if (newResource) {
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
        }

        doc.setIn(['rate_limit_resources'], [...rateLimitResources, newResource]);
      }
      break;
    }

    case 'input':
    case 'output':
    case 'buffer':
    case 'metrics':
    case 'tracer': {
      // Root level components: replace existing
      for (const [key, value] of Object.entries(newConfigObject)) {
        doc.setIn([key], value);
      }
      break;
    }

    case 'scanner':
      // Scanners are embedded, return as-is for manual handling
      return newConfigObject;

    default:
      // Unknown component type: merge at root level
      for (const [key, value] of Object.entries(newConfigObject)) {
        doc.setIn([key], value);
      }
      break;
  }

  // Return the modified Document (will be converted to YAML string in configToYaml)
  return doc;
};

/**
 * Phase 3: Converts config object to formatted YAML string with schema comments
 * Now handles both plain objects and YAML Documents (for comment preservation)
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

      // Add schema comments for the new component (only for new configs, not merged ones)
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
 * Adds helpful schema comments to NEW YAML configs
 * Works directly with JSON Schema for simplicity
 * Only called for new configs (not merged ones - Document API preserves existing comments)
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

    if (isRequired) {
      comment = ' # Required';
    } else if (fieldSchema.default !== undefined) {
      comment = ` # Default: ${JSON.stringify(fieldSchema.default)}`;
    } else {
      comment = ' # Optional';
    }

    // Skip comments for empty structural elements unless required
    if ((value.trim() === '{}' || value.trim() === '[]') && !isRequired) {
      comment = '';
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
 * Generates default values from ConnectFieldSpec
 * Uses shared JSON Schema utility when _jsonSchema is available
 */
export function generateDefaultValue(spec: ConnectFieldSpec, showOptionalFields?: boolean): unknown {
  // If we have raw JSON Schema, use shared utility
  if (spec._jsonSchema) {
    // Shared utility doesn't have showOptionalFields concept
    // It respects the required array in JSON Schema
    // For now, if showOptionalFields is true, we need to handle it differently
    if (showOptionalFields) {
      return generateAllFieldsFromJsonSchema(spec._jsonSchema);
    }
    return generateDefaultFromJsonSchema(spec._jsonSchema);
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
 */
function generateAllFieldsFromJsonSchema(jsonSchema: any): unknown {
  if (jsonSchema.default !== undefined) {
    return jsonSchema.default;
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
      // Include ALL properties, not just required ones
      for (const [propName, propSchema] of Object.entries(jsonSchema.properties)) {
        const value = generateAllFieldsFromJsonSchema(propSchema);
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

const displayNames: Record<string, string> = {
  // Component types
  input: 'Inputs',
  output: 'Outputs',
  processor: 'Processors',
  cache: 'Caches',
  buffer: 'Buffers',
  rate_limit: 'Rate Limits',
  scanner: 'Scanners',
  metrics: 'Metrics',
  tracer: 'Tracers',
  // Semantic categories
  databases: 'Databases',
  messaging: 'Message Queues',
  storage: 'File Storage',
  api: 'API Clients',
  aws: 'AWS Services',
  gcp: 'Google Cloud',
  azure: 'Azure Services',
  cloud: 'Cloud Services',
  export: 'Data Export',
  transformation: 'Data Transformation',
  monitoring: 'Monitoring & Observability',
  // Additional categories
  windowing: 'Windowing',
  utility: 'Utility',
  local: 'Local',
  social: 'Social',
  network: 'Network',
  integration: 'Integration',
  spicedb: 'SpiceDB',
  ai: 'AI/ML',
  parsing: 'Parsing',
  mapping: 'Mapping',
  composition: 'Composition',
  unstructured: 'Unstructured',
};

export const getCategoryDisplayName = (category: string): string => {
  return displayNames[category] || category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
};

const databaseComponents = [
  'sql',
  'postgres',
  'mysql',
  'redis',
  'mongodb',
  'cassandra',
  'dynamodb',
  'elasticsearch',
  'opensearch',
  'snowflake',
  'clickhouse',
  'influxdb',
];
const cloudComponents = ['aws', 'gcp', 'azure', 's3', 'sqs', 'sns', 'kinesis', 'pubsub', 'blob', 'cloud'];
const messagingComponents = ['kafka', 'nats', 'rabbitmq', 'mqtt', 'amqp', 'jetstream', 'pubsub'];
const fileComponents = ['file', 'sftp', 'ftp', 'tar', 'zip'];
const httpComponents = ['http', 'webhook', 'api', 'websocket', 'rest'];
const exportKeywords = ['json', 'xml', 'csv', 'parquet', 'avro', 'protobuf'];
const transformationKeywords = [
  'transform',
  'process',
  'map',
  'bloblang',
  'jq',
  'jmespath',
  'branch',
  'split',
  'compress',
  'decompress',
];
const monitoringKeywords = ['metric', 'log', 'trace', 'prometheus', 'jaeger', 'opentelemetry', 'statsd'];

const inferComponentCategory = (componentName: string): string[] => {
  const name = componentName.toLowerCase();
  const categories: string[] = [];

  // Database-related components
  if (databaseComponents.some((db) => name.includes(db))) {
    categories.push(COMPONENT_CATEGORIES.DATABASES);
  }

  // Cloud/Service providers
  if (cloudComponents.some((cloud) => name.includes(cloud))) {
    categories.push(COMPONENT_CATEGORIES.CLOUD);
    if (name.includes('aws')) categories.push(COMPONENT_CATEGORIES.AWS);
    if (name.includes('gcp') || name.includes('google')) categories.push(COMPONENT_CATEGORIES.GCP);
    if (name.includes('azure')) categories.push(COMPONENT_CATEGORIES.AZURE);
  }

  // Messaging/Streaming
  if (messagingComponents.some((msg) => name.includes(msg))) {
    categories.push(COMPONENT_CATEGORIES.MESSAGING);
  }

  // File/Storage
  if (fileComponents.some((file) => name.includes(file))) {
    categories.push(COMPONENT_CATEGORIES.STORAGE);
  }

  // HTTP/API
  if (httpComponents.some((http) => name.includes(http))) {
    categories.push(COMPONENT_CATEGORIES.API);
  }

  // Data format components
  if (exportKeywords.some((exportComponent) => name.includes(exportComponent))) {
    categories.push(COMPONENT_CATEGORIES.EXPORT);
  }

  // Transformation components (processors)
  if (transformationKeywords.some((transformationComponent) => name.includes(transformationComponent))) {
    categories.push(COMPONENT_CATEGORIES.TRANSFORMATION);
  }

  // Monitoring components
  if (monitoringKeywords.some((monitoringComponent) => name.includes(monitoringComponent))) {
    categories.push(COMPONENT_CATEGORIES.MONITORING);
  }

  // If no specific category found, leave empty (don't assign 'other')
  // Components without categories will be handled by the default display logic

  return categories;
};

// ===============================
// Exported utility functions
// ===============================

/**
 * Get all categories for the filter dropdown
 */
export const getNodeCategories = (additionalComponents?: ExtendedConnectComponentSpec[]): ConnectNodeCategory[] => {
  const allCategories = new Map(categories);

  // Add categories from additional components
  if (additionalComponents) {
    for (const component of additionalComponents) {
      if (component.categories) {
        for (const categoryId of component.categories) {
          if (!allCategories.has(categoryId)) {
            const categoryData: ConnectNodeCategory = {
              id: categoryId,
              name: getCategoryDisplayName(categoryId),
            };
            allCategories.set(categoryId, categoryData);
          }
        }
      }
    }
  }

  return Array.from(allCategories.values());
};

/**
 * Get all components (built-in + external) with isExternal flag
 * Used by connect-tiles.tsx for filtering
 */
export const getAllComponents = (
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec[] => {
  const builtInComponents: InternalConnectComponentSpec[] = allComponents.map((component) => ({
    ...component,
    isExternal: false,
  }));

  const externalComponents: InternalConnectComponentSpec[] = (additionalComponents || []).map((component) => ({
    ...component,
    isExternal: true,
  }));

  return [...builtInComponents, ...externalComponents];
};

/**
 * Get a specific component by type and name
 * Used by yaml.ts for template generation
 */
export const getComponentByTypeAndName = (
  type: ConnectComponentType,
  name: string,
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec | undefined =>
  getAllComponents(additionalComponents).find((comp) => comp.type === type && comp.name === name);
