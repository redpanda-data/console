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

import type { ConfigEntry, ConfigEntryExtended } from '../../state/rest-interfaces';
import { prettyBytesOrNA, prettyMilliseconds } from '../utils';

export const CONFIG_INFINITE_VALUES: Record<string, number> = {
  'flush.ms': 9_223_372_036_854,
};

export const entryHasInfiniteValue = (entry: ConfigEntry) =>
  Number(entry.value) === CONFIG_INFINITE_VALUES[entry.name] || entry.value === '-1';

export const getInfiniteValueForEntry = (entry: ConfigEntryExtended) => CONFIG_INFINITE_VALUES[entry.name] ?? -1;

// Broker configs use both dot and underscore separators. Longer time suffixes
// deliberately omit the separator so Kafka and Redpanda names both match.
const TIME_EXTENSIONS: [string, number][] = [
  ['.ms', 1],
  ['_ms', 1],
  ['seconds', 1000],
  ['minutes', 60 * 1000],
  ['hours', 60 * 60 * 1000],
  ['days', 24 * 60 * 60 * 1000],
];
const BYTE_EXTENSIONS = [
  '.bytes',
  '_bytes',
  '.buffer.size',
  '.replication.throttled.rate',
  '.reassignment.throttled.rate',
];
const LISTENER_NAMES = ['advertised.listeners', 'listener.security.protocol.map', 'listeners'];

export function formatConfigValue(
  name: string,
  value: string | null | undefined,
  formatType: 'friendly' | 'raw' | 'both'
): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (formatType !== 'friendly' && formatType !== 'both') {
    return value;
  }
  if (value && LISTENER_NAMES.includes(name)) {
    return value.split(',').join('\n');
  }
  const num = Number(value);
  if (value === '' || value === '0' || Number.isNaN(num)) {
    return value;
  }
  return formatNumericConfigValue(name, value, num, formatType === 'both' ? ` (${value})` : '');
}

function formatNumericConfigValue(name: string, value: string, num: number, suffix: string): string {
  if (name === 'flush.messages' && num > 2 ** 60) {
    return `Never${suffix}`;
  }
  if (name.endsWith('.bytes.per.second')) {
    return num >= Number.MAX_SAFE_INTEGER ? `Infinite${suffix}` : `${prettyBytesOrNA(num)}/s${suffix}`;
  }
  if (CONFIG_INFINITE_VALUES[name] && num >= CONFIG_INFINITE_VALUES[name]) {
    return `Infinite${suffix}`;
  }
  const timeExtension = TIME_EXTENSIONS.find(([extension]) => name.endsWith(extension));
  if (timeExtension) {
    return formatTimeConfigValue(num, timeExtension[1], suffix);
  }
  return formatByteOrRatioConfigValue(name, value, num, suffix);
}

function formatTimeConfigValue(num: number, msFactor: number, suffix: string): string {
  return num > Number.MAX_SAFE_INTEGER || num === -1
    ? `Infinite${suffix}`
    : prettyMilliseconds(num * msFactor, { verbose: true, unitCount: 2 }) + suffix;
}

function formatByteOrRatioConfigValue(name: string, value: string, num: number, suffix: string): string {
  if (BYTE_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    // uint64 max rounds above the integer boundary when represented as a JS number.
    const uint64Max = '18446744073709551615';
    const uint64Exp = 1.844_674_407_370_955e19;
    return value === uint64Max || num >= uint64Exp || num === -1 ? `Infinite${suffix}` : prettyBytesOrNA(num) + suffix;
  }
  return name.endsWith('.ratio') ? `${(num * 100).toLocaleString()}%` : value;
}
