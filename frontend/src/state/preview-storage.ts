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

import { config } from 'config';
import type { z } from 'zod';

// The browser-local preview stores (schedules, run history) each keep one JSON map in localStorage, keyed
// by pipeline. Reads and writes go through here, so they all behave the same when storage can't be used.

/** A pipeline's key in a preview map: its cluster, then its id. */
export const pipelinePreviewKey = (pipelineId: string): string => `${config.clusterId || 'default'}/${pipelineId}`;

/**
 * The map stored under `key` as written, entries this version can't read included, so a write never drops
 * them. Undefined when storage can't be read at all; empty when what's there isn't a map.
 */
export function readPreviewMap(key: string): Record<string, unknown> | undefined {
  if (typeof window === 'undefined') {
    return;
  }
  let text: string | null;
  try {
    text = window.localStorage.getItem(key);
  } catch {
    return;
  }
  try {
    const parsed: unknown = JSON.parse(text ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The entries of a stored map that `schema` reads (and `keep` accepts); the rest are left out. */
export function readableEntries<T>(
  map: Record<string, unknown>,
  schema: z.ZodType<T>,
  keep: (value: T) => boolean = () => true
): Record<string, T> {
  const entries: Record<string, T> = {};
  for (const [entryKey, value] of Object.entries(map)) {
    const result = schema.safeParse(value);
    if (result.success && keep(result.data)) {
      entries[entryKey] = result.data;
    }
  }
  return entries;
}

/** Writes the map; with storage unavailable, the page keeps what it holds until it reloads. */
export function writePreviewMap(key: string, map: Record<string, unknown>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Storage is unavailable.
  }
}

/** Calls `listener` with the stored map whenever another tab changes it. */
export function onPreviewMapChange(key: string, listener: (map: Record<string, unknown>) => void): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.addEventListener('storage', (event) => {
    const map = event.key === key || event.key === null ? readPreviewMap(key) : undefined;
    if (map) {
      listener(map);
    }
  });
}
