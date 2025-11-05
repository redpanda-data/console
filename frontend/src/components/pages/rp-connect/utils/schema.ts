import { onboardingWizardStore } from 'state/onboarding-wizard-store';

import { isConsumerGroupField, isPasswordField, isSchemaRegistryUrlField, isTopicField, isUserField } from './wizard';
import benthosSchemaFull from '../../../../assets/rp-connect-schema-full.json' with { type: 'json' };
import {
  CRITICAL_CONNECTION_FIELDS,
  convertToScreamingSnakeCase,
  getContextualVariableSyntax,
  getSecretSyntax,
  MANAGED_ONLY_CONNECT_COMPONENTS,
  NON_CRITICAL_CONFIG_OBJECTS,
  REDPANDA_TOPIC_AND_USER_COMPONENTS,
} from '../types/constants';
import {
  type BenthosSchemaFull,
  CONNECT_COMPONENT_TYPE,
  type ConnectComponentSpec,
  type ConnectComponentType,
  type ConnectConfigKey,
  type ConnectConfigObject,
  type RawComponentSpec,
  type RawFieldSpec,
} from '../types/schema';

const convertFieldSpecFromFullSchema = (fieldSpec: RawFieldSpec): RawFieldSpec => {
  const spec: RawFieldSpec = {
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

const createComponentConfigSpec = (component: RawComponentSpec): RawFieldSpec => {
  const config = component.config;

  const configSpec: RawFieldSpec = {
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

const typeToSchemaKey: Record<Exclude<ConnectComponentType, 'custom'>, keyof BenthosSchemaFull> = {
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

const typeToYamlConfigKey: Record<Exclude<ConnectComponentType, 'custom'>, ConnectConfigKey> = {
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
  const schemaData = benthosSchemaFull;
  const allComponents: ConnectComponentSpec[] = [];

  // Parse each component type from flat arrays
  for (const componentType of CONNECT_COMPONENT_TYPE) {
    if (componentType === 'custom') {
      continue;
    }
    const schemaKey = typeToSchemaKey[componentType];
    const componentsArray = schemaData[schemaKey] as RawComponentSpec[] | undefined;

    if (!(componentsArray && Array.isArray(componentsArray))) {
      continue;
    }

    for (const comp of componentsArray) {
      if (MANAGED_ONLY_CONNECT_COMPONENTS.includes(comp.name)) {
        continue;
      }
      const componentSpec: ConnectComponentSpec = {
        name: comp.name,
        type: comp.type as Exclude<ConnectComponentType, 'custom'>,
        status: comp.status || 'stable',
        plugin: comp.plugin,
        summary: comp.summary,
        description: comp.description,
        categories: comp.categories || undefined,
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

const generateRedpandaTopLevelConfig = (): Record<string, unknown> => {
  const userData = onboardingWizardStore.getUserData();
  const redpandaConfig: Record<string, unknown> = {};

  if (userData?.username) {
    const usernameSecretId = `KAFKA_USER_${convertToScreamingSnakeCase(userData.username)}`;
    const passwordSecretId = `KAFKA_PASSWORD_${convertToScreamingSnakeCase(userData.username)}`;

    redpandaConfig.sasl = [
      {
        mechanism: userData.saslMechanism || 'SCRAM-SHA-256',
        username: getSecretSyntax(usernameSecretId),
        password: getSecretSyntax(passwordSecretId),
      },
    ];
  }

  return redpandaConfig;
};

/**
 * Phase 1: Converts a component specification to a config object structure with default values
 * following the Redpanda Connect YAML schema structure
 * @param componentSpec - the component spec to convert to a config object
 * @param showOptionalFields - whether to show optional fields
 * @param showAdvancedFields - whether to show advanced fields
 * @returns Object with config and spec, or undefined
 */
export const schemaToConfig = (
  componentSpec?: ConnectComponentSpec,
  showOptionalFields?: boolean,
  showAdvancedFields?: boolean
): { config: Partial<ConnectConfigObject>; spec: ConnectComponentSpec } | undefined => {
  if (!componentSpec?.config) {
    return;
  }

  const connectionConfig = generateDefaultValue(componentSpec.config, {
    showOptionalFields,
    showAdvancedFields,
    componentName: componentSpec.name,
  });

  const config: Partial<ConnectConfigObject> = {};

  if (componentSpec.name === 'redpanda_common') {
    const redpandaBlockConfig = generateRedpandaTopLevelConfig();

    if (Object.keys(redpandaBlockConfig).length > 0) {
      config.redpanda = redpandaBlockConfig;
    }

    // Structure the component config (topics, consumer_group, etc.)
    switch (componentSpec.type) {
      case 'input':
      case 'output':
        config[typeToYamlConfigKey[componentSpec.type]] = {
          [componentSpec.name]: connectionConfig,
        };
        break;
      default:
        break;
    }

    return { config, spec: componentSpec };
  }

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
      return {
        config: { [componentSpec.name]: connectionConfig },
        spec: componentSpec,
      };

    default:
      break;
  }

  return { config, spec: componentSpec };
};

function populateWizardFields(spec: RawFieldSpec, componentName?: string): string | string[] | undefined {
  if (!spec.name) {
    return undefined;
  }

  const topicData = onboardingWizardStore.getTopicData();
  const userData = onboardingWizardStore.getUserData();

  // Populate topic fields
  if (isTopicField(spec.name) && topicData?.topicName) {
    return spec.kind === 'array' ? [topicData.topicName] : topicData.topicName;
  }

  // Populate consumer group fields (only for input components)
  if (isConsumerGroupField(spec.name) && userData?.consumerGroup) {
    return userData.consumerGroup;
  }

  // For Redpanda components with username in session storage, inject secret references
  if (componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName) && userData?.username) {
    // Username field: use secret reference instead of plain text
    if (isUserField(spec.name)) {
      const usernameSecretId = `KAFKA_USER_${convertToScreamingSnakeCase(userData.username)}`;
      return getSecretSyntax(usernameSecretId);
    }

    // Password field: use secret reference
    if (isPasswordField(spec.name)) {
      const passwordSecretId = `KAFKA_PASSWORD_${convertToScreamingSnakeCase(userData.username)}`;
      return getSecretSyntax(passwordSecretId);
    }
  }

  return undefined;
}

/**
 * Populates fields with Redpanda contextual variables for supported components
 * @param spec - Field specification
 * @param componentName - Component name to check if contextual variables should be used
 * @param parentName - Parent field name for context-sensitive checks (e.g., schema_registry.url)
 * @returns Contextual variable syntax or undefined
 */
function populateContextualVariables(
  spec: RawFieldSpec,
  componentName?: string,
  parentName?: string
): string | string[] | undefined {
  if (!(spec.name && componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName))) {
    return undefined;
  }

  // Schema Registry URL within schema_registry object
  if (isSchemaRegistryUrlField(spec.name, parentName)) {
    return getContextualVariableSyntax('REDPANDA_SCHEMA_REGISTRY_URL');
  }

  return undefined;
}

/**
 * Populates connection defaults for REDPANDA_SECRET_COMPONENTS
 * These are reasonable defaults for Redpanda Cloud connections:
 * - TLS enabled: true (Redpanda Cloud requires TLS)
 * - SASL mechanism: from session storage or default to SCRAM-SHA-256
 *
 * @param spec - Field specification
 * @param componentName - Component name
 * @param parentName - Parent field name for context
 * @returns Default value or undefined
 */
function populateConnectionDefaults(
  spec: RawFieldSpec,
  componentName?: string,
  parentName?: string
): string | boolean | string[] | undefined {
  if (!(spec.name && componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName))) {
    return undefined;
  }

  // SASL mechanism from session storage or default to SCRAM-SHA-256
  const isMechanismField = spec.name.toLowerCase() === 'mechanism' && parentName?.toLowerCase() === 'sasl';
  if (isMechanismField) {
    const userData = onboardingWizardStore.getUserData();
    return userData?.saslMechanism || 'SCRAM-SHA-256';
  }

  return undefined;
}

function shouldHideField(params: {
  spec: RawFieldSpec;
  showOptionalFields: boolean;
  showAdvancedFields: boolean;
  componentName: string | undefined;
}): boolean {
  const { spec, showOptionalFields, showAdvancedFields, componentName } = params;

  const isRedpandaComponent = componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName);
  const isCriticalRedpandaField = isRedpandaComponent && spec.name && CRITICAL_CONNECTION_FIELDS.has(spec.name);
  const isExplicitlyRequired = spec.is_optional === false;
  const isExplicitlyOptional = spec.is_optional === true;
  const isImplicitlyRequired = spec.is_optional === undefined && spec.default === undefined;
  const isExplicitlyAdvanced = spec.is_advanced === true;
  const isNonCriticalRedpandaField = isRedpandaComponent && spec.name && NON_CRITICAL_CONFIG_OBJECTS.has(spec.name);

  if (isCriticalRedpandaField) {
    return false;
  }

  // this is a really wierd edge case where the schema doesn't match the docs, and this is the only consistent way to show "common" fields
  if (isExplicitlyRequired || isImplicitlyRequired || !isExplicitlyAdvanced) {
    return false;
  }

  if (showAdvancedFields && isExplicitlyAdvanced) {
    return false;
  }

  if (showOptionalFields && isExplicitlyOptional) {
    return false;
  }

  if (isExplicitlyAdvanced) {
    return true;
  }

  if (isExplicitlyOptional) {
    return true;
  }

  if (isNonCriticalRedpandaField) {
    return true;
  }

  return true;
}

function generateObjectValue(
  spec: RawFieldSpec,
  showOptionalFields: boolean | undefined,
  showAdvancedFields: boolean | undefined,
  componentName: string | undefined
): Record<string, unknown> | undefined {
  if (!spec.children) {
    return {};
  }

  const obj = {} as Record<string, unknown>;

  for (const child of spec.children) {
    const childValue = generateDefaultValue(child, {
      showOptionalFields,
      showAdvancedFields,
      componentName,
      parentName: spec.name,
    });

    if (childValue !== undefined && child.name) {
      obj[child.name] = childValue;
    }
  }

  return obj;
}

function generateArrayValue(params: {
  spec: RawFieldSpec;
  showOptionalFields: boolean;
  showAdvancedFields: boolean;
  componentName: string | undefined;
}): unknown[] | undefined {
  const { spec, showOptionalFields, showAdvancedFields, componentName } = params;
  // Special case: SASL arrays for redpanda/kafka_franz components
  const isSaslArray = spec.name?.toLowerCase() === 'sasl';
  if (isSaslArray && spec.children && componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName)) {
    const saslObj = {} as Record<string, unknown>;

    for (const child of spec.children) {
      const childValue = generateDefaultValue(child, {
        showOptionalFields,
        showAdvancedFields,
        componentName,
        parentName: spec.name,
      });
      if (childValue !== undefined && child.name) {
        saslObj[child.name] = childValue;
      }
    }

    // Always return SASL array if we have any values (mechanism will be populated by populateConnectionDefaults)
    if (Object.keys(saslObj).length > 0) {
      return [saslObj];
    }
  }

  return [];
}

function generateScalarValue(spec: RawFieldSpec, options: GenerateDefaultValueOptions): unknown {
  const { showOptionalFields, showAdvancedFields, componentName } = options;
  switch (spec.type) {
    case 'string':
      return '';
    case 'int':
    case 'float':
      return 0;
    case 'bool':
      return false;
    case 'object':
      return generateObjectValue(spec, showOptionalFields, showAdvancedFields, componentName) ?? {};
    default:
      return '';
  }
}

interface GenerateDefaultValueOptions {
  showOptionalFields?: boolean;
  showAdvancedFields?: boolean;
  componentName?: string;
  parentName?: string;
}

export function generateDefaultValue(
  spec: RawFieldSpec,
  options?: GenerateDefaultValueOptions
): RawFieldSpec['default'] {
  const { showOptionalFields, showAdvancedFields, componentName, parentName } = options || {};

  const isCriticalField = spec.name ? CRITICAL_CONNECTION_FIELDS.has(spec.name) : false;
  const isExplicitlyRequired = spec.is_optional === false;
  const isExplicitlyOptional = spec.is_optional === true;
  const isImplicitlyRequired = spec.is_optional === undefined && spec.default === undefined;
  const hasNonEmptyDefault = spec.default !== undefined && spec.default !== '';

  if (hasNonEmptyDefault && isExplicitlyRequired) {
    spec.comment = `Required (default: ${JSON.stringify(spec.default)})`;
  } else if ((isExplicitlyRequired || isImplicitlyRequired) && spec.name !== 'seed_brokers') {
    spec.comment = 'Required';
  } else if (hasNonEmptyDefault && isExplicitlyOptional) {
    spec.comment = `Optional (default: ${JSON.stringify(spec.default)})`;
  } else if (isExplicitlyOptional || isCriticalField) {
    spec.comment = 'Optional';
  } else if (spec.name === 'seed_brokers') {
    spec.comment = 'Optional';
  }

  // Try wizard data population first for Redpanda secret components
  if (componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName)) {
    const wizardValue = populateWizardFields(spec, componentName);
    if (wizardValue !== undefined) {
      return wizardValue;
    }

    // Then try contextual variables for supported components
    const contextualValue = populateContextualVariables(spec, componentName, parentName);
    if (contextualValue !== undefined) {
      return contextualValue;
    }

    // Then try connection defaults (TLS enabled, SASL mechanism)
    const connectionDefault = populateConnectionDefaults(spec, componentName, parentName);
    if (connectionDefault !== undefined) {
      return connectionDefault;
    }
  }

  // Check if field should be hidden
  if (
    shouldHideField({
      spec,
      showOptionalFields: showOptionalFields ?? false,
      showAdvancedFields: showAdvancedFields ?? false,
      componentName,
    })
  ) {
    return undefined;
  }

  // Return default if available
  if (spec.default !== undefined) {
    return spec.default;
  }

  // Generate value based on field kind
  switch (spec.kind) {
    case 'scalar':
      return generateScalarValue(spec, options || {});
    case 'array':
      return generateArrayValue({
        spec,
        showOptionalFields: showOptionalFields ?? false,
        showAdvancedFields: showAdvancedFields ?? false,
        componentName,
      });
    case '2darray':
      return [];
    case 'map':
      return {};
    default:
      return undefined;
  }
}
