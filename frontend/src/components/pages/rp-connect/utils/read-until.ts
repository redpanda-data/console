/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { type Document, isAlias, isMap, isScalar, isSeq, Pair, parseDocument, Scalar, YAMLMap } from 'yaml';

import type { InputEndBehavior, InputEndKind } from './input-end-behavior';
import type { StopSlot } from './pipeline-flow-parser';
import { isStopConditionSet, READ_UNTIL, type StopCondition, YAML_STRINGIFY_OPTIONS } from './yaml';

const COUNTER_LIMIT_RE = /^\s*counter\(\s*\)\s*(?<operator>>=|>)\s*(?<limit>\d+)\s*$/u;
const NAMED_COUNT_LIMIT_RE = /^\s*count\(\s*"(?<counterName>[^"\\]*)"\s*\)\s*(?<operator>>=|>)\s*(?<limit>\d+)\s*$/u;

/** A message limit; `counter` names the legacy `count("…")` it counts with, when it uses one. */
export type MessageLimit = { limit: number; counter?: string };

function limitCheckParts(check: string) {
  const modern = COUNTER_LIMIT_RE.exec(check);
  if (modern) {
    return { op: modern[1], digits: modern[2] };
  }
  const legacy = NAMED_COUNT_LIMIT_RE.exec(check);
  return { op: legacy?.[2], digits: legacy?.[3], counter: legacy?.[1] };
}

/**
 * The message limit expressed by a check. New checks use a per-call-site
 * `counter()`; legacy named `count()` checks share their counts by name.
 */
export function parseMessageLimit(check: string | undefined) {
  if (!check) {
    return;
  }
  const { op, digits, counter } = limitCheckParts(check);
  if (!(op && digits)) {
    return;
  }
  const limit = op === '>' ? Number(digits) + 1 : Number(digits);
  if (!(limit > 0 && Number.isSafeInteger(limit))) {
    return;
  }
  return counter === undefined ? { limit } : { limit, counter };
}

export function messageLimitCheck({ limit, counter }: MessageLimit) {
  return counter === undefined ? `counter() >= ${limit}` : `count("${counter}") >= ${limit}`;
}

/** A stop condition as chosen in the editor; a message limit becomes a counter check on apply. */
export type StopConditionDraft = {
  messageLimit?: number;
  check?: string;
  idleTimeout?: string;
  restartInput?: boolean;
};

/** The condition to write for a draft; an edited legacy `count("…")` limit keeps its counter. */
export function resolveStopCondition(existing: StopCondition | undefined, draft: StopConditionDraft) {
  const stop: StopCondition = {};
  if (draft.messageLimit !== undefined) {
    stop.check = messageLimitCheck({ limit: draft.messageLimit, counter: parseMessageLimit(existing?.check)?.counter });
  } else if (draft.check?.trim()) {
    stop.check = draft.check.trim();
  }
  if (draft.idleTimeout?.trim()) {
    stop.idleTimeout = draft.idleTimeout.trim();
  }
  if (draft.restartInput && isStopConditionSet(stop)) {
    stop.restartInput = true;
  }
  return stop;
}

function sameCheck(a: string | undefined, b: string | undefined) {
  if ((a?.trim() || undefined) === (b?.trim() || undefined)) {
    return true;
  }
  const [x, y] = [parseMessageLimit(a), parseMessageLimit(b)];
  return Boolean(x && y && x.limit === y.limit && x.counter === y.counter);
}

/** Whether two conditions stop the input the same way. */
export function sameStopCondition(a: StopCondition | undefined, b: StopCondition | undefined) {
  return (
    sameCheck(a?.check, b?.check) &&
    (a?.idleTimeout?.trim() || undefined) === (b?.idleTimeout?.trim() || undefined) &&
    Boolean(a?.restartInput) === Boolean(b?.restartInput)
  );
}

const ENV_REF_RE = /\$\{[^}]+\}/u;

const UNIT_NS: Record<string, number> = {
  ns: 1,
  us: 1e3,
  µs: 1e3,
  μs: 1e3,
  ms: 1e6,
  s: 1e9,
  m: 60e9,
  h: 3600e9,
};
const MAX_DURATION_NS = 2 ** 63 - 1;
const DURATION_PART_RE = /^(?<whole>\d*)(?:\.(?<fraction>\d*))?(?<unit>[^\d.]*)/u;

