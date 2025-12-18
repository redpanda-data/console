import { ConnectError } from '@connectrpc/connect';
import {
  type ComponentList,
  type ComponentSpec,
  ComponentStatus,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { toast } from 'sonner';
import { onboardingWizardStore } from 'state/onboarding-wizard-store';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import {
  hasWizardRelevantFields,
  isConsumerGroupField,
  isPasswordField,
  isSchemaRegistryUrlField,
  isTopicField,
  isUserField,
} from './wizard';
import {
  CRITICAL_CONNECTION_FIELDS,
  convertToScreamingSnakeCase,
  getContextualVariableSyntax,
  getSecretSyntax,
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
 * Returns empty array and shows toast notification on error.
 */
export function parseSchema(componentList: ComponentList): ConnectComponentSpec[] {
  try {
    return Object.entries(COMPONENT_TYPE_MAPPINGS).flatMap(([componentType, { listKey }]) =>
      ((componentList[listKey] as ComponentSpec[]) || []).map((comp) => ({
        ...comp,
        type: componentType as Exclude<ConnectComponentType, 'custom'>,
        config: comp.config,
      }))
    );
  } catch (error) {
    toast.error(
      formatToastErrorMessageGRPC({
        error: ConnectError.from(error),
        action: 'Parse component schema',
        entity: 'Component list',
      })
    );
    return [];
  }
}

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
      config[typeToYamlConfigKey[componentSpec.type]] = {
        label: '',
        [componentSpec.name]: connectionConfig,
      };
      break;
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
    return;
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

  return;
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
    return;
  }

  // Schema Registry URL within schema_registry object
  if (isSchemaRegistryUrlField(spec.name, parentName)) {
    return getContextualVariableSyntax('REDPANDA_SCHEMA_REGISTRY_URL');
  }

  return;
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
    return;
  }

  // SASL mechanism from session storage or default to SCRAM-SHA-256
  const isMechanismField = spec.name.toLowerCase() === 'mechanism' && parentName?.toLowerCase() === 'sasl';
  if (isMechanismField) {
    const userData = onboardingWizardStore.getUserData();
    return userData?.saslMechanism || 'SCRAM-SHA-256';
  }

  return;
}

function shouldShowField(params: {
  spec: RawFieldSpec;
  showOptionalFields: boolean;
  showAdvancedFields: boolean;
  componentName: string | undefined;
}): boolean {
  const { spec, showOptionalFields, showAdvancedFields, componentName } = params;

  // Critical fields always visible (for REDPANDA_TOPIC_AND_USER_COMPONENTS)
  const isRedpandaComponent = componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName);
  const isCriticalField = isRedpandaComponent && spec.name && CRITICAL_CONNECTION_FIELDS.has(spec.name);

  // Special case: SASL only shows if wizard user data exists
  if (isCriticalField && spec.name === 'sasl') {
    const userData = onboardingWizardStore.getUserData();
    return !!userData?.username;
  }

  if (isCriticalField) {
    return true;
  }

  // Show fields that can be populated by wizard data
  if (hasWizardRelevantFields(spec, componentName)) {
    return true;
  }

  const isAdvanced = spec.advanced === true;
  const isOptional = spec.optional === true;
  const hasNonEmptyDefault = spec.defaultValue !== undefined && spec.defaultValue !== '';

  // Show fields with defaults that aren't explicitly optional or advanced
  if (hasNonEmptyDefault && !isOptional && !isAdvanced) {
    return true;
  }

  // Don't show advanced fields unless explicitly requested
  if (isAdvanced && !showAdvancedFields) {
    return false;
  }

  // Don't show optional fields unless explicitly requested
  if (isOptional && !showOptionalFields) {
    return false;
  }

  // Show everything else (required, non-advanced, non-optional fields)
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

  // Handle object arrays (arrays with children)
  // Check for non-empty children array (empty arrays are truthy!)
  if (spec.children && spec.children.length > 0) {
    const obj = generateObjectValue(spec, showOptionalFields, showAdvancedFields, componentName);
    // Return array with placeholder object only if object has fields
    return obj && Object.keys(obj).length > 0 ? [obj] : [];
  }

  // Handle primitive arrays (string, int, float, bool, unknown)
  // Always return array with placeholder element for proper YAML/Bloblang formatting
  switch (spec.type) {
    case 'string':
      return [''];
    case 'int':
    case 'float':
      return [0];
    case 'bool':
      return [false];
    case 'unknown':
      return [null];
    default:
      // Fallback for any other type (component types, etc.)
      return [''];
  }
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
    case 'unknown':
      return null;
    case 'object': {
      const obj = generateObjectValue(spec, showOptionalFields, showAdvancedFields, componentName);
      return obj && Object.keys(obj).length > 0 ? obj : undefined;
    }
    default:
      return '';
  }
}

type GenerateDefaultValueOptions = {
  showOptionalFields?: boolean;
  showAdvancedFields?: boolean;
  componentName?: string;
  parentName?: string;
};

