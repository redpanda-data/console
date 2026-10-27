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

// `lineWidth: 0` disables folding: the lib default folds long single-line bloblang mappings at
// col 80, reformatting lines the user never touched. Every mutation stringify must use this.
const YAML_STRINGIFY_OPTIONS = { lineWidth: 0 } as const;

/** Keys that appear as siblings to the component name (e.g. `label`, a `<<` merge key). */
const RESERVED_COMPONENT_KEYS = new Set(['label', '<<']);

/** Extract the component name from an object, skipping reserved keys like `label`. */
export const firstKey = (obj: unknown): string | undefined => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return;
  }
  return Object.keys(obj).find((k) => !RESERVED_COMPONENT_KEYS.has(k));
};

/** Extract child input names from a multi-input component (broker, sequence). */
export const parseMultiInputs = (inputKey: string, value: unknown): string[] | undefined => {
  if (
    (inputKey === 'broker' || inputKey === 'sequence') &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'inputs' in value
  ) {
    const items = (value as { inputs?: unknown[] }).inputs;
    if (Array.isArray(items)) {
      return items.map(firstKey).filter((k): k is string => !!k);
    }
  }
};

/** Extract child output names from a multi-output component (broker, switch, fallback). */
export const parseMultiOutputs = (outputKey: string, value: unknown): string[] | undefined => {
  if (outputKey === 'broker' && value && typeof value === 'object' && !Array.isArray(value) && 'outputs' in value) {
    const items = (value as { outputs?: unknown[] }).outputs;
    if (Array.isArray(items)) {
      return items.map(firstKey).filter((k): k is string => !!k);
    }
  }

  if (outputKey === 'switch' && value && typeof value === 'object' && !Array.isArray(value) && 'cases' in value) {
    const cases = (value as { cases?: unknown[] }).cases;
    if (Array.isArray(cases)) {
      return cases
        .map((c) => (c && typeof c === 'object' ? firstKey((c as { output?: unknown }).output) : undefined))
        .filter((k): k is string => !!k);
    }
  }

  if (outputKey === 'fallback' && Array.isArray(value)) {
    return value.map(firstKey).filter((k): k is string => !!k);
  }
};

// Append into the seq at `path` IN PLACE, creating it when absent — rebuilding an existing
// array through toJSON()/setIn would strip comments and anchors off its current entries.
const appendToSeq = (doc: Document.Parsed, path: string[], item: unknown): void => {
  const node = doc.getIn(path);
  if (isSeq(node)) {
    node.add(doc.createNode(item));
  } else {
    doc.setIn(path, [item]);
  }
};

const mergeProcessor = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  const configObj = newConfigObject as Record<string, { processors?: unknown[] }>;
  const processorsArray = configObj?.pipeline?.processors;
  const newProcessor = Array.isArray(processorsArray) ? processorsArray[0] : undefined;
  if (newProcessor) {
    appendToSeq(doc, ['pipeline', 'processors'], newProcessor);
  }
};

// Append a cache_resources / rate_limit_resources entry, suffixing its label on
// collision so resources never share a label (which would make the link ambiguous).
const mergeResourceArray = (
  doc: Document.Parsed,
  newConfigObject: Partial<ConnectConfigObject>,
  key: ResourceArrayKey
): void => {
  const newResource = (newConfigObject as Record<string, unknown[]>)?.[key]?.[0] as Record<string, unknown> | undefined;
  if (!newResource) {
    return;
  }

  // Read labels via toJS() so YAML aliases resolve.
  const existing = (doc.toJS() as Record<string, unknown> | null)?.[key];
  const existingLabels = (Array.isArray(existing) ? (existing as Record<string, unknown>[]) : [])
    .map((r) => r?.label)
    .filter((l): l is string => typeof l === 'string' && l !== '');
  if (typeof newResource.label === 'string') {
    newResource.label = uniqueResourceLabel(existingLabels, newResource.label);
  }

  appendToSeq(doc, [key], newResource);
};

const mergeRootComponent = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  if (newConfigObject) {
    for (const [key, value] of Object.entries(newConfigObject)) {
      // Avoid duplicate top-level redpanda blocks across multiple redpanda_common components.
      if (key === 'redpanda' && doc.has('redpanda')) {
        continue;
      }
      doc.set(key, value);
    }
  }
};

/** The component type configured under the root `input` (e.g. `kafka_franz`), if any. */
const inputComponentType = (doc: Document.Parsed | Document): string | undefined =>
  firstKey((doc.get('input') as { toJSON?: () => unknown } | undefined)?.toJSON?.());

