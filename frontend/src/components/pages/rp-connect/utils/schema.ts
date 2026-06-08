import { ConnectError } from '@connectrpc/connect';
import {
  type ComponentList,
  type ComponentSpec,
  ComponentStatus,
  type FieldSpec,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { toast } from 'sonner';
import { rpcnWizardStore } from 'state/rpcn-wizard-store';
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

/** Maps component type to its plural proto ComponentList key and its YAML config key. */
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

const typeToYamlConfigKey: Record<Exclude<ConnectComponentType, 'custom'>, ConnectConfigKey> = Object.fromEntries(
  Object.entries(COMPONENT_TYPE_MAPPINGS).map(([type, { yamlKey }]) => [type, yamlKey])
) as Record<Exclude<ConnectComponentType, 'custom'>, ConnectConfigKey>;

/** `type` scopes the search to one list to disambiguate names shared across types (e.g. `redpanda`). Omitted = first match. */
export function findComponentByName(
  componentList: ComponentList,
  name: string,
  type?: Exclude<ConnectComponentType, 'custom'>
): ComponentSpec | undefined {
  const mappings = type ? [COMPONENT_TYPE_MAPPINGS[type]] : Object.values(COMPONENT_TYPE_MAPPINGS);
  for (const { listKey } of mappings) {
    const list = componentList[listKey] as ComponentSpec[] | undefined;
    if (!list) {
      continue;
    }
    const found = list.find((c) => c.name === name);
    if (found) {
      return found;
    }
  }
  return;
}

/** Walks a dotted field path (e.g. `tls.cert_file`) through a FieldSpec children tree. */
export function resolveFieldByPath(root: FieldSpec | undefined, path: string): FieldSpec | undefined {
  if (!(root && path)) {
    return;
  }
  let current: FieldSpec | undefined = root;
  for (const segment of path.split('.')) {
    current = current?.children?.find((c) => c.name === segment);
    if (!current) {
      return;
    }
  }
  return current;
}

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
  const userData = rpcnWizardStore.getUserData();
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

/** Converts a component spec into a default-valued config object following the Connect YAML schema. */
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
      // Scanners are embedded in inputs, so return the config directly.
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

  const topicData = rpcnWizardStore.getTopicData();
  const userData = rpcnWizardStore.getUserData();

  if (isTopicField(spec.name) && topicData?.topicName) {
    return spec.kind === 'array' ? [topicData.topicName] : topicData.topicName;
  }

  if (isConsumerGroupField(spec.name) && userData?.consumerGroup) {
    return userData.consumerGroup;
  }

  // Only inject user/password secret refs in SASL context, to avoid leaking into TLS client_certs.
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

/** Populates fields with Redpanda contextual variables (e.g. schema_registry.url) for supported components. */
function populateContextualVariables(
  spec: RawFieldSpec,
  componentName?: string,
  parentName?: string
): string | string[] | undefined {
  if (!(spec.name && componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName))) {
    return;
  }

  if (isSchemaRegistryUrlField(spec.name, parentName)) {
    return getContextualVariableSyntax('REDPANDA_SCHEMA_REGISTRY_URL');
  }

  return;
}

