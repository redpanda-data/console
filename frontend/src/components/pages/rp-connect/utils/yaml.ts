import { ConnectError } from '@connectrpc/connect';
import { toast } from 'sonner';
import { escapeRegExp } from 'utils/regex';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import {
  Document,
  isMap,
  isPair,
  isScalar,
  isSeq,
  parseDocument,
  parse as parseYaml,
  visit,
  type YAMLMap,
  stringify as yamlStringify,
} from 'yaml';

import { schemaToConfig } from './schema';
import {
  CLOUD_SERVICE_ACCOUNT_SASL_MECHANISM,
  getContextualVariableSyntax,
  getSecretSyntax,
  SHARED_CLIENT_FALLBACK_COMPONENTS,
  userSecretIds,
} from '../types/constants';
import type { ConnectComponentSpec, ConnectComponentType, ConnectConfigObject, RawFieldSpec } from '../types/schema';

/** Disable line wrapping so mutations do not reformat untouched Bloblang expressions. */
export const YAML_STRINGIFY_OPTIONS = { lineWidth: 0 } as const;

/** Keep a failed YAML read or serialization distinct from valid empty output. */
export function tryYamlOperation<T>(operation: () => T) {
  let result: T | undefined;
  try {
    result = operation();
  } catch {
    result = undefined;
  }
  return result;
}

const RESERVED_COMPONENT_KEYS = new Set(['label', '<<']);

/** Extract the component name from an object, skipping reserved keys like `label`. */
export const firstKey = (obj: unknown) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return;
  }
  return Object.keys(obj).find((k) => !RESERVED_COMPONENT_KEYS.has(k));
};

const SLOT_SIBLING_KEYS = new Set([...RESERVED_COMPONENT_KEYS, 'processors']);

/** The component name in an input or output slot, skipping `label` and the slot's `processors`. */
export const slotComponentKey = (obj: unknown) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return;
  }
  return Object.keys(obj).find((k) => !SLOT_SIBLING_KEYS.has(k));
};

const YAML_TRUE = new Set(['true', 'yes', 'y', 'on']);
const YAML_FALSE = new Set(['false', 'no', 'n', 'off']);

/** A boolean field as Connect decodes it, YAML 1.1 words included; undefined for an env reference or anything else. */
export function yamlFlag(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }
  const word = typeof value === 'string' ? value.trim().toLowerCase() : undefined;
  if (word === undefined) {
    return;
  }
  if (YAML_TRUE.has(word)) {
    return true;
  }
  return YAML_FALSE.has(word) ? false : undefined;
}

/** The input wrapper that gives any input a logical end. */
export const READ_UNTIL = 'read_until';

/** A `read_until` wrapper's end settings: the fields beside its child `input`. */
export type StopCondition = {
  /** Bloblang query; the input closes after the message that makes it true. */
  check?: string;
  /** Go duration; the input closes once no message has arrived for this long. */
  idleTimeout?: string;
  /** Reopen the child input when it closes before `check` is met. */
  restartInput?: boolean;
};

export type UnwrappedInput = {
  /** The object holding the input component: the slot itself, or the wrapper's `read_until.input`. */
  component: Record<string, unknown>;
  /** Path from the slot to `component` — `[]` when the slot isn't wrapped. */
  innerPath: string[];
  /** The wrapper's settings, when the slot is a `read_until`. */
  stop?: StopCondition;
};

/** The value as a plain object, or undefined for anything else (arrays included). */
export const asRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const nonEmptyString = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : undefined);

const checkQuery = (value: unknown) =>
  nonEmptyString(typeof value === 'boolean' || typeof value === 'number' ? String(value) : value);

const idleTimeoutText = (value: unknown) => (typeof value === 'number' ? String(value) : nonEmptyString(value));

/** Parse `read_until` settings, retaining scalar checks and numeric idle timeouts as text. */
export function readStopCondition(value: unknown) {
  const record = asRecord(value) ?? {};
  const check = checkQuery(record.check);
  const idleTimeout = idleTimeoutText(record.idle_timeout);
  const stop: StopCondition = {
    ...(check ? { check } : {}),
    ...(idleTimeout ? { idleTimeout } : {}),
    ...(yamlFlag(record.restart_input) === true ? { restartInput: true } : {}),
  };
  return stop;
}

/** True when the condition can end the input — a `check` or an idle timeout. `restart_input` alone can't. */
export function isStopConditionSet(stop: StopCondition | undefined | null): stop is StopCondition {
  return Boolean(stop && (stop.check || stop.idleTimeout));
}

/**
 * Resolve an input slot through a `read_until` wrapper. A wrapper with no child input yet (mid-edit)
 * is left as-is, so it still renders and edits as a plain component.
 */
export function unwrapReadUntil(slot: Record<string, unknown>) {
  if (slotComponentKey(slot) !== READ_UNTIL) {
    return { component: slot, innerPath: [] } satisfies UnwrappedInput;
  }
  const wrapper = asRecord(slot[READ_UNTIL]);
  const inner = asRecord(wrapper?.input);
  if (!(wrapper && inner && slotComponentKey(inner))) {
    return { component: slot, innerPath: [] } satisfies UnwrappedInput;
  }
  return {
    component: inner,
    innerPath: [READ_UNTIL, 'input'],
    stop: readStopCondition(wrapper),
  } satisfies UnwrappedInput;
}

const inputSlotName = (slot: unknown) => {
  const record = asRecord(slot);
  return record ? slotComponentKey(unwrapReadUntil(record).component) : undefined;
};

/** Extract child input names from a multi-input component (broker, sequence). */
export const parseMultiInputs = (inputKey: string, value: unknown) => {
  if (
    (inputKey === 'broker' || inputKey === 'sequence') &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'inputs' in value
  ) {
    const items = (value as { inputs?: unknown[] }).inputs;
    if (Array.isArray(items)) {
      return items.map(inputSlotName).filter((k): k is string => !!k);
    }
  }
};

