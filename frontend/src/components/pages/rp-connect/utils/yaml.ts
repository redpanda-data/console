import { ConnectError } from '@connectrpc/connect';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { Document, isScalar, isSeq, parseDocument, parse as parseYaml, visit, stringify as yamlStringify } from 'yaml';

import { schemaToConfig } from './schema';
import { convertToScreamingSnakeCase, getSecretSyntax } from '../types/constants';
import type { ConnectComponentSpec, ConnectComponentType, ConnectConfigObject, RawFieldSpec } from '../types/schema';

// ============================================================================
// Shared pure YAML helpers (moved from yaml-parsing.ts)
// ============================================================================

/** Keys that appear as siblings to the actual component name (e.g. `label`). */
const RESERVED_COMPONENT_KEYS = new Set(['label']);

/** Extract the component name from an object, skipping reserved metadata keys like `label`. */
export const firstKey = (obj: unknown): string | undefined => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return;
  }
  return Object.keys(obj).find((k) => !RESERVED_COMPONENT_KEYS.has(k));
};

/** Alias used within this file. */
const componentName = firstKey;

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
    const cases = (value as { cases?: { output?: unknown }[] }).cases;
    if (Array.isArray(cases)) {
      return cases.map((c) => firstKey(c.output)).filter((k): k is string => !!k);
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
    if (Array.isArray(processors)) {
      doc.setIn(['pipeline', 'processors'], [...processors, newProcessor]);
    } else {
      doc.setIn(['pipeline', 'processors'], [newProcessor]);
    }
  }
};

// Append a cache_resources / rate_limit_resources entry, suffixing its label on
// collision so two resources never share a label (which would make the link ambiguous).
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
      // Skip 'redpanda' key if it already exists (for redpanda_common components)
      // This prevents duplicate top-level redpanda blocks when using multiple redpanda_common components
      if (key === 'redpanda' && doc.has('redpanda')) {
        continue;
      }
      doc.set(key, value);
    }
  }
};

const mergeScanner = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): Document.Parsed => {
  const inputNode = doc.get('input') as { toJSON?: () => unknown } | undefined;
  if (!inputNode) {
    return doc;
  }

  const inputObj = (inputNode.toJSON?.() as Record<string, unknown>) || {};
  const inputType = Object.keys(inputObj)[0];
  if (!inputType) {
    return doc;
  }

  const scannerName = Object.keys(newConfigObject as Record<string, unknown>)[0];
  const scannerConfig = (newConfigObject as Record<string, unknown>)[scannerName];

  doc.setIn(['input', inputType, 'scanner'], scannerConfig);
  return doc;
};

