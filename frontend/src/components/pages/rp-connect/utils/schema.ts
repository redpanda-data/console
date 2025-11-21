import {
  type ComponentList,
  type ComponentSpec,
  ComponentStatus,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { onboardingWizardStore } from 'state/onboarding-wizard-store';

import { isConsumerGroupField, isPasswordField, isSchemaRegistryUrlField, isTopicField, isUserField } from './wizard';
import {
  CRITICAL_CONNECTION_FIELDS,
  convertToScreamingSnakeCase,
  getContextualVariableSyntax,
  getSecretSyntax,
  NON_CRITICAL_CONFIG_OBJECTS,
  REDPANDA_TOPIC_AND_USER_COMPONENTS,
} from '../types/constants';
import type {
  ConnectComponentSpec,
  ConnectComponentType,
  ConnectConfigKey,
  ConnectConfigObject,
  RawFieldSpec,
} from '../types/schema';

// Helper to convert proto ComponentStatus enum to string
export function componentStatusToString(status: ComponentStatus): string {
  switch (status) {
    case ComponentStatus.STABLE:
      return 'stable';
    case ComponentStatus.BETA:
      return 'beta';
    case ComponentStatus.EXPERIMENTAL:
      return 'experimental';
    case ComponentStatus.DEPRECATED:
      return 'deprecated';
    case ComponentStatus.UNSPECIFIED:
      return 'stable';
    default:
      return 'stable';
  }
}

/**
 * Consolidated mapping for component types across different contexts:
 * - listKey: Field name in ComponentList proto (plural)
 * - yamlKey: Key used in YAML config structure
 */
const COMPONENT_TYPE_MAPPINGS: Record<
  Exclude<ConnectComponentType, 'custom'>,
  { listKey: keyof ComponentList; yamlKey: ConnectConfigKey }
> = {
  buffer: { listKey: 'buffers', yamlKey: 'buffer' },
  cache: { listKey: 'caches', yamlKey: 'cache_resources' },
  input: { listKey: 'inputs', yamlKey: 'input' },
  output: { listKey: 'outputs', yamlKey: 'output' },
  processor: { listKey: 'processors', yamlKey: 'pipeline' },
  rate_limit: { listKey: 'rateLimits', yamlKey: 'rate_limit_resources' },
  metrics: { listKey: 'metrics', yamlKey: 'metrics' },
  tracer: { listKey: 'tracers', yamlKey: 'tracer' },
  scanner: { listKey: 'scanners', yamlKey: 'scanner' },
};

// Derived mapping for backward compatibility
const typeToYamlConfigKey: Record<Exclude<ConnectComponentType, 'custom'>, ConnectConfigKey> = Object.fromEntries(
  Object.entries(COMPONENT_TYPE_MAPPINGS).map(([type, { yamlKey }]) => [type, yamlKey])
) as Record<Exclude<ConnectComponentType, 'custom'>, ConnectConfigKey>;

/**
 * Parses ComponentList from API response into ConnectComponentSpec array.
 * Converts proto ComponentSpec to strongly-typed ConnectComponentSpec by overriding the type field.
 */
export const parseSchema = (componentList: ComponentList): ConnectComponentSpec[] =>
  Object.entries(COMPONENT_TYPE_MAPPINGS).flatMap(([componentType, { listKey }]) =>
    ((componentList[listKey] as ComponentSpec[]) || []).map((comp) => ({
      ...comp,
      type: componentType as Exclude<ConnectComponentType, 'custom'>,
      config: comp.config,
    }))
  );

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

  // Critical fields always visible
  const isRedpandaComponent = componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName);
  const isCriticalField = isRedpandaComponent && spec.name && CRITICAL_CONNECTION_FIELDS.has(spec.name);
  if (isCriticalField) {
    return false;
  }

  const isAdvanced = spec.advanced === true;
  const isOptional = spec.optional === true;

  // Hide advanced fields unless explicitly requested
  if (isAdvanced && !showAdvancedFields) {
    return true;
  }

  // Hide optional fields unless explicitly requested
  if (isOptional && !showOptionalFields) {
    return true;
  }

  // Hide non-critical config objects for Redpanda components
  const isNonCriticalConfigObject = isRedpandaComponent && spec.name && NON_CRITICAL_CONFIG_OBJECTS.has(spec.name);
  if (isNonCriticalConfigObject && !showOptionalFields) {
    return true;
  }

  // Show everything else (required, non-advanced, non-optional fields)
  return false;
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

  const obj: Record<string, unknown> = {};

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
    const saslObj: Record<string, unknown> = {};

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
    case 'object': {
      const obj = generateObjectValue(spec, showOptionalFields, showAdvancedFields, componentName);
      return obj && Object.keys(obj).length > 0 ? obj : undefined;
    }
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex field generation logic with many conditions
export function generateDefaultValue(spec: RawFieldSpec, options?: GenerateDefaultValueOptions): unknown {
  const { showOptionalFields, showAdvancedFields, componentName, parentName } = options || {};

  const isCriticalField = spec.name ? CRITICAL_CONNECTION_FIELDS.has(spec.name) : false;
  const isExplicitlyRequired = spec.optional === false;
  const isExplicitlyOptional = spec.optional === true;
  const isImplicitlyRequired = spec.optional === undefined && spec.defaultValue === undefined;
  const hasNonEmptyDefault = spec.defaultValue !== undefined && spec.defaultValue !== '';

  const shouldHide = shouldHideField({
    spec,
    showOptionalFields: !!showOptionalFields,
    showAdvancedFields: !!showAdvancedFields,
    componentName,
  });

  // biome-ignore lint/suspicious/noConsole: Debug logging for field value generation
  console.log('DEBUG [generateDefaultValue] Processing field:', {
    fieldName: spec.name,
    fieldType: spec.type,
    fieldKind: spec.kind,
    hasDefault: !!spec.defaultValue,
    isOptional: spec.optional,
    isAdvanced: spec.advanced,
    shouldHide,
    isCriticalField,
  });

  if (hasNonEmptyDefault && isExplicitlyRequired) {
    spec.comment = `Required (default: ${JSON.stringify(spec.defaultValue)})`;
  } else if ((isExplicitlyRequired || isImplicitlyRequired) && spec.name !== 'seed_brokers') {
    spec.comment = 'Required';
  } else if (hasNonEmptyDefault && isExplicitlyOptional) {
    spec.comment = `Optional (default: ${JSON.stringify(spec.defaultValue)})`;
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
  if (shouldHide) {
    return undefined;
  }

  // Return default if available, but skip empty string defaults for object types
  // (empty string is a placeholder, we want to generate the actual object from children)
  if (spec.defaultValue !== undefined && !(spec.defaultValue === '' && spec.type === 'object')) {
    return spec.defaultValue;
  }

  // Generate value based on field kind
  let generatedValue: unknown;
  switch (spec.kind) {
    case 'scalar':
      generatedValue = generateScalarValue(spec, options || {});
      break;
    case 'array': {
      const arrayValue = generateArrayValue({
        spec,
        showOptionalFields: showOptionalFields ?? false,
        showAdvancedFields: showAdvancedFields ?? false,
        componentName,
      });
      generatedValue = arrayValue && arrayValue.length > 0 ? arrayValue : undefined;
      break;
    }
    case '2darray':
      generatedValue = [];
      break;
    case 'map':
      generatedValue = {};
      break;
    default:
      generatedValue = undefined;
  }

  return generatedValue;
}