/** Extract child output names from a multi-output component (broker, switch, fallback). */
export const parseMultiOutputs = (outputKey: string, value: unknown) => {
  if (outputKey === 'broker' && value && typeof value === 'object' && !Array.isArray(value) && 'outputs' in value) {
    const items = (value as { outputs?: unknown[] }).outputs;
    if (Array.isArray(items)) {
      return items.map(slotComponentKey).filter((k): k is string => !!k);
    }
  }

  if (outputKey === 'switch' && value && typeof value === 'object' && !Array.isArray(value) && 'cases' in value) {
    const cases = (value as { cases?: unknown[] }).cases;
    if (Array.isArray(cases)) {
      return cases
        .map((c) => (c && typeof c === 'object' ? slotComponentKey((c as { output?: unknown }).output) : undefined))
        .filter((k): k is string => !!k);
    }
  }

  if (outputKey === 'fallback' && Array.isArray(value)) {
    return value.map(slotComponentKey).filter((k): k is string => !!k);
  }
};

const appendToSeq = (doc: Document.Parsed, path: string[], item: unknown) => {
  const node = doc.getIn(path);
  if (isSeq(node)) {
    node.add(doc.createNode(item));
  } else {
    doc.setIn(path, [item]);
  }
};

const mergeProcessor = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>) => {
  const configObj = newConfigObject as Record<string, { processors?: unknown[] }>;
  const processorsArray = configObj?.pipeline?.processors;
  const newProcessor = Array.isArray(processorsArray) ? processorsArray[0] : undefined;
  if (newProcessor) {
    appendToSeq(doc, ['pipeline', 'processors'], newProcessor);
  }
};

const mergeResourceArray = (
  doc: Document.Parsed,
  newConfigObject: Partial<ConnectConfigObject>,
  key: ResourceArrayKey
) => {
  const newResource = (newConfigObject as Record<string, unknown[]>)?.[key]?.[0] as Record<string, unknown> | undefined;
  if (!newResource) {
    return;
  }

  const existing = (doc.toJS() as Record<string, unknown> | null)?.[key];
  const existingLabels = (Array.isArray(existing) ? (existing as Record<string, unknown>[]) : [])
    .map((r) => r?.label)
    .filter((l): l is string => typeof l === 'string' && l !== '');
  if (typeof newResource.label === 'string') {
    newResource.label = uniqueResourceLabel(existingLabels, newResource.label);
  }

  appendToSeq(doc, [key], newResource);
};

const mergeRootComponent = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>) => {
  if (newConfigObject) {
    for (const [key, value] of Object.entries(newConfigObject)) {
      if (key === 'redpanda' && doc.has('redpanda')) {
        continue;
      }
      doc.set(key, value);
    }
  }
};

const rootInputComponent = (doc: Document.Parsed | Document) => {
  const inputObj = asRecord((doc.get('input') as { toJSON?: () => unknown } | undefined)?.toJSON?.());
  const { component, innerPath } = unwrapReadUntil(inputObj ?? {});
  const inputType = slotComponentKey(component);
  return inputType ? { inputType, innerPath } : undefined;
};

const mergeScanner = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>) => {
  const input = rootInputComponent(doc);
  if (!input) {
    return;
  }

  const scannerName = Object.keys(newConfigObject as Record<string, unknown>)[0];
  if (!scannerName) {
    return;
  }
  const scannerConfig = (newConfigObject as Record<string, unknown>)[scannerName] ?? {};
  doc.setIn(['input', ...input.innerPath, input.inputType, 'scanner'], { [scannerName]: scannerConfig });
};

type DetectedComponentType = 'processor' | 'cache' | 'rate_limit' | 'root' | 'scanner' | 'unknown';

const ROOT_SECTION_KEYS = ['input', 'output', 'buffer', 'metrics', 'tracer'] as const;

const SECTION_COMPONENT_TYPES = [
  ['pipeline', 'processor'],
  ['cache_resources', 'cache'],
  ['rate_limit_resources', 'rate_limit'],
] as const;

const isScannerSnippet = (newConfigObject: Partial<ConnectConfigObject>, doc?: Document.Parsed) => {
  const keys = Object.keys(newConfigObject);
  return (
    keys.length === 1 &&
    Boolean(doc?.has('input')) &&
    Boolean(keys[0]) &&
    !(ROOT_SECTION_KEYS as readonly string[]).includes(keys[0])
  );
};

const detectComponentType = (newConfigObject: Partial<ConnectConfigObject>, doc?: Document.Parsed) => {
  const section = SECTION_COMPONENT_TYPES.find(([key]) => newConfigObject[key]);
  if (section) {
    return section[1];
  }

  if (ROOT_SECTION_KEYS.some((key) => newConfigObject[key])) {
    return 'root';
  }

  return isScannerSnippet(newConfigObject, doc) ? 'scanner' : 'unknown';
};

const mergeByComponentType = (
  componentType: DetectedComponentType,
  doc: Document.Parsed,
  newConfigObject: Partial<ConnectConfigObject>
) => {
  switch (componentType) {
    case 'processor':
      mergeProcessor(doc, newConfigObject);
      break;
    case 'cache':
      mergeResourceArray(doc, newConfigObject, 'cache_resources');
      break;
    case 'rate_limit':
      mergeResourceArray(doc, newConfigObject, 'rate_limit_resources');
      break;
    case 'root':
      mergeRootComponent(doc, newConfigObject);
      break;
    case 'scanner':
      mergeScanner(doc, newConfigObject);
      break;
    default:
      mergeRootComponent(doc, newConfigObject);
      break;
  }
};

