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

  // Deprecated fields never belong in a generated config.
  if (spec.deprecated) {
    return false;
  }

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
 * Whether a field must be set by the user.
 *
 * Preferred signal: `requiredBySchema`, stamped by enrichComponentsWithConfigSchema from the raw
 * config schema's `required` arrays — the backend computes those knowing every default value
 * (benthos: required ⇔ no default and not optional), so they are authoritative.
 *
 * Degraded fallback (unstamped specs — dataplane predating flag serialization, or a call site
 * without the raw schema): trust the proto flags, but stay conservative about defaults. The proto
 * only serializes string defaults, so a non-string field with an empty `defaultValue` is far more
 * likely "default lost in serialization" than "required" (fleet-wide, only 3 scalar non-string
 * fields are truly required). The known cost of this mode: string fields whose real default is ""
 * are indistinguishable from required ones and show as required.
 */
export function checkRequired(spec: RawFieldSpec, ancestorOptional?: boolean): boolean {
  // Deprecated fields are being phased out; never force one regardless of signals.
  if (spec.deprecated === true) {
    return false;
  }
  if (spec.requiredBySchema !== undefined) {
    return spec.requiredBySchema;
  }
  if (spec.optional === true) {
    return false;
  }
  // Non-scalar under an optional ancestor: a collection default ([]/{}) was likely lost in proto.
  // Scalars are still evaluated normally.
  if (ancestorOptional && spec.kind !== 'scalar') {
    return false;
  }
  if (spec.defaultValue) {
    return false;
  }
  // Non-string types lose their defaults in proto (0/false/[] → ""), so can't be deemed required.
  if (spec.type !== 'string') {
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

  const required = checkRequired(spec, ancestorOptional);

  // Objects build structure from children, so they never use the required sentinel.
  if (required && spec.type !== 'object') {
    spec.comment = `Required - ${getRequiredFieldTypeHint(spec)}, must be manually set`;
    return SENTINEL_REQUIRED_FIELD;
  }

  // A non-empty defaultValue survived serialization — use it (structured kinds arrive as JSON).
  if (spec.defaultValue) {
    const converted = convertDefaultValue(spec.defaultValue, spec.type, spec.kind);
    if (converted !== undefined) {
      return converted;
    }
  }

  // SASL arrays for redpanda/kafka_franz components are generated even when optional/advanced so
  // wizard-collected credentials land in the config.
  const isSaslArray = spec.kind === 'array' && spec.name?.toLowerCase() === 'sasl';
  if (isSaslArray && componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName)) {
    return generateObjectArrayValue(spec, showAdvancedFields, componentName);
  }

  // Object structure recursion. Some object nodes come with an empty kind — benthos leaves Kind
  // unset on e.g. batching policies; treat that as scalar.
  if (spec.type === 'object') {
    if (spec.kind === 'scalar' || spec.kind === '') {
      const obj = generateObjectValue(spec, showAdvancedFields, componentName);
      return obj && Object.keys(obj).length > 0 ? obj : undefined;
    }
    // Collections of objects are only seeded when the field is required — except at the component
    // root (name ''), which must always produce a type-correct value: inserting e.g. `switch`
    // (root kind 'array') has to emit `[]`/`[{...}]`, never YAML null.
    const isComponentRoot = !spec.name;
    if (!(required || isComponentRoot)) {
      return;
    }
    if (spec.kind === 'array') {
      return generateObjectArrayValue(spec, showAdvancedFields, componentName) ?? [];
    }
    if (spec.kind === '2darray') {
      const obj = generateObjectValue(spec, showAdvancedFields, componentName);
      return obj && Object.keys(obj).length > 0 ? [[obj]] : [[]];
    }
    if (spec.kind === 'map') {
      return {};
    }
  }

  // Everything else is a non-required field whose default didn't survive serialization (the proto
  // only carries string defaults). Emit nothing so the engine's real default applies — zero-filling
  // here used to flip semantics (e.g. auto_replay_nacks defaults to true but rendered as `false`).
  return;
}
