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

export function lerpNumber(value: number, to: number, factor: number): number {
  return value + (to - value) * factor;
}

/** Applies the upper bound first, matching the existing slider behavior for inverted bounds. */
export function clampNumber(value: number, min: number | undefined, max: number | undefined): number {
  if (max !== undefined && value > max) {
    return max;
  }
  if (min !== undefined && value < min) {
    return min;
  }
  return value;
}

/** Numeric condition semantics: zero and NaN are absent; negative values and infinities are not. */
export function isNonzeroNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && value !== 0 && !Number.isNaN(value);
}

/** Preserve numeric fallback behavior without evaluating the source more than once. */
export function nonzeroNumber(value: number | null | undefined): number | undefined {
  return isNonzeroNumber(value) ? value : undefined;
}
