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
import { isStopConditionSet, READ_UNTIL, type StopCondition } from './yaml';

const YAML_STRINGIFY_OPTIONS = { lineWidth: 0 } as const;

// ── Message limits ─────────────────────────────────────────────────────────
// `counter()` counts per call site; the deprecated `count("name")` is shared by name, so it is
// read and kept but never written.

const COUNTER_LIMIT_RE = /^\s*counter\(\s*\)\s*(>=|>)\s*(\d+)\s*$/;
const NAMED_COUNT_LIMIT_RE = /^\s*count\(\s*"([^"\\]*)"\s*\)\s*(>=|>)\s*(\d+)\s*$/;

/** A message limit; `counter` names the legacy `count("…")` it counts with, when it uses one. */
export type MessageLimit = { limit: number; counter?: string };

// A limit check's operator and digits, plus the counter name of a legacy `count("…")` one.
function limitCheckParts(check: string): { op?: string; digits?: string; counter?: string } {
  const modern = COUNTER_LIMIT_RE.exec(check);
  if (modern) {
    return { op: modern[1], digits: modern[2] };
  }
  const legacy = NAMED_COUNT_LIMIT_RE.exec(check);
  return { op: legacy?.[2], digits: legacy?.[3], counter: legacy?.[1] };
}

/** The message limit a `check` expresses (`counter() >= N`, or legacy `count("name") >= N`). */
export function parseMessageLimit(check: string | undefined): MessageLimit | undefined {
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

export function messageLimitCheck({ limit, counter }: MessageLimit): string {
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
export function resolveStopCondition(existing: StopCondition | undefined, draft: StopConditionDraft): StopCondition {
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

// The same check, or the same message limit however it's written (`counter() > 5` is `counter() >= 6`).
function sameCheck(a: string | undefined, b: string | undefined): boolean {
  if ((a?.trim() || undefined) === (b?.trim() || undefined)) {
    return true;
  }
  const [x, y] = [parseMessageLimit(a), parseMessageLimit(b)];
  return Boolean(x && y && x.limit === y.limit && x.counter === y.counter);
}

/** Whether two conditions stop the input the same way. */
export function sameStopCondition(a: StopCondition | undefined, b: StopCondition | undefined): boolean {
  return (
    sameCheck(a?.check, b?.check) &&
    (a?.idleTimeout?.trim() || undefined) === (b?.idleTimeout?.trim() || undefined) &&
    Boolean(a?.restartInput) === Boolean(b?.restartInput)
  );
}

// ── Durations ──────────────────────────────────────────────────────────────

const ENV_REF_RE = /\$\{[^}]+\}/;

// Go's `time.ParseDuration` units, in nanoseconds (both micro signs included).
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
const DURATION_PART_RE = /^(\d*)(?:\.(\d*))?([^\d.]*)/;

// The leading `<number><unit>` part of `text`: its length and nanoseconds; undefined when there isn't one.
function durationPart(text: string): { length: number; ns: number } | undefined {
  const [part, whole = '', fraction, unit = ''] = DURATION_PART_RE.exec(text) ?? [''];
  const scale = Object.hasOwn(UNIT_NS, unit) ? UNIT_NS[unit] : undefined;
  if (!(whole || fraction) || scale === undefined) {
    return;
  }
  // Go truncates each fractional part to whole nanoseconds.
  return { length: part.length, ns: Number(whole || '0') * scale + Math.trunc(Number(`0.${fraction || '0'}`) * scale) };
}

// The unsigned magnitude in nanoseconds, one `<number><unit>` part at a time.
function durationMagnitude(text: string): number | undefined {
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

/** A Go duration in nanoseconds, parsed as `time.ParseDuration` does; undefined where Go rejects it. */
export function parseGoDuration(value: string): number | undefined {
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

export function classifyIdleTimeout(value: string | undefined): IdleTimeoutKind {
  // Connect skips an empty one.
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
export const idleTimeoutFires = (value: string | undefined): boolean => {
  const kind = classifyIdleTimeout(value);
  return kind === 'positive' || kind === 'env';
};

/** Whether Connect counts the `idle_timeout` as set, so the `read_until` needs no check. */
export const isIdleTimeoutSet = (value: string | undefined): boolean => {
  const kind = classifyIdleTimeout(value);
  return kind === 'positive' || kind === 'env' || kind === 'zero';
};

const DURATION_WORD_RE = /(\d*\.?\d*)(ns|us|µs|μs|ms|s|m|h)/g;
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
export function describeDuration(value: string): string {
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

// ── Display ────────────────────────────────────────────────────────────────

const COMPACT_NUMBER = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const FULL_NUMBER = new Intl.NumberFormat('en');

/** A message count in short form, as stop rows and run history show it: "1K", "12.5K". */
export const compactCount = (n: number): string => COMPACT_NUMBER.format(n);

export type StopConditionSummary = {
  /** Fits a one-line label, e.g. "1K msgs · idle 30s". */
  short: string;
  /** Fits an input card's stop row, e.g. "after 1K msgs or 30s idle". */
  compact: string;
  /** A sentence fragment after "Stops ", e.g. "after 1,000 messages, or after 30 seconds without new messages". */
  long: string;
};

function limitUnit(n: number, batches: boolean, abbreviated: boolean): string {
  if (batches) {
    return n === 1 ? 'batch' : 'batches';
  }
  if (abbreviated) {
    return n === 1 ? 'msg' : 'msgs';
  }
  return n === 1 ? 'message' : 'messages';
}

// The check's part of the summary: a message limit, or a match on any other check.
function checkClause(check: string | undefined, batches: boolean): StopConditionSummary | undefined {
  const limit = parseMessageLimit(check);
  if (limit) {
    const msgs = `${compactCount(limit.limit)} ${limitUnit(limit.limit, batches, true)}`;
    const long = `after ${FULL_NUMBER.format(limit.limit)} ${limitUnit(limit.limit, batches, false)}`;
    return { short: msgs, compact: `after ${msgs}`, long };
  }
  if (!check) {
    return;
  }
  // A backtick in the query would end the code span it's quoted in.
  const long = check.includes('`') ? 'when its check is true' : `when \`${check.trim()}\` is true`;
  return { short: 'on match', compact: 'on match', long };
}

function idleClause(idleTimeout: string, afterCheck: boolean): StopConditionSummary {
  const idle = idleTimeout.trim();
  return {
    short: `idle ${idle}`,
    compact: afterCheck ? `${idle} idle` : `after ${idle} idle`,
    long: `after ${describeDuration(idleTimeout)} without new messages`,
  };
}

/** A stop condition in words; over an input that `batches`, a limit counts batches, as Connect does. */
export function describeStopCondition(
  stop: StopCondition,
  { batches = false }: { batches?: boolean } = {}
): StopConditionSummary {
  const check = checkClause(stop.check, batches);
  const idle = stop.idleTimeout ? idleClause(stop.idleTimeout, check !== undefined) : undefined;
  const clauses = [check, idle].filter((clause): clause is StopConditionSummary => clause !== undefined);
  return {
    short: clauses.map((c) => c.short).join(' · '),
    compact: clauses.map((c) => c.compact).join(' or '),
    long: clauses.map((c) => c.long).join(', or '),
  };
}

// ── Short label ────────────────────────────────────────────────────────────

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
export function stopShortLabel(slot: StopSlot, effective: InputEndBehavior): string {
  if (effective.kind === 'condition' && isStopConditionSet(slot.condition)) {
    const { short } = describeStopCondition(effective.stopsOn ?? slot.condition, { batches: slot.ownEnd.batches });
    return short.charAt(0).toUpperCase() + short.slice(1);
  }
  return SHORT_BY_KIND[effective.kind === 'condition' ? 'unknown' : effective.kind];
}

// ── Summaries ──────────────────────────────────────────────────────────────

/** A `code` span in behavior text. */
export const CODE_SPAN_RE = /`([^`]+)`/g;
const plain = (text: string): string => text.replace(CODE_SPAN_RE, '$1');

export const withCaveat = (text: string, behavior: InputEndBehavior) =>
  behavior.caveat ? `${text} ${behavior.caveat}` : text;

/** An input's one-line end label, plus the plain-text sentence for its tooltip. */
export function stopSummary(slot: StopSlot, effective: InputEndBehavior): { short: string; long: string } {
  const short = stopShortLabel(slot, effective);
  const note =
    effective.kind === 'continuous' && !isStopConditionSet(slot.condition) ? ' No stop condition is set.' : '';
  return { short, long: plain(`${withCaveat(effective.reason, effective)}${note}`) };
}

// "its input never stops", "none of its 3 inputs stop", "2 of 3 inputs never stop".
function continuousShare(n: number, total: number): string {
  if (total === 1) {
    return 'its input never stops';
  }
  if (n === total) {
    return `none of its ${total} inputs stop`;
  }
  return `${n} of ${total} inputs never ${n === 1 ? 'stops' : 'stop'}`;
}

// "its input", "all 3 inputs", "1 of 3 inputs".
function whichMembers(n: number, total: number): string {
  if (total === 1) {
    return 'its input';
  }
  return n === total ? `all ${total} inputs` : `${n} of ${total} inputs`;
}

// A broker/sequence: what its members add up to.
function groupEndText(name: string, effective: InputEndBehavior): { eyebrow: string; text: string } {
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
      // The members all stop when the group's own batching is what may not.
      return {
        eyebrow: 'Stops?',
        text: m && m.unknown > 0 ? `${whichMembers(m.unknown, m.total)} may not stop` : plain(effective.reason),
      };
  }
}

// A single input, short enough for its card: how it ends without a condition, or why that one doesn't act.
function inputEndText(
  slot: StopSlot,
  effective: InputEndBehavior,
  editable: boolean
): { eyebrow: string; text: string } {
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
      // A broken input inside isn't its condition's fault.
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
): { eyebrow: string; text: string } {
  if (effective.kind === 'condition' && isStopConditionSet(slot.condition)) {
    const { compact } = describeStopCondition(effective.stopsOn ?? slot.condition, { batches: slot.ownEnd.batches });
    return { eyebrow: 'Stops', text: compact };
  }
  return isGroup ? groupEndText(name, effective) : inputEndText(slot, effective, editable);
}

// ── YAML mutation ──────────────────────────────────────────────────────────

const pairKey = (pair: unknown): unknown =>
  pair instanceof Pair && isScalar(pair.key) ? (pair.key as Scalar).value : undefined;

const findPair = (map: YAMLMap, key: string): Pair | undefined =>
  map.items.find((p) => pairKey(p) === key) as Pair | undefined;

// The wrapper's settings, in document order ahead of its child `input` so they read first.
const SETTING_KEYS = ['check', 'idle_timeout', 'restart_input'] as const;

function settingValues(stop: StopCondition): Record<(typeof SETTING_KEYS)[number], string | boolean | undefined> {
  return {
    check: stop.check?.trim() || undefined,
    idle_timeout: stop.idleTimeout?.trim() || undefined,
    // Default false — written only when on.
    restart_input: stop.restartInput ? true : undefined,
  };
}

function setPairValue(pair: Pair, value: string | boolean): void {
  if (isScalar(pair.value)) {
    pair.value.value = value;
  } else {
    pair.value = new Scalar(value);
  }
}

function insertBeforeInput(wrapper: YAMLMap, pair: Pair): void {
  const inputIndex = wrapper.items.findIndex((p) => pairKey(p) === 'input');
  wrapper.items.splice(inputIndex === -1 ? wrapper.items.length : inputIndex, 0, pair);
}

function applySetting(wrapper: YAMLMap, key: string, value: string | boolean | undefined): void {
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

// Update the wrapper's settings in place: existing keys keep their position and comments, new ones
// land just before `input`, cleared ones are removed.
function applySettings(wrapper: YAMLMap, stop: StopCondition): void {
  const values = settingValues(stop);
  for (const key of SETTING_KEYS) {
    applySetting(wrapper, key, values[key]);
  }
}

// Wrap the slot's input in a `read_until`: its fields (label and processors included) move into the
// child input as is, comments too, so the component keeps its own identity.
function wrapSlot(slot: YAMLMap, stop: StopCondition): void {
  // A one-line `{ kafka: … }` member would nest the whole wrapper onto that line.
  slot.flow = false;
  const inner = new YAMLMap();
  inner.items = slot.items;
  // An anchor names the input, so it follows it inside; an alias elsewhere keeps meaning the bare input.
  inner.anchor = slot.anchor;
  slot.anchor = undefined;
  const wrapper = new YAMLMap();
  wrapper.items.push(new Pair(new Scalar('input'), inner));
  applySettings(wrapper, stop);
  slot.items = [new Pair(new Scalar(READ_UNTIL), wrapper)];
}

// Where a child-input field goes when its wrapper is removed: onto the slot, over the slot's own
// label (the child's is the one shown and edited), or merged (the slot's processors ran after the
// child's — one list keeps that order). A clash on any other key can't merge without changing behaviour,
// nor can an anchored list: its aliases elsewhere would gain or lose the other's processors.
function placeChildPair(slot: YAMLMap, pair: Pair, outerKeys: Set<unknown>): 'move' | 'done' | 'clash' {
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

// Prepend the child's processors to the slot's; false when either isn't a list or is anchored.
function prependProcessors(outer: unknown, inner: unknown): boolean {
  if (!(isSeq(outer) && isSeq(inner)) || outer.anchor || inner.anchor) {
    return false;
  }
  outer.items.unshift(...inner.items);
  return true;
}

// A `read_until` wrapper's child input; without one, a `read_until` is a component of its own.
function wrappedInput(wrapper: unknown): YAMLMap | undefined {
  const inner = isMap(wrapper) ? wrapper.get('input', true) : undefined;
  return isMap(inner) ? inner : undefined;
}

// The child's pairs that move onto the slot, placing the rest as they go; undefined on a clash.
function childPairsToMove(slot: YAMLMap, inner: YAMLMap): Pair[] | undefined {
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

// Comments on the wrapper's own keys and above the child's first key stay with what follows them;
// ones trailing the child or the wrapper close the slot instead. The wrapped input's anchor names
// what now sits on the slot.
function carryCommentsAndAnchor(slot: YAMLMap, wrapperPair: Pair, inner: YAMLMap, first: unknown): void {
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

// Replace the wrapper with its child input's fields, in place; false when they can't merge.
function unwrapSlot(slot: YAMLMap, wrapperPair: Pair): boolean {
  const inner = wrappedInput(wrapperPair.value);
  // A merge key on either side could shadow, or be shadowed by, the keys that move.
  if (!inner || [...slot.items, ...inner.items].some(isMergePair)) {
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

// ── Editability ────────────────────────────────────────────────────────────

const VIA_ALIAS = 'This input comes from a YAML alias or merge key. Change its stop condition in the YAML.';
const MERGED_WRAPPER = 'Its `read_until` comes from a YAML merge key. Change its stop condition in the YAML.';
const MERGED_SETTINGS = 'Its stop settings come from a YAML merge key. Change its stop condition in the YAML.';
const MAX_MERGE_DEPTH = 8;

// A `<<` key: the string with `merge` off, a symbol with it on.
const isMergePair = (pair: unknown): boolean => {
  const key = pairKey(pair);
  return key === '<<' || (typeof key === 'symbol' && key.description === '<<');
};

// The maps a `<<` value merges in: an alias, a map, or a list of them.
function mergeSources(doc: Document, value: unknown): YAMLMap[] {
  const items = isSeq(value) ? value.items : [value];
  return items.map((item) => (isAlias(item) ? item.resolve(doc) : item)).filter((m): m is YAMLMap => isMap(m));
}

// Whether a `<<` merge key on the map brings in `key`.
function mergesIn(doc: Document, map: YAMLMap, key: string, depth = 0): boolean {
  return (
    depth < MAX_MERGE_DEPTH &&
    map.items.some(
      (pair) =>
        isMergePair(pair) &&
        mergeSources(doc, (pair as Pair).value).some(
          (source) => findPair(source, key) !== undefined || mergesIn(doc, source, key, depth + 1)
        )
    )
  );
}

/**
 * Why the stop condition of the input slot at `slotPath` can't be rewritten in place: the input, its
 * `read_until`, that wrapper's child or one of its settings comes from an alias or merge key, or
 * `restart_input` from an env var the editor would drop. Undefined when it can.
 */
export function stopSlotLock(doc: Document, slotPath: (string | number)[]): string | undefined {
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

// Why a `read_until` map's child input or settings can't be rewritten in place.
function wrapperLock(doc: Document, wrapper: YAMLMap): string | undefined {
  const input = wrapper.get('input', true);
  if (isAlias(input) || (input === undefined && mergesIn(doc, wrapper, 'input'))) {
    return VIA_ALIAS;
  }
  // Rewriting only the wrapper's own keys would leave a merged one in effect.
  if (SETTING_KEYS.some((key) => mergesIn(doc, wrapper, key))) {
    return MERGED_SETTINGS;
  }
  const restart = wrapper.get('restart_input', true);
  if (isScalar(restart) && typeof restart.value === 'string' && isEnvRef(restart.value)) {
    return `Its \`restart_input\` is set from \`${restart.value.trim()}\`. Change its stop condition in the YAML.`;
  }
}

// Apply `stop` to the slot in place: false when it can't be done safely, 'unchanged' for a no-op.
function applyToSlot(slot: YAMLMap, stop: StopCondition | null): boolean | 'unchanged' {
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
 * null/unset. Returns null when the YAML can't be rewritten safely.
 */
export function setStopCondition(
  yaml: string,
  slotPath: (string | number)[],
  stop: StopCondition | null
): string | null {
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
