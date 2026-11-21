import { ConnectError } from '@connectrpc/connect';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import {
  Document,
  isDocument,
  isMap,
  isNode,
  isScalar,
  isSeq,
  type Pair,
  parseDocument,
  parse as parseYaml,
  stringify as yamlStringify,
} from 'yaml';

import { schemaToConfig } from './schema';
import { appendResource, appendToSeq, isBlankConfigText } from './yaml-component-editing';
import type { ResourceArrayKey } from './yaml-edit-target';
import { listResourceLabels, RESOURCE_KEY_BY_KIND, type ResourceKind, uniqueResourceLabel } from './yaml-resources';
import { asRecord, firstKey, slotComponentKey, unwrapReadUntil, yamlConfig } from './yaml-values';
import { isNonEmptyString } from '../../../../utils/string-utils';
import { isObject, isPresent, isUnknownArray } from '../../../../utils/type-guards';
import type { ConnectComponentSpec, ConnectConfigObject, RawFieldSpec } from '../types/schema';

// The component name of an input slot, looking through a `read_until` wrapper.
const inputSlotName = (slot: unknown): string | undefined => {
  const record = asRecord(slot);
  return record ? slotComponentKey(unwrapReadUntil(record).component) : undefined;
};

/** Extract child input names from a multi-input component (broker, sequence). */
export const parseMultiInputs = (inputKey: string, value: unknown): string[] | undefined => {
  if (
    (inputKey === 'broker' || inputKey === 'sequence') &&
    isObject(value) &&
    !isUnknownArray(value) &&
    'inputs' in value
  ) {
    const items = value.inputs;
    if (isUnknownArray(items)) {
      return items.map(inputSlotName).filter((k): k is string => k !== null && k !== undefined && k !== '');
    }
  }
};

/** Extract child output names from a multi-output component (broker, switch, fallback). */
export const parseMultiOutputs = (outputKey: string, value: unknown): string[] | undefined => {
  if (outputKey === 'broker' && isObject(value) && !isUnknownArray(value) && 'outputs' in value) {
    const items = value.outputs;
    if (isUnknownArray(items)) {
      return items.map(slotComponentKey).filter((k): k is string => k !== null && k !== undefined && k !== '');
    }
  }

  if (outputKey === 'switch' && isObject(value) && !isUnknownArray(value) && 'cases' in value) {
    const cases = value.cases;
    if (isUnknownArray(cases)) {
      return cases
        .map((c) => (isObject(c) ? slotComponentKey(c.output) : undefined))
        .filter((k): k is string => k !== null && k !== undefined && k !== '');
    }
  }

  if (outputKey === 'fallback' && isUnknownArray(value)) {
    return value.map(slotComponentKey).filter((k): k is string => k !== null && k !== undefined && k !== '');
  }
};

const mergeProcessor = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  const processorsArray = asRecord(newConfigObject.pipeline)?.processors;
  const newProcessor = isUnknownArray(processorsArray) ? processorsArray[0] : undefined;
  if (Boolean(newProcessor)) {
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
  const resources = newConfigObject[key];
  const newResource = isUnknownArray(resources) ? asRecord(resources[0]) : undefined;
  if (!newResource) {
    return;
  }

  // Read labels via toJS() so YAML aliases resolve.
  const existing = asRecord(doc.toJS())?.[key];
  const existingLabels = (isUnknownArray(existing) ? existing : [])
    .map((r) => (isObject(r) ? r.label : undefined))
    .filter((l): l is string => typeof l === 'string' && l !== '');
  if (typeof newResource.label === 'string') {
    newResource.label = uniqueResourceLabel(existingLabels, newResource.label);
  }

  appendToSeq(doc, [key], newResource);
};

const mergeRootComponent = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  if (isPresent(newConfigObject)) {
    for (const [key, value] of Object.entries(newConfigObject)) {
      // Avoid duplicate top-level redpanda blocks across multiple redpanda_common components.
      if (key === 'redpanda' && doc.has('redpanda')) {
        continue;
      }
      doc.set(key, value);
    }
  }
};