/**
 * Converts string default values to their proper types
 */
function convertDefaultValue(defaultValue: string, type: string): unknown {
  if (type === 'bool') {
    return defaultValue === 'true';
  }
  if (type === 'int' || type === 'float') {
    const num = Number(defaultValue);
    return Number.isNaN(num) ? defaultValue : num;
  }
  return defaultValue;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex field generation logic with many conditions
export function generateDefaultValue(spec: RawFieldSpec, options?: GenerateDefaultValueOptions): unknown {
  const { showOptionalFields, showAdvancedFields, componentName, parentName } = options || {};

  const isRedpandaComponent = componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName);
  const isCriticalField = spec.name && isRedpandaComponent && CRITICAL_CONNECTION_FIELDS.has(spec.name);
  const isExplicitlyRequired = spec.optional === false;
  const isExplicitlyOptional = spec.optional === true;
  const isImplicitlyRequired = spec.optional === undefined && spec.defaultValue === undefined;
  const hasNonEmptyDefault = spec.defaultValue !== undefined && spec.defaultValue !== '';

  // Try wizard data population first for Redpanda secret components
  // If these succeed, the field is relevant regardless of optional/advanced flags
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

  const shouldShow = shouldShowField({
    spec,
    showOptionalFields: !!showOptionalFields,
    showAdvancedFields: !!showAdvancedFields,
    componentName,
  });

  // Early exit if field should not be shown (and wasn't auto-populated above)
  if (!shouldShow) {
    return;
  }

  // Special comment handling for conditional and optional fields
  if (spec.name === 'topics') {
    spec.comment = 'Required if regexp_topics and regexp_topics_include are not configured';
  } else if (spec.name === 'regexp_topics') {
    spec.comment = 'Required if topics is not configured';
  } else if (spec.name === 'regexp_topics_include') {
    spec.comment = 'Required if topics is not configured';
  } else if (spec.name === 'consumer_group') {
    spec.comment = 'Required if topic partition is not specified';
  } else if (spec.name === 'key' || spec.name === 'partition') {
    spec.comment = 'Optional';
  } else if (hasNonEmptyDefault) {
    // Always show default if present, regardless of required/optional status
    const convertedValue = convertDefaultValue(spec.defaultValue, spec.type);
    const formattedDefault =
      spec.type === 'bool' || spec.type === 'int' || spec.type === 'float'
        ? convertedValue
        : JSON.stringify(spec.defaultValue);

    if (isExplicitlyRequired || isImplicitlyRequired) {
      spec.comment = `Required (default: ${formattedDefault})`;
    } else if (isExplicitlyOptional) {
      spec.comment = `Optional (default: ${formattedDefault})`;
    } else {
      // Neither explicitly required nor optional - just show the default
      spec.comment = `Default: ${formattedDefault}`;
    }
  } else if (isExplicitlyRequired || isImplicitlyRequired) {
    spec.comment = 'Required';
  } else if (isExplicitlyOptional || isCriticalField) {
    spec.comment = 'Optional';
  }

  // Return default if available, but skip empty string defaults for object/array types
  // (empty string is a placeholder, we want to generate the actual structure from children)
  // Arrays need to generate their structure even with empty defaultValue
  if (
    spec.defaultValue !== undefined &&
    !(spec.defaultValue === '' && (spec.type === 'object' || spec.kind === 'array'))
  ) {
    // Apply type conversion
    return convertDefaultValue(spec.defaultValue, spec.type);
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
      // Generate array of arrays with placeholder for proper YAML/Bloblang formatting
      if (spec.children) {
        const obj = generateObjectValue(spec, showOptionalFields, showAdvancedFields, componentName);
        generatedValue = obj && Object.keys(obj).length > 0 ? [[obj]] : [[]];
      } else {
        // Primitive 2darray based on type
        switch (spec.type) {
          case 'string':
            generatedValue = [['']];
            break;
          case 'int':
          case 'float':
            generatedValue = [[0]];
            break;
          case 'bool':
            generatedValue = [[false]];
            break;
          case 'unknown':
            generatedValue = [[null]];
            break;
          default:
            generatedValue = [['']];
        }
      }
      break;
    case 'map':
      // Generate map with single placeholder entry for better YAML visibility
      switch (spec.type) {
        case 'string':
          generatedValue = { key: '' };
          break;
        case 'int':
        case 'float':
          generatedValue = { key: 0 };
          break;
        case 'bool':
          generatedValue = { key: false };
          break;
        case 'unknown':
          generatedValue = { key: null };
          break;
        case 'object':
          if (spec.children) {
            const obj = generateObjectValue(spec, showOptionalFields, showAdvancedFields, componentName);
            generatedValue = obj && Object.keys(obj).length > 0 ? { key: obj } : {};
          } else {
            generatedValue = {};
          }
          break;
        default:
          generatedValue = { key: '' };
      }
      break;
    default:
      generatedValue = undefined;
  }

  return generatedValue;
}