function durationPart(text: string) {
  const [part, whole = '', fraction, unit = ''] = DURATION_PART_RE.exec(text) ?? [''];
  const scale = Object.hasOwn(UNIT_NS, unit) ? UNIT_NS[unit] : undefined;
  if (!(whole || fraction) || scale === undefined) {
    return;
  }
  return { length: part.length, ns: Number(whole || '0') * scale + Math.trunc(Number(`0.${fraction || '0'}`) * scale) };
}

function durationMagnitude(text: string) {
  let rest = text;
  let total = 0;
  while (rest !== '') {
    const part = durationPart(rest);
    if (!part || total + part.ns > MAX_DURATION_NS) {
      return;
    }
    total += part.ns;
    rest = rest.slice(part.length);
  }
  return total;
}

/**
 * Parse a Go duration in nanoseconds, truncating fractional parts like
 * `time.ParseDuration`. Return undefined for unrecognized durations.
 */
export function parseGoDuration(value: string) {
  const trimmed = value.trim();
  const signed = trimmed.startsWith('-') || trimmed.startsWith('+');
  const rest = signed ? trimmed.slice(1) : trimmed;
  if (rest === '0') {
    return 0;
  }
  const magnitude = rest === '' ? undefined : durationMagnitude(rest);
  return magnitude === undefined ? undefined : (trimmed.startsWith('-') ? -1 : 1) * magnitude;
}

/** Whether a field holds an env var reference, resolved only when the pipeline starts. */
export const isEnvRef = (value: string) => ENV_REF_RE.test(value);

/**
 * How Connect reads an `idle_timeout`: `invalid` fails to parse at start, `negative` counts as unset, `zero`
 * is set but never fires, and an `env` reference is resolved at start and taken to be positive.
 */
export type IdleTimeoutKind = 'unset' | 'invalid' | 'env' | 'negative' | 'zero' | 'positive';

export function classifyIdleTimeout(value: string | undefined) {
  if (value === undefined || value === '') {
    return 'unset';
  }
  const ns = parseGoDuration(value);
  if (ns === undefined) {
    return isEnvRef(value) ? 'env' : 'invalid';
  }
  if (ns === 0) {
    return 'zero';
  }
  return ns < 0 ? 'negative' : 'positive';
}

/** Whether an `idle_timeout` arms a timer: Connect only starts one for a positive duration. */
export const idleTimeoutFires = (value: string | undefined) => {
  const kind = classifyIdleTimeout(value);
  return kind === 'positive' || kind === 'env';
};

/** Whether Connect counts the `idle_timeout` as set, so the `read_until` needs no check. */
export const isIdleTimeoutSet = (value: string | undefined) => {
  const kind = classifyIdleTimeout(value);
  return kind === 'positive' || kind === 'env' || kind === 'zero';
};

const DURATION_WORD_RE = /(?<value>\d*\.?\d*)(?<unit>ns|us|µs|μs|ms|s|m|h)/gu;
const DURATION_UNIT_WORDS: Record<string, [string, string]> = {
  h: ['hour', 'hours'],
  m: ['minute', 'minutes'],
  s: ['second', 'seconds'],
  ms: ['millisecond', 'milliseconds'],
  us: ['microsecond', 'microseconds'],
  µs: ['microsecond', 'microseconds'],
  μs: ['microsecond', 'microseconds'],
  ns: ['nanosecond', 'nanoseconds'],
};

/** `90s` → "90 seconds", `1h30m` → "1 hour 30 minutes"; anything unparseable is returned as written. */
export function describeDuration(value: string) {
  const trimmed = value.trim();
  const ns = parseGoDuration(trimmed);
  if (ns === undefined || ns < 0) {
    return trimmed;
  }
  if (ns === 0) {
    return '0 seconds';
  }
  return Array.from(trimmed.matchAll(DURATION_WORD_RE), ([, n, unit]) => {
    const [one, many] = DURATION_UNIT_WORDS[unit];
    return `${Number(n)} ${Number(n) === 1 ? one : many}`;
  }).join(' ');
}

const COMPACT_NUMBER = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const FULL_NUMBER = new Intl.NumberFormat('en');

/** A message count in short form, as stop rows and run history show it: "1K", "12.5K". */
export const compactCount = (n: number) => COMPACT_NUMBER.format(n);

