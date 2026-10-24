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
}

/**
 * Walks a dotted field path (e.g. `tls.cert_file`) through a field-spec children tree.
 * Plain proto FieldSpec trees are accepted too (structurally assignable to RawFieldSpec).
 */
export function resolveFieldByPath(root: RawFieldSpec | undefined, path: string): RawFieldSpec | undefined {
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

const generateRedpandaTopLevelConfig = (): Record<string, unknown> => {
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

  const config =
    componentSpec.name === 'redpanda_common'
      ? redpandaCommonConfig(componentSpec, connectionConfig)
      : componentSectionConfig(componentSpec, connectionConfig);
  return { config, spec: componentSpec };
};

// redpanda_common carries its SASL in a top-level `redpanda:` block beside the component.
function redpandaCommonConfig(
  componentSpec: ConnectComponentSpec,
  connectionConfig: unknown
): Partial<ConnectConfigObject> {
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

/** The snippet that places a component's config under its section of the Connect YAML schema. */
function componentSectionConfig(
  componentSpec: ConnectComponentSpec,
  connectionConfig: unknown
): Partial<ConnectConfigObject> {
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
      // Scanners are embedded in inputs, so return the config directly.
      return { [componentSpec.name]: connectionConfig };

    default:
      break;
  }

  return config;
}

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
  if (
    componentName &&
    REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName) &&
    userData?.username &&
    parentName?.toLowerCase() === 'sasl'
  ) {
    return saslSecretRef(spec.name, userData.username);
  }
}

function saslSecretRef(fieldName: string, username: string): string | undefined {
  if (isUserField(fieldName)) {
    return getSecretSyntax(userSecretIds(username).username);
  }

  if (isPasswordField(fieldName)) {
    return getSecretSyntax(userSecretIds(username).password);
  }
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
}

const isRedpandaComponent = (name?: string): boolean => !!name && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(name);

function shouldShowField(params: {
  spec: RawFieldSpec;
  showAdvancedFields: boolean;
  componentName: string | undefined;
}): boolean {
  const { spec, showAdvancedFields, componentName } = params;

  // Deprecated fields never belong in a generated config.
  if (spec.deprecated) {
    return false;
  }

  // Redpanda SASL: show when wizard has user data (even though it's advanced)
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

// Wraps the object's generated children in a single-element array (`[{...}]`), or nothing when
// no child produced a value.
function generateObjectArrayValue(
  spec: RawFieldSpec,
  showAdvancedFields: boolean | undefined,
  componentName: string | undefined
): unknown[] | undefined {
  const obj = generateObjectValue(spec, showAdvancedFields, componentName);
  return obj && Object.keys(obj).length > 0 ? [obj] : undefined;
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
  } catch {
    // Not valid JSON, fall through to return as string
  }
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
  // Deprecated fields are being phased out; never force one regardless of signals.
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
  // Object: required if any child is required.
  return spec.children.some((c) => checkRequired(c));
}

// Without `requiredBySchema`, an empty default may be one the proto failed to carry.
function mayHaveLostDefault(spec: RawFieldSpec, ancestorOptional?: boolean): boolean {
  return (
    // Non-scalar under an optional ancestor: a collection default ([]/{}) was likely lost in proto.
    // Scalars are still evaluated normally.
    (Boolean(ancestorOptional) && spec.kind !== 'scalar') ||
    // Non-string types lose their defaults in proto (0/false/[] → ""), so can't be deemed required.
    spec.type !== 'string' ||
    // Advanced non-scalar fields typically had defaults that were lost in serialization.
    (spec.kind !== 'scalar' && Boolean(spec.advanced))
  );
}

const SCALAR_FIELD_TYPES = new Set<string>(['string', 'int', 'float', 'bool']);

// Types whose value is a nested component edited on the canvas (all except the wizard-only `custom`).
const COMPONENT_FIELD_TYPES = new Set<string>(CONNECT_COMPONENT_TYPE.filter((t) => t !== 'custom'));

export function fieldHasOptions(spec: RawFieldSpec): boolean {
  return (spec.annotatedOptions?.length ?? 0) > 0;
}

// A scalar string that links to a cache/rate_limit resource by label rather than nesting a component.
export function isResourceRefField(spec: RawFieldSpec): boolean {
  return (
    Boolean(spec.name) &&
    spec.kind === 'scalar' &&
    (spec.type === 'cache' || spec.type === 'rate_limit') &&
    !(spec.children?.length ?? 0)
  );
}

// A single editable value: a primitive, an enum select, or a resource reference (stored as a string).
export function isScalarField(spec: RawFieldSpec): boolean {
  return (
    Boolean(spec.name) &&
    spec.kind === 'scalar' &&
    (SCALAR_FIELD_TYPES.has(spec.type) || fieldHasOptions(spec) || isResourceRefField(spec))
  );
}

