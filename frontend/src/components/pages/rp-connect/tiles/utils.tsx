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
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import benthosSchema from '../../../../assets/rp-connect-schema.json';
import {
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

const yamlOptions = {
  indent: 2,
  lineWidth: 120,
  minContentWidth: 20,
  doubleQuotedAsJSON: false,
};

/**
 * Phase 2: Merges a new component config object into existing YAML configuration
 * following the Redpanda Connect schema merging rules
 */
export const mergeConnectConfigs = (
  existingYaml: string,
  newConfigObject: any,
  componentSpec: ConnectComponentSpec,
) => {
  let existingConfig: any = {};

  // Parse existing YAML if provided (comments will be lost here - unavoidable)
  if (existingYaml.trim()) {
    try {
      existingConfig = yamlParse(existingYaml) || {};
    } catch (error) {
      console.warn('Failed to parse existing YAML, starting with empty config:', error);
      existingConfig = {};
    }
  }

  // Apply merging rules based on component type
  switch (componentSpec.type) {
    case 'processor':
      // Processors: append to pipeline.processors[] array
      if (!existingConfig.pipeline) {
        existingConfig.pipeline = {};
      }
      if (!existingConfig.pipeline.processors) {
        existingConfig.pipeline.processors = [];
      }
      // Add the new processor to the array
      if (newConfigObject.pipeline?.processors?.[0]) {
        existingConfig.pipeline.processors.push(newConfigObject.pipeline.processors[0]);
      }
      break;

    case 'cache':
      // Cache: append to cache_resources[] array
      if (!existingConfig.cache_resources) {
        existingConfig.cache_resources = [];
      }
      if (newConfigObject.cache_resources?.[0]) {
        // Check for label conflicts and resolve
        const newResource = newConfigObject.cache_resources[0];
        const existingLabels = existingConfig.cache_resources.map((r: any) => r.label);
        if (existingLabels.includes(newResource.label)) {
          // Generate unique label
          let counter = 1;
          let uniqueLabel = `${newResource.label}_${counter}`;
          while (existingLabels.includes(uniqueLabel)) {
            counter++;
            uniqueLabel = `${newResource.label}_${counter}`;
          }
          newResource.label = uniqueLabel;
        }
        existingConfig.cache_resources.push(newResource);
      }
      break;

    case 'rate_limit':
      // Rate limit: append to rate_limit_resources[] array
      if (!existingConfig.rate_limit_resources) {
        existingConfig.rate_limit_resources = [];
      }
      if (newConfigObject.rate_limit_resources?.[0]) {
        // Check for label conflicts and resolve
        const newResource = newConfigObject.rate_limit_resources[0];
        const existingLabels = existingConfig.rate_limit_resources.map((r: any) => r.label);
        if (existingLabels.includes(newResource.label)) {
          // Generate unique label
          let counter = 1;
          let uniqueLabel = `${newResource.label}_${counter}`;
          while (existingLabels.includes(uniqueLabel)) {
            counter++;
            uniqueLabel = `${newResource.label}_${counter}`;
          }
          newResource.label = uniqueLabel;
        }
        existingConfig.rate_limit_resources.push(newResource);
      }
      break;

    case 'input':
    case 'output':
    case 'buffer':
    case 'metrics':
    case 'tracer':
      // Root level components: replace existing
      Object.assign(existingConfig, newConfigObject);
      break;

    case 'scanner':
      // Scanners are embedded, return as-is for manual handling
      return newConfigObject;

    default:
      // Unknown component type: merge at root level
      Object.assign(existingConfig, newConfigObject);
      break;
  }

  return existingConfig;
};

/**
 * Phase 3: Converts config object to formatted YAML string with schema comments
 */
export const configToYaml = (configObject: any, componentSpec: ConnectComponentSpec): string => {
  try {
    // Stringify to clean YAML
    let yamlString = yamlStringify(configObject, yamlOptions);

    // Add schema comments for the new component
    yamlString = addSchemaComments(yamlString, componentSpec);

    // Add spacing between root-level components for readability
    yamlString = addRootSpacing(yamlString);

    return yamlString;
  } catch (error) {
    console.error('Error converting config to YAML:', error);
    return JSON.stringify(configObject, null, 2);
  }
};

/**
 * Adds schema-based comments to YAML for the specified component
 */
const addSchemaComments = (yamlString: string, componentSpec: ConnectComponentSpec): string => {
  if (!componentSpec.config.children) {
    return yamlString;
  }

  // Create field map for quick lookup
  const fieldMap = new Map<string, ConnectFieldSpec>();
  const addFieldsToMap = (fields: ConnectFieldSpec[], prefix = '') => {
    fields.forEach((field) => {
      const fullName = prefix ? `${prefix}.${field.name}` : field.name;
      fieldMap.set(fullName, field);
      fieldMap.set(field.name, field); // Fallback lookup

      if (field.children) {
        addFieldsToMap(field.children, fullName);
      }
    });
  };

  addFieldsToMap(componentSpec.config.children);

  const lines = yamlString.split('\n');
  const contextStack: string[] = [];
  const indentStack: number[] = [];
  const processedLines: string[] = [];

  lines.forEach((line) => {
    // Skip empty lines and existing comments
    if (!line.trim() || line.trim().startsWith('#') || line.includes('#')) {
      processedLines.push(line);
      return;
    }

    const currentIndent = line.length - line.trimStart().length;
    const keyValueMatch = line.match(/^(\s*)([^:#\n]+):\s*(.*)$/);
    if (!keyValueMatch) {
      processedLines.push(line);
      return;
    }

    const [, indent, key, value] = keyValueMatch;
    const cleanKey = key.trim();

    // Update context stack
    while (indentStack.length > 0 && currentIndent <= indentStack[indentStack.length - 1]) {
      indentStack.pop();
      contextStack.pop();
    }

    const fullPath = contextStack.length > 0 ? `${contextStack.join('.')}.${cleanKey}` : cleanKey;
    const fieldSpec = fieldMap.get(fullPath) || fieldMap.get(cleanKey);

    // Track nesting
    const hasChildren = value.trim() === '' || value.trim() === '{}' || value.trim() === '[]';
    if (hasChildren) {
      contextStack.push(cleanKey);
      indentStack.push(currentIndent);
    }

    if (!fieldSpec) {
      processedLines.push(line);
      return;
    }

    // Generate comment
    let comment = '';
    const isOptional = fieldSpec.default !== undefined || fieldSpec.is_optional === true;

    if (!isOptional) {
      comment = ' # Required (no default)';
    } else if (fieldSpec.default !== undefined) {
      comment = ` # Default: ${JSON.stringify(fieldSpec.default)}`;
    } else {
      comment = ' # Optional';
    }

    // Skip comments for empty structural elements unless required
    if ((value.trim() === '{}' || value.trim() === '[]') && isOptional) {
      comment = '';
    }

    processedLines.push(`${indent}${cleanKey}: ${value}${comment}`);
  });

  return processedLines.join('\n');
};

/**
 * Adds spacing between root-level components for readability
 */
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
    const schemaKey =
      componentType === 'rate_limit' ? 'rate-limits' : componentType === 'metrics' ? 'metrics' : `${componentType}s`;
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
  className: string;
};

export const getComponentTypeConfig = (type: ConnectComponentType): ComponentConfig => {
  switch (type) {
    case 'input':
      return {
        icon: <FolderInput className="h-3 w-3" />,
        text: 'Input',
        variant: 'green' as const,
        className: 'text-green-800 dark:text-green-300',
      };
    case 'output':
      return {
        icon: <FolderOutput className="h-3 w-3" />,
        text: 'Output',
        variant: 'orange' as const,
        className: 'text-orange-800 dark:text-orange-300',
      };
    case 'processor':
      return {
        icon: <Cpu className="h-3 w-3" />,
        text: 'Processor',
        variant: 'blue' as const,
        className: 'text-blue-800 dark:text-blue-300',
      };
    case 'cache':
      return {
        icon: <Database className="h-3 w-3" />,
        text: 'Cache',
        variant: 'purple' as const,
        className: 'text-purple-800 dark:text-purple-300',
      };
    case 'buffer':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: 'Buffer',
        variant: 'indigo' as const,
        className: 'text-indigo-800 dark:text-indigo-300',
      };
    case 'rate_limit':
      return {
        icon: <Timer className="h-3 w-3" />,
        text: 'Rate Limit',
        variant: 'yellow' as const,
        className: 'text-yellow-800 dark:text-yellow-300',
      };
    case 'scanner':
      return {
        icon: <Search className="h-3 w-3" />,
        text: 'Scanner',
        variant: 'cyan' as const,
        className: 'text-cyan-800 dark:text-cyan-300',
      };
    case 'metrics':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Metrics',
        variant: 'teal' as const,
        className: 'text-teal-800 dark:text-teal-300',
      };
    case 'tracer':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Tracer',
        variant: 'rose' as const,
        className: 'text-rose-800 dark:text-rose-300',
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' '),
        variant: 'gray' as const,
        className: 'text-gray-800 dark:text-gray-300',
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
      className: 'text-gray-800 dark:text-gray-300',
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
        className: 'text-green-800 dark:text-green-300',
      };
    case 'output':
      return {
        icon: <FolderOutput className="h-3 w-3" />,
        text: displayText,
        variant: 'orange' as const,
        className: 'text-orange-800 dark:text-orange-300',
      };
    case 'processor':
      return {
        icon: <Cpu className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
        className: 'text-blue-800 dark:text-blue-300',
      };
    case 'cache':
      return {
        icon: <Database className="h-3 w-3" />,
        text: displayText,
        variant: 'purple' as const,
        className: 'text-purple-800 dark:text-purple-300',
      };
    case 'buffer':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: displayText,
        variant: 'indigo' as const,
        className: 'text-indigo-800 dark:text-indigo-300',
      };
    case 'rate_limit':
      return {
        icon: <Timer className="h-3 w-3" />,
        text: displayText,
        variant: 'yellow' as const,
        className: 'text-yellow-800 dark:text-yellow-300',
      };
    case 'scanner':
      return {
        icon: <Search className="h-3 w-3" />,
        text: displayText,
        variant: 'cyan' as const,
        className: 'text-cyan-800 dark:text-cyan-300',
      };
    case 'metrics':
      return {
        icon: <Activity className="h-3 w-3" />,
        text: displayText,
        variant: 'teal' as const,
        className: 'text-teal-800 dark:text-teal-300',
      };
    case 'tracer':
      return {
        icon: <RefreshCw className="h-3 w-3" />,
        text: displayText,
        variant: 'rose' as const,
        className: 'text-rose-800 dark:text-rose-300',
      };
    // Semantic categories
    case 'databases':
      return {
        icon: <Database className="h-3 w-3" />,
        text: displayText,
        variant: 'purple' as const,
        className: 'text-purple-800 dark:text-purple-300',
      };
    case 'messaging':
      return {
        icon: <MessageCircle className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
        className: 'text-blue-800 dark:text-blue-300',
      };
    case 'storage':
      return {
        icon: <HardDrive className="h-3 w-3" />,
        text: displayText,
        variant: 'indigo' as const,
        className: 'text-indigo-800 dark:text-indigo-300',
      };
    case 'api':
      return {
        icon: <Globe className="h-3 w-3" />,
        text: displayText,
        variant: 'green' as const,
        className: 'text-green-800 dark:text-green-300',
      };
    case 'aws':
      return {
        icon: <Cloud className="h-3 w-3" />,
        text: displayText,
        variant: 'orange' as const,
        className: 'text-orange-800 dark:text-orange-300',
      };
    case 'gcp':
      return {
        icon: <Cloud className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
        className: 'text-blue-800 dark:text-blue-300',
      };
    case 'azure':
      return {
        icon: <Cloud className="h-3 w-3" />,
        text: displayText,
        variant: 'cyan' as const,
        className: 'text-cyan-800 dark:text-cyan-300',
      };
    case 'cloud':
      return {
        icon: <Cloud className="h-3 w-3" />,
        text: displayText,
        variant: 'gray' as const,
        className: 'text-gray-800 dark:text-gray-300',
      };
    case 'export':
      return {
        icon: <Download className="h-3 w-3" />,
        text: displayText,
        variant: 'emerald' as const,
        className: 'text-emerald-800 dark:text-emerald-300',
      };
    case 'transformation':
      return {
        icon: <RefreshCw className="h-3 w-3" />,
        text: displayText,
        variant: 'yellow' as const,
        className: 'text-yellow-800 dark:text-yellow-300',
      };
    case 'monitoring':
      return {
        icon: <Activity className="h-3 w-3" />,
        text: displayText,
        variant: 'teal' as const,
        className: 'text-teal-800 dark:text-teal-300',
      };
    case 'windowing':
      return {
        icon: <Monitor className="h-3 w-3" />,
        text: displayText,
        variant: 'purple' as const,
        className: 'text-purple-800 dark:text-purple-300',
      };
    case 'utility':
      return {
        icon: <Wrench className="h-3 w-3" />,
        text: displayText,
        variant: 'amber' as const,
        className: 'text-amber-800 dark:text-amber-300',
      };
    case 'local':
      return {
        icon: <Home className="h-3 w-3" />,
        text: displayText,
        variant: 'green' as const,
        className: 'text-green-800 dark:text-green-300',
      };
    case 'social':
      return {
        icon: <Users className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
        className: 'text-blue-800 dark:text-blue-300',
      };
    case 'network':
      return {
        icon: <Network className="h-3 w-3" />,
        text: displayText,
        variant: 'indigo' as const,
        className: 'text-indigo-800 dark:text-indigo-300',
      };
    case 'integration':
      return {
        icon: <GitBranch className="h-3 w-3" />,
        text: displayText,
        variant: 'emerald' as const,
        className: 'text-emerald-800 dark:text-emerald-300',
      };
    case 'spicedb':
      return {
        icon: <Shield className="h-3 w-3" />,
        text: displayText,
        variant: 'red' as const,
        className: 'text-red-800 dark:text-red-300',
      };
    case 'ai':
      return {
        icon: <Brain className="h-3 w-3" />,
        text: displayText,
        variant: 'purple' as const,
        className: 'text-purple-800 dark:text-purple-300',
      };
    case 'parsing':
      return {
        icon: <FileText className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
        className: 'text-blue-800 dark:text-blue-300',
      };
    case 'mapping':
      return {
        icon: <ArrowRightLeft className="h-3 w-3" />,
        text: displayText,
        variant: 'yellow' as const,
        className: 'text-yellow-800 dark:text-yellow-300',
      };
    case 'composition':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: displayText,
        variant: 'teal' as const,
        className: 'text-teal-800 dark:text-teal-300',
      };
    case 'unstructured':
      return {
        icon: <Hash className="h-3 w-3" />,
        text: displayText,
        variant: 'orange' as const,
        className: 'text-orange-800 dark:text-orange-300',
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
        className: 'text-gray-800 dark:text-gray-300',
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
        className: 'text-emerald-800 dark:text-emerald-300',
      };
    case 'beta':
      return {
        icon: <Clock className="h-3 w-3" />,
        text: 'Beta',
        variant: 'amber' as const,
        className: 'text-amber-800 dark:text-amber-300',
      };
    case 'experimental':
      return {
        icon: <AlertTriangle className="h-3 w-3" />,
        text: 'Experimental',
        variant: 'orange' as const,
        className: 'text-orange-800 dark:text-orange-300',
      };
    case 'deprecated':
      return {
        icon: <XCircle className="h-3 w-3" />,
        text: 'Deprecated',
        variant: 'red' as const,
        className: 'text-red-800 dark:text-red-300',
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: status.charAt(0).toUpperCase() + status.slice(1),
        variant: 'gray' as const,
        className: 'text-gray-800 dark:text-gray-300',
      };
  }
};

/**
 * generates a yaml string for a connect config based on the selected connectionName and connectionType
 * @param existingYaml - optional existing YAML content to merge with
 * @returns yaml string of connect config for the selected connectionName and connectionType
 */
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
  const componentSpec =
    connectionName && connectionType ? getComponentByTypeAndName(connectionType, connectionName) : undefined;

  if (!componentSpec) {
    return undefined;
  }

  // Phase 1: Generate config object for new component
  const newConfigObject = schemaToConfig(componentSpec, showOptionalFields);
  if (!newConfigObject) {
    return undefined;
  }

  // Phase 2 & 3: Merge with existing (if any) and convert to YAML
  if (existingYaml) {
    const mergedConfig = mergeConnectConfigs(existingYaml, newConfigObject, componentSpec);
    return configToYaml(mergedConfig, componentSpec);
  }

  return configToYaml(newConfigObject, componentSpec);
};
