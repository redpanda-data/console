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

import { visiblePageKeys } from './message-order';
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
});
