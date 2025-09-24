import type { BadgeVariant } from 'components/redpanda-ui/components/badge';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Brain,
  CheckCircle2,
  Clock,
  Cloud,
  Cpu,
  Database,
  Download,
  FileText,
  FolderInput,
  FolderOutput,
  GitBranch,
  Globe,
  HardDrive,
  Hash,
  HelpCircle,
  Home,
  Layers,
  MessageCircle,
  Monitor,
  Network,
  RefreshCw,
  Search,
  Shield,
  Timer,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import { stringify as yamlStringify } from 'yaml';
import benthosSchema from '../../../../assets/rp-connect-schema.json';
import {
  type BaseConnectConfig,
  COMPONENT_CATEGORIES,
  CONNECT_COMPONENT_TYPE,
  type ComponentCategory,
  type ConnectComponentSpec,
  type ConnectComponentStatus,
  type ConnectComponentType,
  type ConnectFieldSpec,
  type ConnectNodeCategory,
  type ConnectSchemaNodeConfig,
  type ExtendedConnectComponentSpec,
  type InternalConnectComponentSpec,
} from './types';

export const CONNECT_TILE_STORAGE_KEY = 'selected-connect-tile';

/**
 * Converts a component specification to a config structure with default values
 */
export const schemaToConfig = (componentSpec?: ConnectComponentSpec, showOptionalFields?: boolean) => {
  if (!componentSpec?.config) {
    return undefined;
  }

  // Generate the configuration object from the component's FieldSpec
  const connectionConfig = generateDefaultValue(componentSpec.config, showOptionalFields);

  return {
    [componentSpec.type]: {
      label: '',
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

    // In the rp-connect-schema, fields with default values are optional
    // Fields without default values are required
    const isOptionalField = fieldSpec.default !== undefined || fieldSpec.is_optional === true;

    if (!isOptionalField) {
      // Required field without default
      comment = ' # Required (no default)';
    } else {
      // Optional field (has default or marked as optional)
      if (fieldSpec.default !== undefined) {
        comment = ` # Default: ${JSON.stringify(fieldSpec.default)}`;
      } else {
        comment = ' # Optional';
      }
    }

    // Don't add comments to structural elements (empty objects/arrays) unless they have defaults
    // For required fields that become empty due to optional child filtering, still show requirement status
    if (value.trim() === '{}' || value.trim() === '[]') {
      if (fieldSpec.default !== undefined) {
        // Optional field with empty default - no comment needed
        comment = '';
      } else if (!isOptionalField) {
        // Required field that became empty due to child filtering - show as required
        comment = ' # Required';
      }
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

export function generateDefaultValue(spec: ConnectFieldSpec, showOptionalFields?: boolean): unknown {
  // In the rp-connect-schema, fields with default values are considered optional
  // Fields without default values are required
  const isOptionalField = spec.default !== undefined || spec.is_optional === true;

  // Check if this is an optional field that should be excluded
  if (isOptionalField && !showOptionalFields) {
    return undefined;
  }

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
              const childValue = generateDefaultValue(child, showOptionalFields);
              // Only include fields that are not undefined (i.e., not excluded optional fields)
              if (childValue !== undefined) {
                obj[child.name] = childValue;
              }
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

const getCategoryDisplayName = (category: string): string => {
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

// Convert raw component data from new schema format to ConnectComponentSpec
const processComponentFromSchema = (rawComponent: any): ConnectComponentSpec => {
  // The new schema format already has the component structure we need
  const componentSpec: ConnectComponentSpec = {
    name: rawComponent.name,
    type: rawComponent.type,
    status: rawComponent.status || 'stable',
    plugin: rawComponent.plugin || false,
    summary: rawComponent.summary,
    description: rawComponent.description,
    categories: rawComponent.categories || inferComponentCategory(rawComponent.name),
    config: rawComponent.config, // Already in FieldSpec format
    version: rawComponent.version,
    footnotes: rawComponent.footnotes,
    examples: rawComponent.examples,
    support_level: rawComponent.support_level,
  };

  // Enrich with inferred categories if none exist
  if (!componentSpec.categories || componentSpec.categories.length === 0) {
    componentSpec.categories = inferComponentCategory(componentSpec.name);
  }

  return componentSpec;
};

const parseSchema = () => {
  const schemaData = benthosSchema as any;
  const componentsByType = new Map<string, ConnectComponentSpec[]>();
  const nodeConfigs = new Map<string, ConnectSchemaNodeConfig>();
  const categories = new Map<string, ConnectNodeCategory>();
  const allComponents: ConnectComponentSpec[] = [];

  // Parse each component type using the constants from types.ts
  for (const componentType of CONNECT_COMPONENT_TYPE) {
    const schemaKey = componentType === 'rate_limit' ? 'rate-limits' : componentType + 's';
    const componentArray = schemaData[schemaKey];
    if (Array.isArray(componentArray)) {
      const components = componentArray.map(processComponentFromSchema);

      componentsByType.set(componentType, components);
      allComponents.push(...components);

      // Create node configs for each component
      for (const component of components) {
        const nodeConfig: ConnectSchemaNodeConfig = {
          id: `${componentType}-${component.name}`,
          name: component.name,
          type: component.type,
          category: componentType as ConnectComponentType,
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

  // Create semantic category collections
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

  return { componentsByType, nodeConfigs, categories, allComponents };
};

// Cache the parsed schema data
const { componentsByType, nodeConfigs, categories, allComponents } = parseSchema();

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

// Component type getters using the type-safe constants
export const getComponentsOfType = (type: ConnectComponentType): ConnectComponentSpec[] =>
  componentsByType.get(type) || [];

// Legacy getters for backward compatibility
export const getInputs = (): ConnectComponentSpec[] => getComponentsOfType('input');
export const getOutputs = (): ConnectComponentSpec[] => getComponentsOfType('output');
export const getProcessors = (): ConnectComponentSpec[] => getComponentsOfType('processor');
export const getCaches = (): ConnectComponentSpec[] => getComponentsOfType('cache');
export const getBuffers = (): ConnectComponentSpec[] => getComponentsOfType('buffer');
export const getRateLimits = (): ConnectComponentSpec[] => getComponentsOfType('rate_limit');
export const getScanners = (): ConnectComponentSpec[] => getComponentsOfType('scanner');
export const getMetrics = (): ConnectComponentSpec[] => getComponentsOfType('metrics');
export const getTracers = (): ConnectComponentSpec[] => getComponentsOfType('tracer');

// Get components by type with external component support
export const getComponentsByType = (
  type: ConnectComponentType,
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec[] => {
  const builtInComponents = getComponentsOfType(type);
  const mappedBuiltIn: InternalConnectComponentSpec[] = builtInComponents.map((comp) => ({
    ...comp,
    isExternal: false,
  }));

  const externalComponentsOfType: InternalConnectComponentSpec[] = (additionalComponents || [])
    .filter((comp) => comp.type === type)
    .map((comp) => ({ ...comp, isExternal: true }));

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

// Get component by name
export const getComponentByName = (
  name?: string,
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec | undefined =>
  name ? getAllComponents(additionalComponents).find((comp) => comp.name === name) : undefined;

// Get component by type and name (more precise)
export const getComponentByTypeAndName = (
  type: ConnectComponentType,
  name: string,
  additionalComponents?: ExtendedConnectComponentSpec[],
): InternalConnectComponentSpec | undefined =>
  getAllComponents(additionalComponents).find((comp) => comp.type === type && comp.name === name);

// Specialized helpers for common workflows
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
  // Use the cached allComponents instead of calling individual getters
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

export type ComponentConfig = {
  icon: React.ReactNode;
  text: string;
  variant: BadgeVariant;
};

export const getComponentTypeConfig = (type: ConnectComponentType): ComponentConfig => {
  switch (type) {
    case 'input':
      return {
        icon: <FolderInput className="h-3 w-3" />,
        text: 'Input',
        variant: 'green' as const,
      };
    case 'output':
      return {
        icon: <FolderOutput className="h-3 w-3" />,
        text: 'Output',
        variant: 'orange' as const,
      };
    case 'processor':
      return {
        icon: <Cpu className="h-3 w-3" />,
        text: 'Processor',
        variant: 'blue' as const,
      };
    case 'cache':
      return {
        icon: <Database className="h-3 w-3" />,
        text: 'Cache',
        variant: 'purple' as const,
      };
    case 'buffer':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: 'Buffer',
        variant: 'indigo' as const,
      };
    case 'rate_limit':
      return {
        icon: <Timer className="h-3 w-3" />,
        text: 'Rate Limit',
        variant: 'yellow' as const,
      };
    case 'scanner':
      return {
        icon: <Search className="h-3 w-3" />,
        text: 'Scanner',
        variant: 'cyan' as const,
      };
    case 'metrics':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Metrics',
        variant: 'teal' as const,
      };
    case 'tracer':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Tracer',
        variant: 'rose' as const,
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' '),
        variant: 'gray' as const,
      };
  }
};

export const getCategoryConfig = (category: ComponentCategory | ConnectComponentType | string): ComponentConfig => {
  // Handle null/undefined categories
  if (!category) {
    return {
      icon: <HelpCircle className="h-3 w-3" />,
      text: 'Unknown',
      variant: 'gray' as const,
    };
  }

  const categoryLower = category.toLowerCase();
  const displayText = getCategoryDisplayName(categoryLower);

  switch (categoryLower) {
    case 'input':
      return {
        icon: <FolderInput className="h-3 w-3" />,
        text: displayText,
        variant: 'green' as const,
      };
    case 'output':
      return {
        icon: <FolderOutput className="h-3 w-3" />,
        text: displayText,
        variant: 'orange' as const,
      };
    case 'processor':
      return {
        icon: <Cpu className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
      };
    case 'cache':
      return {
        icon: <Database className="h-3 w-3" />,
        text: displayText,
        variant: 'purple' as const,
      };
    case 'buffer':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: displayText,
        variant: 'indigo' as const,
      };
    case 'rate_limit':
      return {
        icon: <Timer className="h-3 w-3" />,
        text: displayText,
        variant: 'yellow' as const,
      };
    case 'scanner':
      return {
        icon: <Search className="h-3 w-3" />,
        text: displayText,
        variant: 'cyan' as const,
      };
    case 'metrics':
      return {
        icon: <Activity className="h-3 w-3" />,
        text: displayText,
        variant: 'teal' as const,
      };
    case 'tracer':
      return {
        icon: <RefreshCw className="h-3 w-3" />,
        text: displayText,
        variant: 'rose' as const,
      };
    // Semantic categories
    case 'databases':
      return {
        icon: <Database className="h-3 w-3" />,
        text: displayText,
        variant: 'purple' as const,
      };
    case 'messaging':
      return {
        icon: <MessageCircle className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
      };
    case 'storage':
      return {
        icon: <HardDrive className="h-3 w-3" />,
        text: displayText,
        variant: 'indigo' as const,
      };
    case 'api':
      return {
        icon: <Globe className="h-3 w-3" />,
        text: displayText,
        variant: 'green' as const,
      };
    case 'aws':
      return {
        icon: <Cloud className="h-3 w-3" />,
        text: displayText,
        variant: 'orange' as const,
      };
    case 'gcp':
      return {
        icon: <Cloud className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
      };
    case 'azure':
      return {
        icon: <Cloud className="h-3 w-3" />,
        text: displayText,
        variant: 'cyan' as const,
      };
    case 'cloud':
      return {
        icon: <Cloud className="h-3 w-3" />,
        text: displayText,
        variant: 'gray' as const,
      };
    case 'export':
      return {
        icon: <Download className="h-3 w-3" />,
        text: displayText,
        variant: 'emerald' as const,
      };
    case 'transformation':
      return {
        icon: <RefreshCw className="h-3 w-3" />,
        text: displayText,
        variant: 'yellow' as const,
      };
    case 'monitoring':
      return {
        icon: <Activity className="h-3 w-3" />,
        text: displayText,
        variant: 'teal' as const,
      };
    case 'windowing':
      return {
        icon: <Monitor className="h-3 w-3" />,
        text: displayText,
        variant: 'purple' as const,
      };
    case 'utility':
      return {
        icon: <Wrench className="h-3 w-3" />,
        text: displayText,
        variant: 'amber' as const,
      };
    case 'local':
      return {
        icon: <Home className="h-3 w-3" />,
        text: displayText,
        variant: 'green' as const,
      };
    case 'social':
      return {
        icon: <Users className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
      };
    case 'network':
      return {
        icon: <Network className="h-3 w-3" />,
        text: displayText,
        variant: 'indigo' as const,
      };
    case 'integration':
      return {
        icon: <GitBranch className="h-3 w-3" />,
        text: displayText,
        variant: 'emerald' as const,
      };
    case 'spicedb':
      return {
        icon: <Shield className="h-3 w-3" />,
        text: displayText,
        variant: 'red' as const,
      };
    case 'ai':
      return {
        icon: <Brain className="h-3 w-3" />,
        text: displayText,
        variant: 'purple' as const,
      };
    case 'parsing':
      return {
        icon: <FileText className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
      };
    case 'mapping':
      return {
        icon: <ArrowRightLeft className="h-3 w-3" />,
        text: displayText,
        variant: 'yellow' as const,
      };
    case 'composition':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: displayText,
        variant: 'teal' as const,
      };
    case 'unstructured':
      return {
        icon: <Hash className="h-3 w-3" />,
        text: displayText,
        variant: 'orange' as const,
      };
    default:
      // Log unknown categories for debugging
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.warn(`Unknown category: "${category}"`);
      }
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: displayText,
        variant: 'gray' as const,
      };
  }
};

export const getStatusConfig = (status: ConnectComponentStatus): ComponentConfig => {
  switch (status) {
    case 'stable':
      return {
        icon: <CheckCircle2 className="h-3 w-3" />,
        text: 'Stable',
        variant: 'emerald' as const,
      };
    case 'beta':
      return {
        icon: <Clock className="h-3 w-3" />,
        text: 'Beta',
        variant: 'amber' as const,
      };
    case 'experimental':
      return {
        icon: <AlertTriangle className="h-3 w-3" />,
        text: 'Experimental',
        variant: 'orange' as const,
      };
    case 'deprecated':
      return {
        icon: <XCircle className="h-3 w-3" />,
        text: 'Deprecated',
        variant: 'red' as const,
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: status.charAt(0).toUpperCase() + status.slice(1),
        variant: 'gray' as const,
      };
  }
};

/**
 * generates a yaml string for a connect config based on the selected connectionName and connectionType
 * @returns yaml string of connect config for the selected connectionName and connectionType
 */
export const getConnectTemplate = ({
  connectionName,
  connectionType,
  showOptionalFields,
}: {
  connectionName: string;
  connectionType: string;
  showOptionalFields?: boolean;
}) => {
  const componentSpec =
    connectionName && connectionType ? getComponentByTypeAndName(connectionType, connectionName) : undefined;
  const baseConfig = schemaToConfig(componentSpec, showOptionalFields);

  if (!baseConfig || !componentSpec) {
    return undefined;
  }
  return configToYaml(baseConfig, componentSpec);
};
