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

const DECIMAL_PLACES_REGEX = /\.\d{4,}/;

/**
 * Converts a retention value when its unit picker changes, so the amount stays the same. Switching
 * to `default` keeps the base amount; a value with more than three decimals is rounded.
 */
export function convertRetentionValue<U extends string>(
  value: number,
  unit: U,
  newUnit: U,
  factors: Record<U, number>
): number {
  if (newUnit === 'default') {
    return value * factors[unit];
  }
  const factor = unit === 'default' ? 1 : factors[unit];
  let newValue = (value * factor) / factors[newUnit];
  if (Number.isNaN(newValue)) {
    newValue = 0;
  }
  if (DECIMAL_PLACES_REGEX.test(String(newValue))) {
    newValue = Math.round(newValue);
  }
  return newValue;
}
