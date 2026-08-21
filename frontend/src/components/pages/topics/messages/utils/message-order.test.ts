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

import { describe, expect, test } from 'vitest';

import { applyDisplayWindow } from './live-window';
import { orderForContinuousNewest, visiblePageKeys } from './message-order';
import type { TopicMessage } from '../../../../../state/rest-interfaces';

const msg = (partitionID: number, offset: number, timestamp: number): TopicMessage =>
  ({ partitionID, offset, timestamp }) as TopicMessage;

// Arrives oldest-first (server order), as a continuous-mode stream would.
const messages = [msg(0, 1, 100), msg(0, 2, 300), msg(0, 3, 200)];

describe('visiblePageKeys', () => {
  test('applies the sort when sorting is not disabled', () => {
    expect(
      visiblePageKeys(messages, {
        sorting: [{ id: 'timestamp', desc: true }],
        sortingDisabled: false,
        pageIndex: 0,
        pageSize: 10,
      })
    ).toEqual(['0-2', '0-3', '0-1']);
  });

  test('ignores sorting and keeps server order when sortingDisabled — matches the table, which also disables sorting in continuous mode', () => {
    expect(
      visiblePageKeys(messages, {
        sorting: [{ id: 'timestamp', desc: true }],
        sortingDisabled: true,
        pageIndex: 0,
        pageSize: 10,
      })
    ).toEqual(['0-1', '0-2', '0-3']);
  });

  test('paginates within whichever order was chosen', () => {
    expect(visiblePageKeys(messages, { sorting: [], sortingDisabled: true, pageIndex: 1, pageSize: 2 })).toEqual([
      '0-3',
    ]);
  });

  test('ignores a persisted sort on a column the table never made sortable (e.g. key/value from the legacy page), keeping server order', () => {
    expect(
      visiblePageKeys(messages, {
        sorting: [{ id: 'key', desc: false }],
        sortingDisabled: false,
        pageIndex: 0,
        pageSize: 10,
      })
    ).toEqual(['0-1', '0-2', '0-3']);
  });

  test('rows with an equal timestamp keep their relative (server) order instead of an offset tiebreak the table never applies', () => {
    const tied = [msg(0, 5, 100), msg(0, 1, 100), msg(0, 3, 100)];
    expect(
      visiblePageKeys(tied, {
        sorting: [{ id: 'timestamp', desc: true }],
        sortingDisabled: false,
        pageIndex: 0,
        pageSize: 10,
      })
    ).toEqual(['0-5', '0-1', '0-3']);
  });
});

describe('orderForContinuousNewest', () => {
  // Partition-grouped, as the backend emits it for the "Newest" origin (per-partition batches,
  // not globally interleaved by timestamp).
  const partitionGrouped = [msg(0, 1, 100), msg(0, 2, 300), msg(1, 5, 200), msg(1, 6, 400)];

  test('sorts newest-first (timestamp desc, offset desc tiebreak) for continuous + newest', () => {
    expect(orderForContinuousNewest(partitionGrouped, true, 'newest')).toEqual([
      msg(1, 6, 400),
      msg(0, 2, 300),
      msg(1, 5, 200),
      msg(0, 1, 100),
    ]);
  });

  test('leaves server order untouched outside continuous + newest', () => {
    expect(orderForContinuousNewest(partitionGrouped, false, 'newest')).toBe(partitionGrouped);
    expect(orderForContinuousNewest(partitionGrouped, true, 'oldest')).toBe(partitionGrouped);
  });

  test('breaks ties by offset descending', () => {
    const tied = [msg(0, 1, 100), msg(1, 3, 100), msg(0, 2, 100)];
    expect(orderForContinuousNewest(tied, true, 'newest')).toEqual([msg(1, 3, 100), msg(0, 2, 100), msg(0, 1, 100)]);
  });
});

describe('orderForContinuousNewest composed with applyDisplayWindow (topic-messages-view order of operations)', () => {
  // Regression for: continuous + "Newest" trimmed the newest rows instead of the oldest.
  // For this scope each successive "Load more" page is *older* than the last (the backend
  // resolves a descending page direction — list_messages.go — for every start offset except
  // StartOffsetOldest), so the buffer's front holds the newest page and its back holds the
  // oldest, the opposite of every other (oldest→newest) scope.
  const newestPageFirst = [
    // Page 1 (arrives first): the newest page.
    ...Array.from({ length: 5 }, (_, i) => msg(0, i, 100 + i * 10)),
    // Page 2 (arrives via "Load more"): an older page.
    ...Array.from({ length: 5 }, (_, i) => msg(1, i, i * 10)),
  ];

  test('windowing after ordering keeps the newest page even once an older page pushes the buffer over cap', () => {
    const ordered = orderForContinuousNewest(newestPageFirst, true, 'newest');
    const { rows } = applyDisplayWindow(ordered, 4, { newestFirst: true });

    expect(rows.map((m) => m.timestamp)).toEqual([140, 130, 120, 110]);
  });

  test('windowing before ordering (the pre-fix composition) drops the newest page instead', () => {
    const { rows: windowedFirst } = applyDisplayWindow(newestPageFirst, 4);
    const wrongResult = orderForContinuousNewest(windowedFirst, true, 'newest');

    // The bug: the front-trim (correct only for oldest→newest arrival) removes page 1 — the
    // newest page — and keeps the older page 2 instead.
    expect(wrongResult.map((m) => m.timestamp)).toEqual([40, 30, 20, 10]);
  });
});
