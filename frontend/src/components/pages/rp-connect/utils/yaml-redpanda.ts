// Copyright 2026 Redpanda Data, Inc.

import { escapeRegExp } from 'utils/regex';
import {
  type Document,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  parse as parseYaml,
  visit,
  type YAMLMap,
  stringify as yamlStringify,
} from 'yaml';

import { asRecord, unwrapReadUntil, yamlConfig } from './yaml-values';
import { isNonEmptyString } from '../../../../utils/string-utils';
import { isObject, isUnknownArray } from '../../../../utils/type-guards';
import {
  CLOUD_SERVICE_ACCOUNT_SASL_MECHANISM,
  getContextualVariableSyntax,
  getSecretSyntax,
  SHARED_CLIENT_FALLBACK_COMPONENTS,
  userSecretIds,
} from '../types/constants';

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
  if (isNonEmptyString(result.username)) {
    const secretIds = userSecretIds(result.username);
    return [
      {
        mechanism: (result.saslMechanism ?? '') || 'SCRAM-SHA-256',
        username: getSecretSyntax(secretIds.username),
        password: getSecretSyntax(secretIds.password),
      },
    ];
  }
}

type RedpandaSection = 'input' | 'output';

// The YAML path of a top-level input/output component, looking through an input's `read_until`, or
// undefined when that isn't where the component is (a second wrapper inside, say). Judged on the
// merge-resolved config, so a wrapper built from a `<<` merge key is still seen.
function componentPathIn(yamlContent: string, section: RedpandaSection, componentName: string): string[] | undefined {
  try {
    const slot = asRecord(asRecord(parseYaml(yamlContent, { merge: true }))?.[section]);
    if (!slot) {
      return;
    }
    const { component, innerPath } = section === 'input' ? unwrapReadUntil(slot) : { component: slot, innerPath: [] };
    return componentName in component ? [section, ...innerPath, componentName] : undefined;
  } catch {
    // Unparseable YAML: no path, as for a missing component.
  }
}

const leadingSpaces = (line: string): number => line.length - line.trimStart().length;

// Lines that close a block: content (not blank, not a comment) at or above the block's indent.
const closesBlock = (line: string, indent: number): boolean =>
  line.trim() !== '' && !line.trimStart().startsWith('#') && leadingSpaces(line) <= indent;

// Strip commented-out placeholder lines for just-patched keys, so the user doesn't see
// both the `# topics: Required ...` comment and the real value. Assumes 2-space block indentation.
function stripCommentedKeys(yaml: string, keys: string[], componentPath: string[]): string {
  if (keys.length === 0) {
    return yaml;
  }

  const lines = yaml.split('\n');
  const block = findComponentBlock(lines, componentPath);
  if (!block) {
    return yaml;
  }

  const keyPattern = keys.map(escapeRegExp).join('|');
  const commentRegex = new RegExp(`^\\s*#\\s*(?:${keyPattern}):.*$`);
  return lines.filter((line, i) => i <= block.start || i >= block.end || !commentRegex.test(line)).join('\n');
}

type LineBlock = { start: number; end: number };

