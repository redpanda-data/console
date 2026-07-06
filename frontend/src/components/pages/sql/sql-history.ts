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

import { config, isEmbedded } from 'config';
import { z } from 'zod';

// The single source of truth for the SQL query-run history persisted in
// localStorage. Written by the editor on every run and read back by both the
// editor's History popover and the landing page's "Recent queries" card —
// shared here so the key and entry shape can't drift between the two.

export const HistoryEntrySchema = z.object({ sql: z.string(), at: z.number() });

export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const MAX_HISTORY = 40;

// Tolerates individually malformed entries: keeps the valid ones, drops the rest.
const StoredHistorySchema = z.array(z.unknown()).transform((list) =>
  list.flatMap((entry) => {
    const parsed = HistoryEntrySchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  })
);

const HISTORY_KEY_BASE = 'rp_sql_history_v1';

// localStorage is origin-scoped, and embedded Console serves every cluster
// from the same Cloud UI origin — an unscoped key would surface cluster A's
// queries as one-click runs on cluster B. Standalone serves one cluster per
// origin, so the bare key suffices there.
function historyKey(): string {
  return isEmbedded() ? `${HISTORY_KEY_BASE}:${config.clusterId ?? 'default'}` : HISTORY_KEY_BASE;
}

// Kept defensive so a malformed or truncated stored value never throws.
export function loadHistory(): HistoryEntry[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    return StoredHistorySchema.catch([]).parse(JSON.parse(localStorage.getItem(historyKey()) ?? '[]'));
  } catch {
    return [];
  }
}

export function saveHistory(list: HistoryEntry[]): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(historyKey(), JSON.stringify(list.slice(0, MAX_HISTORY)));
  } catch {
    // best-effort; ignore quota/serialization failures
  }
}

/** Prepend `sql` to `list`, deduping an identical earlier run and capping the length. */
export function pushHistory(list: HistoryEntry[], sql: string, at: number): HistoryEntry[] {
  return [{ sql, at }, ...list.filter((entry) => entry.sql !== sql)].slice(0, MAX_HISTORY);
}