// A list of primitives (e.g. `topics: [a, b]`), edited one-per-line.
export function isScalarArrayField(spec: RawFieldSpec): boolean {
  return Boolean(spec.name) && spec.kind === 'array' && SCALAR_FIELD_TYPES.has(spec.type) && !fieldHasOptions(spec);
}

// A nested object with its own fields (e.g. `tls`, `batching`), rendered as a collapsible
// sub-section. benthos leaves `kind` empty on some object nodes (batching policies) — same thing.
export function isObjectGroupField(spec: RawFieldSpec): boolean {
  return (
    Boolean(spec.name) &&
    (spec.kind === 'scalar' || (spec.kind === '' && spec.type === 'object')) &&
    (spec.children?.length ?? 0) > 0
  );
}

// A field whose value is itself a nested component. Edited as its own canvas node, never inline.
export function isComponentField(spec: RawFieldSpec): boolean {
  return Boolean(spec.name) && COMPONENT_FIELD_TYPES.has(spec.type) && !isResourceRefField(spec);
}

// Fields rendered as form controls; deprecated fields, nested components, and complex fields
// (object arrays, maps, …) are excluded and fall back to the raw-YAML section.
export function isFormField(spec: RawFieldSpec): boolean {
  return (
    !(spec.deprecated || isComponentField(spec)) &&
    (isScalarField(spec) || isScalarArrayField(spec) || isObjectGroupField(spec))
  );
}

/** Finds a parsed component spec by name; `type` disambiguates names shared across types (e.g. `redpanda`). */
export function findConnectComponent(
  components: ConnectComponentSpec[],
  name: string,
  type?: ConnectComponentType
): ConnectComponentSpec | undefined {
  return components.find((c) => (type === undefined || c.type === type) && c.name === name);
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

export function generateDefaultValue(spec: RawFieldSpec, options: GenerateDefaultValueOptions = {}): unknown {
  const { showAdvancedFields, componentName, parentName } = options;

  // For Redpanda secret components, auto-population wins over optional/advanced flags.
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

function populateRedpandaValue(spec: RawFieldSpec, componentName?: string, parentName?: string): unknown {
  return (
    populateWizardFields(spec, componentName, parentName) ??
    populateContextualVariables(spec, componentName, parentName) ??
    populateConnectionDefaults(spec, componentName, parentName)
  );
}

// Comments the field and returns the placeholder the YAML output turns into that comment.
function markRequired(spec: RawFieldSpec): string {
  spec.comment = `Required - ${getRequiredFieldTypeHint(spec)}, must be manually set`;
  return SENTINEL_REQUIRED_FIELD;
}

function generateShownFieldValue(
  spec: RawFieldSpec,
  { showAdvancedFields, componentName, ancestorOptional }: GenerateDefaultValueOptions
): unknown {
  const required = checkRequired(spec, ancestorOptional);

  // Objects build structure from children, so they never use the required sentinel.
  if (required && spec.type !== 'object') {
    return markRequired(spec);
  }

  // A non-empty defaultValue survived serialization — use it (structured kinds arrive as JSON).
  const converted = spec.defaultValue ? convertDefaultValue(spec.defaultValue, spec.type, spec.kind) : undefined;
  if (converted !== undefined) {
    return converted;
  }

  // SASL arrays for redpanda/kafka_franz components are generated even when optional/advanced so
  // wizard-collected credentials land in the config.
  if (spec.kind === 'array' && spec.name?.toLowerCase() === 'sasl' && isRedpandaComponent(componentName)) {
    return generateObjectArrayValue(spec, showAdvancedFields, componentName);
  }

  if (spec.type === 'object') {
    return generateObjectStructure(spec, required, showAdvancedFields, componentName);
  }

  // Everything else is a non-required field whose default didn't survive serialization (the proto
  // only carries string defaults). Emit nothing so the engine's real default applies — zero-filling
  // flips semantics (e.g. auto_replay_nacks defaults to true; a generated `false` overrides it).
}

// Object structure recursion. Some object nodes come with an empty kind — benthos leaves Kind
// unset on e.g. batching policies; treat that as scalar.
function generateObjectStructure(
  spec: RawFieldSpec,
  required: boolean,
  showAdvancedFields: boolean | undefined,
  componentName: string | undefined
): unknown {
  // The component root (name '') must always produce a type-correct value: inserting `switch`
  // (root kind 'array') has to emit `[]`/`[{...}]`, and a field-less component like `drop` has
  // to emit `{}` — returning undefined would drop the component key from the YAML entirely.
  const isComponentRoot = !spec.name;
  if (spec.kind === 'scalar' || spec.kind === '') {
    const obj = generateObjectValue(spec, showAdvancedFields, componentName);
    if (obj && Object.keys(obj).length > 0) {
      return obj;
    }
    return isComponentRoot ? {} : undefined;
  }
  // Collections of objects are only seeded when the field is required or at the component root.
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
