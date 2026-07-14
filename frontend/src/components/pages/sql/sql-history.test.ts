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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { type HistoryEntry, loadHistory, MAX_HISTORY, pushHistory, saveHistory } from './sql-history';

const HISTORY_KEY = 'rp_sql_history_v1';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pushHistory', () => {
  test('prepends the newest entry', () => {
    const list = pushHistory([{ sql: 'SELECT 1', at: 1 }], 'SELECT 2', 2);
    expect(list.map((entry) => entry.sql)).toEqual(['SELECT 2', 'SELECT 1']);
  });

  test('dedupes an identical earlier run instead of listing it twice', () => {
    const list = pushHistory(
      [
        { sql: 'SELECT 1', at: 1 },
        { sql: 'SELECT 2', at: 2 },
      ],
      'SELECT 1',
      3
    );
    expect(list).toEqual([
      { sql: 'SELECT 1', at: 3 },
      { sql: 'SELECT 2', at: 2 },
    ]);
  });

  test('caps the list length', () => {
    let list: HistoryEntry[] = [];
    for (let i = 0; i < MAX_HISTORY + 10; i += 1) {
      list = pushHistory(list, `SELECT ${i}`, i);
    }
    expect(list).toHaveLength(MAX_HISTORY);
    expect(list[0].sql).toBe(`SELECT ${MAX_HISTORY + 9}`);
  });
});

describe('loadHistory / saveHistory', () => {
  test('round-trips entries through localStorage', () => {
    saveHistory([{ sql: 'SELECT 1', at: 42 }]);
    expect(loadHistory()).toEqual([{ sql: 'SELECT 1', at: 42 }]);
  });

  test('drops malformed entries but keeps valid ones', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([{ sql: 'SELECT 1', at: 1 }, { sql: 7 }, 'nope', null]));
    expect(loadHistory()).toEqual([{ sql: 'SELECT 1', at: 1 }]);
  });

  test('returns empty for a non-array value', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ not: 'a list' }));
    expect(loadHistory()).toEqual([]);
  });

  test('returns empty for invalid JSON', () => {
    localStorage.setItem(HISTORY_KEY, '{broken');
    expect(loadHistory()).toEqual([]);
  });
});
