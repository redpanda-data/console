/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Base64, fromUint8Array } from 'js-base64';
import prettyBytesOriginal from 'pretty-bytes';
import prettyMillisecondsOriginal, { type Options as PrettyMillisecondsOptions } from 'pretty-ms';

import type { TopicMessage } from '../state/rest-interfaces';

// Note: Making a <Memo> component is not possible, the container JSX will always render children first so they can be passed as props
export const nameof = <T>(name: Extract<keyof T, string>): string => name;

export class TimeSince {
  timestamp: number = Date.now();

  /** Reset timer back to 0 ms (or the given value). For example '1000' will set the timer as if it was started 1 second ago.  */
  reset(to = 0) {
    this.timestamp = Date.now() - to;
  }

  /** Time since last reset (or create) in ms */
  get value() {
    return Date.now() - this.timestamp;
  }
}

export class Cooldown {
  timestamp = 0; // time of last trigger
  duration = 0; // how long the CD takes to charge

  /**
   * @description Create a cooldown with the given duration
   * @param duration time the cooldown takes to complete in ms
   * @param start `running` to start 'on cooldown', `ready` to start already charged
   */
  constructor(duration: number, start: 'ready' | 'running' = 'running') {
    this.duration = duration;
    if (start === 'running') {
      this.timestamp = Date.now();
    }
  }

  /** Time (in ms) since the last time the cooldown was triggered */
  timeSinceLastTrigger(): number {
    return Date.now() - this.timestamp;
  }

  /** Time (in ms) until the cooldown is ready (or 0 if it is) */
  get timeLeft(): number {
    const t = this.duration - this.timeSinceLastTrigger();
    if (t < 0) {
      return 0;
    }
    return t;
  }

  // Check if ready
  get isReady(): boolean {
    return this.timeLeft <= 0;
  }

  // 'Use' the cooldown. Check if ready, and if it is also trigger it
  consume(force = false): boolean {
    if (this.timeLeft <= 0 || force) {
      this.timestamp = Date.now();
      return true;
    }
    return false;
  }

  // Force the cooldown to be ready
  setReady(): void {
    this.timestamp = 0;
  }

  // Same as 'consume(true)'
  restart(): void {
    this.timestamp = Date.now();
  }
}

export class Timer {
  target = 0;
  duration = 0;

  constructor(duration: number, initialState: 'started' | 'done' = 'started') {
    this.duration = duration;
    if (initialState === 'started') {
      this.target = Date.now() + duration;
    } else {
      this.target = 0;
    }
  }

  /** Time (in ms) until done (or 0) */
  get timeLeft() {
    const t = this.target - Date.now();
    if (t < 0) {
      return 0;
    }
    return t;
  }

  get isRunning() {
    return !this.isDone;
  }

  get isDone() {
    return this.timeLeft <= 0;
  }

  /** Restart timer */
  restart() {
    this.target = Date.now() + this.duration;
  }

  /** Set timer completed */
  setDone() {
    this.target = 0;
  }
}

let refreshCounter = 0; // used to always create a different value, forcing some components to always re-render
const REFRESH_COUNTER_MAX = 1000;
export const alwaysChanging = () => {
  refreshCounter = (refreshCounter + 1) % REFRESH_COUNTER_MAX;
  return refreshCounter;
};

export function assignDeep(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const key in source) {
    if (!Object.hasOwn(source, key) || key === '__proto__' || key === 'constructor') {
      continue;
    }
    assignDeepValue(target, key, source[key]);
  }
}

function assignDeepValue(target: Record<string, unknown>, key: string, value: unknown) {
  const existing = key in target ? target[key] : undefined;
  if (typeof value === 'function' || typeof value === 'symbol') {
    return;
  }
  if (typeof value === 'object') {
    assignDeepObject(target, key, value, existing);
    return;
  }
  if (existing !== value) {
    target[key] = value;
  }
}

function assignDeepObject(target: Record<string, unknown>, key: string, value: object | null, existing: unknown) {
  // Replacing arrays preserves shared element identities when settings reorder them.
  if (Array.isArray(value) || !existing || typeof existing !== 'object') {
    target[key] = value;
    return;
  }
  if (value !== null) {
    assignDeep(existing as Record<string, unknown>, value as Record<string, unknown>);
  }
}