function convertRequiredFieldSentinels(yamlString: string) {
  let result = yamlString.replace(
    /^(?<indent>\s*)(?<key>[\w][\w.-]*): ['"]?__REQUIRED_FIELD__['"]?\s*#\s*(?<description>.+)$/gmu,
    '$1# $2: $3'
  );
  result = result.replace(
    /^(?<indent>\s*)(?<key>[\w][\w.-]*): ['"]?__REQUIRED_FIELD__['"]?\s*$/gmu,
    '$1# $2: Required'
  );
  return result;
}

const keyMatchRegex = /^(?<key>[^:#\n]+):/u;

const rootKeyOf = (line: string) => {
  if (!line.trim() || line.length !== line.trimStart().length || !line.includes(':')) {
    return;
  }
  return line.match(keyMatchRegex)?.[1].trim();
};

const addRootSpacing = (yamlString: string) => {
  const processedLines: string[] = [];
  let previousRootKey: string | null = null;
  for (const line of yamlString.split('\n')) {
    const rootKey = rootKeyOf(line);
    if (rootKey !== undefined) {
      if (
        previousRootKey !== null &&
        rootKey !== previousRootKey &&
        processedLines.length > 0 &&
        processedLines.at(-1)?.trim() !== ''
      ) {
        processedLines.push('');
      }
      previousRootKey = rootKey;
    }
    processedLines.push(line);
  }
  return processedLines.join('\n');
};

const isBlankConfigText = (text: string) => {
  const trimmed = text.trim();
  return trimmed === '' || trimmed === '{}';
};

const toastMergeFailure = (error: unknown, action: string) => {
  toast.error(
    formatToastErrorMessageGRPC({
      error: ConnectError.from(error),
      action,
      entity: 'mergeConnectConfigs',
    })
  );
};

const parseExistingDocument = (existingYaml: string) => {
  try {
    return parseDocument(existingYaml);
  } catch (error) {
    toastMergeFailure(error, 'Parse existing YAML');
  }
};

const mergeIntoDocument = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>) => {
  const componentType = detectComponentType(newConfigObject, doc);
  try {
    mergeByComponentType(componentType, doc, newConfigObject);
    return true;
  } catch (error) {
    toastMergeFailure(error, 'Merge selected component into existing config');
    return false;
  }
};

/**
 * Insert a connector without replacing existing nodes, anchors, or comments.
 * Start a new block document for an empty root. Scanners must attach to an
 * existing input, including one nested under `read_until`.
 * Undefined tells the editor to retain its current text.
 */
export const mergeConnectConfigs = (existingYaml: string, newConfigObject: Partial<ConnectConfigObject>) => {
  if (isBlankConfigText(existingYaml)) {
    return newConfigObject;
  }

  const doc = parseExistingDocument(existingYaml);
  if (!(doc && mergeIntoDocument(doc, newConfigObject))) {
    return;
  }

  return doc;
};

const yamlConfig = {
  indent: 2,
  ...YAML_STRINGIFY_OPTIONS,
  minContentWidth: 20,
  doubleQuotedAsJSON: false,
};

type YAMLNode = { items?: unknown[]; comment?: string; commentBefore?: string };
type YAMLKey = { value?: string; comment?: string };
type YAMLPair = { key?: YAMLKey; value?: YAMLNode };

function addCommentsRecursive(node: YAMLNode, spec: RawFieldSpec) {
  if (!(node.items && spec.children)) {
    return;
  }

  for (const item of node.items) {
    addPairComments(item as YAMLPair, spec.children);
  }
}

function addPairComments(pair: YAMLPair, fields: RawFieldSpec[]) {
  const key = pair?.key?.value;
  const fieldSpec = key ? fields.find((child) => child.name === key) : undefined;
  if (!fieldSpec) {
    return;
  }

  if (fieldSpec.comment) {
    placeFieldComment(pair, fieldSpec, fieldSpec.comment);
  }

  if (pair.value?.items && fieldSpec.children) {
    addCommentsRecursive(pair.value, fieldSpec);
  }
}

function placeFieldComment(pair: YAMLPair, fieldSpec: RawFieldSpec, comment: string) {
  const hasItems = Boolean(pair.value?.items);
  if (hasItems && !fieldSpec.children && pair.key) {
    pair.key.comment = ` ${comment}`;
  } else if (!(hasItems && fieldSpec.children) && pair.value) {
    pair.value.comment = ` ${comment}`;
  }
}

function lastArrayIndex(doc: Document.Parsed | Document, path: string[]) {
  const node = doc.getIn(path) as { items?: unknown[] } | undefined;
  const length = node?.items?.length ?? 0;
  return String(length > 0 ? length - 1 : 0);
}

function componentConfigPath(doc: Document.Parsed | Document, componentSpec: ConnectComponentSpec) {
  const specName = componentSpec.name;
  switch (componentSpec.type) {
    case 'input':
    case 'output':
    case 'buffer':
    case 'metrics':
    case 'tracer':
      return [componentSpec.type, specName];
    case 'processor':
      return ['pipeline', 'processors', lastArrayIndex(doc, ['pipeline', 'processors']), specName];
    case 'cache':
      return ['cache_resources', lastArrayIndex(doc, ['cache_resources']), specName];
    case 'rate_limit':
      return ['rate_limit_resources', lastArrayIndex(doc, ['rate_limit_resources']), specName];
    case 'scanner': {
      const input = rootInputComponent(doc);
      return input ? ['input', ...input.innerPath, input.inputType, 'scanner', specName] : undefined;
    }
    default:
      return;
  }
}

function nodeAlongPath(doc: Document.Parsed | Document, path: string[]) {
  let currentNode: YAMLNode | undefined = doc.contents as YAMLNode;
  for (const segment of path) {
    if (!currentNode?.items) {
      break;
    }

    const foundPair: YAMLPair | undefined = (currentNode.items as YAMLPair[]).find(
      (item) => item?.key?.value === segment
    );
    if (foundPair?.value) {
      currentNode = foundPair.value;
    } else if (Number.isNaN(Number(segment))) {
      break;
    } else {
      currentNode = (currentNode.items as YAMLNode[])[Number(segment)];
    }
  }
  return currentNode;
}

function addCommentsFromSpec(doc: Document.Parsed | Document, componentSpec: ConnectComponentSpec) {
  if (!componentSpec.config) {
    return;
  }

  const configPath = componentConfigPath(doc, componentSpec);
  const configNode = configPath ? nodeAlongPath(doc, configPath) : undefined;
  if (configNode) {
    addCommentsRecursive(configNode, componentSpec.config);
  }
}

const toYamlDocument = (configObject: Document.Parsed | Partial<ConnectConfigObject>) => {
  if (typeof (configObject as Document.Parsed).getIn === 'function') {
    return parseDocument(yamlStringify(configObject, yamlConfig));
  }
  return new Document(configObject);
};

/** Serialize the config, adding field help to the appended component. An empty result preserves the editor's text. */
export const configToYaml = (
  configObject: Document.Parsed | Partial<ConnectConfigObject> | undefined,
  componentSpec?: ConnectComponentSpec
) => {
  if (!configObject) {
    return '';
  }

  try {
    const doc = toYamlDocument(configObject);
    if (componentSpec) {
      addCommentsFromSpec(doc, componentSpec);
    }
    return addRootSpacing(convertRequiredFieldSentinels(yamlStringify(doc, yamlConfig)));
  } catch (error) {
    toast.error(
      formatToastErrorMessageGRPC({
        error: ConnectError.from(error),
        action: 'Convert connect config to YAML',
        entity: 'configToYaml',
      })
    );

    return '';
  }
};

const yamlHasInput = (yamlContent?: string) => {
  if (!yamlContent?.trim()) {
    return false;
  }
  try {
    return parseDocument(yamlContent).has('input');
  } catch {
    return false;
  }
};

const findTemplateSpec = (components: ConnectComponentSpec[], connectionName: string, connectionType: string) => {
  const componentSpec =
    connectionName && connectionType
      ? components.find((comp) => comp.type === connectionType && comp.name === connectionName)
      : undefined;

  if (!componentSpec) {
    toast.error(
      formatToastErrorMessageGRPC({
        error: new ConnectError('Component spec not found'),
        action: 'Get connect template',
        entity: 'getConnectTemplate',
      })
    );
  }
  return componentSpec;
};

const isScannerWithoutInput = (spec: ConnectComponentSpec, existingYaml?: string) => {
  if (spec.type !== 'scanner' || yamlHasInput(existingYaml)) {
    return false;
  }
  toast.error(
    formatToastErrorMessageGRPC({
      error: new ConnectError('a scanner attaches to an input, and this config has none'),
      action: 'add scanner',
      entity: spec.name,
    })
  );
  return true;
};

const mergeTemplateIntoYaml = (
  existingYaml: string,
  newConfigObject: Partial<ConnectConfigObject>,
  spec: ConnectComponentSpec
) => {
  const mergedConfig = mergeConnectConfigs(existingYaml, newConfigObject);
  if (!mergedConfig) {
    return existingYaml;
  }
  return configToYaml(mergedConfig, spec) || existingYaml;
};

export const getConnectTemplate = ({
  connectionName,
  connectionType,
  components,
  showAdvancedFields,
  existingYaml,
}: {
  connectionName: string;
  connectionType: string;
  components: ConnectComponentSpec[];
  showAdvancedFields?: boolean;
  existingYaml?: string;
}) => {
  const componentSpec = findTemplateSpec(components, connectionName, connectionType);
  const result = componentSpec ? schemaToConfig(componentSpec, showAdvancedFields) : undefined;
  if (!result) {
    return;
  }

  const { config: newConfigObject, spec } = result;
  if (isScannerWithoutInput(spec, existingYaml)) {
    return existingYaml;
  }

  return existingYaml
    ? mergeTemplateIntoYaml(existingYaml, newConfigObject, spec)
    : configToYaml(newConfigObject, spec);
};

/** Root sections of a parsed pipeline config document. */
export type ParsedYamlConfig = {
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  pipeline?: { processors?: Record<string, unknown>[] };
  cache_resources?: unknown[];
  rate_limit_resources?: unknown[];
  input_resources?: unknown[];
  output_resources?: unknown[];
  processor_resources?: unknown[];
  buffer?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  tracer?: Record<string, unknown>;
  logger?: Record<string, unknown>;
  redpanda?: Record<string, unknown>;
};

export type ParsedConfigComponents = {
  inputs: string[];
  processors: string[];
  outputs: string[];
};

const sectionComponentNames = (
  component: Record<string, unknown> | undefined,
  parseMulti: (key: string, value: unknown) => string[] | undefined
) => {
  const key = slotComponentKey(component);
  if (!(component && key)) {
    return [];
  }
  return parseMulti(key, component[key]) ?? [key];
};

/** A parsed config's input, processor, and output component names. */
export const configComponentsOf = (config: ParsedYamlConfig | null) => {
  if (!config) {
    return { inputs: [], processors: [], outputs: [] } satisfies ParsedConfigComponents;
  }

  const processors = Array.isArray(config.pipeline?.processors)
    ? config.pipeline.processors.map(firstKey).filter((p): p is string => !!p)
    : [];
  const inputObj = asRecord(config.input);

  return {
    inputs: sectionComponentNames(inputObj && unwrapReadUntil(inputObj).component, parseMultiInputs),
    processors,
    outputs: sectionComponentNames(asRecord(config.output), parseMultiOutputs),
  } satisfies ParsedConfigComponents;
};

type RedpandaPatch = {
  topicName?: string;
  consumerGroup?: string;
  sasl?: { mechanism: string; username?: string; password?: string }[];
};

export type RedpandaSetupResultLike = {
  topicName?: string;
  username?: string;
  saslMechanism?: string;
  consumerGroup?: string;
  authMethod?: 'sasl' | 'service-account';
};

function buildSaslPatch(result: RedpandaSetupResultLike) {
  if (result.authMethod === 'service-account') {
    return [{ mechanism: CLOUD_SERVICE_ACCOUNT_SASL_MECHANISM }];
  }
  if (result.username) {
    const secretIds = userSecretIds(result.username);
    return [
      {
        mechanism: result.saslMechanism || 'SCRAM-SHA-256',
        username: getSecretSyntax(secretIds.username),
        password: getSecretSyntax(secretIds.password),
      },
    ];
  }
}

type RedpandaSection = 'input' | 'output';

function componentPathIn(yamlContent: string, section: RedpandaSection, componentName: string) {
  return tryYamlOperation(() => {
    const slot = asRecord(asRecord(parseYaml(yamlContent, { merge: true }))?.[section]);
    if (!slot) {
      return;
    }
    const { component, innerPath } = section === 'input' ? unwrapReadUntil(slot) : { component: slot, innerPath: [] };
    return componentName in component ? [section, ...innerPath, componentName] : undefined;
  });
}

const leadingSpaces = (line: string) => line.length - line.trimStart().length;
const closesBlock = (line: string, indent: number) =>
  line.trim() !== '' && !line.trimStart().startsWith('#') && leadingSpaces(line) <= indent;

function stripCommentedKeys(yaml: string, keys: string[], componentPath: string[]) {
  if (keys.length === 0) {
    return yaml;
  }

  const lines = yaml.split('\n');
  const block = findComponentBlock(lines, componentPath);
  if (!block) {
    return yaml;
  }

  const keyPattern = keys.map(escapeRegExp).join('|');
  const commentRegex = new RegExp(`^\\s*#\\s*(?:${keyPattern}):.*$`, 'u');
  return lines.filter((line, i) => i <= block.start || i >= block.end || !commentRegex.test(line)).join('\n');
}

type LineBlock = { start: number; end: number };

function findComponentBlock(lines: string[], componentPath: string[]) {
  let block: LineBlock = { start: -1, end: lines.length };
  for (const [depth, segment] of componentPath.entries()) {
    const start = findKeyLine(lines, block, depth, segment);
    if (start === -1) {
      return;
    }
    block = { start, end: findBlockEnd(lines, start, depth * 2) };
  }
  return block.start === -1 ? undefined : block;
}

function findKeyLine(lines: string[], parent: LineBlock, depth: number, segment: string) {
  const indent = depth * 2;
  const keyRegex = new RegExp(`^ {${indent}}${escapeRegExp(segment)}:`, 'u');
  for (let i = parent.start + 1; i < parent.end; i++) {
    if (keyRegex.test(lines[i])) {
      return i;
    }
    if (depth > 0 && closesBlock(lines[i], indent - 2)) {
      return -1;
    }
  }
  return -1;
}

function findBlockEnd(lines: string[], start: number, indent: number) {
  for (let i = start + 1; i < lines.length; i++) {
    if (closesBlock(lines[i], indent)) {
      return i;
    }
  }
  return lines.length;
}

function patchTopicName(doc: Document.Parsed, section: RedpandaSection, componentPath: string[], topicName: string) {
  if (section === 'output') {
    doc.setIn([...componentPath, 'topic'], topicName);
    return 'topic';
  }
  const existing = doc.getIn([...componentPath, 'topics']);
  if (isSeq(existing)) {
    if (!existing.toJSON().some((t: unknown) => String(t) === topicName)) {
      doc.addIn([...componentPath, 'topics'], topicName);
    }
  } else {
    doc.setIn([...componentPath, 'topics'], [topicName]);
  }
  return 'topics';
}

/** Whether a parsed component names at least one broker to connect to. */
export function hasSeedBrokers(component: unknown) {
  const brokers =
    component && typeof component === 'object' ? (component as Record<string, unknown>).seed_brokers : undefined;
  return (Array.isArray(brokers) ? brokers : [brokers]).some((broker) => typeof broker === 'string' && broker !== '');
}

function ensureOwnConnection(doc: Document.Parsed, componentPath: string[], componentName: string, resolved: unknown) {
  const component = doc.getIn(componentPath);
  if (!(SHARED_CLIENT_FALLBACK_COMPONENTS.has(componentName) && isMap(component))) {
    return [];
  }
  if (hasSeedBrokers(resolved)) {
    return [];
  }
  setGeneratedSeedBrokers(doc, component);
  return ensureTlsDefault(doc, component, resolved) ? ['seed_brokers', 'tls'] : ['seed_brokers'];
}

function setGeneratedSeedBrokers(doc: Document.Parsed, component: YAMLMap) {
  const brokers = doc.createNode([getContextualVariableSyntax('REDPANDA_BROKERS')]);
  if (component.has('seed_brokers')) {
    component.set('seed_brokers', brokers);
  } else {
    component.items.unshift(doc.createPair('seed_brokers', brokers));
  }
}

function ensureTlsDefault(doc: Document.Parsed, component: YAMLMap, resolved: unknown) {
  const resolvedTls = (resolved as { tls?: unknown } | undefined)?.tls;
  if (resolvedTls === undefined || resolvedTls === null) {
    component.set('tls', doc.createNode({ enabled: true }));
    return true;
  }
  const tls = component.get('tls', true);
  if (isMap(tls) && (resolvedTls as { enabled?: unknown }).enabled === undefined) {
    tls.set('enabled', true);
  }
  return false;
}

/**
 * Apply onboarding values without replacing existing topic entries or their
 * comments. Resolve merge keys before updating so the patch retains inherited
 * fields. When a component inherits a shared client, generated broker and TLS
 * settings let it use the new credentials against the selected cluster.
 * Return undefined if the component is missing or the YAML cannot be patched.
 */
export function patchRedpandaConfig(
  existingYaml: string,
  section: RedpandaSection,
  componentName: string,
  patch: RedpandaPatch
) {
  const doc = existingYaml.trim() ? tryParseDocument(existingYaml) : undefined;
  const componentPath = doc && componentPathIn(existingYaml, section, componentName);
  if (!(doc && componentPath && doc.hasIn(componentPath))) {
    return;
  }

  const resolved = readComponent(existingYaml, section, componentName).component;
  const patchedKeys = applyRedpandaPatch(doc, section, componentPath, componentName, patch, resolved);

  return tryYamlOperation(() => stripCommentedKeys(yamlStringify(doc, yamlConfig), patchedKeys, componentPath));
}

function tryParseDocument(yamlContent: string) {
  return tryYamlOperation(() => parseDocument(yamlContent));
}

function applyRedpandaPatch(
  doc: Document.Parsed,
  section: RedpandaSection,
  componentPath: string[],
  componentName: string,
  patch: RedpandaPatch,
  resolved: Record<string, unknown> | undefined
) {
  const patchedKeys: string[] = [];

  if (patch.topicName) {
    patchedKeys.push(patchTopicName(doc, section, componentPath, patch.topicName));
  }

  if (patch.consumerGroup && section === 'input' && resolved?.consumer_group !== patch.consumerGroup) {
    doc.setIn([...componentPath, 'consumer_group'], patch.consumerGroup);
    patchedKeys.push('consumer_group');
  }

  if (patch.sasl) {
    patchedKeys.push(...patchSasl(doc, componentPath, componentName, patch.sasl, resolved));
  }
  return patchedKeys;
}

function patchSasl(
  doc: Document.Parsed,
  componentPath: string[],
  componentName: string,
  sasl: NonNullable<RedpandaPatch['sasl']>,
  resolved: Record<string, unknown> | undefined
) {
  if (componentName === 'redpanda_common') {
    doc.setIn(['redpanda', 'sasl'], sasl);
    return ['sasl'];
  }
  doc.setIn([...componentPath, 'sasl'], sasl);
  return [...ensureOwnConnection(doc, componentPath, componentName, resolved), 'sasl'];
}

/** Build a RedpandaPatch and apply it to existing YAML. */
export function tryPatchRedpandaYaml(
  yamlContent: string,
  section: RedpandaSection,
  componentName: string,
  result: RedpandaSetupResultLike
) {
  const patch: RedpandaPatch = {
    topicName: result.topicName || undefined,
    consumerGroup: result.consumerGroup || undefined,
    sasl: buildSaslPatch(result),
  };
  if (!(patch.topicName || patch.consumerGroup || patch.sasl)) {
    return;
  }
  return patchRedpandaConfig(yamlContent, section, componentName, patch);
}

/** Whether any client logs in with the pipeline's service account, which it then can't run without. */
export function usesServiceAccountLogin(yamlContent: string) {
  let found = false;
  visit(parseDocument(yamlContent), {
    Pair(_, pair) {
      if (
        isScalar(pair.key) &&
        pair.key.value === 'mechanism' &&
        isScalar(pair.value) &&
        pair.value.value === CLOUD_SERVICE_ACCOUNT_SASL_MECHANISM
      ) {
        found = true;
        return visit.BREAK;
      }
    },
  });
  return found;
}

function readComponent(yamlContent: string, section: RedpandaSection, componentName: string) {
  if (!yamlContent.trim()) {
    return { component: undefined, parseError: false };
  }
  let parsed: unknown;
  try {
    parsed = parseDocument(yamlContent, { merge: true }).toJS();
  } catch {
    return { component: undefined, parseError: true };
  }
  return { component: componentObjectIn(parsed, section, componentName), parseError: false };
}

function componentObjectIn(parsed: unknown, section: RedpandaSection, componentName: string) {
  const sectionObj = asRecord(asRecord(parsed)?.[section]);
  const holder = sectionObj && section === 'input' ? unwrapReadUntil(sectionObj).component : sectionObj;
  const component = holder?.[componentName];
  if (!component || typeof component !== 'object' || Array.isArray(component)) {
    return;
  }
  return component as Record<string, unknown>;
}

/**
 * Extract topic(s) from a Redpanda connector. All Redpanda types keep topics at
 * `[section].[componentName].topics[]` (inputs) or `.topic` (outputs).
 */
export function extractConnectorTopics(yamlContent: string, section: RedpandaSection, componentName: string) {
  const { component: config, parseError } = readComponent(yamlContent, section, componentName);
  if (!config) {
    return { topics: undefined, parseError };
  }

  if (Array.isArray(config.topics)) {
    const filtered = config.topics.filter((t): t is string => typeof t === 'string' && t !== '');
    return { topics: filtered.length > 0 ? filtered : undefined, parseError: false };
  }

  if (typeof config.topic === 'string' && config.topic !== '') {
    return { topics: [config.topic], parseError: false };
  }

  return { topics: undefined, parseError: false };
}

/** The consumer group an input component reads with, if it names one. */
export function extractConnectorConsumerGroup(yamlContent: string, componentName: string) {
  const group = readComponent(yamlContent, 'input', componentName).component?.consumer_group;
  return typeof group === 'string' && group !== '' ? group : undefined;
}

/** Extract all referenced topic names from input/output configs. */
export function extractAllTopics(yamlContent: string) {
  if (!yamlContent.trim()) {
    return [];
  }

  const topics = new Set<string>();
  try {
    const config = parseYaml(yamlContent, { merge: true }) as Record<string, unknown> | null;
    if (!config) {
      return [];
    }
    walkForTopics(config, topics, new WeakSet<object>());
  } catch {
    return [];
  }
  return [...topics];
}

function walkForTopics(obj: unknown, topics: Set<string>, seen: WeakSet<object>) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) {
    return;
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    for (const item of obj) {
      walkForTopics(item, topics, seen);
    }
    return;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (!addTopicValue(key, value, topics)) {
      walkForTopics(value, topics, seen);
    }
  }
}

function addTopicValue(key: string, value: unknown, topics: Set<string>) {
  if ((key === 'topic' || key === 'topics') && typeof value === 'string' && value) {
    topics.add(value);
    return true;
  }
  if (key === 'topics' && Array.isArray(value)) {
    for (const t of value) {
      if (typeof t === 'string' && t) {
        topics.add(t);
      }
    }
    return true;
  }
  return false;
}

/** YAML from onboarding wizard data: compose input and (optional) output templates. */
export function generateYamlFromWizardData(
  input: { connectionName: string; connectionType: string } | undefined,
  output: { connectionName: string; connectionType: string } | undefined,
  components: ConnectComponentSpec[]
) {
  if (!(input?.connectionName && input?.connectionType)) {
    return '';
  }

  let yaml =
    getConnectTemplate({
      connectionName: input.connectionName,
      connectionType: input.connectionType,
      components,
      existingYaml: '',
    }) || '';

  if (output?.connectionName && output?.connectionType) {
    yaml =
      getConnectTemplate({
        connectionName: output.connectionName,
        connectionType: output.connectionType,
        components,
        existingYaml: yaml,
      }) || yaml;
  }

  return yaml;
}

export type ResourceArrayKey = 'cache_resources' | 'rate_limit_resources';

/**
 * Addresses a visually editable component. Early kinds are top-level conveniences (with tailored
 * prune-on-delete); `path` addresses any nested component by exact YAML location + schema type. An
 * input under `input` is addressed by its slot, and read and written through its `read_until`
 * (`targetComponentPath`), so a stop condition never moves its target.
 */
export type EditTarget =
  | { kind: 'input' }
  | { kind: 'output' }
  | { kind: 'processor'; index: number }
  | { kind: 'resource'; resourceKey: ResourceArrayKey; index: number }
  | { kind: 'path'; path: (string | number)[]; componentType: ConnectComponentType }
  | { kind: 'switchCase'; path: (string | number)[] };

/** The YAML path (for `getIn`/`setIn`) of an edit target's component object, or of an input's slot. */
export function editTargetPath(target: EditTarget) {
  switch (target.kind) {
    case 'input':
      return ['input'];
    case 'output':
      return ['output'];
    case 'processor':
      return ['pipeline', 'processors', target.index];
    case 'path':
    case 'switchCase':
      return target.path;
    default:
      return [target.resourceKey, target.index];
  }
}

function isEmptySeq(node: unknown) {
  return isSeq(node) && node.items.length === 0;
}

function isEmptyMap(node: unknown) {
  const items = (node as { items?: unknown[] } | undefined)?.items;
  return Array.isArray(items) && items.length === 0;
}

function pruneEmptyContainers(doc: Document.Parsed, target: EditTarget) {
  if (target.kind === 'processor') {
    if (isEmptySeq(doc.getIn(['pipeline', 'processors']))) {
      doc.deleteIn(['pipeline', 'processors']);
    }
    if (isEmptyMap(doc.get('pipeline'))) {
      doc.delete('pipeline');
    }
  } else if (target.kind === 'resource' && isEmptySeq(doc.getIn([target.resourceKey]))) {
    doc.delete(target.resourceKey);
  } else if (
    target.kind === 'path' &&
    typeof target.path[0] === 'string' &&
    target.path[0].endsWith('_resources') &&
    typeof target.path[1] === 'number' &&
    isEmptySeq(doc.get(target.path[0]))
  ) {
    doc.delete(target.path[0]);
  }
}

/** The component name of what `target` holds: input and output slots skip their own `processors`. */
export function componentKeyAt(target: EditTarget, component: unknown) {
  const type = targetComponentType(target);
  return type === 'input' || type === 'output' ? slotComponentKey(component) : firstKey(component);
}

/** The component type an edit target loads its schema/config as. */
export function targetComponentType(target: EditTarget) {
  switch (target.kind) {
    case 'input':
      return 'input';
    case 'output':
      return 'output';
    case 'processor':
      return 'processor';
    case 'path':
      return target.componentType;
    case 'switchCase':
      return 'processor';
    default:
      return target.resourceKey === 'cache_resources' ? 'cache' : 'rate_limit';
  }
}

export function editTargetsEqual(a: EditTarget | undefined, b: EditTarget) {
  if (a?.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'processor' && b.kind === 'processor') {
    return a.index === b.index;
  }
  if (a.kind === 'resource' && b.kind === 'resource') {
    return a.resourceKey === b.resourceKey && a.index === b.index;
  }
  if ((a.kind === 'path' || a.kind === 'switchCase') && (b.kind === 'path' || b.kind === 'switchCase')) {
    return JSON.stringify(a.path) === JSON.stringify(b.path);
  }
  return true;
}

const recordAt = (doc: Document, path: (string | number)[]) =>
  asRecord((doc.getIn(path) as { toJSON?: () => unknown } | undefined)?.toJSON?.());

/**
 * The YAML path of the component an edit target holds. The canvas shows an input under `input` (the
 * top-level one, or a broker or sequence member) as the input its `read_until` wraps, so that is where
 * its component is read and written; deleting the target still takes the whole slot.
 */
export function targetComponentPath(doc: Document, target: EditTarget) {
  const path = editTargetPath(target);
  if (targetComponentType(target) !== 'input' || path[0] !== 'input') {
    return path;
  }
  const slot = recordAt(doc, path);
  return slot ? [...path, ...unwrapReadUntil(slot).innerPath] : path;
}

/** Read the component object at an edit target as plain JS (for the edit dialog). */
export function getComponentAt(yaml: string, target: EditTarget) {
  return tryYamlOperation(() => {
    const doc = parseDocument(yaml);
    return recordAt(doc, targetComponentPath(doc, target));
  });
}

/** Replace an existing component, refusing stale paths rather than creating padded entries. */
export function setComponentAt(yaml: string, target: EditTarget, componentObject: Record<string, unknown>) {
  try {
    const doc = parseDocument(yaml);
    const path = targetComponentPath(doc, target);
    if (doc.getIn(path) === undefined) {
      return null;
    }
    doc.setIn(path, componentObject);
    return doc.toString(YAML_STRINGIFY_OPTIONS);
  } catch {
    return null;
  }
}

/** Prune empty top-level containers after removal, retain nested arrays, and return blank YAML if nothing remains. */
export function removeComponentAt(yaml: string, target: EditTarget) {
  try {
    const doc = parseDocument(yaml);
    doc.deleteIn(editTargetPath(target));
    pruneEmptyContainers(doc, target);
    const out = doc.toString(YAML_STRINGIFY_OPTIONS);
    return isBlankConfigText(out) ? '' : out;
  } catch {
    return null;
  }
}

export function seqLengthAt(yaml: string, path: (string | number)[]) {
  try {
    const seq = parseDocument(yaml).getIn(path);
    return isSeq(seq) ? seq.items.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Insert a component into any array at `index` (creating the array as needed). `containerPath` is
 * the target array's YAML path, e.g. `['pipeline','processors']` or `['input','broker','inputs']`.
 */
export function insertComponentAt(
  yaml: string,
  containerPath: (string | number)[],
  index: number,
  componentObject: Record<string, unknown>
) {
  try {
    const doc = parseDocument(yaml);
    const seq = doc.getIn(containerPath);
    if (isSeq(seq)) {
      const clamped = Math.max(0, Math.min(index, seq.items.length));
      seq.items.splice(clamped, 0, doc.createNode(componentObject));
    } else if (seq === undefined || seq === null) {
      doc.setIn(containerPath, [componentObject]);
    } else {
      return null;
    }
    return doc.toString(YAML_STRINGIFY_OPTIONS);
  } catch {
    return null;
  }
}

/** Append a resource object to a resource array (creating the array as needed). */
export function appendResource(yaml: string, resourceKey: ResourceArrayKey, resourceObject: Record<string, unknown>) {
  try {
    const doc = parseDocument(yaml);
    appendToSeq(doc, [resourceKey], resourceObject);
    return doc.toString(YAML_STRINGIFY_OPTIONS);
  } catch {
    return null;
  }
}

/**
 * Build the bare component object to splice in for a freshly chosen connector, e.g.
 * `{ mapping: '...' }`. Reuses `getConnectTemplate` so insert output matches templates elsewhere.
 */
export function buildInsertableComponent(
  connectionName: string,
  connectionType: InsertableComponentType,
  components: ConnectComponentSpec[]
) {
  const yaml = getConnectTemplate({ connectionName, connectionType, components, existingYaml: '' });
  if (!yaml) {
    return;
  }
  return tryYamlOperation(() => {
    const parsed = parseYaml(yaml) as Record<string, unknown> | null;
    return parsed ? templateComponent(parsed, connectionType) : undefined;
  });
}

type InsertableComponentType = 'processor' | 'cache' | 'rate_limit' | 'input' | 'output';

function templateComponent(parsed: Record<string, unknown>, connectionType: InsertableComponentType) {
  if (connectionType === 'processor') {
    const procs = (parsed.pipeline as { processors?: unknown[] } | undefined)?.processors;
    return Array.isArray(procs) ? (procs[0] as Record<string, unknown>) : undefined;
  }
  if (connectionType === 'input' || connectionType === 'output') {
    const obj = parsed[connectionType];
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : undefined;
  }
  const key: ResourceArrayKey = connectionType === 'cache' ? 'cache_resources' : 'rate_limit_resources';
  const arr = parsed[key];
  return Array.isArray(arr) ? (arr[0] as Record<string, unknown>) : undefined;
}

export type ResourceKind = 'cache' | 'rate_limit';

const RESOURCE_KEY_BY_KIND: Record<ResourceKind, ResourceArrayKey> = {
  cache: 'cache_resources',
  rate_limit: 'rate_limit_resources',
};

/** The top-level resource array key for a kind (cache → cache_resources). */
export function resourceArrayKey(kind: ResourceKind) {
  return RESOURCE_KEY_BY_KIND[kind];
}

/** The resource kind a `cache`/`rate_limit` component name maps to, else undefined. */
export function resourceKindForComponentName(name: string) {
  const kind: ResourceKind | undefined = name === 'cache' || name === 'rate_limit' ? name : undefined;
  return kind;
}

/** The resource kind of a `resource` edit target (cache_resources → cache, …). */
export function resourceTargetKind(target: EditTarget) {
  if (target.kind !== 'resource') {
    return;
  }
  return target.resourceKey === 'cache_resources' ? 'cache' : 'rate_limit';
}

/** Resource references target cache/rate-limit arrays or input, processor, and output resources. */
export type ResourceRefKind = ResourceKind | 'input' | 'processor' | 'output';

/**
 * The resource kind a FIELD NAME references by string value — dedupe's `cache:`, a CDC input's
 * `checkpoint_cache:`, http's `rate_limit:`. Shared by the flow parser's candidate promotion and
 * the rename/count visitors below so a ref recognised on the canvas is also followed on rename.
 */
export function resourceKindForFieldName(name: string) {
  if (name === 'cache' || name.endsWith('_cache')) {
    return 'cache';
  }
  if (name === 'rate_limit' || name.endsWith('_rate_limit')) {
    return 'rate_limit';
  }
}

const PATH_RESOURCE_REF_KIND: Record<string, ResourceRefKind> = {
  input_resources: 'input',
  processor_resources: 'processor',
  output_resources: 'output',
};

/** The ref kind of a `*_resources` item edited via a path target (input_resources → input, …). */
export function pathResourceRefKind(target: EditTarget) {
  if (target.kind !== 'path' || target.path.length !== 2) {
    return;
  }
  const [key] = target.path;
  return typeof key === 'string' ? PATH_RESOURCE_REF_KIND[key] : undefined;
}

/** The ref kind an edit target's component can be referenced by, across both target shapes. */
export function resourceRefKindForTarget(target: EditTarget) {
  return resourceTargetKind(target) ?? pathResourceRefKind(target);
}

/** Labels of every resource of a kind, in document order — the options for a reference dropdown. */
export function listResourceLabels(yaml: string, kind: ResourceKind) {
  try {
    const node = parseDocument(yaml).getIn([RESOURCE_KEY_BY_KIND[kind]]) as { toJSON?: () => unknown } | undefined;
    const items = node?.toJSON?.();
    if (!Array.isArray(items)) {
      return [];
    }
    return items
      .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>).label : undefined))
      .filter((l): l is string => typeof l === 'string' && l !== '');
  } catch {
    return [];
  }
}

