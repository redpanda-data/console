import { ConnectError } from '@connectrpc/connect';
import {
  type ComponentList,
  type ComponentSpec,
  ComponentStatus,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { toast } from 'sonner';
import { onboardingWizardStore } from 'state/onboarding-wizard-store';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { isConsumerGroupField, isPasswordField, isSchemaRegistryUrlField, isTopicField, isUserField } from './wizard';
import {
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
 * @param showAdvancedFields - whether to show advanced fields
 * @returns Object with config and spec, or undefined
 */
export const schemaToConfig = (
  componentSpec?: ConnectComponentSpec,
  showAdvancedFields?: boolean
): { config: Partial<ConnectConfigObject>; spec: ConnectComponentSpec } | undefined => {
  if (!componentSpec?.config) {
    return;
  }

  const connectionConfig = generateDefaultValue(componentSpec.config, {
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

function populateWizardFields(
  spec: RawFieldSpec,
  componentName?: string,
  parentName?: string
): string | string[] | undefined {
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
  // Only inject user/password in SASL context to prevent leaking into TLS client_certs
  const isSaslContext = parentName?.toLowerCase() === 'sasl';
  if (
    componentName &&
    REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName) &&
    userData?.username &&
    isSaslContext
  ) {
    if (isUserField(spec.name)) {
      const usernameSecretId = `KAFKA_USER_${convertToScreamingSnakeCase(userData.username)}`;
      return getSecretSyntax(usernameSecretId);
    }

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
): string | boolean | string[] | Record<string, unknown> | undefined {
  if (!(spec.name && componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName))) {
    return;
  }

  // TLS: return { enabled: true } for Redpanda Cloud (bypasses child generation — no client_certs, no password leak)
  if (spec.name === 'tls' && spec.type === 'object') {
    return { enabled: true };
  }

  // SASL mechanism from session storage or default to SCRAM-SHA-256
  const isMechanismField = spec.name.toLowerCase() === 'mechanism' && parentName?.toLowerCase() === 'sasl';
  if (isMechanismField) {
    const userData = onboardingWizardStore.getUserData();
    return userData?.saslMechanism || 'SCRAM-SHA-256';
  }

  return;
}

const isRedpandaComponent = (name?: string): boolean => !!name && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(name);

function shouldShowField(params: {
  spec: RawFieldSpec;
  showAdvancedFields: boolean;
  componentName: string | undefined;
}): boolean {
  const { spec, showAdvancedFields, componentName } = params;

  // Redpanda SASL: show when wizard has user data (even though it's advanced)
  if (isRedpandaComponent(componentName) && spec.name === 'sasl') {
    const userData = onboardingWizardStore.getUserData();
    return !!userData?.username;
  }

  // Hide advanced fields unless requested
  if (spec.advanced && !showAdvancedFields) {
    return false;
  }

  return true;
}

function generateObjectValue(
  spec: RawFieldSpec,
  showAdvancedFields: boolean | undefined,
  componentName: string | undefined
): Record<string, unknown> | undefined {
  if (!spec.children) {
    return {};
  }

  const obj: Record<string, unknown> = {};
  // Only pass optionality from this node — don't propagate grandparent's optionality.
  // A non-optional child under an optional parent establishes a new "required boundary":
  // its own children follow normal required rules.
  const childAncestorOptional = spec.optional === true;

  for (const child of spec.children) {
    const childValue = generateDefaultValue(child, {
      showAdvancedFields,
      componentName,
      parentName: spec.name,
      ancestorOptional: childAncestorOptional,
    });

    if (childValue !== undefined && child.name) {
      obj[child.name] = childValue;
    }
  }

  return obj;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
function generateArrayValue(params: {
  spec: RawFieldSpec;
  showAdvancedFields: boolean;
  componentName: string | undefined;
  ancestorOptional?: boolean;
}): unknown[] | undefined {
  const { spec, showAdvancedFields, componentName } = params;
  // Only pass optionality from this node — same as generateObjectValue.
  const childAncestorOptional = spec.optional === true;
  // Special case: SASL arrays for redpanda/kafka_franz components
  const isSaslArray = spec.name?.toLowerCase() === 'sasl';
  if (isSaslArray && spec.children && componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName)) {
    const saslObj: Record<string, unknown> = {};

    for (const child of spec.children) {
      const childValue = generateDefaultValue(child, {
        showAdvancedFields,
        componentName,
        parentName: spec.name,
        ancestorOptional: childAncestorOptional,
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
    const obj = generateObjectValue(spec, showAdvancedFields, componentName);
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
  const { showAdvancedFields, componentName } = options;
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
      const obj = generateObjectValue(spec, showAdvancedFields, componentName);
      return obj && Object.keys(obj).length > 0 ? obj : undefined;
    }
    default:
      return '';
  }
}

type GenerateDefaultValueOptions = {
  showAdvancedFields?: boolean;
  componentName?: string;
  parentName?: string;
  ancestorOptional?: boolean;
};

/**
 * Converts string default values to their proper types.
 * Returns undefined for empty-string defaults on non-string types.
 */
function convertDefaultValue(defaultValue: string, type: string, kind?: string): unknown {
  // Empty string is not a meaningful default for non-string types
  if (defaultValue === '' && type !== 'string') {
    return;
  }
  if (type === 'bool') {
    return defaultValue === 'true';
  }
  if (type === 'int' || type === 'float') {
    const num = Number(defaultValue);
    return Number.isNaN(num) ? defaultValue : num;
  }
  // For structured kinds (array, map, 2darray), try JSON.parse
  // The backend serializes defaults like [] or {} as JSON strings in the proto
  if (kind === 'array' || kind === 'map' || kind === '2darray') {
    try {
      const parsed = JSON.parse(defaultValue);
      if (Array.isArray(parsed) || (typeof parsed === 'object' && parsed !== null)) {
        return parsed;
      }
    } catch {
      // Not valid JSON, fall through to return as string
    }
  }
  return defaultValue;
}

export const SENTINEL_REQUIRED_FIELD = '__REQUIRED_FIELD__';

/**
 * Determines if a field should be marked as required.
 * Mirrors backend's CheckRequired() with workarounds for proto serialization gaps.
 *
 * ancestorOptional only suppresses non-scalar kinds (array, map, 2darray) because the backend
 * loses collection defaults ([] → "", {} → "") during proto serialization. Scalar fields under
 * optional parents are still evaluated normally — if they look required, they are required.
 */
export function checkRequired(spec: RawFieldSpec, ancestorOptional?: boolean): boolean {
  // Explicitly optional → not required
  if (spec.optional === true) {
    return false;
  }
  // Ancestor is optional AND field is non-scalar: proto likely lost a collection default
  // (e.g., include_prefixes had default: [] which became ""). Suppress required marking.
  // Scalar fields are NOT suppressed — they're genuinely required if they have no default.
  if (ancestorOptional && spec.kind !== 'scalar') {
    return false;
  }
  // Has a surviving non-empty default → not required
  if (spec.defaultValue && spec.defaultValue !== '') {
    return false;
  }
  // Non-string types: backend drops defaults (int 0 → "", bool false → "", array [] → "")
  // Can't distinguish "no default" from "lost default", so treat as not required
  if (spec.type !== 'string') {
    return false;
  }
  // When optional flag is absent (proto didn't set it) but defaultValue was provided (even ""),
  // the backend acknowledged a default exists — treat as not required.
  // Only fields with explicit optional: false OR no defaultValue at all can be required.
  if (spec.optional === undefined && spec.defaultValue !== undefined) {
    return false;
  }
  // Advanced non-scalar fields typically have defaults that were lost in proto serialization
  if (spec.kind !== 'scalar' && spec.advanced) {
    return false;
  }
  // Leaf field without default → required
  if (!spec.children?.length) {
    return true;
  }
  // Object with children: required if any child is required
  return spec.children.some((c) => checkRequired(c));
}

function getRequiredFieldTypeHint(spec: RawFieldSpec): string {
  const typeLabel = (() => {
    switch (spec.type) {
      case 'int':
        return 'integer';
      case 'float':
        return 'number';
      case 'bool':
        return 'boolean';
      case 'unknown':
        return 'value';
      default:
        return spec.type; // 'string', 'object'
    }
  })();
  switch (spec.kind) {
    case 'array':
      return `${typeLabel} list`;
    case '2darray':
      return `${typeLabel} nested list`;
    case 'map':
      return 'key-value map';
    default:
      return typeLabel;
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex field generation logic with many conditions
export function generateDefaultValue(spec: RawFieldSpec, options?: GenerateDefaultValueOptions): unknown {
  const { showAdvancedFields, componentName, parentName, ancestorOptional } = options || {};

  // Try wizard data population first for Redpanda secret components
  // If these succeed, the field is relevant regardless of optional/advanced flags
  if (isRedpandaComponent(componentName)) {
    const wizardValue = populateWizardFields(spec, componentName, parentName);
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
    showAdvancedFields: !!showAdvancedFields,
    componentName,
  });

  // Early exit if field should not be shown (and wasn't auto-populated above)
  if (!shouldShow) {
    return;
  }

  // Mark field as required if checkRequired determines it should be, skipping objects
  // (objects generate structure from children, not sentinel values)
  if (checkRequired(spec, ancestorOptional) && spec.type !== 'object') {
    spec.comment = `Required - ${getRequiredFieldTypeHint(spec)}, must be manually set`;
    return SENTINEL_REQUIRED_FIELD;
  }
  // Return default if available, but skip empty string defaults for object/array/map/2darray types
  // (empty string is a placeholder, we want to generate the actual structure from children)
  if (
    spec.defaultValue !== undefined &&
    !(
      spec.defaultValue === '' &&
      (spec.type === 'object' || spec.kind === 'array' || spec.kind === 'map' || spec.kind === '2darray')
    )
  ) {
    const converted = convertDefaultValue(spec.defaultValue, spec.type, spec.kind);
    // If convertDefaultValue returned undefined (empty string for non-string), fall through to kind-based generation
    if (converted !== undefined) {
      return converted;
    }
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
        showAdvancedFields: showAdvancedFields ?? false,
        componentName,
        ancestorOptional,
      });
      generatedValue = arrayValue && arrayValue.length > 0 ? arrayValue : undefined;
      break;
    }
    case '2darray':
      // Generate array of arrays with placeholder for proper YAML/Bloblang formatting
      if (spec.children) {
        const obj = generateObjectValue(spec, showAdvancedFields, componentName);
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
      // Empty map for all types
      generatedValue = {};
      break;
    default:
      generatedValue = undefined;
  }

  return generatedValue;
}