export type StopConditionSummary = {
  /** Fits a one-line label, e.g. "1K msgs · idle 30s". */
  short: string;
  /** Fits an input card's stop row, e.g. "after 1K msgs or 30s idle". */
  compact: string;
  /** A sentence fragment after "Stops ", e.g. "after 1,000 messages, or after 30 seconds without new messages". */
  long: string;
};

function limitUnit(n: number, batches: boolean, abbreviated: boolean) {
  if (batches) {
    return n === 1 ? 'batch' : 'batches';
  }
  if (abbreviated) {
    return n === 1 ? 'msg' : 'msgs';
  }
  return n === 1 ? 'message' : 'messages';
}

function checkClause(check: string | undefined, batches: boolean) {
  const limit = parseMessageLimit(check);
  if (limit) {
    const msgs = `${compactCount(limit.limit)} ${limitUnit(limit.limit, batches, true)}`;
    const long = `after ${FULL_NUMBER.format(limit.limit)} ${limitUnit(limit.limit, batches, false)}`;
    return { short: msgs, compact: `after ${msgs}`, long };
  }
  if (!check) {
    return;
  }
  const long = check.includes('`') ? 'when its check is true' : `when \`${check.trim()}\` is true`;
  return { short: 'on match', compact: 'on match', long };
}

function idleClause(idleTimeout: string, afterCheck: boolean) {
  const idle = idleTimeout.trim();
  return {
    short: `idle ${idle}`,
    compact: afterCheck ? `${idle} idle` : `after ${idle} idle`,
    long: `after ${describeDuration(idleTimeout)} without new messages`,
  };
}

/** A stop condition in words; over an input that `batches`, a limit counts batches, as Connect does. */
export function describeStopCondition(stop: StopCondition, { batches = false }: { batches?: boolean } = {}) {
  const check = checkClause(stop.check, batches);
  const idle = stop.idleTimeout ? idleClause(stop.idleTimeout, check !== undefined) : undefined;
  const clauses = [check, idle].filter((clause): clause is StopConditionSummary => clause !== undefined);
  return {
    short: clauses.map((c) => c.short).join(' · '),
    compact: clauses.map((c) => c.compact).join(' or '),
    long: clauses.map((c) => c.long).join(', or '),
  };
}

const SHORT_BY_KIND: Record<Exclude<InputEndKind, 'condition'>, string> = {
  natural: 'When done',
  continuous: 'Continuous',
  invalid: 'Needs fixing',
  unknown: 'May not stop',
};

/**
 * An input's one-line end label (the end chip's per-input rows): its condition while that condition is
 * what ends the input, otherwise how the input ends (a broken or never-firing condition included).
 */
export function stopShortLabel(slot: StopSlot, effective: InputEndBehavior) {
  if (effective.kind === 'condition' && isStopConditionSet(slot.condition)) {
    const { short } = describeStopCondition(effective.stopsOn ?? slot.condition, { batches: slot.ownEnd.batches });
    return short.charAt(0).toUpperCase() + short.slice(1);
  }
  return SHORT_BY_KIND[effective.kind === 'condition' ? 'unknown' : effective.kind];
}

