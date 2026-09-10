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
 * Bound the rows shown during live tail / continuous mode to the last `cap`
 * entries of the *ordered* array. Callers must order `rows` before windowing.
 *
 * Keeping the tail makes the window follow the loading frontier in every scope:
 * oldest→newest orderings (live tail, continuous "Oldest") append newly arrived
 * rows at the tail, and continuous "Newest" fetches ever-older pages that sort
 * to the tail of its newest-first ordering. Keeping the head instead would pin
 * continuous "Newest" to its first `cap` rows forever — every "Load more" page
 * would be fetched and then silently discarded. Which side got trimmed therefore
 * depends on the scope (oldest rows everywhere, the *newest* rows once
 * continuous "Newest" pages past the cap) — the footer states which.
 *
 * Returns the input array unchanged when it already fits, so referential
 * equality holds for memoized consumers.
 */
export function applyDisplayWindow<T>(rows: readonly T[], cap: number): { rows: readonly T[]; trimmed: number } {
  if (rows.length <= cap) {
    return { rows, trimmed: 0 };
  }
  const trimmed = rows.length - cap;
  return { rows: rows.slice(trimmed), trimmed };
}
