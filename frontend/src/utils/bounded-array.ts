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
 * Append `item` to `arr`, returning a NEW array capped to the last `max` entries.
 *
 * For immutable state (zustand `setState`, reducers) where an unbounded append would
 * otherwise retain every entry for the lifetime of a long-lived tab.
 */
export function boundedAppend<T>(arr: readonly T[], item: T, max: number): T[] {
  const next = [...arr, item];
  return next.length > max ? next.slice(next.length - max) : next;
}

/**
 * Trim a mutable buffer IN PLACE to its last `max` entries (sliding window).
 *
 * For long-lived push-buffers (e.g. the live-tail message array) where bounding memory
 * matters more than keeping the full history.
 */
export function trimToLast<T>(buffer: T[], max: number): void {
  if (buffer.length > max) {
    buffer.splice(0, buffer.length - max);
  }
}

/**
 * Return a NEW map containing only the entries whose key is in `validKeys`.
 *
 * For entity caches keyed by a name (topics, schema subjects, …) that would otherwise retain
 * entries for entities that no longer exist (deleted, or a different cluster after a remount).
 * Pruning to the current set never drops a live entity, so callers re-fetch nothing.
 */
export function pruneMapToKeys<V>(map: ReadonlyMap<string, V>, validKeys: ReadonlySet<string>): Map<string, V> {
  const next = new Map<string, V>();
  for (const [key, value] of map) {
    if (validKeys.has(key)) {
      next.set(key, value);
    }
  }
  return next;
}
