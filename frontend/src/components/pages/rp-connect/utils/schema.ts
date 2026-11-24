import { ConnectError } from '@connectrpc/connect';
import {
  type ComponentList,
  type ComponentSpec,
  ComponentStatus,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { toast } from 'sonner';
import { rpcnWizardStore } from 'state/rpcn-wizard-store';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { isConsumerGroupField, isPasswordField, isSchemaRegistryUrlField, isTopicField, isUserField } from './wizard';
import {
  getContextualVariableSyntax,
  getSecretSyntax,
  REDPANDA_TOPIC_AND_USER_COMPONENTS,
  userSecretIds,
} from '../types/constants';
import type {
  ConnectComponentSpec,
  ConnectComponentType,
  ConnectConfigKey,
  ConnectConfigObject,
  RawFieldSpec,
} from '../types/schema';
import { CONNECT_COMPONENT_TYPE } from '../types/schema';

export function componentStatusToString(status: ComponentStatus) {
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
) {
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
}

/**
 * Walks a dotted field path (e.g. `tls.cert_file`) through a field-spec children tree.
 * Plain proto FieldSpec trees are accepted too (structurally assignable to RawFieldSpec).
 */
export function resolveFieldByPath(root: RawFieldSpec | undefined, path: string) {
  if (!(root && path)) {
    return;
  }
  let current: RawFieldSpec | undefined = root;
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

const generateRedpandaTopLevelConfig = () => {
  const userData = rpcnWizardStore.getUserData();
  const redpandaConfig: Record<string, unknown> = {};

  if (userData?.username) {
    const secretIds = userSecretIds(userData.username);

    redpandaConfig.sasl = [
      {
        mechanism: userData.saslMechanism || 'SCRAM-SHA-256',
        username: getSecretSyntax(secretIds.username),
        password: getSecretSyntax(secretIds.password),
      },
    ];
  }

  return redpandaConfig;
};

/** Converts a component spec into a default-valued config object following the Connect YAML schema. */
export const schemaToConfig = (componentSpec?: ConnectComponentSpec, showAdvancedFields?: boolean) => {
  if (!componentSpec?.config) {
    return;
  }

  const connectionConfig = generateDefaultValue(componentSpec.config, {
    showAdvancedFields,
    componentName: componentSpec.name,
  });

  const config =
    componentSpec.name === 'redpanda_common'
      ? redpandaCommonConfig(componentSpec, connectionConfig)
      : componentSectionConfig(componentSpec, connectionConfig);
  return { config, spec: componentSpec };
};

function redpandaCommonConfig(componentSpec: ConnectComponentSpec, connectionConfig: unknown) {
  const config: Partial<ConnectConfigObject> = {};
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

  return config;
}

function componentSectionConfig(componentSpec: ConnectComponentSpec, connectionConfig: unknown) {
  const config: Partial<ConnectConfigObject> = {};

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
      return { [componentSpec.name]: connectionConfig };

    default:
      break;
  }

  return config;
}

function populateWizardFields(spec: RawFieldSpec, componentName?: string, parentName?: string) {
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

  // WARNING: Inject secret references only in SASL; TLS client certificates must not acquire SASL credentials.
  if (
    componentName &&
    REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName) &&
    userData?.username &&
    parentName?.toLowerCase() === 'sasl'
  ) {
    return saslSecretRef(spec.name, userData.username);
  }
}

function saslSecretRef(fieldName: string, username: string) {
  if (isUserField(fieldName)) {
    return getSecretSyntax(userSecretIds(username).username);
  }

  if (isPasswordField(fieldName)) {
    return getSecretSyntax(userSecretIds(username).password);
  }
}

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
}

function populateConnectionDefaults(
  spec: RawFieldSpec,
  componentName?: string,
  parentName?: string
): string | boolean | string[] | Record<string, unknown> | undefined {
  if (!(spec.name && componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName))) {
    return;
  }

  if (spec.name === 'tls' && spec.type === 'object') {
    return { enabled: true };
  }

  const isMechanismField = spec.name.toLowerCase() === 'mechanism' && parentName?.toLowerCase() === 'sasl';
  if (isMechanismField) {
    const userData = rpcnWizardStore.getUserData();
    return userData?.saslMechanism || 'SCRAM-SHA-256';
  }
}

