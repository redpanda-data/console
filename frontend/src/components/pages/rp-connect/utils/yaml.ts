import { ConnectError } from '@connectrpc/connect';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { Document, parseDocument, parse as parseYaml, stringify as yamlStringify } from 'yaml';

import { schemaToConfig } from './schema';
import { convertToScreamingSnakeCase, getSecretSyntax } from '../types/constants';
import type { ConnectComponentSpec, ConnectConfigObject, RawFieldSpec } from '../types/schema';

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

const mergeCacheResource = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  const cacheResourcesNode = doc.getIn(['cache_resources']) as { toJSON?: () => unknown } | undefined;
  const cacheResources = (cacheResourcesNode?.toJSON?.() as unknown[]) || [];

  const cacheConfigObj = newConfigObject as Record<string, unknown[]>;
  // biome-ignore lint/style/useConst: newResource.label is mutated below
  let newResource = cacheConfigObj?.cache_resources?.[0] as Record<string, unknown> | undefined;

  if (newResource) {
    const existingLabels = Array.isArray(cacheResources)
      ? (cacheResources as Record<string, unknown>[]).map((r) => r?.label).filter(Boolean)
      : [];

    if (existingLabels.includes(newResource.label as string)) {
      let counter = 1;
      let uniqueLabel = `${newResource.label}_${counter}`;
      while (existingLabels.includes(uniqueLabel)) {
        counter += 1;
        uniqueLabel = `${newResource.label}_${counter}`;
      }
      newResource.label = uniqueLabel;
    }

    doc.setIn(['cache_resources'], [...(cacheResources as unknown[]), newResource]);
  }
};

const mergeRateLimitResource = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  const rateLimitResourcesNode = doc.getIn(['rate_limit_resources']) as { toJSON?: () => unknown } | undefined;
  const rateLimitResources = (rateLimitResourcesNode?.toJSON?.() as unknown[]) || [];

  const rateLimitConfigObj = newConfigObject as Record<string, unknown[]>;
  // biome-ignore lint/style/useConst: newResource.label is mutated below
  let newResource = rateLimitConfigObj?.rate_limit_resources?.[0] as Record<string, unknown> | undefined;

  if (newResource) {
    const existingLabels = Array.isArray(rateLimitResources)
      ? (rateLimitResources as Record<string, unknown>[]).map((r) => r?.label).filter(Boolean)
      : [];

    if (existingLabels.includes(newResource.label as string)) {
      let counter = 1;
      let uniqueLabel = `${newResource.label}_${counter}`;
      while (existingLabels.includes(uniqueLabel)) {
        counter += 1;
        uniqueLabel = `${newResource.label}_${counter}`;
      }
      newResource.label = uniqueLabel;
    }

    doc.setIn(['rate_limit_resources'], [...(rateLimitResources as unknown[]), newResource]);
  }
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
      mergeCacheResource(doc, newConfigObject);
      break;
    case 'rate_limit':
      mergeRateLimitResource(doc, newConfigObject);
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
function stripCommentedKeys(yaml: string, keys: string[], section: string): string {
  if (keys.length === 0) {
    return yaml;
  }

  const lines = yaml.split('\n');
  const keyPattern = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const commentRegex = new RegExp(`^\\s*#\\s*(?:${keyPattern}):.*$`);

  // Find the section block boundaries so we only strip comments within the patched section
  const sectionRegex = new RegExp(`^${section}:`);
  const sectionStart = lines.findIndex((l) => sectionRegex.test(l));
  if (sectionStart === -1) return yaml;

  // Section ends at the next top-level key (no leading whitespace)
  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (lines[i].length > 0 && !lines[i].startsWith(' ') && !lines[i].startsWith('#')) {
      sectionEnd = i;
      break;
    }
  }

  return lines
    .filter((line, i) => {
      if (i < sectionStart || i >= sectionEnd) return true;
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
    return stripCommentedKeys(result, patchedKeys, section);
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
): string[] | undefined {
  if (!yamlContent.trim()) {
    return;
  }

  let doc: Document.Parsed;
  try {
    doc = parseDocument(yamlContent);
  } catch {
    return;
  }

  const topicsNode = doc.getIn([section, componentName, 'topics']);
  // doc.getIn returns a YAMLSeq node for sequences, not a plain JS array — convert first
  const topics =
    topicsNode != null && typeof topicsNode === 'object' && 'toJSON' in topicsNode
      ? (topicsNode as { toJSON(): unknown }).toJSON()
      : topicsNode;
  if (Array.isArray(topics)) {
    const filtered = topics.filter((t): t is string => typeof t === 'string' && t !== '');
    return filtered.length > 0 ? filtered : undefined;
  }

  const topic = doc.getIn([section, componentName, 'topic']);
  if (typeof topic === 'string' && topic !== '') {
    return [topic];
  }

  return;
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
