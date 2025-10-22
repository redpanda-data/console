import { onboardingWizardStore } from 'state/onboarding-wizard-store';
import { isFalsy } from 'utils/falsy';

import {
  hasWizardRelevantFields,
  isBrokerField,
  isPasswordField,
  isSchemaRegistryUrlField,
  isTopicField,
  isUserField,
} from './wizard';
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

  const brokers = getContextualVariableSyntax('REDPANDA_BROKERS');
  redpandaConfig.seed_brokers = [brokers];

  redpandaConfig.tls = {
    enabled: true,
  };

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
 * @returns Object with config and spec, or undefined
 */
export const schemaToConfig = (
  componentSpec?: ConnectComponentSpec,
  showOptionalFields?: boolean
): { config: Partial<ConnectConfigObject>; spec: ConnectComponentSpec } | undefined => {
  if (!componentSpec?.config) {
    return;
  }

  const connectionConfig = generateDefaultValue(componentSpec.config, {
    showOptionalFields,
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

function populateWizardFields(spec: RawFieldSpec, componentName?: string): unknown | undefined {
  if (!spec.name) {
    return undefined;
  }

  const topicData = onboardingWizardStore.getTopicData();
  const userData = onboardingWizardStore.getUserData();

  // Populate topic fields
  if (isTopicField(spec.name) && topicData?.topicName) {
    return spec.kind === 'array' ? [topicData.topicName] : topicData.topicName;
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
): unknown | undefined {
  if (!(spec.name && componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName))) {
    return undefined;
  }

  // Broker fields get REDPANDA_BROKERS
  if (isBrokerField(spec.name)) {
    const brokersSyntax = getContextualVariableSyntax('REDPANDA_BROKERS');
    // Array field (e.g., seed_brokers)
    if (spec.kind === 'array') {
      return [brokersSyntax];
    }
    // String field (e.g., addresses as comma-separated)
    return brokersSyntax;
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
): unknown | undefined {
  if (!(spec.name && componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName))) {
    return undefined;
  }

  // TLS enabled should be true for Redpanda Cloud connections
  const isTlsEnabled = spec.name.toLowerCase() === 'enabled' && parentName?.toLowerCase() === 'tls';
  if (isTlsEnabled) {
    return true;
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
  componentName: string | undefined;
  hasWizardData: boolean;
  isExplicitlyRequired: boolean;
  isCriticalField: boolean;
  insideWizardContext: boolean;
}): boolean {
  const {
    spec,
    showOptionalFields,
    componentName,
    hasWizardData,
    isExplicitlyRequired,
    isCriticalField,
    insideWizardContext,
  } = params;

  // never hide critical connection fields for Redpanda components
  if (
    componentName &&
    CRITICAL_CONNECTION_FIELDS.has(spec.name as string) &&
    REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName)
  ) {
    return false;
  }

  // Hide non-critical config objects for REDPANDA_SECRET_COMPONENTS
  const isNonCriticalConfigObject =
    componentName &&
    spec.name &&
    REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName) &&
    NON_CRITICAL_CONFIG_OBJECTS.has(spec.name);

  if (isNonCriticalConfigObject && !showOptionalFields && !isExplicitlyRequired) {
    return true;
  }

  const isAdvancedField = spec.is_advanced === true;
  if (isAdvancedField && !showOptionalFields && !hasWizardData && !isExplicitlyRequired && !isCriticalField) {
    const hasEmptyDefault = isFalsy(spec.default);
    const isEffectivelyOptional = spec.is_optional === true || (hasEmptyDefault && spec.is_optional !== false);
    if (!insideWizardContext || isEffectivelyOptional) {
      return true;
    }
  }

  const isOptionalField = spec.is_optional === true && !isAdvancedField;
  if (isOptionalField && !showOptionalFields && !hasWizardData) {
    return true;
  }

  const hasDefault = spec.default !== undefined;
  const isScalarDefault = hasDefault && spec.kind === 'scalar' && spec.type !== 'object';
  const isExplicitlyOptional = spec.is_optional === true;

  if (isScalarDefault && !showOptionalFields && !insideWizardContext && !isExplicitlyRequired) {
    // Always hide explicitly optional fields with defaults
    if (isExplicitlyOptional && !hasWizardData) {
      return true;
    }
    // For REDPANDA_SECRET_COMPONENTS, hide non-critical scalar fields with defaults
    if (
      componentName &&
      REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName) &&
      !(isCriticalField || hasWizardData)
    ) {
      return true;
    }
  }

  return false;
}