export function containsIgnoreCase(str: string, search: string): boolean {
  return str.toLowerCase().indexOf(search.toLowerCase()) >= 0;
}

const collator = new Intl.Collator(undefined, {
  usage: 'search',
  sensitivity: 'base',
});
export function equalsIgnoreCase(a: string, b: string) {
  return collator.compare(a, b) === 0;
}

type FoundProperty = { propertyName: string; path: string[]; value: unknown };
type PropertySearchResult = 'continue' | 'abort';

type PropertySearchExContext = {
  isMatch: (propertyName: string, path: string[], value: unknown) => boolean;
  currentPath: string[];
  results: FoundProperty[];
  returnFirstResult: boolean;
};

export function collectElements(
  obj: unknown,
  isMatch: (propertyName: string, path: string[], value: unknown) => boolean,
  returnFirstMatch: boolean
): FoundProperty[] {
  const ctx: PropertySearchExContext = {
    isMatch,
    currentPath: [],
    results: [],
    returnFirstResult: returnFirstMatch,
  };
  collectElementsRecursive(ctx, obj as Record<string, unknown>);
  return ctx.results;
}

function collectElementsRecursive(ctx: PropertySearchExContext, obj: Record<string, unknown>): PropertySearchResult {
  for (const key in obj) {
    if (Object.hasOwn(obj, key) && collectMatchingProperty(ctx, key, obj[key]) === 'abort') {
      return 'abort';
    }
  }
  return 'continue';
}

function collectMatchingProperty(ctx: PropertySearchExContext, key: string, value: unknown): PropertySearchResult {
  if (ctx.isMatch(key, ctx.currentPath, value)) {
    ctx.results.push({ propertyName: key, path: Object.assign([], ctx.currentPath), value });
    if (ctx.returnFirstResult) {
      return 'abort';
    }
  }
  if (typeof value === 'object' && value !== null) {
    ctx.currentPath.push(key);
    const result = collectElementsRecursive(ctx, value as Record<string, unknown>);
    ctx.currentPath.pop();
    return result;
  }
  return 'continue';
}

type IsMatchFunc = (pathElement: string, propertyName: string, value: unknown) => boolean;
export type CollectedProperty = { path: string[]; value: unknown };

export function collectElements2(
  targetObject: Record<string, unknown>,
  path: string[],
  isMatch: IsMatchFunc
): CollectedProperty[] {
  let explore: CollectedProperty[] = [{ path: [], value: targetObject }];
  for (let index = 0; index < path.length; index++) {
    const next = explore.flatMap((property) => collectPathSegment(property, path[index], isMatch));
    if (index === path.length - 1) {
      return next;
    }
    explore = next;
  }
  return [];
}

function collectPathSegment(property: CollectedProperty, segment: string, isMatch: IsMatchFunc): CollectedProperty[] {
  if (segment !== '**') {
    return collectDirectProperties(property, segment, isMatch);
  }
  const nested = collectElements(property.value, (_key, _path, value) => typeof value === 'object', false);
  return [
    ...nested.map((child) => ({ path: [...property.path, ...child.path, child.propertyName], value: child.value })),
    { path: [...property.path], value: property.value },
  ];
}

function collectDirectProperties(
  property: CollectedProperty,
  segment: string,
  isMatch: IsMatchFunc
): CollectedProperty[] {
  const results: CollectedProperty[] = [];
  for (const key in property.value as Record<string, unknown>) {
    if (Object.hasOwn(property.value as Record<string, unknown>, key)) {
      const value = (property.value as Record<string, unknown>)[key];
      if (value === null || typeof value === 'function') {
        continue;
      }
      if (segment === '*' || isMatch(segment, key, value)) {
        results.push({ path: [...property.path, key], value });
      }
    }
  }
  return results;
}

export function getAllMessageKeys(messages: TopicMessage[]): Property[] {
  const ctx: GetAllKeysContext = {
    currentFullPath: '',
    currentPath: [],
    results: [],
    existingPaths: new Set<string>(),
  };

  // slice is needed because messages array is observable
  for (const m of messages.slice()) {
    const payload = m.value.payload;
    getAllKeysRecursive(ctx, payload as Record<string, unknown>);

    ctx.currentPath = [];
    ctx.currentFullPath = '';
  }

  // console.log('getAllMessageKeys', ctx.results);

  return ctx.results;
}