/** Line range of the block at `componentPath` in serialized YAML: its key line up to the line that closes it. */
function findComponentBlock(lines: string[], componentPath: string[]): LineBlock | undefined {
  // Walk down the path one indent level per segment, staying inside each parent's block.
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

function findKeyLine(lines: string[], parent: LineBlock, depth: number, segment: string): number {
  const indent = depth * 2;
  const keyRegex = new RegExp(`^ {${indent}}${escapeRegExp(segment)}:`);
  for (let i = parent.start + 1; i < parent.end; i++) {
    if (keyRegex.test(lines[i])) {
      return i;
    }
    if (depth > 0 && closesBlock(lines[i], indent - 2)) {
      return -1; // left the parent's block
    }
  }
  return -1;
}

function findBlockEnd(lines: string[], start: number, indent: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (closesBlock(lines[i], indent)) {
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
  componentPath: string[],
  topicName: string
): string {
  if (section === 'output') {
    doc.setIn([...componentPath, 'topic'], topicName);
    return 'topic';
  }
  const existing = doc.getIn([...componentPath, 'topics']);
  if (isSeq(existing)) {
    const topics: unknown = existing.toJSON();
    if (isUnknownArray(topics) && topics.every((topic) => String(topic) !== topicName)) {
      doc.addIn([...componentPath, 'topics'], topicName);
    }
  } else {
    doc.setIn([...componentPath, 'topics'], [topicName]);
  }
  return 'topics';
}

/** Whether a parsed component names at least one broker to connect to. */
export function hasSeedBrokers(component: unknown): boolean {
  const brokers = isObject(component) ? component.seed_brokers : undefined;
  return (isUnknownArray(brokers) ? brokers : [brokers]).some((broker) => typeof broker === 'string' && broker !== '');
}

/**
 * Points a component that would otherwise borrow the shared client at the cluster itself, so the SASL
 * user just written is the one it connects as. Only those generated brokers get Cloud's TLS default.
 * Returns the added keys. `resolved` is the component with aliases and merge keys applied, as the flow
 * parser reads it.
 */
function ensureOwnConnection(
  doc: Document.Parsed,
  componentPath: string[],
  componentName: string,
  resolved: unknown
): string[] {
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
  const resolvedTls = asRecord(resolved)?.tls;
  if (resolvedTls === undefined || resolvedTls === null) {
    component.set('tls', doc.createNode({ enabled: true }));
    return true;
  }
  const tls = component.get('tls', true);
  if (isMap(tls) && asRecord(resolvedTls)?.enabled === undefined) {
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
  const doc = existingYaml.trim() ? tryParseDocument(existingYaml) : undefined;
  const componentPath = doc && componentPathIn(existingYaml, section, componentName);
  // Writing into a component that only a merge key supplies would shadow everything else it merges in.
  if (!(doc && componentPath && doc.hasIn(componentPath))) {
    return;
  }

  const resolved = readComponent(existingYaml, section, componentName).component;
  const patchedKeys = applyRedpandaPatch(doc, section, componentPath, componentName, patch, resolved);

  try {
    return stripCommentedKeys(yamlStringify(doc, yamlConfig), patchedKeys, componentPath);
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

/** Write the patch into the component at `componentPath` (`resolved` is its alias-resolved form); returns the keys set. */
function applyRedpandaPatch(
  doc: Document.Parsed,
  section: RedpandaSection,
  componentPath: string[],
  componentName: string,
  patch: RedpandaPatch,
  resolved: Record<string, unknown> | undefined
): string[] {
  const patchedKeys: string[] = [];

  if (isNonEmptyString(patch.topicName)) {
    patchedKeys.push(patchTopicName(doc, section, componentPath, patch.topicName));
  }

  // Left alone when the input already reads with it, which may come from a merge key.
  if (
    isNonEmptyString(patch.consumerGroup) &&
    section === 'input' &&
    resolved?.consumer_group !== patch.consumerGroup
  ) {
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
): string[] {
  if (componentName === 'redpanda_common') {
    // redpanda_common keeps SASL in a top-level `redpanda:` block.
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
): string | undefined {
  const patch: RedpandaPatch = {
    topicName: (result.topicName ?? '') || undefined,
    consumerGroup: (result.consumerGroup ?? '') || undefined,
    sasl: buildSaslPatch(result),
  };
  if (!((patch.topicName ?? '') || isNonEmptyString(patch.consumerGroup) || patch.sasl)) {
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

/** `parsed[section][componentName]` when it is an object; an input's may sit inside a `read_until` wrapper. */
function componentObjectIn(
  parsed: unknown,
  section: RedpandaSection,
  componentName: string
): Record<string, unknown> | undefined {
  const sectionObj = asRecord(asRecord(parsed)?.[section]);
  const holder = sectionObj && section === 'input' ? unwrapReadUntil(sectionObj).component : sectionObj;
  const component = holder?.[componentName];
  return asRecord(component);
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

  if (isUnknownArray(config.topics)) {
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
    const config: unknown = parseYaml(yamlContent, { merge: true });
    if (config === null || config === undefined) {
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
  if (!isObject(obj) || seen.has(obj)) {
    return;
  }
  seen.add(obj);

  if (isUnknownArray(obj)) {
    for (const item of obj) {
      walkForTopics(item, topics, seen);
    }
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
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
  if (key === 'topics' && isUnknownArray(value)) {
    for (const t of value) {
      if (typeof t === 'string' && t) {
        topics.add(t);
      }
    }
    return true;
  }
  return false;
}