/** The root input's component type (e.g. `kafka_franz`) and its path inside any `read_until` around it. */
const rootInputComponent = (
  doc: Document.Parsed | Document
): { inputType: string; innerPath: string[] } | undefined => {
  const input = doc.get('input');
  const inputObj = isNode(input) ? asRecord(input.toJSON()) : undefined;
  const { component, innerPath } = unwrapReadUntil(inputObj ?? {});
  const inputType = slotComponentKey(component);
  return inputType !== null && inputType !== undefined && inputType !== '' ? { inputType, innerPath } : undefined;
};

const mergeScanner = (doc: Document.Parsed, newConfigObject: Partial<ConnectConfigObject>): void => {
  // A scanner belongs to the input itself, inside any `read_until` around it.
  const input = rootInputComponent(doc);
  if (!input) {
    return;
  }

  // Keep the scanner's name wrapper (`scanner: { csv: {…} }`). A default-less spec yields an
  // undefined inner config, which the serializer would drop along with the key — normalize to {}.
  const scannerName = Object.keys(newConfigObject)[0];
  if (!scannerName) {
    return;
  }
  const scannerConfig = asRecord(newConfigObject)?.[scannerName] ?? {};
  doc.setIn(['input', ...input.innerPath, input.inputType, 'scanner'], { [scannerName]: scannerConfig });
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
    ROOT_SECTION_KEYS.every((key) => !(key === keys[0]))
  );
};

const detectComponentType = (
  newConfigObject: Partial<ConnectConfigObject>,
  doc?: Document.Parsed
): DetectedComponentType => {
  const section = SECTION_COMPONENT_TYPES.find(([key]) => Boolean(newConfigObject[key]));
  if (section) {
    return section[1];
  }

  if (ROOT_SECTION_KEYS.some((key) => Boolean(newConfigObject[key]))) {
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
    case 'unknown':
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
  return keyMatchRegex.exec(line)?.[1].trim();
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

function addCommentsRecursive(node: unknown, spec: RawFieldSpec): void {
  if (!(isMap(node) && spec.children)) {
    return;
  }
  for (const pair of node.items) {
    addPairComments(pair, spec.children);
  }
}

function addPairComments(pair: Pair<unknown, unknown>, fields: RawFieldSpec[]): void {
  const key = isScalar(pair.key) ? pair.key.value : undefined;
  const fieldSpec = typeof key === 'string' && key !== '' ? fields.find((child) => child.name === key) : undefined;
  if (!fieldSpec) {
    return;
  }
  if (isNonEmptyString(fieldSpec.comment)) {
    placeFieldComment(pair, fieldSpec, fieldSpec.comment);
  }
  if (fieldSpec.children) {
    addCommentsRecursive(pair.value, fieldSpec);
  }
}

// Array → comment on key; leaf → comment on value; parent object → skip (children get it).
function placeFieldComment(pair: Pair<unknown, unknown>, fieldSpec: RawFieldSpec, comment: string): void {
  const hasItems = isMap(pair.value) || isSeq(pair.value);
  if (hasItems && !fieldSpec.children && isScalar(pair.key)) {
    pair.key.comment = ` ${comment}`;
  } else if (!(hasItems && fieldSpec.children) && isNode(pair.value)) {
    pair.value.comment = ` ${comment}`;
  }
}

// Merges APPEND the new component to its array, so field help-comments must target the LAST
// entry (a standalone doc has exactly one, so "last" holds there too).
function lastArrayIndex(doc: Document.Parsed | Document, path: string[]): string {
  const node = doc.getIn(path);
  const length = isSeq(node) || isMap(node) ? node.items.length : 0;
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
      const input = rootInputComponent(doc);
      return input ? ['input', ...input.innerPath, input.inputType, 'scanner', specName] : undefined;
    }
    case 'custom':
    default:
      return;
  }
}