type Property = {
  /** property name */
  propertyName: string;
  /** path to the property (excluding 'prop' itself) */
  path: string[];
  /** path + prop */
  fullPath: string;
};
type GetAllKeysContext = {
  currentPath: string[]; // complete, real path
  currentFullPath: string; // string path, with array indices replaced by a start
  existingPaths: Set<string>; // list of 'currentFullPath' entries, used to filter duplicates
  results: Property[];
};

function getAllKeysRecursive(ctx: GetAllKeysContext, obj: Record<string, unknown>): void {
  const isArray = Array.isArray(obj);
  const pathToHere = ctx.currentFullPath;
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      collectMessageKey(ctx, obj[key], key, pathToHere, isArray);
    }
  }
  ctx.currentFullPath = pathToHere;
}

function collectMessageKey(
  ctx: GetAllKeysContext,
  value: unknown,
  key: string,
  pathToHere: string,
  isArray: boolean
): void {
  ctx.currentPath.push(key);
  const fullPath = isArray ? `${pathToHere}[*]` : `${pathToHere}.${key}`;
  ctx.currentFullPath = fullPath;
  if (!isArray) {
    recordMessageKey(ctx, key, fullPath);
  }
  if (typeof value === 'object' && value !== null) {
    getAllKeysRecursive(ctx, value as Record<string, unknown>);
  }
  ctx.currentPath.pop();
  ctx.currentFullPath = fullPath;
}

function recordMessageKey(ctx: GetAllKeysContext, key: string, fullPath: string): void {
  if (ctx.existingPaths.has(fullPath)) {
    return;
  }
  ctx.existingPaths.add(fullPath);
  ctx.results.push({ propertyName: key, path: Object.assign([], ctx.currentPath), fullPath });
}

const secToMs = 1000;
const minToMs = 60 * secToMs;
const hoursToMs = 60 * minToMs;
// const daysToMs = 24 * hoursToMs;

export function hoursToMilliseconds(hours: number) {
  return hours * hoursToMs;
}

export const cullText = (str: string, length: number) => {
  const ELLIPSIS_LENGTH = 3;
  return str.length > length ? `${str.substring(0, length - ELLIPSIS_LENGTH)}...` : str;
};

export function groupConsecutive(ar: number[]): number[][] {
  const groups: number[][] = [];

  for (const cur of ar) {
    const group = groups.length > 0 ? groups.at(-1) : undefined;

    if (group) {
      const last = group.at(-1);
      if (last === cur - 1) {
        // We can extend the group
        group.push(cur);
        continue;
      }
    }

    groups.push([cur]);
  }

  return groups;
}

export const prettyBytesOrNA = (n: number) => {
  if (!Number.isFinite(n) || n < 0) {
    return 'N/A';
  }
  return prettyBytes(n);
};

/** Same size, same members. */
export const eqSet = <T = string>(xs: Set<T>, ys: Set<T>): boolean =>
  xs.size === ys.size && [...xs].every((x) => ys.has(x));

export type PrettyValueOptions = {
  /** Show 'Infinite' for greater or equal to 2^64-1 */
  showLargeAsInfinite?: boolean;
  /** A fallback to show when the value is `undefined` or `null` */
  showNullAs?: string;
};
export const UInt64Max = '18446744073709551615'; // can't be represented in js, would be rounded up to 18446744073709552000
function isUInt64Maximum(str: string) {
  if (str === UInt64Max) {
    return true;
  }
  if (str === String(Number(UInt64Max))) {
    return true;
  }
  return false;
}

