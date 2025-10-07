import { parseDocument, stringify as yamlStringify } from 'yaml';
import benthosSchema from '../../../../assets/rp-connect-schema-full.json';
import { CONNECT_WIZARD_TOPIC_KEY, CONNECT_WIZARD_USER_KEY } from '../../../../state/connect/state';
import {
  CONNECT_COMPONENT_TYPE,
  type ConnectComponentSpec,
  type ConnectComponentType,
  type ConnectFieldSpec,
  type ConnectNodeCategory,
  type ExtendedConnectComponentSpec,
} from '../types/schema';
import type { AddTopicFormData, AddUserFormData } from '../types/wizard';
import { getCategoryDisplayName } from './categories';

/**
 * Components that support Redpanda secret population from wizard
 * Includes Kafka-compatible components and Redpanda migrator tools
 */
const REDPANDA_SECRET_COMPONENTS = [
  'kafka',
  'kafka_franz',
  'redpanda',
  'redpanda_common',
  'redpanda_migrator',
  'redpanda_migrator_bundle',
  'redpanda_migrator_offsets',
];

/**
 * Fields that are critical for connection and should always be shown
 * even when they have defaults
 */
const CRITICAL_CONNECTION_FIELDS = new Set(['addresses', 'seed_brokers', 'topics', 'topic', 'brokers']);

/**
 * Configuration object fields that should be hidden for REDPANDA_SECRET_COMPONENTS
 * when wizard data exists (unless showOptionalFields is true)
 */
const NON_CRITICAL_CONFIG_OBJECTS = new Set(['tls', 'metadata', 'batching', 'backoff', 'retry']);

/**
 * Converts a field spec from the full schema format to ConnectFieldSpec
 */
const convertFieldSpecFromFullSchema = (fieldSpec: any): ConnectFieldSpec => {
  const spec: ConnectFieldSpec = {
    name: fieldSpec.name || '',
    type: fieldSpec.type || 'unknown',
    kind: fieldSpec.kind || 'scalar',
    description: fieldSpec.description,
    is_advanced: fieldSpec.is_advanced,
    is_deprecated: fieldSpec.is_deprecated,
    is_optional: fieldSpec.is_optional,
    is_secret: fieldSpec.is_secret,
    default: fieldSpec.default,
    interpolated: fieldSpec.interpolated,
    bloblang: fieldSpec.bloblang,
    examples: fieldSpec.examples,
    annotated_options: fieldSpec.annotated_options,
    options: fieldSpec.options,
    version: fieldSpec.version,
    linter: fieldSpec.linter,
    scrubber: fieldSpec.scrubber,
  };

  if (fieldSpec.children && Array.isArray(fieldSpec.children)) {
    spec.children = fieldSpec.children.map(convertFieldSpecFromFullSchema);
  }

  return spec;
};

/**
 * Creates a ConnectFieldSpec for a component's config from the full schema format
 */
const createComponentConfigSpec = (component: any): ConnectFieldSpec => {
  const config = component.config;

  const configSpec: ConnectFieldSpec = {
    name: component.name,
    type: 'object',
    kind: 'scalar',
    children: [],
  };

  if (config?.children && Array.isArray(config.children)) {
    configSpec.children = config.children.map(convertFieldSpecFromFullSchema);
  }

  return configSpec;
};

/**
 * Phase 0: Parses benthos schema and returns all components with metadata
 */