// Walks map keys by name and sequence entries by index, stopping at the deepest node reached.
function nodeAlongPath(doc: Document.Parsed | Document, path: string[]): unknown {
  let currentNode: unknown = doc.contents;
  for (const segment of path) {
    if (!(isMap(currentNode) || isSeq(currentNode))) {
      break;
    }
    const foundPair = isMap(currentNode)
      ? currentNode.items.find((item) => isScalar(item.key) && item.key.value === segment)
      : undefined;
    if (foundPair && Boolean(foundPair.value)) {
      currentNode = foundPair.value;
    } else if (Number.isNaN(Number(segment))) {
      break;
    } else {
      currentNode = currentNode.items[Number(segment)];
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
  if (Boolean(configNode)) {
    addCommentsRecursive(configNode, componentSpec.config);
  }
}

const toYamlDocument = (configObject: Document.Parsed | Partial<ConnectConfigObject>): Document.Parsed | Document => {
  if (isDocument(configObject)) {
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
  if (!isNonEmptyString(yamlContent?.trim())) {
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

  return existingYaml !== null && existingYaml !== undefined && existingYaml !== ''
    ? mergeTemplateIntoYaml(existingYaml, newConfigObject, spec)
    : configToYaml(newConfigObject, spec);
};

/** Parsed YAML is unvalidated: each consumer checks the shape of the sections it reads. */
export type ParsedYamlConfig = Partial<
  Record<
    | 'input'
    | 'output'
    | 'pipeline'
    | 'cache_resources'
    | 'rate_limit_resources'
    | 'input_resources'
    | 'output_resources'
    | 'processor_resources'
    | 'buffer'
    | 'metrics'
    | 'tracer'
    | 'logger'
    | 'redpanda',
    unknown
  >
> &
  Record<string, unknown>;

export type ParsedConfigComponents = {
  inputs: string[];
  processors: string[];
  outputs: string[];
};

// The component a root section holds, expanded to its children for multi-component wrappers.
const sectionComponentNames = (
  component: Record<string, unknown> | undefined,
  parseMulti: (key: string, value: unknown) => string[] | undefined
): string[] => {
  const key = slotComponentKey(component);
  if (!(component && key !== null && key !== undefined && key !== '')) {
    return [];
  }
  return parseMulti(key, component[key]) ?? [key];
};

/** A parsed config's input, processor, and output component names. */
export const configComponentsOf = (value: unknown): ParsedConfigComponents => {
  const config = asRecord(value);
  if (!config) {
    return { inputs: [], processors: [], outputs: [] };
  }

  const processorItems = asRecord(config.pipeline)?.processors;
  const processors = isUnknownArray(processorItems)
    ? processorItems.flatMap((processor) => {
        const name = firstKey(processor);
        return name !== null && name !== undefined && name !== '' ? [name] : [];
      })
    : [];
  const inputObj = asRecord(config.input);

  return {
    inputs: sectionComponentNames(inputObj && unwrapReadUntil(inputObj).component, parseMultiInputs),
    processors,
    outputs: sectionComponentNames(asRecord(config.output), parseMultiOutputs),
  };
};

/** YAML from onboarding wizard data: compose input and (optional) output templates. */
export function generateYamlFromWizardData(
  input: { connectionName: string; connectionType: string } | undefined,
  output: { connectionName: string; connectionType: string } | undefined,
  components: ConnectComponentSpec[]
): string {
  if (!(isNonEmptyString(input?.connectionName) && input?.connectionType)) {
    return '';
  }

  let yaml =
    (getConnectTemplate({
      connectionName: input.connectionName,
      connectionType: input.connectionType,
      components,
      existingYaml: '',
    }) ??
      '') ||
    '';

  if (isNonEmptyString(output?.connectionName) && output?.connectionType) {
    yaml =
      (getConnectTemplate({
        connectionName: output.connectionName,
        connectionType: output.connectionType,
        components,
        existingYaml: yaml,
      }) ??
        '') ||
      yaml;
  }

  return yaml;
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
  if (!(yaml !== null && yaml !== undefined && yaml !== '')) {
    return;
  }
  try {
    const parsed = asRecord(parseYaml(yaml));
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
    const procs = asRecord(parsed.pipeline)?.processors;
    return isUnknownArray(procs) ? asRecord(procs[0]) : undefined;
  }
  if (connectionType === 'input' || connectionType === 'output') {
    // Bare input/output object (e.g. `{ kafka: {...} }`) for a broker/fallback/switch member array.
    const obj = parsed[connectionType];
    return asRecord(obj);
  }
  const key: ResourceArrayKey = connectionType === 'cache' ? 'cache_resources' : 'rate_limit_resources';
  const arr = parsed[key];
  return isUnknownArray(arr) ? asRecord(arr[0]) : undefined;
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
