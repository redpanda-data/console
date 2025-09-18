import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  FolderInput,
  FolderOutput,
  HelpCircle,
  Layers,
  Search,
  Timer,
  XCircle,
} from 'lucide-react';
import { stringify as yamlStringify } from 'yaml';
import benthosSchema from '../../../../assets/rp-connect-schema.json';
import type {
  BaseConnectConfig,
  ConnectComponentSpec,
  ConnectComponentStatus,
  ConnectComponentType,
  ConnectFieldSpec,
  ConnectJsonSchema,
  ConnectJsonSchemaProperty,
  ConnectNodeCategory,
  ConnectSchemaNodeConfig,
  ExtendedConnectComponentSpec,
} from '../types/connect';

/**
 * Converts a component specification to a config structure with default values
 */
export const schemaToConfig = (componentSpec?: ConnectComponentSpec) => {
  if (!componentSpec?.config) {
    return undefined;
  }

  // Generate the configuration object from the component's FieldSpec
  const connectionConfig = generateDefaultValue(componentSpec.config);

  return {
    [componentSpec.type]: {
      [componentSpec.name]: connectionConfig,
    },
  };
};

/**
 * Adds inline comments to YAML string based on component specification
 */
const addSchemaComments = (yamlString: string, componentSpec: ConnectComponentSpec): string => {
  if (!componentSpec.config.children) {
    return yamlString;
  }

  // Create a map of field paths to their specs for quick lookup
  const fieldMap = new Map<string, ConnectFieldSpec>();
  const addFieldsToMap = (fields: ConnectFieldSpec[], prefix = '') => {
    fields.forEach((field) => {
      const fullName = prefix ? `${prefix}.${field.name}` : field.name;
      fieldMap.set(fullName, field);
      fieldMap.set(field.name, field); // Also add without prefix for direct lookup

      if (field.children) {
        addFieldsToMap(field.children, fullName);
      }
    });
  };

  addFieldsToMap(componentSpec.config.children);

  // Parse YAML lines and track nesting context
  const lines = yamlString.split('\n');
  const contextStack: string[] = []; // Track current nesting path
  const indentStack: number[] = []; // Track indentation levels

  const processedLines = lines.map((line) => {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      return line;
    }

    // Calculate current indentation
    const currentIndent = line.length - line.trimStart().length;

    // Extract key and value
    const keyValueMatch = line.match(/^(\s*)([^:#\n]+):\s*(.*)$/);
    if (!keyValueMatch) {
      return line;
    }

    const [, indent, key, value] = keyValueMatch;
    const cleanKey = key.trim();
    const hasExistingComment = line.includes('#');

    if (hasExistingComment) {
      return line; // Don't override existing comments
    }

    // Update context stack based on indentation
    while (indentStack.length > 0 && currentIndent <= indentStack[indentStack.length - 1]) {
      indentStack.pop();
      contextStack.pop();
    }

    // Build full path for this key
    const fullPath = contextStack.length > 0 ? `${contextStack.join('.')}.${cleanKey}` : cleanKey;

    // Look up field spec using full path or just key name
    let fieldSpec = fieldMap.get(fullPath) || fieldMap.get(cleanKey);

    // If not found, try parent context + key (for cases where schema structure differs)
    if (!fieldSpec && contextStack.length > 0) {
      for (let i = contextStack.length - 1; i >= 0; i--) {
        const partialPath = `${contextStack.slice(i).join('.')}.${cleanKey}`;
        fieldSpec = fieldMap.get(partialPath);
        if (fieldSpec) break;
      }
    }

    // Determine if this key will have children (object/array values)
    const hasChildren = value.trim() === '' || value.trim() === '{}' || value.trim() === '[]';

    if (hasChildren) {
      // Add to context stack for nested fields
      contextStack.push(cleanKey);
      indentStack.push(currentIndent);
    }

    if (!fieldSpec) {
      return line;
    }

    // Format the comment based on field properties
    let comment = '';

    if (!fieldSpec.is_optional) {
      // Required field
      if (fieldSpec.default !== undefined) {
        comment = ` # Default: ${JSON.stringify(fieldSpec.default)}`;
      } else {
        comment = ' # Required';
      }
    } else {
      // Optional field
      if (fieldSpec.default !== undefined) {
        comment = ` # Default: ${JSON.stringify(fieldSpec.default)}`;
      } else {
        comment = ' # Optional';
      }
    }

    // Don't add comments to structural elements (empty objects/arrays)
    if ((value.trim() === '{}' || value.trim() === '[]') && !fieldSpec.default) {
      comment = '';
    }

    return `${indent}${cleanKey}: ${value}${comment}`;
  });

  return processedLines.join('\n');
};

const yamlOptions = {
  indent: 2,
  lineWidth: 120,
  minContentWidth: 20,
  doubleQuotedAsJSON: false,
};

/**
 * Converts a config object to formatted YAML with comments
 */
export const configToYaml = (config: BaseConnectConfig, componentSpec: ConnectComponentSpec): string => {
  try {
    let yamlString = yamlStringify(config, yamlOptions);

    // Add schema-based comments for optional fields
    yamlString = addSchemaComments(yamlString, componentSpec);

    return yamlString;
  } catch (error) {
    console.error('Error converting config to YAML:', error);
    return JSON.stringify(config, null, 2);
  }
};

export function generateDefaultValue(spec: ConnectFieldSpec): unknown {
  // Use the explicit default if it exists
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
        case 'object': // A scalar object is a complex type, render its children
          if (spec.children) {
            const obj = {} as Record<string, unknown>;

            // For configuration templates, include all fields to provide comprehensive examples
            // This gives users visibility into all available configuration options
            for (const child of spec.children) {
              obj[child.name] = generateDefaultValue(child);
            }

            return obj;
          }
          return {};
        default:
          return ''; // Fallback for other types like 'input', 'processor' etc.
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

// Utility functions for generating summaries and display names
const generateSummary = (componentName: string, type: string): string => {
  const formattedName = componentName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  const formattedType = type.charAt(0).toUpperCase() + type.slice(1);
  return `${formattedName} ${formattedType.toLowerCase()}`;
};

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
  other: 'Other',
};

const getCategoryDisplayName = (category: string): string => {
  return displayNames[category] || category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
};

// Enhanced category system with proper typing
export const COMPONENT_CATEGORIES = {
  // Infrastructure
  DATABASES: 'databases',
  MESSAGING: 'messaging',
  STORAGE: 'storage',
  API: 'api',

  // Cloud Providers
  AWS: 'aws',
  GCP: 'gcp',
  AZURE: 'azure',
  CLOUD: 'cloud',

  // Data Formats
  EXPORT: 'export',
  // Other
  TRANSFORMATION: 'transformation',
  MONITORING: 'monitoring',
  OTHER: 'other',
} as const;

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[keyof typeof COMPONENT_CATEGORIES];

// Internal component spec with isExternal flag
export interface InternalConnectComponentSpec extends ConnectComponentSpec {
  isExternal?: boolean;
}

const convertJsonSchemaToFieldSpec = (
  jsonSchema: ConnectJsonSchemaProperty,
  name: string,
  parentRequired?: string[],
): ConnectFieldSpec => {
  const fieldSpec: ConnectFieldSpec = {
    name,
    type: 'string', // Default fallback
    kind: 'scalar',
    is_optional: !parentRequired?.includes(name),
  };

  // Handle different schema types
  if (jsonSchema.type) {
    switch (jsonSchema.type) {
      case 'boolean':
        fieldSpec.type = 'bool';
        // Don't set default for booleans - let generateDefaultValue handle it
        break;
      case 'integer':
      case 'number':
        fieldSpec.type = jsonSchema.type === 'integer' ? 'int' : 'float';
        // Don't set default for numbers - let generateDefaultValue handle it
        break;
      case 'string':
        fieldSpec.type = 'string';
        // Don't set default for strings - let generateDefaultValue handle it
        break;
      case 'array':
        fieldSpec.kind = 'array';
        fieldSpec.type = 'array';
        // Don't set default for arrays - let generateDefaultValue handle it
        // Handle array items if specified
        if (jsonSchema.items) {
          fieldSpec.children = [convertJsonSchemaToFieldSpec(jsonSchema.items, 'item', [])];
        }
        break;
      case 'object':
        fieldSpec.type = 'object';
        fieldSpec.kind = 'scalar';

        // Convert properties to children
        if (jsonSchema.properties) {
          fieldSpec.children = Object.entries(jsonSchema.properties).map(([childName, childSchema]) =>
            convertJsonSchemaToFieldSpec(childSchema, childName, jsonSchema.required),
          );
        }
        // Don't set default for objects - let generateDefaultValue handle it
        break;
    }
  } else if (jsonSchema.properties) {
    // No explicit type but has properties - treat as object
    fieldSpec.type = 'object';
    fieldSpec.kind = 'scalar';
    fieldSpec.children = Object.entries(jsonSchema.properties).map(([childName, childSchema]) =>
      convertJsonSchemaToFieldSpec(childSchema, childName, jsonSchema.required),
    );
  } else if (jsonSchema.anyOf || jsonSchema.allOf) {
    // Handle schema compositions - for now, just treat as generic object
    fieldSpec.type = 'object';
    fieldSpec.kind = 'scalar';
  }

  return fieldSpec;
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

  // If no specific category found, mark as general
  if (categories.length === 0) {
    categories.push(COMPONENT_CATEGORIES.OTHER);
  }

  return categories;
};

// Extract components from JSON Schema definition
const extractComponentsFromDefinition = (
  definition: ConnectJsonSchemaProperty,
  type: string,
): ConnectComponentSpec[] => {
  const components: ConnectComponentSpec[] = [];

  // Navigate the allOf > anyOf structure to find component properties
  if (definition.allOf && definition.allOf.length > 0) {
    const firstAllOf = definition.allOf[0];
    if (firstAllOf.anyOf) {
      for (const anyOfItem of firstAllOf.anyOf) {
        if (anyOfItem.properties) {
          // Each properties object should have one key (the component name)
          for (const [componentName, componentSchema] of Object.entries(anyOfItem.properties)) {
            if (componentSchema.properties || componentSchema.type === 'object') {
              const componentSpec: ConnectComponentSpec = {
                name: componentName,
                type,
                status: 'stable', // Default status, could be extracted from schema if available
                summary: generateSummary(componentName, type),
                config: convertJsonSchemaToFieldSpec(componentSchema, componentName, componentSchema.required),
                plugin: false, // Default to false for built-in components
                // ✅ NEW: Enrich categories during parse, not at runtime
                categories: inferComponentCategory(componentName),
              };
              components.push(componentSpec);
            }
          }
        }
      }
    }
  }

  return components;
};

const parseSchema = () => {
  const jsonSchema = benthosSchema as ConnectJsonSchema;
  if (!jsonSchema.definitions) {
    console.warn('No definitions found in schema');
    return {
      componentsByType: new Map(),
      nodeConfigs: new Map(),
      categories: new Map(),
    };
  }

  const componentsByType = new Map<string, ConnectComponentSpec[]>();
  const nodeConfigs = new Map<string, ConnectSchemaNodeConfig>();
  const categories = new Map<string, ConnectNodeCategory>();

  // Parse each component type from the schema definitions
  const componentTypes = [
    { key: 'input', category: 'input' as const },
    { key: 'output', category: 'output' as const },
    { key: 'processor', category: 'processor' as const },
    { key: 'cache', category: 'cache' as const },
    { key: 'buffer', category: 'buffer' as const },
    { key: 'rate_limit', category: 'rate_limit' as const },
    { key: 'scanner', category: 'scanner' as const },
  ];

  // First pass: extract components and infer semantic categories
  const allComponents: ConnectComponentSpec[] = [];

  for (const { key, category } of componentTypes) {
    const definition = jsonSchema.definitions[key];
    if (definition) {
      const components = extractComponentsFromDefinition(definition, key);

      // Infer semantic categories for each component
      for (const component of components) {
        component.categories = inferComponentCategory(component.name);
      }

      componentsByType.set(key, components);
      allComponents.push(...components);

      // Create node configs for each component
      for (const component of components) {
        const nodeConfig: ConnectSchemaNodeConfig = {
          id: `${category}-${component.name}`,
          name: component.name,
          type: component.type,
          category,
          status: component.status || 'stable',
          summary: component.summary,
          description: component.description,
          config: component.config,
          categories: component.categories,
          version: component.version,
        };
        nodeConfigs.set(nodeConfig.id, nodeConfig);
      }
    }
  }

  // Second pass: create semantic category collections
  const semanticCategoryMap = new Map<string, ConnectComponentSpec[]>();

  for (const component of allComponents) {
    if (component.categories) {
      for (const categoryId of component.categories) {
        if (!semanticCategoryMap.has(categoryId)) {
          semanticCategoryMap.set(categoryId, []);
        }
        const categoryComponents = semanticCategoryMap.get(categoryId);
        if (categoryComponents) {
          categoryComponents.push(component);
        }
      }
    }
  }

  // Convert to NodeCategory format for semantic categories
  for (const [categoryId, components] of semanticCategoryMap) {
    const categoryData: ConnectNodeCategory = {
      id: categoryId,
      name: getCategoryDisplayName(categoryId),
      components,
    };
    categories.set(categoryId, categoryData);
  }

  return { componentsByType, nodeConfigs, categories };
};

// Cache the parsed schema data
const { componentsByType, nodeConfigs, categories } = parseSchema();

// Exported utility functions
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
              components: [],
            };
            allCategories.set(categoryId, categoryData);
          }
        }
      }
    }
  }

  return Array.from(allCategories.values());
};

