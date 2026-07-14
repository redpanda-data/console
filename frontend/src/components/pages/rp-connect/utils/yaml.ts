import { ConnectError } from '@connectrpc/connect';
import { toast } from 'sonner';
import { escapeRegExp } from 'utils/regex';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import {
  Document,
  isPair,
  isScalar,
  isSeq,
  parseDocument,
  parse as parseYaml,
  visit,
  stringify as yamlStringify,
} from 'yaml';

import { schemaToConfig } from './schema';
import { convertToScreamingSnakeCase, getSecretSyntax } from '../types/constants';
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
  return;
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

  return;
};

const mergeProcessor = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  const processorsNode = doc.getIn(['pipeline', 'processors']) as { toJSON?: () => unknown } | undefined;
  const processors = (processorsNode?.toJSON?.() as unknown[]) || [];

  const configObj = newConfigObject as Record<string, { processors?: unknown[] }>;
  const processorsArray = configObj?.pipeline?.processors;
  const newProcessor = Array.isArray(processorsArray) ? processorsArray[0] : undefined;

  if (newProcessor) {
    doc.setIn(['pipeline', 'processors'], Array.isArray(processors) ? [...processors, newProcessor] : [newProcessor]);
  }
};

// Append a cache_resources / rate_limit_resources entry, suffixing its label on
// collision so resources never share a label (which would make the link ambiguous).
const mergeResourceArray = (
  doc: Document.Parsed,
  newConfigObject: Partial<ConnectConfigObject>,
  key: ResourceArrayKey
): void => {
  const node = doc.getIn([key]) as { toJSON?: () => unknown } | undefined;
  const existing = (node?.toJSON?.() as unknown[]) || [];
  const newResource = (newConfigObject as Record<string, unknown[]>)?.[key]?.[0] as Record<string, unknown> | undefined;
  if (!newResource) {
    return;
  }

  const existingLabels = (Array.isArray(existing) ? (existing as Record<string, unknown>[]) : [])
    .map((r) => r?.label)
    .filter((l): l is string => typeof l === 'string' && l !== '');
  if (typeof newResource.label === 'string') {
    newResource.label = uniqueResourceLabel(existingLabels, newResource.label);
  }

  doc.setIn([key], [...existing, newResource]);
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

const mergeScanner = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  const inputNode = doc.get('input') as { toJSON?: () => unknown } | undefined;
  if (!inputNode) {
    return;
  }

  const inputObj = (inputNode.toJSON?.() as Record<string, unknown>) || {};
  const inputType = firstKey(inputObj);
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

const detectComponentType = (
  newConfigObject: Partial<ConnectConfigObject>,
  doc?: Document.Parsed
): DetectedComponentType => {
  if (newConfigObject.pipeline) {
    return 'processor';
  }

  if (newConfigObject.cache_resources) {
    return 'cache';
  }

  if (newConfigObject.rate_limit_resources) {
    return 'rate_limit';
  }

  if (ROOT_SECTION_KEYS.some((key) => newConfigObject[key])) {
    return 'root';
  }

  // Single key that isn't a known root section, with an existing input → scanner.
  const keys = Object.keys(newConfigObject);
  if (
    keys.length === 1 &&
    doc?.has('input') &&
    keys[0] &&
    !(ROOT_SECTION_KEYS as readonly string[]).includes(keys[0])
  ) {
    return 'scanner';
  }

  return 'unknown';
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

const addRootSpacing = (yamlString: string): string => {
  const lines = yamlString.split('\n');
  const processedLines: string[] = [];
  let previousRootKey: string | null = null;
  for (const line of lines) {
    if (!line.trim()) {
      processedLines.push(line);
      continue;
    }
    const currentIndent = line.length - line.trimStart().length;
    if (currentIndent === 0 && line.includes(':')) {
      const keyMatch = line.match(keyMatchRegex);
      if (keyMatch) {
        const cleanKey = keyMatch[1].trim();
        // Blank line before each root component (except the first)
        if (
          previousRootKey !== null &&
          cleanKey !== previousRootKey &&
          processedLines.length > 0 &&
          processedLines.at(-1)?.trim() !== ''
        ) {
          processedLines.push('');
        }
        previousRootKey = cleanKey;
      }
    }
    processedLines.push(line);
  }
  return processedLines.join('\n');
};

export const mergeConnectConfigs = (
  existingYaml: string,
  newConfigObject: Partial<ConnectConfigObject>
): Document.Parsed | Partial<ConnectConfigObject> | undefined => {
  if (!existingYaml.trim()) {
    return newConfigObject;
  }

  let doc: Document.Parsed;
  try {
    doc = parseDocument(existingYaml);
  } catch (error) {
    toast.error(
      formatToastErrorMessageGRPC({
        error: ConnectError.from(error),
        action: 'Parse existing YAML',
        entity: 'mergeConnectConfigs',
      })
    );
    return; // Keep existing YAML in editor
  }

  const componentType = detectComponentType(newConfigObject, doc);

  try {
    mergeByComponentType(componentType, doc, newConfigObject);
  } catch (error) {
    toast.error(
      formatToastErrorMessageGRPC({
        error: ConnectError.from(error),
        action: 'Merge selected component into existing config',
        entity: 'mergeConnectConfigs',
      })
    );
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
function addCommentsRecursive(node: YAMLNode, spec: RawFieldSpec): void {
  if (!node.items) {
    return;
  }

  if (!spec.children) {
    return;
  }

  for (const item of node.items) {
    const pair = item as YAMLPair;
    const key = pair?.key?.value;
    if (!key) {
      continue;
    }

    const fieldSpec = spec.children.find((child) => child.name === key);
    if (!fieldSpec) {
      continue;
    }

    const isParentObject = pair.value?.items && fieldSpec.children;
    const isArray = pair.value?.items && !fieldSpec.children;

    if (fieldSpec.comment) {
      // Array → comment on key; leaf → comment on value; parent object → skip (children get it).
      if (isArray && pair.key) {
        pair.key.comment = ` ${fieldSpec.comment}`;
      } else if (!isParentObject && pair.value) {
        pair.value.comment = ` ${fieldSpec.comment}`;
      }
    }

    if (isParentObject && pair.value) {
      addCommentsRecursive(pair.value, fieldSpec);
    }
  }
}

// Merges APPEND the new component to its array, so field help-comments must target the LAST
// entry (a standalone doc has exactly one, so "last" holds there too).
function lastArrayIndex(doc: Document.Parsed | Document, path: string[]): string {
  const node = doc.getIn(path) as { items?: unknown[] } | undefined;
  const length = node?.items?.length ?? 0;
  return String(length > 0 ? length - 1 : 0);
}

function addCommentsFromSpec(doc: Document.Parsed | Document, componentSpec: ConnectComponentSpec): void {
  if (!componentSpec.config) {
    return;
  }

  const specName = componentSpec.name;
  let configPath: string[] = [];

  switch (componentSpec.type) {
    case 'input':
    case 'output':
    case 'buffer':
    case 'metrics':
    case 'tracer':
      configPath = [componentSpec.type, specName];
      break;
    case 'processor':
      configPath = ['pipeline', 'processors', lastArrayIndex(doc, ['pipeline', 'processors']), specName];
      break;
    case 'cache':
    case 'rate_limit': {
      const resourceKey = componentSpec.type === 'cache' ? 'cache_resources' : 'rate_limit_resources';
      configPath = [resourceKey, lastArrayIndex(doc, [resourceKey]), specName];
      break;
    }
    case 'scanner': {
      // A merged scanner lives at `input.<type>.scanner.<name>` (see mergeScanner).
      const inputType = firstKey((doc.get('input') as { toJSON?: () => unknown } | undefined)?.toJSON?.());
      if (!inputType) {
        return;
      }
      configPath = ['input', inputType, 'scanner', specName];
      break;
    }
    default:
      return;
  }

  let currentNode: YAMLNode | undefined = doc.contents as YAMLNode;
  for (const segment of configPath) {
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

  if (currentNode && componentSpec.config) {
    addCommentsRecursive(currentNode, componentSpec.config);
  }
}

export const configToYaml = (
  configObject: Document.Parsed | Partial<ConnectConfigObject> | undefined,
  componentSpec?: ConnectComponentSpec
): string => {
  if (!configObject) {
    return '';
  }

  try {
    let doc: Document.Parsed | Document;

    if (typeof (configObject as Document.Parsed).getIn === 'function') {
      // Merged document: regenerate for consistent structure (fixes navigation for doc.set() nodes).
      const tempYaml = yamlStringify(configObject, yamlConfig);
      doc = parseDocument(tempYaml);
    } else {
      doc = new Document(configObject);
    }

    if (componentSpec) {
      addCommentsFromSpec(doc, componentSpec);
    }

    let yamlString = yamlStringify(doc, yamlConfig);
    yamlString = convertRequiredFieldSentinels(yamlString);
    yamlString = addRootSpacing(yamlString);
    return yamlString;
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
    return;
  }

  const result = schemaToConfig(componentSpec, showAdvancedFields);
  if (!result) {
    return;
  }

  const { config: newConfigObject, spec } = result;

  if (existingYaml) {
    const mergedConfig = mergeConnectConfigs(existingYaml, newConfigObject);

    if (!mergedConfig) {
      return existingYaml;
    }

    const yamlResult = configToYaml(mergedConfig, spec);
    return yamlResult || existingYaml;
  }

  return configToYaml(newConfigObject, spec);
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

    const inputObj = config.input;
    let inputs: string[] = [];
    if (inputObj && typeof inputObj === 'object') {
      const inputKey = firstKey(inputObj);
      if (inputKey) {
        inputs = parseMultiInputs(inputKey, inputObj[inputKey]) ?? [inputKey];
      }
    }

    const outputObj = config.output;
    let outputs: string[] = [];
    if (outputObj && typeof outputObj === 'object') {
      const outputKey = firstKey(outputObj);
      if (outputKey) {
        outputs = parseMultiOutputs(outputKey, outputObj[outputKey]) ?? [outputKey];
      }
    }

    return { inputs, processors, outputs };
  } catch {
    return empty;
  }
};

type RedpandaPatch = {
  topicName?: string;
  sasl?: { mechanism: string; username: string; password: string }[];
};

export type RedpandaSetupResultLike = {
  topicName?: string;
  username?: string;
  saslMechanism?: string;
  authMethod?: 'sasl' | 'service-account';
  serviceAccountSecretName?: string;
};

function buildSaslPatch(result: RedpandaSetupResultLike): RedpandaPatch['sasl'] | undefined {
  if (result.authMethod === 'service-account' && result.serviceAccountSecretName) {
    return [
      {
        mechanism: 'SCRAM-SHA-256',
        username: getSecretSyntax(`${result.serviceAccountSecretName}.client_id`),
        password: getSecretSyntax(`${result.serviceAccountSecretName}.client_secret`),
      },
    ];
  }
  if (result.username) {
    const usernameSecretId = `KAFKA_USER_${convertToScreamingSnakeCase(result.username)}`;
    const passwordSecretId = `KAFKA_PASSWORD_${convertToScreamingSnakeCase(result.username)}`;
    return [
      {
        mechanism: result.saslMechanism || 'SCRAM-SHA-256',
        username: getSecretSyntax(usernameSecretId),
        password: getSecretSyntax(passwordSecretId),
      },
    ];
  }
  return;
}

type RedpandaSection = 'input' | 'output';

// Strip commented-out placeholder lines for just-patched keys, so the user doesn't see
// both the `# topics: Required ...` comment and the real value.
function stripCommentedKeys(yaml: string, keys: string[], section: string, componentName: string): string {
  if (keys.length === 0) {
    return yaml;
  }

  const lines = yaml.split('\n');
  const keyPattern = keys.map(escapeRegExp).join('|');
  const commentRegex = new RegExp(`^\\s*#\\s*(?:${keyPattern}):.*$`);

  const sectionRegex = new RegExp(`^${section}:`);
  const sectionStart = lines.findIndex((l) => sectionRegex.test(l));
  if (sectionStart === -1) return yaml;

  const componentRegex = new RegExp(`^  ${escapeRegExp(componentName)}:`);
  let componentStart = -1;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (lines[i].length > 0 && !lines[i].startsWith(' ') && !lines[i].startsWith('#')) break; // left section
    if (componentRegex.test(lines[i])) {
      componentStart = i;
      break;
    }
  }
  if (componentStart === -1) return yaml;

  // Component block ends at the next top-level key or next sibling component (2-space indent).
  let componentEnd = lines.length;
  for (let i = componentStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('#')) {
      componentEnd = i;
      break;
    }
    if (line.length > 0 && line.startsWith('  ') && !line.startsWith('    ') && !line.startsWith('  #')) {
      componentEnd = i;
      break;
    }
  }

  return lines
    .filter((line, i) => {
      if (i <= componentStart || i >= componentEnd) return true;
      return !commentRegex.test(line);
    })
    .join('\n');
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

  let doc: Document.Parsed;
  try {
    doc = parseDocument(existingYaml);
  } catch {
    return;
  }

  const patchedKeys: string[] = [];

  if (patch.topicName) {
    // Inputs use `topics` (array), outputs use `topic` (string) — per the Redpanda schemas.
    if (section === 'output') {
      doc.setIn([section, componentName, 'topic'], patch.topicName);
      patchedKeys.push('topic');
    } else {
      doc.setIn([section, componentName, 'topics'], [patch.topicName]);
      patchedKeys.push('topics');
    }
  }

  if (patch.sasl) {
    if (componentName === 'redpanda_common') {
      // redpanda_common keeps SASL in a top-level `redpanda:` block.
      doc.setIn(['redpanda', 'sasl'], patch.sasl);
    } else {
      doc.setIn([section, componentName, 'sasl'], patch.sasl);
    }
    patchedKeys.push('sasl');
  }

  try {
    const result = yamlStringify(doc, yamlConfig);
    return stripCommentedKeys(result, patchedKeys, section, componentName);
  } catch {
    return;
  }
}

/** Build a RedpandaPatch and apply it to existing YAML. */
export function tryPatchRedpandaYaml(
  yamlContent: string,
  section: RedpandaSection,
  componentName: string,
  result: RedpandaSetupResultLike
): string | undefined {
  const patch: RedpandaPatch = {};
  if (result.topicName) {
    patch.topicName = result.topicName;
  }
  const sasl = buildSaslPatch(result);
  if (sasl) {
    patch.sasl = sasl;
  }
  if (!(patch.topicName || patch.sasl)) {
    return;
  }
  return patchRedpandaConfig(yamlContent, section, componentName, patch);
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
  if (!yamlContent.trim()) {
    return { topics: undefined, parseError: false };
  }

  // `merge: true` resolves `<<: *anchor` keys, matching the flow parser and extractAllTopics —
  // a component pulling `topics` from a shared anchor must not read as "missing topic" here.
  // parseDocument collects structural errors instead of throwing, so malformed-but-parseable
  // YAML still reads as "no topics" rather than a parse error.
  let parsed: unknown;
  try {
    parsed = parseDocument(yamlContent, { merge: true }).toJS();
  } catch {
    return { topics: undefined, parseError: true };
  }

  const sectionObj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[section] : undefined;
  const component =
    sectionObj && typeof sectionObj === 'object' ? (sectionObj as Record<string, unknown>)[componentName] : undefined;
  if (!component || typeof component !== 'object' || Array.isArray(component)) {
    return { topics: undefined, parseError: false };
  }
  const config = component as Record<string, unknown>;

  if (Array.isArray(config.topics)) {
    const filtered = config.topics.filter((t): t is string => typeof t === 'string' && t !== '');
    return { topics: filtered.length > 0 ? filtered : undefined, parseError: false };
  }

  if (typeof config.topic === 'string' && config.topic !== '') {
    return { topics: [config.topic], parseError: false };
  }

  return { topics: undefined, parseError: false };
}

/** Extract all referenced topic names from input/output configs. */
export function extractAllTopics(yamlContent: string): string[] {
  if (!yamlContent.trim()) {
    return [];
  }

  const topics = new Set<string>();
  // Circular alias configs (`a: &x {b: *x}`) parse to circular objects — guard revisits.
  const seen = new WeakSet<object>();

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: recursive tree walker
  function walkForTopics(obj: unknown): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }
    if (seen.has(obj)) {
      return;
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      for (const item of obj) {
        walkForTopics(item);
      }
      return;
    }

    const record = obj as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if ((key === 'topic' || key === 'topics') && typeof value === 'string' && value) {
        topics.add(value);
      } else if (key === 'topics' && Array.isArray(value)) {
        for (const t of value) {
          if (typeof t === 'string' && t) {
            topics.add(t);
          }
        }
      } else {
        walkForTopics(value);
      }
    }
  }

  try {
    const config = parseYaml(yamlContent, { merge: true }) as Record<string, unknown> | null;
    if (!config) {
      return [];
    }
    walkForTopics(config);
  } catch {
    return [];
  }
  return [...topics];
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
    return;
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
    return doc.toString(YAML_STRINGIFY_OPTIONS);
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
    const seq = doc.getIn([resourceKey]);
    if (isSeq(seq)) {
      seq.items.push(doc.createNode(resourceObject));
    } else {
      doc.setIn([resourceKey], [resourceObject]);
    }
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
  connectionType: 'processor' | 'cache' | 'rate_limit' | 'input' | 'output',
  components: ConnectComponentSpec[]
): Record<string, unknown> | undefined {
  const yaml = getConnectTemplate({ connectionName, connectionType, components, existingYaml: '' });
  if (!yaml) {
    return;
  }
  try {
    const parsed = parseYaml(yaml) as Record<string, unknown> | null;
    if (!parsed) {
      return;
    }
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
  } catch {
    return;
  }
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
  return;
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
  return;
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