/** Redpanda Cloud connection defaults: TLS enabled, SASL mechanism from session or SCRAM-SHA-256. */
function populateConnectionDefaults(
  spec: RawFieldSpec,
  componentName?: string,
  parentName?: string
): string | boolean | string[] | Record<string, unknown> | undefined {
  if (!(spec.name && componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName))) {
    return;
  }

  // { enabled: true } bypasses child generation, so no client_certs/password leak.
  if (spec.name === 'tls' && spec.type === 'object') {
    return { enabled: true };
  }

  const isMechanismField = spec.name.toLowerCase() === 'mechanism' && parentName?.toLowerCase() === 'sasl';
  if (isMechanismField) {
    const userData = rpcnWizardStore.getUserData();
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
    const userData = rpcnWizardStore.getUserData();
    return !!userData?.username;
  }

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
  // Pass only this node's optionality; a non-optional child under an optional parent
  // starts a fresh required boundary rather than inheriting the grandparent's.
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
  // Pass only this node's optionality (see generateObjectValue).
  const childAncestorOptional = spec.optional === true;
  // Special case: SASL arrays for redpanda/kafka_franz components.
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

    if (Object.keys(saslObj).length > 0) {
      return [saslObj];
    }
  }

  // Object arrays: empty arrays are truthy, so guard on length.
  if (spec.children && spec.children.length > 0) {
    const obj = generateObjectValue(spec, showAdvancedFields, componentName);
    return obj && Object.keys(obj).length > 0 ? [obj] : [];
  }

  // Primitive arrays: return a placeholder element for proper YAML/Bloblang formatting.
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
  // Backend serializes [] / {} defaults as JSON strings for structured kinds.
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
 * Mirrors the backend's CheckRequired() with workarounds for proto serialization gaps.
 * Several branches exist because the backend drops defaults during serialization and we
 * can't distinguish "no default" from "lost default"; when in doubt we treat as not required.
 */
export function checkRequired(spec: RawFieldSpec, ancestorOptional?: boolean): boolean {
  if (spec.optional === true) {
    return false;
  }
  // Deprecated fields drop their defaults in the schema; never force a phased-out field.
  if (spec.deprecated === true) {
    return false;
  }
  // Non-scalar under an optional ancestor: a collection default ([]/{}) was likely lost in proto.
  // Scalars are still evaluated normally.
  if (ancestorOptional && spec.kind !== 'scalar') {
    return false;
  }
  if (spec.defaultValue && spec.defaultValue !== '') {
    return false;
  }
  // Non-string types lose their defaults in proto (0/false/[] → ""), so can't be deemed required.
  if (spec.type !== 'string') {
    return false;
  }
  // optional unset but defaultValue present (even "") means the backend acknowledged a default.
  if (spec.optional === undefined && spec.defaultValue !== undefined) {
    return false;
  }
  // Advanced non-scalar fields typically had defaults that were lost in serialization.
  if (spec.kind !== 'scalar' && spec.advanced) {
    return false;
  }
  if (!spec.children?.length) {
    return true;
  }
  // Object: required if any child is required.
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

  // For Redpanda secret components, auto-population wins over optional/advanced flags.
  if (isRedpandaComponent(componentName)) {
    const wizardValue = populateWizardFields(spec, componentName, parentName);
    if (wizardValue !== undefined) {
      return wizardValue;
    }

    const contextualValue = populateContextualVariables(spec, componentName, parentName);
    if (contextualValue !== undefined) {
      return contextualValue;
    }

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

  if (!shouldShow) {
    return;
  }

  // Objects build structure from children, so they never use the required sentinel.
  if (checkRequired(spec, ancestorOptional) && spec.type !== 'object') {
    spec.comment = `Required - ${getRequiredFieldTypeHint(spec)}, must be manually set`;
    return SENTINEL_REQUIRED_FIELD;
  }
  // Skip empty-string defaults for object/array/map/2darray (placeholder) so we build the real structure.
  if (
    spec.defaultValue !== undefined &&
    !(
      spec.defaultValue === '' &&
      (spec.type === 'object' || spec.kind === 'array' || spec.kind === 'map' || spec.kind === '2darray')
    )
  ) {
    const converted = convertDefaultValue(spec.defaultValue, spec.type, spec.kind);
    // undefined here (empty string for non-string) falls through to kind-based generation.
    if (converted !== undefined) {
      return converted;
    }
  }

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
      // Array of arrays with a placeholder for proper YAML/Bloblang formatting.
      if (spec.children) {
        const obj = generateObjectValue(spec, showAdvancedFields, componentName);
        generatedValue = obj && Object.keys(obj).length > 0 ? [[obj]] : [[]];
      } else {
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
      generatedValue = {};
      break;
    default:
      generatedValue = undefined;
  }

  return generatedValue;
}