/** A `code` span in behavior text. */
export const CODE_SPAN_RE = /`(?<code>[^`]+)`/gu;
const plain = (text: string) => text.replace(CODE_SPAN_RE, '$1');

export const withCaveat = (text: string, behavior: InputEndBehavior) =>
  behavior.caveat ? `${text} ${behavior.caveat}` : text;

/** An input's one-line end label, plus the plain-text sentence for its tooltip. */
export function stopSummary(slot: StopSlot, effective: InputEndBehavior) {
  const short = stopShortLabel(slot, effective);
  const note =
    effective.kind === 'continuous' && !isStopConditionSet(slot.condition) ? ' No stop condition is set.' : '';
  return { short, long: plain(`${withCaveat(effective.reason, effective)}${note}`) };
}

function continuousShare(n: number, total: number) {
  if (total === 1) {
    return 'its input never stops';
  }
  if (n === total) {
    return `none of its ${total} inputs stop`;
  }
  return `${n} of ${total} inputs never ${n === 1 ? 'stops' : 'stop'}`;
}

function whichMembers(n: number, total: number) {
  if (total === 1) {
    return 'its input';
  }
  return n === total ? `all ${total} inputs` : `${n} of ${total} inputs`;
}

function groupEndText(name: string, effective: InputEndBehavior) {
  const m = effective.members;
  switch (effective.kind) {
    case 'natural':
      return { eyebrow: 'Stops', text: name === 'sequence' ? 'after its last input stops' : 'once all inputs stop' };
    case 'continuous':
      return { eyebrow: 'Continuous', text: m ? continuousShare(m.continuous, m.total) : plain(effective.reason) };
    case 'invalid':
      return {
        eyebrow: 'Fix',
        text: m && m.invalid > 0 ? `${whichMembers(m.invalid, m.total)} incomplete` : plain(effective.reason),
      };
    default:
      return {
        eyebrow: 'Stops?',
        text: m && m.unknown > 0 ? `${whichMembers(m.unknown, m.total)} may not stop` : plain(effective.reason),
      };
  }
}

function inputEndText(slot: StopSlot, effective: InputEndBehavior, editable: boolean) {
  const wrapped = slot.condition !== undefined;
  switch (effective.kind) {
    case 'natural':
      return { eyebrow: 'Stops', text: 'when its data runs out' };
    case 'continuous':
      if (wrapped) {
        return { eyebrow: 'Continuous', text: 'condition never fires' };
      }
      return { eyebrow: 'Continuous', text: editable ? 'set a stop condition' : 'no stop condition' };
    case 'invalid':
      return {
        eyebrow: 'Fix',
        text: wrapped && slot.ownEnd.kind !== 'invalid' ? 'condition incomplete' : plain(effective.reason),
      };
    default:
      return { eyebrow: 'Stops?', text: 'may not stop on its own' };
  }
}

/** A stop row's eyebrow + text: the stop condition while it's what ends the input, otherwise how it ends. */
export function stopRowText(
  name: string,
  slot: StopSlot,
  effective: InputEndBehavior,
  { isGroup = false, editable = false }: { isGroup?: boolean; editable?: boolean } = {}
) {
  if (effective.kind === 'condition' && isStopConditionSet(slot.condition)) {
    const { compact } = describeStopCondition(effective.stopsOn ?? slot.condition, { batches: slot.ownEnd.batches });
    return { eyebrow: 'Stops', text: compact };
  }
  return isGroup ? groupEndText(name, effective) : inputEndText(slot, effective, editable);
}

const pairKey = (pair: unknown) =>
  pair instanceof Pair && isScalar(pair.key) ? (pair.key as Scalar).value : undefined;

const findPair = (map: YAMLMap, key: string) => map.items.find((p) => pairKey(p) === key) as Pair | undefined;

const SETTING_KEYS = ['check', 'idle_timeout', 'restart_input'] as const;

function settingValues(stop: StopCondition) {
  return {
    check: stop.check?.trim() || undefined,
    idle_timeout: stop.idleTimeout?.trim() || undefined,
    restart_input: stop.restartInput ? true : undefined,
  };
}

function setPairValue(pair: Pair, value: string | boolean) {
  if (isScalar(pair.value)) {
    pair.value.value = value;
  } else {
    pair.value = new Scalar(value);
  }
}

function insertBeforeInput(wrapper: YAMLMap, pair: Pair) {
  const inputIndex = wrapper.items.findIndex((p) => pairKey(p) === 'input');
  wrapper.items.splice(inputIndex === -1 ? wrapper.items.length : inputIndex, 0, pair);
}

function applySetting(wrapper: YAMLMap, key: string, value: string | boolean | undefined) {
  const existing = findPair(wrapper, key);
  if (value === undefined) {
    if (existing) {
      wrapper.items.splice(wrapper.items.indexOf(existing), 1);
    }
  } else if (existing) {
    setPairValue(existing, value);
  } else {
    insertBeforeInput(wrapper, new Pair(new Scalar(key), new Scalar(value)));
  }
}

function applySettings(wrapper: YAMLMap, stop: StopCondition) {
  const values = settingValues(stop);
  for (const key of SETTING_KEYS) {
    applySetting(wrapper, key, values[key]);
  }
}

function wrapSlot(slot: YAMLMap, stop: StopCondition) {
  slot.flow = false;
  const inner = new YAMLMap();
  inner.items = slot.items;
  inner.anchor = slot.anchor;
  slot.anchor = undefined;
  const wrapper = new YAMLMap();
  wrapper.items.push(new Pair(new Scalar('input'), inner));
  applySettings(wrapper, stop);
  slot.items = [new Pair(new Scalar(READ_UNTIL), wrapper)];
}

function placeChildPair(slot: YAMLMap, pair: Pair, outerKeys: Set<unknown>) {
  const key = pairKey(pair);
  if (!outerKeys.has(key)) {
    return 'move';
  }
  if (key === 'label') {
    slot.delete('label');
    return 'move';
  }
  return key === 'processors' && prependProcessors(slot.get('processors', true), pair.value) ? 'done' : 'clash';
}

const processorsMerge = (outer: unknown, inner: unknown) =>
  isSeq(outer) && isSeq(inner) && !(outer.anchor || inner.anchor);

function prependProcessors(outer: unknown, inner: unknown) {
  if (!(isSeq(outer) && isSeq(inner) && processorsMerge(outer, inner))) {
    return false;
  }
  outer.items.unshift(...inner.items);
  return true;
}

const UNWRAP_MERGED = 'Remove its `read_until` in the YAML: a merge key could change what the moved keys mean.';
const UNWRAP_ANCHORS = 'Remove its `read_until` in the YAML: it and its input each carry an anchor.';
const UNWRAP_CLASH = 'Remove its `read_until` in the YAML: the wrapper and its input set the same keys.';

function unwrapBlocker(slot: YAMLMap, inner: YAMLMap) {
  if ([...slot.items, ...inner.items].some(isMergePair)) {
    return UNWRAP_MERGED;
  }
  if (slot.anchor && inner.anchor) {
    return UNWRAP_ANCHORS;
  }
  const outerKeys = new Set(slot.items.map(pairKey).filter((k) => k !== READ_UNTIL));
  const clashes = (inner.items as Pair[]).some((pair) => {
    const key = pairKey(pair);
    return (
      outerKeys.has(key) &&
      key !== 'label' &&
      !(key === 'processors' && processorsMerge(slot.get('processors', true), pair.value))
    );
  });
  return clashes ? UNWRAP_CLASH : undefined;
}

function wrappedInput(wrapper: unknown) {
  const inner = isMap(wrapper) ? wrapper.get('input', true) : undefined;
  return isMap(inner) ? inner : undefined;
}

function childPairsToMove(slot: YAMLMap, inner: YAMLMap) {
  const outerKeys = new Set(slot.items.map(pairKey).filter((k) => k !== READ_UNTIL));
  const moved: Pair[] = [];
  for (const pair of inner.items as Pair[]) {
    const placement = placeChildPair(slot, pair, outerKeys);
    if (placement === 'clash') {
      return;
    }
    if (placement === 'move') {
      moved.push(pair);
    }
  }
  return moved;
}

function carryCommentsAndAnchor(slot: YAMLMap, wrapperPair: Pair, inner: YAMLMap, first: unknown) {
  const wrapper = wrapperPair.value;
  const inputPair = isMap(wrapper) ? findPair(wrapper, 'input') : undefined;
  const comments = [wrapperPair.key, wrapper, inputPair?.key, inner]
    .map((n) => (n as { commentBefore?: string } | undefined)?.commentBefore)
    .filter((c): c is string => Boolean(c));
  if (comments.length > 0 && isScalar(first)) {
    first.commentBefore = [...comments, first.commentBefore].filter(Boolean).join('\n');
  }
  const trailing = [inner.comment, isMap(wrapper) ? wrapper.comment : undefined].filter(Boolean);
  if (trailing.length > 0) {
    slot.comment = [slot.comment, ...trailing].filter(Boolean).join('\n');
  }
  if (inner.anchor && !slot.anchor) {
    slot.anchor = inner.anchor;
  }
}

function unwrapSlot(slot: YAMLMap, wrapperPair: Pair) {
  const inner = wrappedInput(wrapperPair.value);
  if (!inner || unwrapBlocker(slot, inner)) {
    return false;
  }
  const moved = childPairsToMove(slot, inner);
  if (!moved) {
    return false;
  }
  carryCommentsAndAnchor(slot, wrapperPair, inner, moved[0]?.key);
  slot.items.splice(slot.items.indexOf(wrapperPair), 1, ...moved);
  return true;
}

const VIA_ALIAS = 'This input comes from a YAML alias or merge key. Change its stop condition in the YAML.';
const MERGED_WRAPPER = 'Its `read_until` comes from a YAML merge key. Change its stop condition in the YAML.';
const MERGED_SETTINGS = 'Its stop settings come from a YAML merge key. Change its stop condition in the YAML.';
const MAX_MERGE_DEPTH = 8;

const isMergePair = (pair: unknown) => {
  const key = pairKey(pair);
  return key === '<<' || (typeof key === 'symbol' && key.description === '<<');
};

function mergeSources(doc: Document, value: unknown) {
  const items = isSeq(value) ? value.items : [value];
  return items.map((item) => (isAlias(item) ? item.resolve(doc) : item)).filter((m): m is YAMLMap => isMap(m));
}

const mergesIn: (doc: Document, map: YAMLMap, key: string, depth?: number) => boolean = (doc, map, key, depth = 0) =>
  depth < MAX_MERGE_DEPTH &&
  map.items.some(
    (pair) =>
      isMergePair(pair) &&
      mergeSources(doc, (pair as Pair).value).some(
        (source) => findPair(source, key) !== undefined || mergesIn(doc, source, key, depth + 1)
      )
  );

/**
 * Why the stop condition of the input slot at `slotPath` can't be rewritten in place: the input, its
 * `read_until`, that wrapper's child or one of its settings comes from an alias or merge key, or
 * `restart_input` from an env var the editor would drop. Undefined when it can.
 */
export function stopSlotLock(doc: Document, slotPath: (string | number)[]) {
  const slot = doc.getIn(slotPath, true);
  if (!isMap(slot)) {
    return VIA_ALIAS;
  }
  const wrapper = findPair(slot, READ_UNTIL)?.value;
  if (wrapper === undefined) {
    return mergesIn(doc, slot, READ_UNTIL) ? MERGED_WRAPPER : undefined;
  }
  if (!isMap(wrapper)) {
    return isAlias(wrapper) ? VIA_ALIAS : undefined;
  }
  return wrapperLock(doc, wrapper);
}

function wrapperLock(doc: Document, wrapper: YAMLMap) {
  const input = wrapper.get('input', true);
  if (isAlias(input) || (input === undefined && mergesIn(doc, wrapper, 'input'))) {
    return VIA_ALIAS;
  }
  if (SETTING_KEYS.some((key) => mergesIn(doc, wrapper, key))) {
    return MERGED_SETTINGS;
  }
  const restart = wrapper.get('restart_input', true);
  if (isScalar(restart) && typeof restart.value === 'string' && isEnvRef(restart.value)) {
    return `Its \`restart_input\` is set from \`${restart.value.trim()}\`. Change its stop condition in the YAML.`;
  }
}