type DetectedComponentType = 'processor' | 'cache' | 'rate_limit' | 'root' | 'scanner' | 'unknown';

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

  if (
    newConfigObject.input ||
    newConfigObject.output ||
    newConfigObject.buffer ||
    newConfigObject.metrics ||
    newConfigObject.tracer
  ) {
    return 'root';
  }

  // Check if this might be a scanner
  const keys = Object.keys(newConfigObject);
  if (
    keys.length === 1 &&
    doc?.has('input') &&
    keys[0] &&
    keys[0] !== 'input' &&
    keys[0] !== 'output' &&
    keys[0] !== 'buffer' &&
    keys[0] !== 'metrics' &&
    keys[0] !== 'tracer'
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
  // With inline comment: `  key: __REQUIRED_FIELD__ # comment` → `  # key: comment`
  let result = yamlString.replace(/^(\s*)([\w][\w.-]*): ['"]?__REQUIRED_FIELD__['"]?\s*#\s*(.+)$/gm, '$1# $2: $3');
  // Without comment (fallback): `  key: __REQUIRED_FIELD__` → `  # key: Required`
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
    // Check if this is a root-level key
    const currentIndent = line.length - line.trimStart().length;
    if (currentIndent === 0 && line.includes(':')) {
      const keyMatch = line.match(keyMatchRegex);
      if (keyMatch) {
        const cleanKey = keyMatch[1].trim();
        // Add spacing before root components (except first)
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
  lineWidth: 120,
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

    // Determine if this is a parent object (has nested children) vs an array or leaf
    const isParentObject = pair.value?.items && fieldSpec.children;
    const isArray = pair.value?.items && !fieldSpec.children;

    if (fieldSpec.comment) {
      // For arrays, add comment to the key (inline with the field name)
      // For leaf values, add to the value (inline with the value)
      // For parent objects, skip (they get comments on their children)
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
      configPath = ['pipeline', 'processors', '0', specName];
      break;
    case 'cache':
    case 'rate_limit': {
      const resourceKey = componentSpec.type === 'cache' ? 'cache_resources' : 'rate_limit_resources';
      configPath = [resourceKey, '0', specName];
      break;
    }
    case 'scanner':
      configPath = [specName];
      break;
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
      // Not a valid key or array index - stop navigation
      break;
    } else {
      // It's an array index
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
      // It's a merged document - regenerate to ensure consistent structure
      // This fixes navigation issues with nodes added via doc.set()
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

    // Return empty string - the existing YAML in the editor will be preserved
    // This prevents JSON output from appearing
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
  // Phase 0: Find the component spec for the selected connectionName and connectionType
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

  // Phase 1: Generate config object for new component
  const result = schemaToConfig(componentSpec, showAdvancedFields);
  if (!result) {
    return;
  }

  const { config: newConfigObject, spec } = result;

  // Phase 2 & 3: Merge with existing (if any) and convert to YAML
  if (existingYaml) {
    const mergedConfig = mergeConnectConfigs(existingYaml, newConfigObject);

    // If merge failed (returned undefined), keep existing YAML
    if (!mergedConfig) {
      return existingYaml;
    }

    const yamlResult = configToYaml(mergedConfig, spec);

    // If YAML conversion failed (returned empty), keep existing YAML
    if (!yamlResult) {
      return existingYaml;
    }

    return yamlResult;
  }

  return configToYaml(newConfigObject, spec);
};

// ============================================================================
// Config Component Parsing (used by pipeline list)
// ============================================================================

type ParsedYamlConfig = {
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  pipeline?: { processors?: Record<string, unknown>[] };
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
    const config = parseYaml(configYaml) as ParsedYamlConfig | null;
    if (!config) {
      return empty;
    }

    const processors = Array.isArray(config.pipeline?.processors)
      ? config.pipeline.processors.map(componentName).filter((p): p is string => !!p)
      : [];

    const inputObj = config.input;
    let inputs: string[] = [];
    if (inputObj && typeof inputObj === 'object') {
      const inputKey = componentName(inputObj);
      if (inputKey) {
        inputs = parseMultiInputs(inputKey, inputObj[inputKey]) ?? [inputKey];
      }
    }

    const outputObj = config.output;
    let outputs: string[] = [];
    if (outputObj && typeof outputObj === 'object') {
      const outputKey = componentName(outputObj);
      if (outputKey) {
        outputs = parseMultiOutputs(outputKey, outputObj[outputKey]) ?? [outputKey];
      }
    }

    return { inputs, processors, outputs };
  } catch {
    return empty;
  }
};

// ============================================================================
// Topic extraction (for connectors display)
// ============================================================================

// ============================================================================
// Surgical YAML patching for Redpanda components
// ============================================================================

export type RedpandaPatch = {
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

/** Build a SASL patch array from setup result data. */
export function buildSaslPatch(result: RedpandaSetupResultLike): RedpandaPatch['sasl'] | undefined {
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

/**
 * Surgically patches topic and/or SASL fields in an existing YAML config
 * without regenerating the entire component block.
 *
 * - Topics: sets `topics: [topicName]` or `topic: topicName` depending on which
 *   field already exists in the component config. Defaults to `topics` array.
 * - SASL: for `redpanda_common`, patches `redpanda.sasl` at root level.
 *   For all other components, patches `[section].componentName.sasl`.
 *
 * Returns the patched YAML string, or undefined if parsing fails.
 */
/**
 * Remove commented-out lines for keys that have just been patched.
 * E.g. if `topics` was patched, strip `# topics: Required - ...` so the
 * user doesn't see both the comment placeholder and the real value.
 */
function stripCommentedKeys(yaml: string, keys: string[], section: string, componentName: string): string {
  if (keys.length === 0) {
    return yaml;
  }

  const lines = yaml.split('\n');
  const keyPattern = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const commentRegex = new RegExp(`^\\s*#\\s*(?:${keyPattern}):.*$`);

  // Find the section start (e.g., `input:`)
  const sectionRegex = new RegExp(`^${section}:`);
  const sectionStart = lines.findIndex((l) => sectionRegex.test(l));
  if (sectionStart === -1) return yaml;

  // Find the specific component within the section (e.g., `  kafka_franz:`)
  const componentRegex = new RegExp(`^  ${componentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`);
  let componentStart = -1;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    // Stop if we hit another top-level key (left the section)
    if (lines[i].length > 0 && !lines[i].startsWith(' ') && !lines[i].startsWith('#')) break;
    if (componentRegex.test(lines[i])) {
      componentStart = i;
      break;
    }
  }
  if (componentStart === -1) return yaml;

  // Component block ends at the next sibling at the same indent level (2-space indent)
  let componentEnd = lines.length;
  for (let i = componentStart + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at next top-level key or next sibling component (2-space indent, non-comment, non-empty)
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
  section: 'input' | 'output',
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
    // Inputs use `topics` (string array), outputs use `topic` (singular string) —
    // matches the actual Redpanda component schemas.
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
      // redpanda_common uses a top-level `redpanda:` block for SASL
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

/** Build a RedpandaPatch and apply it to existing YAML. Returns patched YAML or undefined. */
export function tryPatchRedpandaYaml(
  yamlContent: string,
  section: 'input' | 'output',
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
 * Extract topic(s) configured on a Redpanda connector from YAML.
 * Works for all Redpanda component types — topics are always at
 * `[section].[componentName].topics[]` (inputs) or `.topic` (outputs).
 */
export function extractConnectorTopics(
  yamlContent: string,
  section: 'input' | 'output',
  componentName: string
): { topics: string[] | undefined; parseError: boolean } {
  if (!yamlContent.trim()) {
    return { topics: undefined, parseError: false };
  }

  let doc: Document.Parsed;
  try {
    doc = parseDocument(yamlContent);
  } catch {
    return { topics: undefined, parseError: true };
  }

  const topicsNode = doc.getIn([section, componentName, 'topics']);
  // doc.getIn returns a YAMLSeq node for sequences, not a plain JS array — convert first
  const topics =
    topicsNode != null && typeof topicsNode === 'object' && 'toJSON' in topicsNode
      ? (topicsNode as { toJSON(): unknown }).toJSON()
      : topicsNode;
  if (Array.isArray(topics)) {
    const filtered = topics.filter((t): t is string => typeof t === 'string' && t !== '');
    return { topics: filtered.length > 0 ? filtered : undefined, parseError: false };
  }

  const topic = doc.getIn([section, componentName, 'topic']);
  if (typeof topic === 'string' && topic !== '') {
    return { topics: [topic], parseError: false };
  }

  return { topics: undefined, parseError: false };
}

/** Check whether a component already has an entry under [section][componentName] in the YAML. */
function componentExistsInYaml(yamlContent: string, section: string, componentName: string): boolean {
  if (!yamlContent.trim()) {
    return false;
  }
  try {
    const doc = parseDocument(yamlContent);
    return doc.getIn([section, componentName]) != null;
  } catch {
    return false;
  }
}

/**
 * Apply Redpanda setup result to YAML.
 *
 * - If the component already exists in the YAML, surgically patches only the
 *   requested fields (topic / SASL) without touching anything else.
 * - If the component is new (not yet in the YAML), generates a full template
 *   via getConnectTemplate and then patches topic/user onto it.
 */
export function applyRedpandaSetup({
  yamlContent,
  connectionName,
  connectionType,
  result,
  components,
}: {
  yamlContent: string;
  connectionName: string;
  connectionType: 'input' | 'output';
  result: RedpandaSetupResultLike;
  components: ConnectComponentSpec[];
}): string | undefined {
  // Only try surgical patch if the component already exists (Flow B — hint buttons).
  // For new components (Flow A — picker), skip to template generation.
  if (componentExistsInYaml(yamlContent, connectionType, connectionName)) {
    const patched = tryPatchRedpandaYaml(yamlContent, connectionType, connectionName, result);
    if (patched) {
      return patched;
    }
  }

  // Generate full template, then patch topic/user onto it
  const base = getConnectTemplate({
    connectionName,
    connectionType,
    components,
    showAdvancedFields: false,
    existingYaml: yamlContent,
  });
  if (!base) {
    return;
  }

  return tryPatchRedpandaYaml(base, connectionType, connectionName, result) ?? base;
}

/** Extract all referenced topic names from input/output configs. */
export function extractAllTopics(yamlContent: string): string[] {
  if (!yamlContent.trim()) {
    return [];
  }

  let config: Record<string, unknown>;
  try {
    config = parseYaml(yamlContent) as Record<string, unknown>;
  } catch {
    return [];
  }

  if (!config) {
    return [];
  }

  const topics = new Set<string>();

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: recursive tree walker
  function walkForTopics(obj: unknown): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

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

  walkForTopics(config);
  return [...topics];
}

/**
 * Generates YAML from onboarding wizard connection data by composing
 * input and (optionally) output templates via getConnectTemplate.
 */
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

// ============================================================================
// Visual-editor mutations
// ----------------------------------------------------------------------------
// Deterministic, position-aware edits used by the visual editor. Each is a pure
// (yaml string -> yaml string | null) transform operating on a parsed Document,
// so comments/formatting survive and the YAML stays the single source of truth.
// `null` is returned on parse failure so callers can keep the prior content.
//
// Only top-level locations are addressable (input, output, top-level
// processors, cache/rate-limit resources). Nested components are read-only in
// the visual editor and edited via raw YAML — this is why no generic "path"
// abstraction is needed.
// ============================================================================

export type ResourceArrayKey = 'cache_resources' | 'rate_limit_resources';

/**
 * Addresses a visually editable component in the config. The first kinds are
 * top-level conveniences (with tailored prune-on-delete); `path` addresses any
 * component — including ones nested inside branch/switch/try/broker — by its exact
 * YAML location, carrying the component type so the right schema can be loaded.
 */
export type EditTarget =
  | { kind: 'input' }
  | { kind: 'output' }
  | { kind: 'processor'; index: number }
  | { kind: 'resource'; resourceKey: ResourceArrayKey; index: number }
  | { kind: 'path'; path: (string | number)[]; componentType: ConnectComponentType }
  // A `switch` case object (`{ check, processors|output }`) — edited for its routing
  // condition; its body components are their own nodes.
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

// After a delete, drop containers that have become empty so the diagram falls
// back to its placeholder (e.g. removing the last processor removes `pipeline`).
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
  } else if (target.kind === 'path' || target.kind === 'switchCase') {
    // Removing a nested component: if its containing array is now empty, drop the
    // array key too (e.g. an emptied branch's `processors`) so it doesn't linger.
    const last = target.path.at(-1);
    if (typeof last === 'number') {
      const arrayPath = target.path.slice(0, -1);
      if (arrayPath.length > 0 && isEmptySeq(doc.getIn(arrayPath))) {
        doc.deleteIn(arrayPath);
      }
    }
  }
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

/** Replace the component object at an edit target with a new one. */
export function setComponentAt(
  yaml: string,
  target: EditTarget,
  componentObject: Record<string, unknown>
): string | null {
  try {
    const doc = parseDocument(yaml);
    doc.setIn(editTargetPath(target), componentObject);
    return doc.toString();
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
    return doc.toString();
  } catch {
    return null;
  }
}

/**
 * Insert a component object into any array in the config at `index` (creating the
 * array as needed). `containerPath` is the YAML path of the target array — e.g.
 * `['pipeline','processors']` (top level), `['pipeline','processors',0,'switch','cases',1,'processors']`
 * (a switch case's processors), or `['input','broker','inputs']`. This is the one
 * primitive behind every visual insertion, nested or not.
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
    } else {
      // No array yet (or the container is absent) — create it with this lone item.
      doc.setIn(containerPath, [componentObject]);
    }
    return doc.toString();
  } catch {
    return null;
  }
}

/** Insert a processor object into `pipeline.processors` at `index`. Thin wrapper over `insertComponentAt`. */
export function insertProcessorAt(
  yaml: string,
  index: number,
  processorObject: Record<string, unknown>
): string | null {
  return insertComponentAt(yaml, ['pipeline', 'processors'], index, processorObject);
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
    return doc.toString();
  } catch {
    return null;
  }
}

/**
 * Build the bare component object to splice into the config for a freshly chosen
 * connector, e.g. `{ mapping: '...' }` for a processor. Reuses `getConnectTemplate`
 * (generated against empty YAML) so insert output matches templates elsewhere.
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
      // A bare input/output object (e.g. `{ kafka: {...} }`) to splice into a
      // broker/fallback/switch member array.
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

// ============================================================================
// Resource references (cache/rate_limit) — link by label, no manual sync.
// ----------------------------------------------------------------------------
// A `cache`/`rate_limit` processor points at a resource via its `resource:` field,
// which must equal a `*_resources` entry's `label:`. These helpers let the visual
// editor offer a typed dropdown, create-and-link in one step, and rename a label
// while cascading the change to every reference — so labels never drift out of sync.
// ============================================================================

export type ResourceKind = 'cache' | 'rate_limit';

const RESOURCE_KEY_BY_KIND: Record<ResourceKind, ResourceArrayKey> = {
  cache: 'cache_resources',
  rate_limit: 'rate_limit_resources',
};

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
 * Create a new resource of `kind` from a connector template and return the YAML plus
 * its (collision-safe) label, so the caller can immediately select it back into the
 * node's `resource:` field — create-and-link in one action.
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
  try {
    const doc = parseDocument(yaml);
    const key = RESOURCE_KEY_BY_KIND[kind];
    const base =
      typeof resourceObject.label === 'string' && resourceObject.label !== '' ? resourceObject.label : connectionName;
    const label = uniqueResourceLabel(listResourceLabels(yaml, kind), base);
    resourceObject.label = label;
    const seq = doc.getIn([key]);
    if (isSeq(seq)) {
      seq.items.push(doc.createNode(resourceObject));
    } else {
      doc.setIn([key], [resourceObject]);
    }
    return { yaml: doc.toString(), label };
  } catch {
    return null;
  }
}

/**
 * Repoint every `resource:` reference from `oldLabel` to `newLabel` across the whole
 * document. Matches by string value, consistent with the editor's label-based linking.
 */
export function renameResourceReferences(yaml: string, oldLabel: string, newLabel: string): string | null {
  if (oldLabel === '' || oldLabel === newLabel) {
    return yaml;
  }
  try {
    const doc = parseDocument(yaml);
    visit(doc, {
      Pair(_, pair) {
        if (
          isScalar(pair.key) &&
          pair.key.value === 'resource' &&
          isScalar(pair.value) &&
          pair.value.value === oldLabel
        ) {
          pair.value.value = newLabel;
        }
      },
    });
    return doc.toString();
  } catch {
    return null;
  }
}

/**
 * Rename a resource's `label:` and cascade the change to every `resource:` reference
 * pointing at the old label — so renaming never leaves dangling references.
 */
export function renameResourceLabel(
  yaml: string,
  resourceKey: ResourceArrayKey,
  index: number,
  newLabel: string
): string | null {
  try {
    const doc = parseDocument(yaml);
    const oldLabel = doc.getIn([resourceKey, index, 'label']);
    doc.setIn([resourceKey, index, 'label'], newLabel);
    const withLabel = doc.toString();
    return typeof oldLabel === 'string'
      ? (renameResourceReferences(withLabel, oldLabel, newLabel) ?? withLabel)
      : withLabel;
  } catch {
    return null;
  }
}

/** Count how many components reference a resource label (via their `resource:` field). */
export function countResourceReferences(yaml: string, label: string): number {
  if (!label) {
    return 0;
  }
  try {
    const doc = parseDocument(yaml);
    let count = 0;
    visit(doc, {
      Pair(_, pair) {
        if (isScalar(pair.key) && pair.key.value === 'resource' && isScalar(pair.value) && pair.value.value === label) {
          count += 1;
        }
      },
    });
    return count;
  } catch {
    return 0;
  }
}