const parseSchema = () => {
  const schemaData = benthosSchema as any;
  const allComponents: ConnectComponentSpec[] = [];

  // Map component types to schema array keys
  const typeToSchemaKey: Record<string, string> = {
    input: 'inputs',
    output: 'outputs',
    processor: 'processors',
    cache: 'caches',
    buffer: 'buffers',
    rate_limit: 'rate-limits',
    scanner: 'scanners',
    metrics: 'metrics',
    tracer: 'tracers',
  };

  // Parse each component type from flat arrays
  for (const componentType of CONNECT_COMPONENT_TYPE) {
    const schemaKey = typeToSchemaKey[componentType];
    const componentsArray = schemaData[schemaKey];

    if (!componentsArray || !Array.isArray(componentsArray)) {
      continue;
    }

    for (const comp of componentsArray) {
      const componentSpec: ConnectComponentSpec = {
        name: comp.name,
        type: comp.type as ConnectComponentType,
        status: comp.status || 'stable',
        plugin: comp.plugin || false,
        summary: comp.summary || `${comp.name} ${comp.type}`,
        description: comp.description || `${comp.name} ${comp.type} component`,
        categories: comp.categories || null,
        config: createComponentConfigSpec(comp),
        version: comp.version || '1.0.0',
      };

      allComponents.push(componentSpec);
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
  // Pass component name for secret population logic
  const connectionConfig = generateDefaultValue(componentSpec.config, showOptionalFields, componentSpec.name);

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
  componentSpec: ConnectComponentSpec,
) => {
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

    case 'scanner': {
      // Scanners are embedded within input configurations
      // Find the input node and merge the scanner into it
      const inputNode = doc.get('input');
      if (!inputNode) {
        console.warn('Cannot add scanner: no input found in existing YAML');
        return doc;
      }

      // Get the input type (first key under input)
      const inputObj = inputNode.toJSON?.() || {};
      const inputType = Object.keys(inputObj)[0];
      if (!inputType) {
        console.warn('Cannot add scanner: input type not found');
        return doc;
      }

      // Scanner config is returned as { scannerName: scannerConfig }
      const scannerName = Object.keys(newConfigObject)[0];
      const scannerConfig = newConfigObject[scannerName];

      // Get the new scanner from the commented Document (or fallback to plain object)
      const newScannerNode = newDoc?.get(scannerName);

      // Set the scanner within the input
      doc.setIn(['input', inputType, 'scanner'], newScannerNode || scannerConfig);
      break;
    }

    default:
      // Unknown component type: merge at root level
      // Use commented nodes from newDoc if available
      for (const [key] of Object.entries(newConfigObject)) {
        const newNode = newDoc?.get(key);
        doc.set(key, newNode || newConfigObject[key]);
      }
      break;
  }

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

      yamlString = addSchemaComments(yamlString, componentSpec);

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
 * Matches: 'topic' (outputs/cache) or 'topics' (inputs)
 */
const isTopicField = (fieldName: string): boolean => {
  const normalizedName = fieldName.toLowerCase();
  return normalizedName === 'topic' || normalizedName === 'topics';
};

/**
 * Checks if a field name is user/authentication-related
 * Matches: 'user' (kafka sasl) or 'username' (redpanda sasl)
 */
const isUserField = (fieldName: string): boolean => {
  const normalized = fieldName.toLowerCase();
  return normalized === 'user' || normalized === 'username';
};

/**
 * Checks if a field name is password-related
 * Matches: 'password' (nested in sasl object)
 */
const isPasswordField = (fieldName: string): boolean => {
  return fieldName.toLowerCase() === 'password';
};

/**
 * Checks if a ConnectFieldSpec or its children have wizard-relevant fields
 * Used to determine if advanced/optional fields should be shown
 */
const hasWizardRelevantFields = (spec: ConnectFieldSpec, componentName?: string): boolean => {
  if (!componentName || !REDPANDA_SECRET_COMPONENTS.includes(componentName)) {
    return false;
  }

  const { topicData, userData } = getPersistedWizardData();

  if (isTopicField(spec.name) && topicData?.topicName) return true;
  if (isUserField(spec.name) && userData?.username) return true;
  if (isPasswordField(spec.name) && userData?.username) return true;

  if (spec.children && spec.children.length > 0) {
    for (const child of spec.children) {
      if (hasWizardRelevantFields(child, componentName)) {
        return true;
      }
    }
  }

  return false;
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
  return Array.from(categorySet)
    .sort((a, b) => a.localeCompare(b))
    .map((categoryId) => ({
      id: categoryId,
      name: getCategoryDisplayName(categoryId),
    }));
};

/**
 * Builds a flat map of field names to their specs for quick lookup
 */
const buildFieldMap = (fields: ConnectFieldSpec[] | undefined): Map<string, ConnectFieldSpec> => {
  const map = new Map<string, ConnectFieldSpec>();

  if (!fields) return map;

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

/**
 * Adds helpful schema comments to NEW YAML configs
 * Comments indicate:
 * - "# Required" for required fields without defaults
 * - "# Default: <value>" for fields with default values
 */
const addSchemaComments = (yamlString: string, componentSpec: ConnectComponentSpec): string => {
  const fieldMap = buildFieldMap(componentSpec.config.children);

  if (fieldMap.size === 0) {
    return yamlString;
  }

  const lines = yamlString.split('\n');
  const processedLines: string[] = [];

  lines.forEach((line) => {
    if (!line.trim() || line.trim().startsWith('#') || line.includes('#')) {
      processedLines.push(line);
      return;
    }

    const keyValueMatch = line.match(/^(\s*)([^:#\n]+):\s*(.*)$/);
    if (!keyValueMatch) {
      processedLines.push(line);
      return;
    }

    const [, indent, key, value] = keyValueMatch;
    const cleanKey = key.trim();

    const fieldSpec = fieldMap.get(cleanKey);
    if (!fieldSpec) {
      processedLines.push(line);
      return;
    }

    let comment = '';

    const hasValue = value.trim().length > 0 && value.trim() !== '{}' && value.trim() !== '[]';

    if (hasValue) {
      // Check if field has a default value
      if (fieldSpec.default !== undefined) {
        comment = ` # Default: ${JSON.stringify(fieldSpec.default)}`;
      }
      // Check if field is required (not optional and no default)
      else if (!fieldSpec.is_optional) {
        comment = ' # Required';
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
 * Generates default values from ConnectFieldSpec
 * Populates topic/user fields from session storage when applicable
 * Only populates secrets for Redpanda-compatible components (kafka, kafka_franz, redpanda)
 */
export function generateDefaultValue(
  spec: ConnectFieldSpec,
  showOptionalFields?: boolean,
  componentName?: string,
  insideWizardContext?: boolean,
): unknown {
  if (componentName && REDPANDA_SECRET_COMPONENTS.includes(componentName)) {
    const { topicData, userData } = getPersistedWizardData();

    // Populate topic fields
    if (isTopicField(spec.name) && topicData?.topicName) {
      return spec.kind === 'array' ? [topicData.topicName] : topicData.topicName;
    }

    // Populate username fields
    if (isUserField(spec.name) && userData?.username) {
      return userData.username;
    }

    // Populate password fields (empty string for manual entry)
    if (isPasswordField(spec.name) && userData?.username) {
      return '';
    }
  }

  // Check if this is an advanced field that should be hidden
  // For REDPANDA_SECRET_COMPONENTS, hide non-critical config objects immediately
  const isAdvancedField = spec.is_advanced === true;
  const isNonCriticalConfigObject =
    componentName && REDPANDA_SECRET_COMPONENTS.includes(componentName) && NON_CRITICAL_CONFIG_OBJECTS.has(spec.name);

  // Hide non-critical config objects (tls, metadata, batching, etc.) immediately
  if (isNonCriticalConfigObject && !showOptionalFields) {
    return undefined;
  }

  // Check if field has wizard-relevant data (only for direct wizard fields, not nested)
  const hasWizardData = hasWizardRelevantFields(spec, componentName);

  if (isAdvancedField && !showOptionalFields && !hasWizardData) {
    // Hide advanced fields unless they're required and inside wizard context
    // Fields with empty/falsy defaults are truly optional, fields with meaningful defaults may be required
    const hasEmptyDefault = spec.default === '' || spec.default === null || spec.default === undefined;
    const isEffectivelyOptional = spec.is_optional === true || (hasEmptyDefault && spec.is_optional !== false);
    if (!insideWizardContext || isEffectivelyOptional) {
      return undefined;
    }
  }

  // Check if this is an optional field (non-advanced) that should be hidden
  // Optional fields with defaults should only show when explicitly requested or wizard-relevant
  const isOptionalField = spec.is_optional === true && !isAdvancedField;
  if (isOptionalField && !showOptionalFields && !hasWizardData) {
    return undefined;
  }

  // Treat scalar fields with defaults as optional in certain cases
  // Don't hide arrays/objects here - they're handled below where we can check if they're empty
  const hasDefault = spec.default !== undefined;
  const isScalarDefault = hasDefault && spec.kind === 'scalar' && spec.type !== 'object';
  const isExplicitlyOptional = spec.is_optional === true;
  const isCriticalField = CRITICAL_CONNECTION_FIELDS.has(spec.name);

  if (isScalarDefault && !showOptionalFields && !insideWizardContext) {
    // Always hide explicitly optional fields with defaults
    if (isExplicitlyOptional && !hasWizardData) {
      return undefined;
    }
    // For REDPANDA_SECRET_COMPONENTS, hide non-critical scalar fields with defaults
    if (componentName && REDPANDA_SECRET_COMPONENTS.includes(componentName)) {
      if (!isCriticalField && !hasWizardData) {
        return undefined;
      }
    }
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

            // Get wizard data once for all children (need userData for wizard context check)
            const { userData } =
              componentName && REDPANDA_SECRET_COMPONENTS.includes(componentName)
                ? getPersistedWizardData()
                : { userData: null };

            // Check if THIS object has wizard-relevant children (not just if wizard data exists)
            // Only direct wizard fields (user/password), NOT topic fields at root level
            // Topic/topics are at root level and shouldn't make siblings show in wizard context
            const hasDirectWizardChildren =
              spec.children?.some((child) => {
                // Only user/password fields create wizard context, not topic
                if (isUserField(child.name) && userData?.username) return true;
                if (isPasswordField(child.name) && userData?.username) return true;
                return false;
              }) ?? false;

            // Generate children values
            // Pass wizard context down ONLY if this object has direct user/password children
            // This ensures SASL children get wizard context, but root config children don't
            const inWizardContext = insideWizardContext || hasDirectWizardChildren;
            for (const child of spec.children) {
              const childValue = generateDefaultValue(child, showOptionalFields, componentName, inWizardContext);

              if (childValue !== undefined) {
                obj[child.name] = childValue;
              }
            }

            // Hide empty objects or objects with all optional children if not explicitly required
            const objKeys = Object.keys(obj);
            if (objKeys.length === 0) {
              const shouldHideEmpty =
                (spec.is_optional === true || spec.is_advanced === true) && !showOptionalFields && !hasWizardData;
              if (shouldHideEmpty) {
                return undefined;
              }
            }

            // For REDPANDA_SECRET_COMPONENTS: hide empty objects without wizard-relevant data
            if (componentName && REDPANDA_SECRET_COMPONENTS.includes(componentName) && objKeys.length === 0) {
              // Hide empty objects for Redpanda components when no wizard relevance
              if (!hasWizardData && !showOptionalFields) {
                return undefined;
              }
            }

            return obj;
          }
          return {};
        default:
          return '';
      }
    case 'array': {
      // Special case: SASL arrays for redpanda/kafka_franz components
      // These have children defining the SASL object structure
      const isSaslArray = spec.name.toLowerCase() === 'sasl';
      if (isSaslArray && spec.children && componentName && REDPANDA_SECRET_COMPONENTS.includes(componentName)) {
        const { userData } = getPersistedWizardData();

        // If wizard data exists, generate a single SASL config object
        if (userData?.username) {
          const saslObj = {} as Record<string, unknown>;

          // Pass wizard context to children so they get populated
          const inWizardContext = true;
          for (const child of spec.children) {
            const childValue = generateDefaultValue(child, showOptionalFields, componentName, inWizardContext);
            if (childValue !== undefined) {
              saslObj[child.name] = childValue;
            }
          }

          // Return as single-element array if we have any content
          if (Object.keys(saslObj).length > 0) {
            return [saslObj];
          }
        }
      }

      // Arrays should be hidden if:
      // 1. They're optional or advanced AND
      // 2. showOptionalFields is false AND
      // 3. Not wizard-relevant
      const shouldHideArray =
        (spec.is_optional === true || spec.is_advanced === true) && !showOptionalFields && !hasWizardData;
      if (shouldHideArray) {
        return undefined;
      }
      return [];
    }
    case '2darray':
      return [];
    case 'map':
      return {};
    default:
      return undefined;
  }
}

/**
 * Get all components (built-in + external)
 * Used by connect-tiles.tsx for filtering and yaml.ts for template generation
 */
export const getAllComponents = (additionalComponents?: ExtendedConnectComponentSpec[]): ConnectComponentSpec[] => {
  return [...builtInComponents, ...(additionalComponents || [])];
};
