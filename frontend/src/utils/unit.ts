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

/**
 * Unit abbreviations map
 */
const UNIT_ABBREV: Record<string, string> = {
  // Bytes
  byte: 'B',
  bytes: 'B',
  b: 'B',

  // Time
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

/**
 * Abbreviate a single unit
 */
function abbreviateUnit(unit: string): string {
  const normalized = unit.toLowerCase().trim();

  if (UNIT_ABBREV[normalized]) {
    return UNIT_ABBREV[normalized];
  }

  // Truncate to 3 chars
  return normalized.substring(0, 3);
}

/**
 * Canonicalize a unit to form "x" or "x/y"
 */
function canonicalizeUnit(unit: string): string {
  if (!unit) return '';

  const normalized = unit.toLowerCase().trim();

  if (normalized.includes('/')) {
    const [numerator, denominator] = normalized.split('/').map((s) => s.trim());
    return `${abbreviateUnit(numerator)}/${abbreviateUnit(denominator)}`;
  }

  return abbreviateUnit(normalized);
}

/**
 * Format a number and return formatted value and scale
 */
function formatNumber(value: number): { formatted: string; scale: string } {
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

  // Small numbers
  if (abs < 10) {
    return { formatted: `${sign}${abs.toFixed(2)}`, scale: '' };
  }
  if (abs < 100) {
    return { formatted: `${sign}${abs.toFixed(1)}`, scale: '' };
  }
  return { formatted: `${sign}${abs.toFixed(0)}`, scale: '' };
}

/**
 * Format a number with its unit
 */
export function formatWithUnit(value: number, unit: string | undefined): string {
  if (!unit) {
    const { formatted, scale } = formatNumber(value);
    return `${formatted}${scale}`;
  }

  const canonical = canonicalizeUnit(unit);
  const { formatted, scale } = formatNumber(value);

  // If numerator is B (bytes), attach scale to the unit
  if (canonical === 'B' || canonical.startsWith('B/')) {
    return `${formatted} ${scale}${canonical}`.trim();
  }

  // For other units, attach scale to the number
  return `${formatted}${scale} ${canonical}`.trim();
}
