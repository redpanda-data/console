import { isFalsy } from 'utils/falsy';
import { type Document, parseDocument, stringify as yamlStringify } from 'yaml';

import { getPersistedWizardData, hasWizardRelevantFields, isPasswordField, isTopicField, isUserField } from './wizard';
import {
  addRootSpacing,
  addSchemaComments,
  mergeCacheResource,
  mergeProcessor,
  mergeRateLimitResource,
  mergeRootComponent,
  mergeScanner,
} from './yaml';
import benthosSchema from '../../../../assets/rp-connect-schema-full.json' with { type: 'json' };
import {
  CRITICAL_CONNECTION_FIELDS,
  NON_CRITICAL_CONFIG_OBJECTS,
  REDPANDA_SECRET_COMPONENTS,
} from '../types/constants';
import {
  type BenthosSchema,
  CONNECT_COMPONENT_TYPE,
  type ConnectComponentSpec,
  type ConnectComponentType,
  type ConnectConfigObject,
  type ConnectFieldSpec,
  type RawComponentSpec,
  type RawFieldSpec,
} from '../types/schema';

/**
 * Converts a field spec from the full schema format to ConnectFieldSpec
 */
const convertFieldSpecFromFullSchema = (fieldSpec: RawFieldSpec): ConnectFieldSpec => {
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
const createComponentConfigSpec = (component: RawComponentSpec): ConnectFieldSpec => {
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

const typeToSchemaKey: Record<ConnectComponentType, keyof BenthosSchema> = {
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

// Maps component types to YAML config keys (different from schema keys)
const typeToYamlConfigKey: Record<ConnectComponentType, string> = {
  input: 'input',
  output: 'output',
  processor: 'pipeline',
  cache: 'cache_resources',
  buffer: 'buffer',
  rate_limit: 'rate_limit_resources',
  scanner: 'scanner',
  metrics: 'metrics',
  tracer: 'tracer',
};

/**
 * Phase 0: Parses benthos schema and returns all components with metadata
 * @returns all components with metadata
 */
const parseSchema = () => {
  const schemaData = benthosSchema as BenthosSchema;
  const allComponents: ConnectComponentSpec[] = [];

  // Parse each component type from flat arrays
  for (const componentType of CONNECT_COMPONENT_TYPE) {
    const schemaKey = typeToSchemaKey[componentType];
    const componentsArray = schemaData[schemaKey] as RawComponentSpec[] | undefined;

    if (!(componentsArray && Array.isArray(componentsArray))) {
      continue;
    }

    for (const comp of componentsArray) {
      const componentSpec: ConnectComponentSpec = {
        name: comp.name,
        type: comp.type as ConnectComponentType,
        status: comp.status || 'stable',
        plugin: comp.plugin,
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

// Singleton cache for parsed components (lazy-loaded to avoid circular dependencies)
let _builtInComponentsCache: ConnectComponentSpec[] | undefined;

/**
 * Gets built-in components, parsing schema on first call and caching result
 * This lazy initialization prevents circular dependency issues during module loading
 */
export const getBuiltInComponents = (): ConnectComponentSpec[] => {
  if (!_builtInComponentsCache) {
    _builtInComponentsCache = parseSchema();
  }
  return _builtInComponentsCache;
};

/**
 * Phase 1: Converts a component specification to a config object structure with default values
 * following the Redpanda Connect YAML schema structure
 * @param componentSpec - the component spec to convert to a config object
 * @param showOptionalFields - whether to show optional fields
 * @returns ConnectConfigObject or undefined
 */
export const schemaToConfig = (
  componentSpec?: ConnectComponentSpec,
  showOptionalFields?: boolean
): ConnectConfigObject | undefined => {
  if (!componentSpec?.config) {
    return;
  }

  const connectionConfig = generateDefaultValue(componentSpec.config, showOptionalFields, componentSpec.name);

  const config: ConnectConfigObject = {};

  // Structure the config according to Redpanda Connect YAML schema
  switch (componentSpec.type) {
    case 'input':
    case 'output':
    case 'buffer':
    case 'metrics':
    case 'tracer':
      config[typeToYamlConfigKey[componentSpec.type]] = {
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

    case 'cache':
    case 'rate_limit':
      config[typeToYamlConfigKey[componentSpec.type]] = [
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
 * @param existingYaml - the existing YAML content to merge with
 * @param newConfigObject - the new config object to merge
 * @param componentSpec - the component spec to merge
 * @returns Document.Parsed or ConnectConfigObject
 */
export const mergeConnectConfigs = (
  existingYaml: string,
  newConfigObject: ConnectConfigObject,
  componentSpec: ConnectComponentSpec
): Document.Parsed | ConnectConfigObject | undefined => {
  if (!existingYaml.trim()) {
    return newConfigObject;
  }

  let doc: Document.Parsed;
  try {
    doc = parseDocument(existingYaml);
  } catch (_error) {
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
  } catch (_error) {
    // Fallback to plain object if YAML generation fails
    newYamlWithComments = '';
  }

  // Parse the new YAML as a Document to extract commented nodes
  let newDoc: Document.Parsed | undefined;
  if (newYamlWithComments) {
    try {
      newDoc = parseDocument(newYamlWithComments);
    } catch (_error) {
      // Parsing failed, newDoc remains undefined
    }
  }

  switch (componentSpec.type) {
    case 'processor': {
      mergeProcessor(doc, newDoc, newConfigObject);
      break;
    }

    case 'cache': {
      mergeCacheResource(doc, newDoc, newConfigObject);
      break;
    }

    case 'rate_limit': {
      mergeRateLimitResource(doc, newDoc, newConfigObject);
      break;
    }

    case 'input':
    case 'output':
    case 'buffer':
    case 'metrics':
    case 'tracer': {
      mergeRootComponent(doc, newDoc, newConfigObject);
      break;
    }

    case 'scanner': {
      mergeScanner(doc, newDoc, newConfigObject);
      break;
    }

    default:
      mergeRootComponent(doc, newDoc, newConfigObject);
      break;
  }

  return doc;
};

/**
 * Phase 3: Converts config object to formatted YAML string
 * @param configObject - the config object to convert to a yaml string
 * @param componentSpec - the component spec to add schema comments to
 * @returns yaml string
 */
export const configToYaml = (
  configObject: Document.Parsed | ConnectConfigObject | undefined,
  componentSpec: ConnectComponentSpec
): string => {
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
  } catch (_error) {
    return JSON.stringify(configObject, null, 2);
  }
};

/**
 * Phase 4: Generates a yaml string for a connect config and merges it into existing yaml based on the selected connectionName and connectionType
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
    const mergedConfig = mergeConnectConfigs(existingYaml, newConfigObject, componentSpec);
    return configToYaml(mergedConfig, componentSpec);
  }

  return configToYaml(newConfigObject, componentSpec);
};

// ===============================
// Helper functions
// ===============================

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: It's a complex function..
export function generateDefaultValue(
  spec: ConnectFieldSpec,
  showOptionalFields?: boolean,
  componentName?: string,
  insideWizardContext?: boolean
): unknown {
  // IMPORTANT: Determine if this field is truly required
  const isExplicitlyRequired = spec.is_optional === false;
  const isCriticalField = CRITICAL_CONNECTION_FIELDS.has(spec.name);

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
  // BUT never hide explicitly required fields
  if (isNonCriticalConfigObject && !showOptionalFields && !isExplicitlyRequired) {
    return undefined;
  }

  // Check if field has wizard-relevant data (only for direct wizard fields, not nested)
  const hasWizardData = hasWizardRelevantFields(spec, componentName);

  if (isAdvancedField && !showOptionalFields && !hasWizardData && !isExplicitlyRequired) {
    // Hide advanced fields unless they're required and inside wizard context
    // Fields with empty/falsy defaults are truly optional, fields with meaningful defaults may be required
    const hasEmptyDefault = isFalsy(spec.default);
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

  if (isScalarDefault && !showOptionalFields && !insideWizardContext && !isExplicitlyRequired) {
    // Always hide explicitly optional fields with defaults
    if (isExplicitlyOptional && !hasWizardData) {
      return undefined;
    }
    // For REDPANDA_SECRET_COMPONENTS, hide non-critical scalar fields with defaults
    if (componentName && REDPANDA_SECRET_COMPONENTS.includes(componentName) && !(isCriticalField || hasWizardData)) {
      return undefined;
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
                if (isUserField(child.name) && userData?.username) {
                  return true;
                }
                if (isPasswordField(child.name) && userData?.username) {
                  return true;
                }
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
                (spec.is_optional === true || spec.is_advanced === true) &&
                !showOptionalFields &&
                !hasWizardData &&
                !isExplicitlyRequired;
              if (shouldHideEmpty) {
                return undefined;
              }
            }

            // For REDPANDA_SECRET_COMPONENTS: hide empty objects without wizard-relevant data
            // BUT never hide explicitly required objects
            if (
              componentName &&
              REDPANDA_SECRET_COMPONENTS.includes(componentName) &&
              objKeys.length === 0 &&
              !(hasWizardData || showOptionalFields || isExplicitlyRequired)
            ) {
              return undefined;
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
      // 3. Not wizard-relevant AND
      // 4. Not explicitly required
      const shouldHideArray =
        (spec.is_optional === true || spec.is_advanced === true) &&
        !showOptionalFields &&
        !hasWizardData &&
        !isExplicitlyRequired;
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
      return;
  }
}