function uniqueResourceLabel(existing: string[], base: string) {
  if (!existing.includes(base)) {
    return base;
  }
  let counter = 1;
  while (existing.includes(`${base}_${counter}`)) {
    counter += 1;
  }
  return `${base}_${counter}`;
}

/**
 * Create a new resource of `kind` from a connector template; returns the YAML plus its collision-safe
 * label so the caller can immediately link it into the node's `resource:` field.
 */
export function createResourceAndReturnLabel(
  yaml: string,
  kind: ResourceKind,
  connectionName: string,
  components: ConnectComponentSpec[]
) {
  const resourceObject = buildInsertableComponent(connectionName, kind, components);
  if (!resourceObject) {
    return null;
  }
  const base =
    typeof resourceObject.label === 'string' && resourceObject.label !== '' ? resourceObject.label : connectionName;
  const label = uniqueResourceLabel(listResourceLabels(yaml, kind), base);
  resourceObject.label = label;
  const nextYaml = appendResource(yaml, RESOURCE_KEY_BY_KIND[kind], resourceObject);
  return nextYaml === null ? null : { yaml: nextYaml, label };
}

function resourcePairRefKind(path: readonly unknown[]) {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const ancestor = path[i];
    if (!(isPair(ancestor) && isScalar(ancestor.key))) {
      continue;
    }
    switch (ancestor.key.value) {
      case 'cache':
      case 'rate_limit':
        return ancestor.key.value;
      case 'input':
      case 'inputs':
        return 'input';
      case 'output':
      case 'outputs':
        return 'output';
      case 'processors':
        return 'processor';
      default:
    }
  }
}