export const getAllNodeConfigs = (additionalComponents?: ExtendedConnectComponentSpec[]): ConnectSchemaNodeConfig[] => {
  const builtInConfigs = Array.from(nodeConfigs.values());

  const externalConfigs: ConnectSchemaNodeConfig[] = (additionalComponents || []).map((component) => ({
    id: `${component.type}-${component.name}-external`,
    name: component.name,
    type: component.type,
    category: component.type as ConnectComponentType,
    status: component.status,
    summary: component.summary,
    description: component.description,
    config: component.config,
    categories: component.categories,
    version: component.version,
  }));

  return [...builtInConfigs, ...externalConfigs];
};

export const getNodeConfigsByCategory = (
  category: string,
  additionalComponents?: ExtendedConnectComponentSpec[],
): ConnectSchemaNodeConfig[] =>
  getAllNodeConfigs(additionalComponents).filter((config) => config.category === category);

export const getNodeConfig = (
  id: string,
  additionalComponents?: ExtendedConnectComponentSpec[],
): ConnectSchemaNodeConfig | undefined => {
  const builtInConfig = nodeConfigs.get(id);
  if (builtInConfig) return builtInConfig;

  // Check external components
  const externalConfig = (additionalComponents || []).find((comp) => id === `${comp.type}-${comp.name}-external`);

  if (externalConfig) {
    return {
      id,
      name: externalConfig.name,
      type: externalConfig.type,
      category: externalConfig.type as ConnectComponentType,
      status: externalConfig.status,
      summary: externalConfig.summary,
      description: externalConfig.description,
      config: externalConfig.config,
      categories: externalConfig.categories,
      version: externalConfig.version,
    };
  }

  return undefined;
};