const mergeScanner = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  const inputType = inputComponentType(doc);
  if (!inputType) {
    return;
  }

  // Keep the scanner's name wrapper (`scanner: { csv: {…} }`). A default-less spec yields an
  // undefined inner config, which the serializer would drop along with the key — normalize to {}.
  const scannerName = Object.keys(newConfigObject as Record<string, unknown>)[0];
  if (!scannerName) {
    return;
  }
  const scannerConfig = (newConfigObject as Record<string, unknown>)[scannerName] ?? {};
  doc.setIn(['input', inputType, 'scanner'], { [scannerName]: scannerConfig });
};

type DetectedComponentType = 'processor' | 'cache' | 'rate_limit' | 'root' | 'scanner' | 'unknown';

// Root config sections that mark a snippet as a root-level merge (and that a single-key snippet
// must NOT be for the scanner heuristic below to apply).
const ROOT_SECTION_KEYS = ['input', 'output', 'buffer', 'metrics', 'tracer'] as const;

// Snippet sections that decide the merge on their own, checked in this order.
const SECTION_COMPONENT_TYPES = [
  ['pipeline', 'processor'],
  ['cache_resources', 'cache'],
  ['rate_limit_resources', 'rate_limit'],
] as const;

// Single key that isn't a known root section, with an existing input → scanner.
const isScannerSnippet = (newConfigObject: Partial<ConnectConfigObject>, doc?: Document.Parsed): boolean => {
  const keys = Object.keys(newConfigObject);
  return (
    keys.length === 1 &&
    Boolean(doc?.has('input')) &&
    Boolean(keys[0]) &&
    !(ROOT_SECTION_KEYS as readonly string[]).includes(keys[0])
  );
};

