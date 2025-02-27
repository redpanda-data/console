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

import type { ConfigEntry, ConfigEntryExtended } from '../../state/restInterfaces';
import { prettyBytesOrNA, prettyMilliseconds } from '../utils';

export const CONFIG_INFINITE_VALUES: Record<string, number> = {
  'flush.ms': 9223372036854,
};

export const entryHasInfiniteValue = (entry: ConfigEntry) =>
  Number(entry.value) === CONFIG_INFINITE_VALUES[entry.name] || entry.value === '-1';

export const getInfiniteValueForEntry = (entry: ConfigEntryExtended) => {
  return CONFIG_INFINITE_VALUES[entry.name] ?? -1;
};

export function formatConfigValue(
  name: string,
  value: string | null | undefined,
  formatType: 'friendly' | 'raw' | 'both',
): string {
  let suffix: string;

  if (value == null) return '';

  switch (formatType) {
    case 'friendly':
      suffix = '';
      break;
    case 'both':
      suffix = ` (${value})`;
      break;
    default:
      return value;
  }

  //
  // String
  //
  if (value && (name === 'advertised.listeners' || name === 'listener.security.protocol.map' || name === 'listeners')) {
    const listeners = value.split(',');
    return listeners.join('\n');
  }

  //
  // Numeric
  //
  const num = Number(value);
  if (value == null || value === '' || value === '0' || Number.isNaN(num)) return value;

  // Special cases
  if (name === 'flush.messages' && num > 2 ** 60) return `Never${suffix}`; // messages between each fsync

  if (name.endsWith('.bytes.per.second')) {
    if (num >= Number.MAX_SAFE_INTEGER) return `Infinite${suffix}`;
    return `${prettyBytesOrNA(num)}/s${suffix}`;
  }

  if (CONFIG_INFINITE_VALUES[name] && num >= CONFIG_INFINITE_VALUES[name]) {
    return `Infinite${suffix}`;
  }

  // Time
  const timeExtensions: [string, number][] = [
    // name ending -> conversion to milliseconds
    ['.ms', 1],
    ['_ms', 1], // Redpanda broker configs use underscores

    // Redpanda broker configs use underscores rather than dots as a separator.
    // Because we want to match both configs, we omit the separator (dot vs underscore) for the
    // following time extensions.
    // These suffixes seem unique enough (compared to "ms") to not be ambigious with other
    // config options.
    ['seconds', 1000],
    ['minutes', 60 * 1000],
    ['hours', 60 * 60 * 1000],
    ['days', 24 * 60 * 60 * 1000],
  ];
  for (const [ext, msFactor] of timeExtensions) {
    if (!name.endsWith(ext)) continue;
    if (num > Number.MAX_SAFE_INTEGER || num === -1) return `Infinite${suffix}`;

    const ms = num * msFactor;
    return prettyMilliseconds(ms, { verbose: true, unitCount: 2 }) + suffix;
  }

  // Bytes
  if (
    name.endsWith('.bytes') ||
    name.endsWith('_bytes') || // Redpanda broker configs use underscores
    name.endsWith('.buffer.size') ||
    name.endsWith('.replication.throttled.rate') ||
    name.endsWith('.reassignment.throttled.rate')
  ) {
    const uint64Max = '18446744073709551615'; // can't be represented in js, would be rounded up to 18446744073709552000
    const uint64Exp = 1.844674407370955e19; // barely below the point where the number would be rounded up
    if (value === uint64Max || num >= uint64Exp || num === -1) return `Infinite${suffix}`;

    return prettyBytesOrNA(num) + suffix;
  }

  // Ratio
  if (name.endsWith('.ratio')) {
    return `${(num * 100).toLocaleString()}%`;
  }

  return value;
}