export const searchNodeConfigs = (
  query: string,
  additionalComponents?: ExtendedConnectComponentSpec[],
): ConnectSchemaNodeConfig[] => {
  const lowerQuery = query.toLowerCase();
  return getAllNodeConfigs(additionalComponents).filter(
    (config) =>
      config.name.toLowerCase().includes(lowerQuery) ||
      config.summary?.toLowerCase().includes(lowerQuery) ||
      config.description?.toLowerCase().includes(lowerQuery),
  );
};

export const getNodeConfigsByStatus = (
  status: string,
  additionalComponents?: ExtendedConnectComponentSpec[],
): ConnectSchemaNodeConfig[] => getAllNodeConfigs(additionalComponents).filter((config) => config.status === status);

export const getSchemaVersion = (): string => 'unknown'; // JSON Schema format doesn't include version

// Component type getters (for backward compatibility)
export const getInputs = (): ConnectComponentSpec[] => componentsByType.get('input') || [];

export const getOutputs = (): ConnectComponentSpec[] => componentsByType.get('output') || [];

export const getProcessors = (): ConnectComponentSpec[] => componentsByType.get('processor') || [];

export const getCaches = (): ConnectComponentSpec[] => componentsByType.get('cache') || [];

export const getBuffers = (): ConnectComponentSpec[] => componentsByType.get('buffer') || [];