const detectComponentType = (
  newConfigObject: Partial<ConnectConfigObject>,
  doc?: Document.Parsed
): DetectedComponentType => {
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

function convertRequiredFieldSentinels(yamlString: string): string {
  // With inline comment: `key: __REQUIRED_FIELD__ # comment` → `# key: comment`
  let result = yamlString.replace(/^(\s*)([\w][\w.-]*): ['"]?__REQUIRED_FIELD__['"]?\s*#\s*(.+)$/gm, '$1# $2: $3');
  // Without comment: `key: __REQUIRED_FIELD__` → `# key: Required`
  result = result.replace(/^(\s*)([\w][\w.-]*): ['"]?__REQUIRED_FIELD__['"]?\s*$/gm, '$1# $2: Required');
  return result;
}

const keyMatchRegex = /^([^:#\n]+):/;

/** The key of an unindented `key:` line, if the line is one. */
const rootKeyOf = (line: string): string | undefined => {
  if (!line.trim() || line.length !== line.trimStart().length || !line.includes(':')) {
    return;
  }
  return line.match(keyMatchRegex)?.[1].trim();
};

const addRootSpacing = (yamlString: string): string => {
  const processedLines: string[] = [];
  let previousRootKey: string | null = null;
  for (const line of yamlString.split('\n')) {
    const rootKey = rootKeyOf(line);
    if (rootKey !== undefined) {
      // Blank line before each root component (except the first)
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

// Blank = empty/whitespace text or an empty root map — `{}` is what the yaml lib emits when the
// last key is deleted. Comment-only text is NOT blank here: it merges, preserving the comments.
const isBlankConfigText = (text: string): boolean => {
  const trimmed = text.trim();
  return trimmed === '' || trimmed === '{}';
};

const toastMergeFailure = (error: unknown, action: string): void => {
  toast.error(
    formatToastErrorMessageGRPC({
      error: ConnectError.from(error),
      action,
      entity: 'mergeConnectConfigs',
    })
  );
};

const parseExistingDocument = (existingYaml: string): Document.Parsed | undefined => {
  try {
    return parseDocument(existingYaml);
  } catch (error) {
    toastMergeFailure(error, 'Parse existing YAML');
  }
};

// Returns false (after a toast) when the merge throws.
const mergeIntoDocument = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): boolean => {
  const componentType = detectComponentType(newConfigObject, doc);
  try {
    mergeByComponentType(componentType, doc, newConfigObject);
    return true;
  } catch (error) {
    toastMergeFailure(error, 'Merge selected component into existing config');
    return false;
  }
};

export const mergeConnectConfigs = (
  existingYaml: string,
  newConfigObject: Partial<ConnectConfigObject>
): Document.Parsed | Partial<ConnectConfigObject> | undefined => {
  // Start fresh on a blank config — merging into a `{}` doc would inherit its flow-style root
  // map and stringify the whole result as a `{ input: {…} }` one-liner.
  if (isBlankConfigText(existingYaml)) {
    return newConfigObject;
  }

  const doc = parseExistingDocument(existingYaml);
  if (!(doc && mergeIntoDocument(doc, newConfigObject))) {
    return; // Keep existing YAML in editor
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

function addCommentsRecursive(node: YAMLNode, spec: RawFieldSpec): void {
  if (!(node.items && spec.children)) {
    return;
  }

  for (const item of node.items) {
    addPairComments(item as YAMLPair, spec.children);
  }
}

function addPairComments(pair: YAMLPair, fields: RawFieldSpec[]): void {
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

// Array → comment on key; leaf → comment on value; parent object → skip (children get it).
function placeFieldComment(pair: YAMLPair, fieldSpec: RawFieldSpec, comment: string): void {
  const hasItems = Boolean(pair.value?.items);
  if (hasItems && !fieldSpec.children && pair.key) {
    pair.key.comment = ` ${comment}`;
  } else if (!(hasItems && fieldSpec.children) && pair.value) {
    pair.value.comment = ` ${comment}`;
  }
}

// Merges APPEND the new component to its array, so field help-comments must target the LAST
// entry (a standalone doc has exactly one, so "last" holds there too).
function lastArrayIndex(doc: Document.Parsed | Document, path: string[]): string {
  const node = doc.getIn(path) as { items?: unknown[] } | undefined;
  const length = node?.items?.length ?? 0;
  return String(length > 0 ? length - 1 : 0);
}

/** Where a component's own config object sits in the document, or undefined when it has no place. */
function componentConfigPath(
  doc: Document.Parsed | Document,
  componentSpec: ConnectComponentSpec
): string[] | undefined {
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
      // A merged scanner lives at `input.<type>.scanner.<name>` (see mergeScanner).
      const inputType = inputComponentType(doc);
      return inputType ? ['input', inputType, 'scanner', specName] : undefined;
    }
    default:
      return;
  }
}

// Walks map keys by name and sequence entries by index, stopping at the deepest node reached.
function nodeAlongPath(doc: Document.Parsed | Document, path: string[]): YAMLNode | undefined {
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
      break; // Not a key or array index
    } else {
      currentNode = (currentNode.items as YAMLNode[])[Number(segment)];
    }
  }
  return currentNode;
}

function addCommentsFromSpec(doc: Document.Parsed | Document, componentSpec: ConnectComponentSpec): void {
  if (!componentSpec.config) {
    return;
  }

  const configPath = componentConfigPath(doc, componentSpec);
  const configNode = configPath ? nodeAlongPath(doc, configPath) : undefined;
  if (configNode) {
    addCommentsRecursive(configNode, componentSpec.config);
  }
}

const toYamlDocument = (configObject: Document.Parsed | Partial<ConnectConfigObject>): Document.Parsed | Document => {
  if (typeof (configObject as Document.Parsed).getIn === 'function') {
    // Merged document: regenerate for consistent structure (fixes navigation for doc.set() nodes).
    return parseDocument(yamlStringify(configObject, yamlConfig));
  }
  return new Document(configObject);
};

export const configToYaml = (
  configObject: Document.Parsed | Partial<ConnectConfigObject> | undefined,
  componentSpec?: ConnectComponentSpec
): string => {
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

    // Empty string preserves the editor's existing YAML (prevents JSON output appearing).
    return '';
  }
};

const yamlHasInput = (yamlContent?: string): boolean => {
  if (!yamlContent?.trim()) {
    return false;
  }
  try {
    return parseDocument(yamlContent).has('input');
  } catch {
    return false;
  }
};

const findTemplateSpec = (
  components: ConnectComponentSpec[],
  connectionName: string,
  connectionType: string
): ConnectComponentSpec | undefined => {
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

// A scanner isn't a root section — it nests under `input.<type>.scanner` (see mergeScanner).
// With no input to attach to, it would land as a bogus top-level block, so refuse instead.
const isScannerWithoutInput = (spec: ConnectComponentSpec, existingYaml?: string): boolean => {
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

// Falls back to the existing YAML when the merge or its serialization fails.
const mergeTemplateIntoYaml = (
  existingYaml: string,
  newConfigObject: Partial<ConnectConfigObject>,
  spec: ConnectComponentSpec
): string => {
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
  // Named-resource inputs/outputs/processors (via `resource:` indirection), shown in the resource lane with ref links.
  input_resources?: unknown[];
  output_resources?: unknown[];
  processor_resources?: unknown[];
  buffer?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  tracer?: Record<string, unknown>;
  logger?: Record<string, unknown>;
  redpanda?: Record<string, unknown>;
};

type ParsedConfigComponents = {
  inputs: string[];
  processors: string[];
  outputs: string[];
};

// The component a root section holds, expanded to its children for multi-component wrappers.
const sectionComponentNames = (
  sectionObj: Record<string, unknown> | undefined,
  parseMulti: (key: string, value: unknown) => string[] | undefined
): string[] => {
  const key = sectionObj && typeof sectionObj === 'object' ? firstKey(sectionObj) : undefined;
  if (!(sectionObj && key)) {
    return [];
  }
  return parseMulti(key, sectionObj[key]) ?? [key];
};

/** Parse a pipeline's configYaml to extract input, processor, and output component names. */
export const parseConfigComponents = (configYaml: string): ParsedConfigComponents => {
  const empty: ParsedConfigComponents = { inputs: [], processors: [], outputs: [] };
  if (!configYaml) {
    return empty;
  }

  try {
    const config = parseYaml(configYaml, { merge: true }) as ParsedYamlConfig | null;
    if (!config) {
      return empty;
    }

    const processors = Array.isArray(config.pipeline?.processors)
      ? config.pipeline.processors.map(firstKey).filter((p): p is string => !!p)
      : [];

    return {
      inputs: sectionComponentNames(config.input, parseMultiInputs),
      processors,
      outputs: sectionComponentNames(config.output, parseMultiOutputs),
    };
  } catch {
    return empty;
  }
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

function buildSaslPatch(result: RedpandaSetupResultLike): RedpandaPatch['sasl'] | undefined {
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

// Strip commented-out placeholder lines for just-patched keys, so the user doesn't see
// both the `# topics: Required ...` comment and the real value.
function stripCommentedKeys(yaml: string, keys: string[], section: string, componentName: string): string {
  if (keys.length === 0) {
    return yaml;
  }

  const lines = yaml.split('\n');
  const block = findComponentBlock(lines, section, componentName);
  if (!block) {
    return yaml;
  }

  const keyPattern = keys.map(escapeRegExp).join('|');
  const commentRegex = new RegExp(`^\\s*#\\s*(?:${keyPattern}):.*$`);
  return lines.filter((line, i) => i <= block.start || i >= block.end || !commentRegex.test(line)).join('\n');
}

const isTopLevelLine = (line: string): boolean => line.length > 0 && !line.startsWith(' ') && !line.startsWith('#');

const isSiblingComponentLine = (line: string): boolean =>
  line.length > 0 && line.startsWith('  ') && !line.startsWith('    ') && !line.startsWith('  #');

/** Line range of `<section>.<componentName>` in serialized YAML: its key line up to the next block. */
function findComponentBlock(
  lines: string[],
  section: string,
  componentName: string
): { start: number; end: number } | undefined {
  const sectionRegex = new RegExp(`^${section}:`);
  const sectionStart = lines.findIndex((l) => sectionRegex.test(l));
  const start = sectionStart === -1 ? -1 : findComponentStart(lines, sectionStart, componentName);
  if (start === -1) {
    return;
  }
  return { start, end: findComponentEnd(lines, start) };
}

function findComponentStart(lines: string[], sectionStart: number, componentName: string): number {
  const componentRegex = new RegExp(`^  ${escapeRegExp(componentName)}:`);
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (isTopLevelLine(lines[i])) {
      return -1; // left section
    }
    if (componentRegex.test(lines[i])) {
      return i;
    }
  }
  return -1;
}

// Component block ends at the next top-level key or next sibling component (2-space indent).
function findComponentEnd(lines: string[], componentStart: number): number {
  for (let i = componentStart + 1; i < lines.length; i++) {
    if (isTopLevelLine(lines[i]) || isSiblingComponentLine(lines[i])) {
      return i;
    }
  }
  return lines.length;
}

// Inputs use `topics` (array), outputs use `topic` (string) — per the Redpanda schemas. An existing
// list is appended to in place (never rebuilt): creating a topic from the inspector must not
// disturb the entries — or their comments — already configured. Returns the patched key.
function patchTopicName(
  doc: Document.Parsed,
  section: RedpandaSection,
  componentName: string,
  topicName: string
): string {
  if (section === 'output') {
    doc.setIn([section, componentName, 'topic'], topicName);
    return 'topic';
  }
  const existing = doc.getIn([section, componentName, 'topics']);
  if (isSeq(existing)) {
    if (!existing.toJSON().some((t: unknown) => String(t) === topicName)) {
      doc.addIn([section, componentName, 'topics'], topicName);
    }
  } else {
    doc.setIn([section, componentName, 'topics'], [topicName]);
  }
  return 'topics';
}

/** Whether a parsed component names at least one broker to connect to. */
export function hasSeedBrokers(component: unknown): boolean {
  const brokers =
    component && typeof component === 'object' ? (component as Record<string, unknown>).seed_brokers : undefined;
  return (Array.isArray(brokers) ? brokers : [brokers]).some((broker) => typeof broker === 'string' && broker !== '');
}

/**
 * Points a component that would otherwise borrow the shared client at the cluster itself, so the SASL
 * user just written is the one it connects as. Only those generated brokers get Cloud's TLS default.
 * Returns the added keys. `resolved` is the component with aliases and merge keys applied, as the flow
 * parser reads it.
 */
function ensureOwnConnection(
  doc: Document.Parsed,
  section: RedpandaSection,
  componentName: string,
  resolved: unknown
): string[] {
  const component = doc.getIn([section, componentName]);
  if (!(SHARED_CLIENT_FALLBACK_COMPONENTS.has(componentName) && isMap(component))) {
    return [];
  }
  if (hasSeedBrokers(resolved)) {
    return [];
  }
  setGeneratedSeedBrokers(doc, component);
  return ensureTlsDefault(doc, component, resolved) ? ['seed_brokers', 'tls'] : ['seed_brokers'];
}

function setGeneratedSeedBrokers(doc: Document.Parsed, component: YAMLMap): void {
  const brokers = doc.createNode([getContextualVariableSyntax('REDPANDA_BROKERS')]);
  if (component.has('seed_brokers')) {
    component.set('seed_brokers', brokers);
  } else {
    component.items.unshift(doc.createPair('seed_brokers', brokers));
  }
}

// Cloud's TLS default for generated brokers: enabled unless the component already decides. Returns
// whether a `tls` key was added.
function ensureTlsDefault(doc: Document.Parsed, component: YAMLMap, resolved: unknown): boolean {
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

export function patchRedpandaConfig(
  existingYaml: string,
  section: RedpandaSection,
  componentName: string,
  patch: RedpandaPatch
): string | undefined {
  if (!existingYaml.trim()) {
    return;
  }

  const doc = tryParseDocument(existingYaml);
  if (!doc) {
    return;
  }

  const resolved = readComponent(existingYaml, section, componentName).component;
  const patchedKeys = applyRedpandaPatch(doc, section, componentName, patch, resolved);

  try {
    return stripCommentedKeys(yamlStringify(doc, yamlConfig), patchedKeys, section, componentName);
  } catch {
    // Unserializable document: undefined, as for empty input.
  }
}

function tryParseDocument(yamlContent: string): Document.Parsed | undefined {
  try {
    return parseDocument(yamlContent);
  } catch {
    // Unparseable YAML: nothing to patch.
  }
}

/** Write the patch into the component (`resolved` is its alias-resolved form); returns the keys set. */
function applyRedpandaPatch(
  doc: Document.Parsed,
  section: RedpandaSection,
  componentName: string,
  patch: RedpandaPatch,
  resolved: Record<string, unknown> | undefined
): string[] {
  const patchedKeys: string[] = [];

  if (patch.topicName) {
    patchedKeys.push(patchTopicName(doc, section, componentName, patch.topicName));
  }

  // Left alone when the input already reads with it, which may come from a merge key.
  if (patch.consumerGroup && section === 'input' && resolved?.consumer_group !== patch.consumerGroup) {
    doc.setIn([section, componentName, 'consumer_group'], patch.consumerGroup);
    patchedKeys.push('consumer_group');
  }

  if (patch.sasl) {
    patchedKeys.push(...patchSasl(doc, section, componentName, patch.sasl, resolved));
  }
  return patchedKeys;
}

function patchSasl(
  doc: Document.Parsed,
  section: RedpandaSection,
  componentName: string,
  sasl: NonNullable<RedpandaPatch['sasl']>,
  resolved: Record<string, unknown> | undefined
): string[] {
  if (componentName === 'redpanda_common') {
    // redpanda_common keeps SASL in a top-level `redpanda:` block.
    doc.setIn(['redpanda', 'sasl'], sasl);
    return ['sasl'];
  }
  doc.setIn([section, componentName, 'sasl'], sasl);
  return [...ensureOwnConnection(doc, section, componentName, resolved), 'sasl'];
}

/** Build a RedpandaPatch and apply it to existing YAML. */
export function tryPatchRedpandaYaml(
  yamlContent: string,
  section: RedpandaSection,
  componentName: string,
  result: RedpandaSetupResultLike
): string | undefined {
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
export function usesServiceAccountLogin(yamlContent: string): boolean {
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

/**
 * One input or output component as plain values. `merge: true` resolves `<<: *anchor` keys, matching
 * the flow parser and extractAllTopics, so values pulled from a shared anchor count as set. parseDocument
 * collects structural errors instead of throwing, so malformed-but-parseable YAML reads as a missing
 * component rather than a parse error.
 */
function readComponent(
  yamlContent: string,
  section: RedpandaSection,
  componentName: string
): { component: Record<string, unknown> | undefined; parseError: boolean } {
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

/** `parsed[section][componentName]` when it is an object. */
function componentObjectIn(
  parsed: unknown,
  section: RedpandaSection,
  componentName: string
): Record<string, unknown> | undefined {
  const sectionObj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[section] : undefined;
  const component =
    sectionObj && typeof sectionObj === 'object' ? (sectionObj as Record<string, unknown>)[componentName] : undefined;
  if (!component || typeof component !== 'object' || Array.isArray(component)) {
    return;
  }
  return component as Record<string, unknown>;
}

/**
 * Extract topic(s) from a Redpanda connector. All Redpanda types keep topics at
 * `[section].[componentName].topics[]` (inputs) or `.topic` (outputs).
 */
export function extractConnectorTopics(
  yamlContent: string,
  section: RedpandaSection,
  componentName: string
): { topics: string[] | undefined; parseError: boolean } {
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
export function extractConnectorConsumerGroup(yamlContent: string, componentName: string): string | undefined {
  const group = readComponent(yamlContent, 'input', componentName).component?.consumer_group;
  return typeof group === 'string' && group !== '' ? group : undefined;
}

/** Extract all referenced topic names from input/output configs. */
export function extractAllTopics(yamlContent: string): string[] {
  if (!yamlContent.trim()) {
    return [];
  }

  const topics = new Set<string>();
  try {
    const config = parseYaml(yamlContent, { merge: true }) as Record<string, unknown> | null;
    if (!config) {
      return [];
    }
    // Circular alias configs (`a: &x {b: *x}`) parse to circular objects — guard revisits.
    walkForTopics(config, topics, new WeakSet<object>());
  } catch {
    return [];
  }
  return [...topics];
}

function walkForTopics(obj: unknown, topics: Set<string>, seen: WeakSet<object>): void {
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

// Collects a `topic`/`topics` entry's names; false when the entry isn't one, so the walk descends.
function addTopicValue(key: string, value: unknown, topics: Set<string>): boolean {
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
): string {
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

// Visual-editor mutations: pure yaml -> (yaml | null) transforms over a parsed Document so comments/
// formatting survive; `null` on parse failure keeps prior content.

export type ResourceArrayKey = 'cache_resources' | 'rate_limit_resources';

/**
 * Addresses a visually editable component. Early kinds are top-level conveniences (with tailored
 * prune-on-delete); `path` addresses any nested component by exact YAML location + schema type.
 */
export type EditTarget =
  | { kind: 'input' }
  | { kind: 'output' }
  | { kind: 'processor'; index: number }
  | { kind: 'resource'; resourceKey: ResourceArrayKey; index: number }
  | { kind: 'path'; path: (string | number)[]; componentType: ConnectComponentType }
  // A `switch` case object — edited for its routing condition; body components are their own nodes.
  | { kind: 'switchCase'; path: (string | number)[] };

/** The YAML path (for `getIn`/`setIn`) of an edit target's component object. */
export function editTargetPath(target: EditTarget): (string | number)[] {
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

function isEmptySeq(node: unknown): boolean {
  return isSeq(node) && node.items.length === 0;
}

function isEmptyMap(node: unknown): boolean {
  const items = (node as { items?: unknown[] } | undefined)?.items;
  return Array.isArray(items) && items.length === 0;
}

// After a delete, drop now-empty TOP-LEVEL containers so the diagram falls back to its placeholder.
// Nested arrays deliberately stay `[]` — deleting the key can hide surviving content or leave `- {}` cruft.
function pruneEmptyContainers(doc: Document.Parsed, target: EditTarget): void {
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
    // *_resources items are path targets, but their array is still a top-level container — drop when emptied.
    doc.delete(target.path[0]);
  }
}

/** The component type an edit target loads its schema/config as. */
export function targetComponentType(target: EditTarget): ConnectComponentType {
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
      // Never used for rendering (the inspector special-cases switchCase first).
      return 'processor';
    default:
      return target.resourceKey === 'cache_resources' ? 'cache' : 'rate_limit';
  }
}

// Structural equality of two edit targets — to find the parsed node for a just-inserted target.
// Path/switchCase targets are identified by their YAML path; the rest by their discriminant fields.
export function editTargetsEqual(a: EditTarget | undefined, b: EditTarget): boolean {
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
  return true; // input / output — singletons, kind match is enough
}

/** Read the component object at an edit target as plain JS (for the edit dialog). */
export function getComponentAt(yaml: string, target: EditTarget): Record<string, unknown> | undefined {
  try {
    const node = parseDocument(yaml).getIn(editTargetPath(target)) as { toJSON?: () => unknown } | undefined;
    const obj = node?.toJSON?.();
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : undefined;
  } catch {
    // Unparseable YAML: no component at the target.
  }
}

export function setComponentAt(
  yaml: string,
  target: EditTarget,
  componentObject: Record<string, unknown>
): string | null {
  try {
    const doc = parseDocument(yaml);
    const path = editTargetPath(target);
    // Only overwrite an existing node: writing to a stale path (external edit / undo) would make
    // setIn pad a sequence with `- null` or inject a phantom component under a padded parent.
    if (doc.getIn(path) === undefined) {
      return null;
    }
    doc.setIn(path, componentObject);
    return doc.toString(YAML_STRINGIFY_OPTIONS);
  } catch {
    return null;
  }
}

/** Remove the component at an edit target, pruning containers left empty. */
export function removeComponentAt(yaml: string, target: EditTarget): string | null {
  try {
    const doc = parseDocument(yaml);
    doc.deleteIn(editTargetPath(target));
    pruneEmptyContainers(doc, target);
    const out = doc.toString(YAML_STRINGIFY_OPTIONS);
    // Deleting the last component leaves `{}` — normalize to a truly blank config so the
    // editor and canvas fall back to their empty states.
    return isBlankConfigText(out) ? '' : out;
  } catch {
    return null;
  }
}

// Items in the sequence at `path` (0 if absent). Locates a just-inserted item (an append lands at length-1).
export function seqLengthAt(yaml: string, path: (string | number)[]): number {
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
): string | null {
  try {
    const doc = parseDocument(yaml);
    const seq = doc.getIn(containerPath);
    if (isSeq(seq)) {
      const clamped = Math.max(0, Math.min(index, seq.items.length));
      seq.items.splice(clamped, 0, doc.createNode(componentObject));
    } else if (seq === undefined || seq === null) {
      doc.setIn(containerPath, [componentObject]);
    } else {
      // The container exists but isn't a sequence (malformed YAML) — refuse rather than clobber it.
      return null;
    }
    return doc.toString(YAML_STRINGIFY_OPTIONS);
  } catch {
    return null;
  }
}

/** Append a resource object to a resource array (creating the array as needed). */
export function appendResource(
  yaml: string,
  resourceKey: ResourceArrayKey,
  resourceObject: Record<string, unknown>
): string | null {
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
): Record<string, unknown> | undefined {
  const yaml = getConnectTemplate({ connectionName, connectionType, components, existingYaml: '' });
  if (!yaml) {
    return;
  }
  try {
    const parsed = parseYaml(yaml) as Record<string, unknown> | null;
    return parsed ? templateComponent(parsed, connectionType) : undefined;
  } catch {
    // Unparseable template: nothing to insert, as when no template exists.
  }
}

type InsertableComponentType = 'processor' | 'cache' | 'rate_limit' | 'input' | 'output';

/** The bare component a parsed template wraps: its first processor/resource, or its input/output. */
function templateComponent(
  parsed: Record<string, unknown>,
  connectionType: InsertableComponentType
): Record<string, unknown> | undefined {
  if (connectionType === 'processor') {
    const procs = (parsed.pipeline as { processors?: unknown[] } | undefined)?.processors;
    return Array.isArray(procs) ? (procs[0] as Record<string, unknown>) : undefined;
  }
  if (connectionType === 'input' || connectionType === 'output') {
    // Bare input/output object (e.g. `{ kafka: {...} }`) for a broker/fallback/switch member array.
    const obj = parsed[connectionType];
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : undefined;
  }
  const key: ResourceArrayKey = connectionType === 'cache' ? 'cache_resources' : 'rate_limit_resources';
  const arr = parsed[key];
  return Array.isArray(arr) ? (arr[0] as Record<string, unknown>) : undefined;
}

// Resource references: a `cache`/`rate_limit` processor's `resource:` must equal a `*_resources`
// entry's `label:`. These helpers link by label so references never drift out of sync.

export type ResourceKind = 'cache' | 'rate_limit';

const RESOURCE_KEY_BY_KIND: Record<ResourceKind, ResourceArrayKey> = {
  cache: 'cache_resources',
  rate_limit: 'rate_limit_resources',
};

/** The top-level resource array key for a kind (cache → cache_resources). */
export function resourceArrayKey(kind: ResourceKind): ResourceArrayKey {
  return RESOURCE_KEY_BY_KIND[kind];
}

/** The resource kind a `cache`/`rate_limit` component name maps to, else undefined. */
export function resourceKindForComponentName(name: string): ResourceKind | undefined {
  return name === 'cache' || name === 'rate_limit' ? name : undefined;
}

/** The resource kind of a `resource` edit target (cache_resources → cache, …). */
export function resourceTargetKind(target: EditTarget): ResourceKind | undefined {
  if (target.kind !== 'resource') {
    return;
  }
  return target.resourceKey === 'cache_resources' ? 'cache' : 'rate_limit';
}

// Resource kinds a reference can point at: cache/rate_limit plus the section-scoped `*_resources`
// arrays reached through `resource:` indirection components.
export type ResourceRefKind = ResourceKind | 'input' | 'processor' | 'output';

/**
 * The resource kind a FIELD NAME references by string value — dedupe's `cache:`, a CDC input's
 * `checkpoint_cache:`, http's `rate_limit:`. Shared by the flow parser's candidate promotion and
 * the rename/count visitors below so a ref recognised on the canvas is also followed on rename.
 */
export function resourceKindForFieldName(name: string): ResourceKind | undefined {
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
export function pathResourceRefKind(target: EditTarget): ResourceRefKind | undefined {
  if (target.kind !== 'path' || target.path.length !== 2) {
    return;
  }
  const [key] = target.path;
  return typeof key === 'string' ? PATH_RESOURCE_REF_KIND[key] : undefined;
}

/** The ref kind an edit target's component can be referenced by, across both target shapes. */
export function resourceRefKindForTarget(target: EditTarget): ResourceRefKind | undefined {
  return resourceTargetKind(target) ?? pathResourceRefKind(target);
}

/** Labels of every resource of a kind, in document order — the options for a reference dropdown. */
export function listResourceLabels(yaml: string, kind: ResourceKind): string[] {
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

/** Pick a label not already used by a resource of this kind, suffixing `_N` on collision. */
function uniqueResourceLabel(existing: string[], base: string): string {
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
): { yaml: string; label: string } | null {
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

// The kind a `resource:` pair references, from its nearest decisive ancestor key: inside a
// `cache`/`rate_limit` component it is that component's own resource field; under `input(s)`/
// `output(s)`/`processors` it is a section indirection running a `*_resources` entry.
function resourcePairRefKind(path: readonly unknown[]): ResourceRefKind | undefined {
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
      // Not decisive (broker, cases, …) — keep walking up.
    }
  }
}

// Visit every reference to a resource label: `resource:` pairs plus name-referencing fields
// (`cache:`, `checkpoint_cache:`, `rate_limit:`). With `kind`, only references of that kind,
// so a cache rename can't touch a same-labelled rate_limit or input resource reference.
function visitResourceReferences(
  doc: Document.Parsed,
  label: string,
  kind: ResourceRefKind | undefined,
  onMatch: (value: { value: unknown }) => void
): void {
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
      // A non-`resource` field only counts as a reference when its NAME marks it as one.
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
export function renameResourceReferences(
  yaml: string,
  oldLabel: string,
  newLabel: string,
  kind?: ResourceRefKind
): string | null {
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
export function countResourceReferences(yaml: string, label: string, kind?: ResourceRefKind): number {
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
