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
  BaseConfig,
  ComponentSpec,
  ComponentStatus,
  ComponentType,
  FieldSpec,
  JsonSchema,
  JsonSchemaProperty,
  NodeCategory,
  SchemaNodeConfig,
} from '../types/connect';

/**
 * Converts a component specification to a config structure with default values
 */
export const schemaToConfig = (componentSpec?: ComponentSpec) => {
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
const addSchemaComments = (yamlString: string, componentSpec: ComponentSpec): string => {
  if (!componentSpec.config.children) {
    return yamlString;
  }

  // Create a map of field paths to their specs for quick lookup
  const fieldMap = new Map<string, FieldSpec>();
  const addFieldsToMap = (fields: FieldSpec[], prefix = '') => {
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
export const configToYaml = (config: BaseConfig, componentSpec: ComponentSpec): string => {
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

export function generateDefaultValue(spec: FieldSpec): unknown {
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

const displayNames: Record<ComponentType, string> = {
  input: 'Inputs',
  output: 'Outputs',
  processor: 'Processors',
  cache: 'Caches',
  buffer: 'Buffers',
  rate_limit: 'Rate Limits',
  scanner: 'Scanners',
  metrics: 'Metrics',
  tracer: 'Tracers',
};

const getCategoryDisplayName = (category: string): string => {
  return displayNames[category] || category;
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

const convertJsonSchemaToFieldSpec = (
  jsonSchema: JsonSchemaProperty,
  name: string,
  parentRequired?: string[],
): FieldSpec => {
  const fieldSpec: FieldSpec = {
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

const databaseComponents = ['sql', 'postgres', 'mysql', 'redis', 'mongodb', 'cassandra', 'dynamodb', 'elasticsearch'];
const cloudComponents = ['aws', 'gcp', 'azure', 's3', 'sqs', 'sns', 'kinesis', 'pubsub'];
const messagingComponents = ['kafka', 'nats', 'rabbitmq', 'mqtt'];
const fileComponents = ['file', 'sftp', 'ftp'];
const httpComponents = ['http', 'webhook', 'api'];
const exportKeywords = ['json', 'xml', 'csv'];
const transformationKeywords = ['transform', 'process', 'map'];
const monitoringKeywords = ['metric', 'log', 'trace'];

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
const extractComponentsFromDefinition = (definition: JsonSchemaProperty, type: string): ComponentSpec[] => {
  const components: ComponentSpec[] = [];

  // Navigate the allOf > anyOf structure to find component properties
  if (definition.allOf && definition.allOf.length > 0) {
    const firstAllOf = definition.allOf[0];
    if (firstAllOf.anyOf) {
      for (const anyOfItem of firstAllOf.anyOf) {
        if (anyOfItem.properties) {
          // Each properties object should have one key (the component name)
          for (const [componentName, componentSchema] of Object.entries(anyOfItem.properties)) {
            if (componentSchema.properties || componentSchema.type === 'object') {
              const componentSpec: ComponentSpec = {
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
  const jsonSchema = benthosSchema as JsonSchema;
  if (!jsonSchema.definitions) {
    console.warn('No definitions found in schema');
    return {
      componentsByType: new Map(),
      nodeConfigs: new Map(),
      categories: new Map(),
    };
  }

  const componentsByType = new Map<string, ComponentSpec[]>();
  const nodeConfigs = new Map<string, SchemaNodeConfig>();
  const categories = new Map<string, NodeCategory>();

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

  for (const { key, category } of componentTypes) {
    const definition = jsonSchema.definitions[key];
    if (definition) {
      const components = extractComponentsFromDefinition(definition, key);
      componentsByType.set(key, components);

      const categoryData: NodeCategory = {
        id: category,
        name: getCategoryDisplayName(category),
        components,
      };
      categories.set(category, categoryData);

      // Create node configs for each component
      for (const component of components) {
        const nodeConfig: SchemaNodeConfig = {
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

  return { componentsByType, nodeConfigs, categories };
};

// Cache the parsed schema data
const { componentsByType, nodeConfigs, categories } = parseSchema();

// Exported utility functions
export const getCategories = (): NodeCategory[] => Array.from(categories.values());

export const getAllNodeConfigs = (): SchemaNodeConfig[] => Array.from(nodeConfigs.values());

export const getNodeConfigsByCategory = (category: string): SchemaNodeConfig[] =>
  getAllNodeConfigs().filter((config) => config.category === category);

export const getNodeConfig = (id: string): SchemaNodeConfig | undefined => nodeConfigs.get(id);

export const searchNodeConfigs = (query: string): SchemaNodeConfig[] => {
  const lowerQuery = query.toLowerCase();
  return getAllNodeConfigs().filter(
    (config) =>
      config.name.toLowerCase().includes(lowerQuery) ||
      config.summary?.toLowerCase().includes(lowerQuery) ||
      config.description?.toLowerCase().includes(lowerQuery),
  );
};

export const getNodeConfigsByStatus = (status: string): SchemaNodeConfig[] =>
  getAllNodeConfigs().filter((config) => config.status === status);

export const getSchemaVersion = (): string => 'unknown'; // JSON Schema format doesn't include version

// Component type getters (for backward compatibility)
export const getInputs = (): ComponentSpec[] => componentsByType.get('input') || [];

export const getOutputs = (): ComponentSpec[] => componentsByType.get('output') || [];

export const getProcessors = (): ComponentSpec[] => componentsByType.get('processor') || [];

export const getCaches = (): ComponentSpec[] => componentsByType.get('cache') || [];

export const getBuffers = (): ComponentSpec[] => componentsByType.get('buffer') || [];

export const getRateLimits = (): ComponentSpec[] => componentsByType.get('rate_limit') || [];

export const getScanners = (): ComponentSpec[] => componentsByType.get('scanner') || [];

// ✅ NEW: Comprehensive helper functions for Phase 1
export const getComponentsByType = (type: ComponentType): ComponentSpec[] => componentsByType.get(type) || [];

export const getComponentsByCategory = (category: ComponentCategory | string): ComponentSpec[] =>
  getAllComponents().filter((comp) => comp.categories?.includes(category));

export const getComponentsByStatus = (status: ComponentStatus): ComponentSpec[] =>
  getAllComponents().filter((comp) => comp.status === status);

// ✅ NEW: Get component by name
export const getComponentByName = (name?: string): ComponentSpec | undefined =>
  name ? getAllComponents().find((comp) => comp.name === name) : undefined;

// ✅ NEW: Specialized helpers for common workflows
export const getDataIngestionComponents = (): ComponentSpec[] => [
  ...getInputs(),
  ...getProcessors().filter((p) => p.categories?.includes(COMPONENT_CATEGORIES.TRANSFORMATION)),
  ...getOutputs(),
];

export const getKafkaComponents = (): ComponentSpec[] =>
  getAllComponents().filter(
    (comp) => comp.name.toLowerCase().includes('kafka') || comp.categories?.includes(COMPONENT_CATEGORIES.MESSAGING),
  );

export const getDatabaseComponents = (): ComponentSpec[] =>
  getAllComponents().filter((comp) => comp.categories?.includes(COMPONENT_CATEGORIES.DATABASES));

export const getCloudComponents = (): ComponentSpec[] =>
  getAllComponents().filter((comp) => comp.categories?.includes(COMPONENT_CATEGORIES.CLOUD));

export const getAllComponents = (): ComponentSpec[] => [
  ...getInputs(),
  ...getOutputs(),
  ...getProcessors(),
  ...getCaches(),
  ...getBuffers(),
  ...getRateLimits(),
  ...getScanners(),
];

export const searchComponents = (
  query: string,
  filters?: {
    types?: ComponentType[];
    categories?: (ComponentCategory | string)[];
    status?: ComponentStatus[];
  },
): ComponentSpec[] => {
  return getAllComponents().filter((component) => {
    // Filter by search text
    if (query.trim()) {
      const searchLower = query.toLowerCase();
      const matchesName = component.name.toLowerCase().includes(searchLower);
      const matchesSummary = component.summary?.toLowerCase().includes(searchLower);
      const matchesDescription = component.description?.toLowerCase().includes(searchLower);

      if (!matchesName && !matchesSummary && !matchesDescription) return false;
    }

    // Filter by types
    if (filters?.types?.length && !filters.types.includes(component.type as ComponentType)) {
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