function generateObjectValue(
  spec: RawFieldSpec,
  showOptionalFields: boolean | undefined,
  componentName: string | undefined,
  insideWizardContext: boolean | undefined
): Record<string, unknown> | undefined {
  if (!spec.children) {
    return {};
  }

  const obj = {} as Record<string, unknown>;

  const userData =
    componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName)
      ? onboardingWizardStore.getUserData()
      : undefined;

  const hasDirectWizardChildren =
    spec.children?.some((child) => {
      if (child.name && isUserField(child.name) && userData?.username) {
        return true;
      }
      if (child.name && isPasswordField(child.name) && userData?.username) {
        return true;
      }
      return false;
    }) ?? false;

  const inWizardContext = insideWizardContext || hasDirectWizardChildren;

  const isTlsObject = spec.name?.toLowerCase() === 'tls';
  const isRedpandaComponent = componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName);

  for (const child of spec.children) {
    const childValue = generateDefaultValue(child, {
      showOptionalFields,
      componentName,
      insideWizardContext: inWizardContext,
      parentName: spec.name,
    });

    if (childValue !== undefined && child.name) {
      obj[child.name] = childValue;
    }
  }

  if (isTlsObject && isRedpandaComponent && obj.enabled === undefined) {
    obj.enabled = true;
  }

  const objKeys = Object.keys(obj);
  if (objKeys.length === 0) {
    const isExplicitlyRequired = spec.is_optional === false;
    const hasWizardData = hasWizardRelevantFields(spec, componentName);

    const shouldHideEmpty =
      (spec.is_optional === true || spec.is_advanced === true) &&
      !showOptionalFields &&
      !hasWizardData &&
      !isExplicitlyRequired;

    if (shouldHideEmpty) {
      return undefined;
    }

    // For REDPANDA_SECRET_COMPONENTS: hide empty objects without wizard-relevant data
    if (
      componentName &&
      REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName) &&
      !(hasWizardData || showOptionalFields || isExplicitlyRequired)
    ) {
      return undefined;
    }
  }

  return obj;
}

function generateArrayValue(params: {
  spec: RawFieldSpec;
  showOptionalFields: boolean;
  componentName: string | undefined;
  isExplicitlyRequired: boolean;
  hasWizardData: boolean;
}): unknown[] | undefined {
  const { spec, showOptionalFields, componentName, isExplicitlyRequired, hasWizardData } = params;
  // Special case: SASL arrays for redpanda/kafka_franz components
  const isSaslArray = spec.name?.toLowerCase() === 'sasl';
  if (isSaslArray && spec.children && componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName)) {
    const userData = onboardingWizardStore.getUserData();

    if (userData?.username) {
      const saslObj = {} as Record<string, unknown>;

      for (const child of spec.children) {
        const childValue = generateDefaultValue(child, {
          showOptionalFields,
          componentName,
          insideWizardContext: true,
          parentName: spec.name,
        });
        if (childValue !== undefined && child.name) {
          saslObj[child.name] = childValue;
        }
      }

      if (Object.keys(saslObj).length > 0) {
        return [saslObj];
      }
    }
  }
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

function generateScalarValue(spec: RawFieldSpec, options: GenerateDefaultValueOptions): unknown {
  const { showOptionalFields, componentName, insideWizardContext } = options;
  switch (spec.type) {
    case 'string':
      return '';
    case 'int':
    case 'float':
      return 0;
    case 'bool':
      return false;
    case 'object':
      return generateObjectValue(spec, showOptionalFields, componentName, insideWizardContext) ?? {};
    default:
      return '';
  }
}

interface GenerateDefaultValueOptions {
  showOptionalFields?: boolean;
  componentName?: string;
  insideWizardContext?: boolean;
  parentName?: string;
}

export function generateDefaultValue(
  spec: RawFieldSpec,
  options?: GenerateDefaultValueOptions
): RawFieldSpec['default'] {
  const { showOptionalFields, componentName, insideWizardContext, parentName } = options || {};

  const isCriticalField = spec.name ? CRITICAL_CONNECTION_FIELDS.has(spec.name) : false;
  const isExplicitlyRequired = spec.is_optional === false;

  // Don't add comments for empty string defaults
  const hasNonEmptyDefault = spec.default !== undefined && spec.default !== '';

  if (hasNonEmptyDefault && isExplicitlyRequired) {
    spec.comment = `Required (default: ${JSON.stringify(spec.default)})`;
  } else if (isExplicitlyRequired) {
    spec.comment = 'Required';
  } else if (hasNonEmptyDefault) {
    spec.comment = `Optional (default: ${JSON.stringify(spec.default)})`;
  } else if (isCriticalField) {
    // Critical fields that are optional with no default
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

  const hasWizardData = hasWizardRelevantFields(spec, componentName);

  // Check if field should be hidden
  if (
    shouldHideField({
      spec,
      showOptionalFields: showOptionalFields ?? false,
      componentName,
      hasWizardData,
      isExplicitlyRequired,
      isCriticalField,
      insideWizardContext: insideWizardContext ?? false,
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
        componentName,
        isExplicitlyRequired,
        hasWizardData,
      });
    case '2darray':
      return [];
    case 'map':
      return {};
    default:
      return undefined;
  }
}