function visitResourceReferences(
  doc: Document.Parsed,
  label: string,
  kind: ResourceRefKind | undefined,
  onMatch: (value: { value: unknown }) => void
) {
  visit(doc, {
    Pair(_, pair, path) {
      if (!(isScalar(pair.key) && isScalar(pair.value) && pair.value.value === label)) {
        return;
      }
      const key = pair.key.value;
      const refKind =
        key === 'resource'
          ? resourcePairRefKind(path)
          : typeof key === 'string'
            ? resourceKindForFieldName(key)
            : undefined;
      if (key !== 'resource' && refKind === undefined) {
        return;
      }
      if (!kind || refKind === kind) {
        onMatch(pair.value);
      }
    },
  });
}

/**
 * Repoint every reference from `oldLabel` to `newLabel`. With `kind`, only references
 * of that resource kind are rewritten; without it, every matching reference is.
 */
export function renameResourceReferences(yaml: string, oldLabel: string, newLabel: string, kind?: ResourceRefKind) {
  if (oldLabel === '' || oldLabel === newLabel) {
    return yaml;
  }
  try {
    const doc = parseDocument(yaml);
    visitResourceReferences(doc, oldLabel, kind, (value) => {
      value.value = newLabel;
    });
    return doc.toString(YAML_STRINGIFY_OPTIONS);
  } catch {
    return null;
  }
}

/**
 * Count how many components reference a resource label (via `resource:` or a name-referencing
 * field). With `kind`, only references belonging to that resource kind are counted.
 */
export function countResourceReferences(yaml: string, label: string, kind?: ResourceRefKind) {
  if (!label) {
    return 0;
  }
  try {
    const doc = parseDocument(yaml);
    let count = 0;
    visitResourceReferences(doc, label, kind, () => {
      count += 1;
    });
    return count;
  } catch {
    return 0;
  }
}
