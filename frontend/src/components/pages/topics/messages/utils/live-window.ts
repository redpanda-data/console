/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/**
 * Bound the rows shown during live tail / continuous mode to the newest `cap`
 * entries. Callers must order `rows` (oldest→newest, or newest→oldest) *before*
 * windowing and say which end holds the newest row via `newestFirst` — trimming
 * on raw arrival order is only valid for the oldest→newest case; continuous
 * "Newest" arrives newest→oldest per partition batch, so trimming the front
 * there would drop the newest rows instead of the oldest ones. Returns the
 * input array unchanged when it already fits, so referential equality holds
 * for memoized consumers.
 */
export function applyDisplayWindow<T>(
  rows: readonly T[],
  cap: number,
  options?: { newestFirst?: boolean }
): { rows: readonly T[]; trimmed: number } {
  if (rows.length <= cap) {
    return { rows, trimmed: 0 };
  }
  const trimmed = rows.length - cap;
  return { rows: options?.newestFirst ? rows.slice(0, cap) : rows.slice(trimmed), trimmed };
}
