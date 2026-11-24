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

const UNIT_ABBREV: Record<string, string> = {
  byte: 'B',
  bytes: 'B',
  b: 'B',

  second: 's',
  seconds: 's',
  sec: 's',
  s: 's',

  millisecond: 'ms',
  milliseconds: 'ms',
  ms: 'ms',

  minute: 'min',
  minutes: 'min',
  min: 'min',

  hour: 'h',
  hours: 'h',
  h: 'h',

  day: 'd',
  days: 'd',
  d: 'd',
};

function abbreviateUnit(unit: string) {
  const normalized = unit.toLowerCase().trim();

  if (UNIT_ABBREV[normalized]) {
    return UNIT_ABBREV[normalized];
  }

  return normalized.substring(0, 3);
}

function canonicalizeUnit(unit: string) {
  if (!unit) {
    return '';
  }

  const normalized = unit.toLowerCase().trim();

  if (normalized.includes('/')) {
    const [numerator, denominator] = normalized.split('/').map((s) => s.trim());
    return `${abbreviateUnit(numerator)}/${abbreviateUnit(denominator)}`;
  }

  return abbreviateUnit(normalized);
}

function formatNumber(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1_000_000_000) {
    return { formatted: `${sign}${(abs / 1_000_000_000).toFixed(1)}`, scale: 'G' };
  }
  if (abs >= 1_000_000) {
    return { formatted: `${sign}${(abs / 1_000_000).toFixed(1)}`, scale: 'M' };
  }
  if (abs >= 1000) {
    return { formatted: `${sign}${(abs / 1000).toFixed(1)}`, scale: 'K' };
  }

  return { formatted: `${sign}${abs.toFixed(abs < 10 ? 2 : abs < 100 ? 1 : 0)}`, scale: '' };
}

/**
 * Format a number with its unit
 */
export function formatWithUnit(value: number, unit: string | undefined) {
  if (!unit) {
    const { formatted, scale } = formatNumber(value);
    return `${formatted}${scale}`;
  }

  const canonical = canonicalizeUnit(unit);
  const { formatted, scale } = formatNumber(value);

  if (canonical === 'B' || canonical.startsWith('B/')) {
    return `${formatted} ${scale}${canonical}`.trim();
  }

  return `${formatted}${scale} ${canonical}`.trim();
}