function parsePrettyString(value: string): number | string {
  if (value === '') {
    return 'N/A';
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : String(parsed);
}

function parsePrettyValue(value: number | string | null | undefined, options?: PrettyValueOptions): number | string {
  if (value === undefined || value === null) {
    return options?.showNullAs ?? 'N/A';
  }
  if (options?.showLargeAsInfinite && isUInt64Maximum(String(value))) {
    return 'Infinite';
  }
  if (typeof value === 'string') {
    return parsePrettyString(value);
  }
  return typeof value === 'number' ? value : 'NaN';
}

export const prettyBytes = (n: number | string | null | undefined, options?: PrettyValueOptions) => {
  const value = parsePrettyValue(n, options);
  return typeof value === 'string' ? value : prettyBytesOriginal(value, { binary: true });
};

export const prettyMilliseconds = (n: number | string, options?: PrettyMillisecondsOptions & PrettyValueOptions) => {
  const value = parsePrettyValue(n, options);
  if (typeof value === 'string') {
    return value;
  }
  return Number.isFinite(value) ? prettyMillisecondsOriginal(value, options) : 'N/A';
};

const ONE_THOUSAND = 1000;
const ONE_MILLION = 1_000_000;
const ONE_BILLION = 1_000_000_000;

const between = (min: number, max: number) => (num: number) => num >= min && num < max;
const isK = between(ONE_THOUSAND, ONE_MILLION);
const isM = between(ONE_MILLION, ONE_BILLION);

const isInfinite = (num: number) => !Number.isFinite(num);
const toK = (num: number) => `${(num / ONE_THOUSAND).toFixed(1)}k`;
const toM = (num: number) => `${(num / ONE_MILLION).toFixed(1)}m`;
const toG = (num: number) => `${(num / ONE_BILLION).toFixed(1)}g`;

export function prettyNumber(num: number) {
  if (Number.isNaN(num) || isInfinite(num) || num < ONE_THOUSAND) {
    return String(num);
  }
  if (isK(num)) {
    return toK(num);
  }
  if (isM(num)) {
    return toM(num);
  }
  return toG(num);
}

export function fromDecimalSeparated(str: string): number {
  if (!str || str === '') {
    return 0;
  }
  return Number.parseInt(str.replace(',', ''), 10);
}

export function toDecimalSeparated(num: number): string {
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * random digits and letters (entropy: 53bit)
 */
export function randomId() {
  return (Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
}

/**
 * "prefix-randomId()-randomId()"
 */
export function simpleUniqueId(prefix?: string) {
  return `${prefix}-${randomId()}-${randomId()}`;
}

/**
 * 4x 'randomId()'
 */
export function uniqueId4(): string {
  return randomId() + randomId() + randomId() + randomId();
}

export function titleCase(str: string): string {
  if (!str) {
    return str;
  }
  return str[0].toUpperCase() + str.slice(1).toLowerCase();
}

export function capitalizeFirst(str: string): string {
  if (!str) {
    return str; // Handle empty or falsy strings
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Scroll the main content region
 */
export function scrollToTop(): void {
  const mainLayout = document.getElementById('mainLayout');
  if (!mainLayout) {
    return;
  }

  mainLayout.scrollTo({ behavior: 'smooth', left: 0, top: 0 });
}

/**
 * Scroll the main content region to the target element (which is found by the given id)
 */
export function scrollTo(targetId: string, anchor: 'start' | 'end' | 'center' = 'center', offset?: number): void {
  const mainLayout = document.getElementById('mainLayout');
  if (!mainLayout) {
    return;
  }
  const target = document.getElementById(targetId);
  if (!target) {
    return;
  }

  const rect = target.getBoundingClientRect();
  // @ts-expect-error perhaps it affects the target for some reason?
  let _top = 0;
  switch (anchor) {
    case 'start':
      _top = rect.top;
      break;
    case 'center':
      _top = (rect.top + rect.bottom) / 2;
      break;
    case 'end':
      _top = rect.bottom;
      break;
    default:
      _top = rect.top;
      break;
  }

  mainLayout.scrollTo({
    behavior: 'smooth',
    top: target.getBoundingClientRect().top + mainLayout.scrollTop + (offset ?? 0),
  });
}

// See: https://stackoverflow.com/questions/30106476/using-javascripts-atob-to-decode-base64-doesnt-properly-decode-utf-8-strings
export function decodeBase64(base64: string) {
  if (!base64) {
    return base64;
  }

  return Base64.decode(base64);
}

export function encodeBase64(rawData: string) {
  return Base64.encode(rawData);
}

/** True when `Base64.decode` accepts the string. */
export function isValidBase64(str: string): boolean {
  try {
    Base64.decode(str);
    return true;
  } catch (_e) {
    return false;
  }
}

export function base64FromUInt8Array(ar: Uint8Array) {
  return fromUint8Array(ar);
}

export function base64ToUInt8Array(base64: string) {
  return Base64.toUint8Array(base64);
}

function binaryStringToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function formatHexBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

export function base64ToHexString(base64: string): string {
  try {
    return formatHexBytes(binaryStringToBytes(Base64.atob(base64)));
  } catch (_err) {
    return '<<Unable to decode message>>';
  }
}

export function uint8ArrayToHexString(ar: Uint8Array): string {
  try {
    return formatHexBytes(ar);
  } catch (_err) {
    return '<<Unable to convert uint8Array to hex>>';
  }
}

export function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve, _) => {
    setTimeout(resolve, timeoutMs);
  });
}

export function setHeader(init: RequestInit, name: string, value: string) {
  if (init.headers === null || init.headers === undefined) {
    init.headers = [[name, value]];
  } else if (Array.isArray(init.headers)) {
    init.headers.push([name, value]);
  } else if (typeof init.headers.set === 'function') {
    init.headers.set(name, value);
  } else {
    // Record<string, string>
    (init.headers as Record<string, string>)[name] = value;
  }
}

// very simple retrier utility for allowing some retries, if we ended up using it more often we should consider making it more elaborate
export function retrier<T>(
  operation: () => Promise<T>,
  { attempts = Number.POSITIVE_INFINITY, delayTime = 100 }
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    operation()
      .then(resolve)
      .catch((reason: unknown) => {
        if (attempts > 0) {
          return delay(delayTime)
            .then(() => retrier(operation, { attempts: attempts - 1, delayTime }))
            .then(resolve)
            .catch(reject);
        }
        reject(reason);
      });
  });
}