const isRedpandaComponent = (name?: string) => !!name && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(name);

function shouldShowField(params: {
  spec: RawFieldSpec;
  showAdvancedFields: boolean;
  componentName: string | undefined;
}) {
  const { spec, showAdvancedFields, componentName } = params;

  if (spec.deprecated) {
    return false;
  }

  if (isRedpandaComponent(componentName) && spec.name === 'sasl') {
    const userData = rpcnWizardStore.getUserData();
    return !!userData?.username;
  }

  return !(spec.advanced && !showAdvancedFields);
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
  // WARNING: Use the immediate parent's optionality; inheriting a grandparent's flag changes required-field handling inside an existing object.
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

function generateObjectArrayValue(
  spec: RawFieldSpec,
  showAdvancedFields: boolean | undefined,
  componentName: string | undefined
) {
  const obj = generateObjectValue(spec, showAdvancedFields, componentName);
  const values: unknown[] | undefined = obj && Object.keys(obj).length > 0 ? [obj] : undefined;
  return values;
}

type GenerateDefaultValueOptions = {
  showAdvancedFields?: boolean;
  componentName?: string;
  parentName?: string;
  ancestorOptional?: boolean;
};

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
  if (kind === 'array' || kind === 'map' || kind === '2darray') {
    return parseStructuredDefault(defaultValue);
  }
  return defaultValue;
}

function parseStructuredDefault(defaultValue: string): unknown {
  try {
    const parsed = JSON.parse(defaultValue);
    if (Array.isArray(parsed) || (typeof parsed === 'object' && parsed !== null)) {
      return parsed;
    }
  } catch {}
  return defaultValue;
}

export const SENTINEL_REQUIRED_FIELD = '__REQUIRED_FIELD__';

/**
 * Whether a field must be set by the user.
 *
 * Authoritative signal is `requiredBySchema`, stamped from the raw config schema's `required`
 * arrays, which the backend computes knowing every default. Without it (dataplane predating flag
 * serialization, or a call site lacking the raw schema) fall back to the proto flags but stay
 * conservative: the proto serializes only string defaults, so a non-string field with an empty
 * `defaultValue` is far more likely a lost default than a required field. Known cost of that mode —
 * string fields whose real default is "" show as required.
 */
export function checkRequired(spec: RawFieldSpec, ancestorOptional?: boolean): boolean {
  if (spec.deprecated === true) {
    return false;
  }
  if (spec.requiredBySchema !== undefined) {
    return spec.requiredBySchema;
  }
  if (spec.optional === true || spec.defaultValue || mayHaveLostDefault(spec, ancestorOptional)) {
    return false;
  }
  if (!spec.children?.length) {
    return true;
  }
  return spec.children.some((c) => checkRequired(c));
}

function mayHaveLostDefault(spec: RawFieldSpec, ancestorOptional?: boolean) {
  return (
    (Boolean(ancestorOptional) && spec.kind !== 'scalar') ||
    // WARNING: Do not infer non-string required fields from an empty proto default; serialization also drops false, zero, and empty collections.
    spec.type !== 'string' ||
    (spec.kind !== 'scalar' && Boolean(spec.advanced))
  );
}

const SCALAR_FIELD_TYPES = new Set<string>(['string', 'int', 'float', 'bool']);

const COMPONENT_FIELD_TYPES = new Set<string>(CONNECT_COMPONENT_TYPE.filter((t) => t !== 'custom'));

export function fieldHasOptions(spec: RawFieldSpec) {
  return (spec.annotatedOptions?.length ?? 0) > 0;
}

export function isResourceRefField(spec: RawFieldSpec) {
  return (
    Boolean(spec.name) &&
    spec.kind === 'scalar' &&
    (spec.type === 'cache' || spec.type === 'rate_limit') &&
    !(spec.children?.length ?? 0)
  );
}

export function isScalarField(spec: RawFieldSpec) {
  return (
    Boolean(spec.name) &&
    spec.kind === 'scalar' &&
    (SCALAR_FIELD_TYPES.has(spec.type) || fieldHasOptions(spec) || isResourceRefField(spec))
  );
}