/** Why the `read_until` on the input slot at `slotPath` can only be removed in the YAML; undefined when it can. */
export function unwrapLock(doc: Document, slotPath: (string | number)[]) {
  const slot = doc.getIn(slotPath, true);
  const wrapperPair = isMap(slot) ? findPair(slot, READ_UNTIL) : undefined;
  const inner = wrappedInput(wrapperPair?.value);
  return isMap(slot) && inner ? unwrapBlocker(slot, inner) : undefined;
}

function applyToSlot(slot: YAMLMap, stop: StopCondition | null) {
  const wrapperPair = findPair(slot, READ_UNTIL);
  const isWrapper = wrappedInput(wrapperPair?.value) !== undefined;
  if (!isStopConditionSet(stop)) {
    return wrapperPair && isWrapper ? unwrapSlot(slot, wrapperPair) : 'unchanged';
  }
  if (!wrapperPair) {
    wrapSlot(slot, stop);
    return true;
  }
  if (isWrapper) {
    applySettings(wrapperPair.value as YAMLMap, stop);
  }
  return isWrapper;
}

/**
 * Set or clear the stop condition on the input slot at `slotPath` (`['input']`, a broker member, …):
 * wraps the input in a `read_until`, updates an existing one in place, or unwraps it when `stop` is
 * null/unset. Preserve comments, anchors, and processor order. Refuse to
 * unwrap ambiguous merge keys, conflicting fields, or processor lists whose
 * aliases would change behavior. Return null if the YAML cannot be edited
 * safely; an unchanged operation returns the original text.
 */
export function setStopCondition(yaml: string, slotPath: (string | number)[], stop: StopCondition | null) {
  try {
    const doc = parseDocument(yaml);
    const slot = doc.errors.length > 0 ? undefined : doc.getIn(slotPath, true);
    if (!isMap(slot) || stopSlotLock(doc, slotPath)) {
      return null;
    }
    const applied = applyToSlot(slot, stop);
    if (applied === 'unchanged') {
      return yaml;
    }
    return applied ? doc.toString(YAML_STRINGIFY_OPTIONS) : null;
  } catch {
    return null;
  }
}