/**
 * https://stackoverflow.com/a/59187769 Extract the type of an element of an array/tuple without
 * performing indexing
 */
export type ElementOf<T> = T extends (infer E)[] ? E : T extends readonly (infer F)[] ? F : never;

/**
 * Truncates a string to a specified length and adds an ellipsis (...) if the truncation occurs.
 *
 * @param {string} input The string to truncate.
 * @param {number} maxLength The maximum length of the string, including the ellipsis.
 * @returns {string} The truncated string with ellipsis if truncation was necessary, otherwise the original string.
 */
export function substringWithEllipsis(input: string, maxLength: number): string {
  // Check if the input length is greater than the maxLength
  // Note: We account for the length of the ellipsis in the comparison
  if (input.length > maxLength) {
    // Subtract 3 from maxLength to accommodate the ellipsis
    // Ensure maxLength is at least 4 to avoid negative substring lengths
    const effectiveLength = Math.max(maxLength - 3, 1);
    return `${input.substring(0, effectiveLength)}...`;
  }
  return input;
}

// If the schemaName contains an escape character (%) we need to protect the url from getting auto decoded by react router.
// Otherwise we cannot tell the difference between '/' and '%2F' and '%252F'
// https://github.com/remix-run/react-router/issues/10213
// https://github.com/remix-run/history/issues/874
export function encodeURIComponentPercents(rawStr: string): string {
  const encoded = encodeURIComponent(rawStr);
  return encoded.replace(/%/g, '﹪');
}

export function decodeURIComponentPercents(encodedStr: string): string {
  const encoded = encodedStr.replace(/﹪/g, '%');
  return decodeURIComponent(encoded);
}

/**
 * Pulls the `subject` out of a permission error's details, from the entry whose
 * `login_type` is `OIDC`. Null when there is no such entry.
 */
export function getOidcSubject(error: {
  details?: { debug?: { metadata?: { login_type?: string; subject?: string } } }[];
}): string | null {
  if (!error.details) {
    return null;
  }
  for (const detail of error.details) {
    if (detail.debug?.metadata?.login_type === 'OIDC' && detail.debug.metadata.subject) {
      return detail.debug.metadata.subject;
    }
  }
  return null; // Return null if no OIDC subject is found
}