export function isScalarArrayField(spec: RawFieldSpec) {
  return Boolean(spec.name) && spec.kind === 'array' && SCALAR_FIELD_TYPES.has(spec.type) && !fieldHasOptions(spec);
}

export function isObjectGroupField(spec: RawFieldSpec) {
  return (
    Boolean(spec.name) &&
    (spec.kind === 'scalar' || (spec.kind === '' && spec.type === 'object')) &&
    (spec.children?.length ?? 0) > 0
  );
}

export function isComponentField(spec: RawFieldSpec) {
  return Boolean(spec.name) && COMPONENT_FIELD_TYPES.has(spec.type) && !isResourceRefField(spec);
}

/** Fields rendered as form controls; deprecated fields, nested components, and complex fields */
export function isFormField(spec: RawFieldSpec) {
  return (
    !(spec.deprecated || isComponentField(spec)) &&
    (isScalarField(spec) || isScalarArrayField(spec) || isObjectGroupField(spec))
  );
}

/** Finds a parsed component spec by name; `type` disambiguates names shared across types (e.g. `redpanda`). */
export function findConnectComponent(components: ConnectComponentSpec[], name: string, type?: ConnectComponentType) {
  return components.find((c) => (type === undefined || c.type === type) && c.name === name);
}

function getRequiredFieldTypeHint(spec: RawFieldSpec) {
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
        return spec.type;
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

/**
 * The component root always emits its schema shape, including [] for an empty list or {} for a fieldless object.
 */
export function generateDefaultValue(spec: RawFieldSpec, options: GenerateDefaultValueOptions = {}): unknown {
  const { showAdvancedFields, componentName, parentName } = options;

  const populated = isRedpandaComponent(componentName)
    ? populateRedpandaValue(spec, componentName, parentName)
    : undefined;
  if (populated !== undefined) {
    return populated;
  }

  if (!shouldShowField({ spec, showAdvancedFields: !!showAdvancedFields, componentName })) {
    return;
  }

  return generateShownFieldValue(spec, options);
}

function populateRedpandaValue(spec: RawFieldSpec, componentName?: string, parentName?: string) {
  const value: unknown =
    populateWizardFields(spec, componentName, parentName) ??
    populateContextualVariables(spec, componentName, parentName) ??
    populateConnectionDefaults(spec, componentName, parentName);
  return value;
}

function markRequired(spec: RawFieldSpec) {
  spec.comment = `Required - ${getRequiredFieldTypeHint(spec)}, must be manually set`;
  return SENTINEL_REQUIRED_FIELD;
}

function generateShownFieldValue(
  spec: RawFieldSpec,
  { showAdvancedFields, componentName, ancestorOptional }: GenerateDefaultValueOptions
): unknown {
  const required = checkRequired(spec, ancestorOptional);

  if (required && spec.type !== 'object') {
    return markRequired(spec);
  }

  const converted = spec.defaultValue ? convertDefaultValue(spec.defaultValue, spec.type, spec.kind) : undefined;
  if (converted !== undefined) {
    return converted;
  }

  if (spec.kind === 'array' && spec.name?.toLowerCase() === 'sasl' && isRedpandaComponent(componentName)) {
    return generateObjectArrayValue(spec, showAdvancedFields, componentName);
  }

  if (spec.type === 'object') {
    return generateObjectStructure(spec, required, showAdvancedFields, componentName);
  }

  // WARNING: Omit non-required values whose defaults were lost in the proto; filling zero values can override engine defaults.
}

function generateObjectStructure(
  spec: RawFieldSpec,
  required: boolean,
  showAdvancedFields: boolean | undefined,
  componentName: string | undefined
): unknown {
  const isComponentRoot = !spec.name;
  if (spec.kind === 'scalar' || spec.kind === '') {
    const obj = generateObjectValue(spec, showAdvancedFields, componentName);
    if (obj && Object.keys(obj).length > 0) {
      return obj;
    }
    return isComponentRoot ? {} : undefined;
  }
  if (!(required || isComponentRoot)) {
    return;
  }
  switch (spec.kind) {
    case 'array':
      return generateObjectArrayValue(spec, showAdvancedFields, componentName) ?? [];
    case '2darray':
      return [generateObjectArrayValue(spec, showAdvancedFields, componentName) ?? []];
    case 'map':
      return {};
    default:
      return;
  }
}