export const getRateLimits = (): ConnectComponentSpec[] => componentsByType.get('rate_limit') || [];

export const getScanners = (): ConnectComponentSpec[] => componentsByType.get('scanner') || [];

// ✅ NEW: Comprehensive helper functions for Phase 1
export const getComponentsByType = (
  type: ConnectComponentType,
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec[] => {
  const builtInComponents = componentsByType.get(type) || [];
  const mappedBuiltIn: InternalConnectComponentSpec[] = builtInComponents.map((comp: ConnectComponentSpec) => ({
    ...comp,
    isExternal: false,
  }));

  const externalComponentsOfType: InternalConnectComponentSpec[] = (additionalComponents || [])
    .filter((comp: ExtendedConnectComponentSpec) => comp.type === type)
    .map((comp: ExtendedConnectComponentSpec) => ({ ...comp, isExternal: true }));

  return [...mappedBuiltIn, ...externalComponentsOfType];
};

export const getComponentsByCategory = (
  category: ComponentCategory | string,
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec[] =>
  getAllComponents(additionalComponents).filter((comp) => comp.categories?.includes(category));

export const getComponentsByStatus = (
  status: ConnectComponentStatus,
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec[] => getAllComponents(additionalComponents).filter((comp) => comp.status === status);

// ✅ NEW: Get component by name
export const getComponentByName = (
  name?: string,
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec | undefined =>
  name ? getAllComponents(additionalComponents).find((comp) => comp.name === name) : undefined;

// ✅ NEW: Specialized helpers for common workflows
export const getDataIngestionComponents = (
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec[] => {
  const allComponents = getAllComponents(additionalComponents);
  return [
    ...allComponents.filter((comp) => comp.type === 'input'),
    ...allComponents.filter(
      (comp) => comp.type === 'processor' && comp.categories?.includes(COMPONENT_CATEGORIES.TRANSFORMATION),
    ),
    ...allComponents.filter((comp) => comp.type === 'output'),
  ];
};

export const getKafkaComponents = (
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec[] =>
  getAllComponents(additionalComponents).filter(
    (comp) => comp.name.toLowerCase().includes('kafka') || comp.categories?.includes(COMPONENT_CATEGORIES.MESSAGING),
  );

export const getDatabaseComponents = (
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec[] =>
  getAllComponents(additionalComponents).filter((comp) => comp.categories?.includes(COMPONENT_CATEGORIES.DATABASES));

export const getCloudComponents = (
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec[] =>
  getAllComponents(additionalComponents).filter((comp) => comp.categories?.includes(COMPONENT_CATEGORIES.CLOUD));

export const getAllComponents = (
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec[] => {
  const builtInComponents: InternalConnectComponentSpec[] = [
    ...getInputs(),
    ...getOutputs(),
    ...getProcessors(),
    ...getCaches(),
    ...getBuffers(),
    ...getRateLimits(),
    ...getScanners(),
  ].map((component) => ({ ...component, isExternal: false }));

  const externalComponents: InternalConnectComponentSpec[] = (additionalComponents || []).map((component) => ({
    ...component,
    isExternal: true,
  }));

  return [...externalComponents, ...builtInComponents];
};

export const searchComponents = (
  query: string,
  filters?: {
    types?: ConnectComponentType[];
    categories?: (ComponentCategory | string)[];
    status?: ConnectComponentStatus[];
  },
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec[] => {
  return getAllComponents(additionalComponents).filter((component) => {
    // Filter by search text
    if (query.trim()) {
      const searchLower = query.toLowerCase();
      const matchesName = component.name.toLowerCase().includes(searchLower);
      const matchesSummary = component.summary?.toLowerCase().includes(searchLower);
      const matchesDescription = component.description?.toLowerCase().includes(searchLower);

      if (!matchesName && !matchesSummary && !matchesDescription) return false;
    }

    // Filter by types
    if (filters?.types?.length && !filters.types.includes(component.type as ConnectComponentType)) {
      return false;
    }

    // Filter by categories
    if (filters?.categories?.length) {
      const hasMatchingCategory = component.categories?.some((cat) => filters.categories?.includes(cat));
      if (!hasMatchingCategory) return false;
    }

    // Filter by status
    if (filters?.status?.length && !filters.status.includes(component.status)) {
      return false;
    }

    return true;
  });
};

export const getComponentTypeConfig = (type: string) => {
  switch (type) {
    case 'input':
      return {
        icon: <FolderInput className="h-3 w-3" />,
        text: 'Input',
        className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      };
    case 'output':
      return {
        icon: <FolderOutput className="h-3 w-3" />,
        text: 'Output',
        className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      };
    case 'processor':
      return {
        icon: <Cpu className="h-3 w-3" />,
        text: 'Processor',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      };
    case 'cache':
      return {
        icon: <Database className="h-3 w-3" />,
        text: 'Cache',
        className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
      };
    case 'buffer':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: 'Buffer',
        className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
      };
    case 'rate_limit':
      return {
        icon: <Timer className="h-3 w-3" />,
        text: 'Rate Limit',
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      };
    case 'scanner':
      return {
        icon: <Search className="h-3 w-3" />,
        text: 'Scanner',
        className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
      };
    case 'metrics':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Metrics',
        className: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
      };
    case 'tracer':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Tracer',
        className: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300',
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' '),
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
      };
  }
};

export const getCategoryConfig = (category: string[] | null) => {
  if (!category) return;
  return category.map((c) => {
    switch (c) {
      case 'input':
        return {
          icon: <FolderInput className="h-3 w-3" />,
          text: 'Input',
          className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        };
      case 'output':
        return {
          icon: <FolderOutput className="h-3 w-3" />,
          text: 'Output',
          className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
        };
      case 'processor':
        return {
          icon: <Cpu className="h-3 w-3" />,
          text: 'Processor',
          className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        };
      case 'cache':
        return {
          icon: <Database className="h-3 w-3" />,
          text: 'Cache',
          className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
        };
      case 'buffer':
        return {
          icon: <Layers className="h-3 w-3" />,
          text: 'Buffer',
          className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
        };
      case 'rate_limit':
        return {
          icon: <Timer className="h-3 w-3" />,
          text: 'Rate Limit',
          className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        };
      case 'scanner':
        return {
          icon: <Search className="h-3 w-3" />,
          text: 'Scanner',
          className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
        };
      default:
        return {
          icon: <HelpCircle className="h-3 w-3" />,
          text: c.charAt(0).toUpperCase() + c.slice(1),
          className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
        };
    }
  });
};

export const getStatusConfig = (status: string) => {
  switch (status) {
    case 'stable':
      return {
        icon: <CheckCircle2 className="h-3 w-3" />,
        text: 'Stable',
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
      };
    case 'beta':
      return {
        icon: <Clock className="h-3 w-3" />,
        text: 'Beta',
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
      };
    case 'experimental':
      return {
        icon: <AlertTriangle className="h-3 w-3" />,
        text: 'Experimental',
        className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      };
    case 'deprecated':
      return {
        icon: <XCircle className="h-3 w-3" />,
        text: 'Deprecated',
        className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: status.charAt(0).toUpperCase() + status.slice(1),
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
      };
  }
};
