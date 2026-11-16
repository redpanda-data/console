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

import { describe, expect, test } from '@rstest/core';
import type { GroupDescription, GroupType } from 'state/rest-interfaces';

import { computeGroupStatistics } from './group-list';

const group = (groupId: string, groupType: GroupType, state: string): GroupDescription => ({
  groupId,
  groupType,
  state,
  protocol: '',
  protocolType: 'consumer',
  members: [],
  coordinatorId: 0,
  topicOffsets: [],
  allowedActions: null,
  lagSum: 0,
  isInUse: false,
  noEditPerms: false,
  noDeletePerms: false,
});

describe('computeGroupStatistics', () => {
  test('counts the groups per type, classic first, and per state in first-seen order', () => {
    const statistics = computeGroupStatistics([
      group('billing', 'consumer', 'Stable'),
      group('orders', 'classic', 'Empty'),
      group('payments', 'classic', 'Stable'),
    ]);

    expect(statistics.total).toBe(3);
    expect(statistics.byType).toEqual([
      { type: 'classic', label: 'Classic', count: 2 },
      { type: 'consumer', label: 'Consumer', count: 1 },
    ]);
    expect(statistics.byState).toEqual([
      { state: 'Stable', count: 2 },
      { state: 'Empty', count: 1 },
    ]);
  });

  test('lists only the types that have groups', () => {
    const statistics = computeGroupStatistics([group('orders', 'classic', 'Stable')]);

    expect(statistics.byType).toEqual([{ type: 'classic', label: 'Classic', count: 1 }]);
  });
});
