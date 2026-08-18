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
