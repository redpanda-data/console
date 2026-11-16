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

import type { GroupDescription, GroupMemberDescription } from 'state/rest-interfaces';

import {
  formatAssignment,
  isBehindGroupEpoch,
  isConsumerGroupWithoutDetails,
  membersSummary,
} from './group-details-utils';
import { describe, expect, test } from 'bun:test';

const member = (id: string, memberEpoch?: number): GroupMemberDescription => ({
  id,
  clientId: `${id}-client`,
  clientHost: '/10.0.0.1',
  assignments: [],
  memberEpoch,
  hasMissingPartitionIds: false,
  hasMissingAssignments: false,
});

const group = (overrides: Partial<GroupDescription>): GroupDescription => ({
  groupId: 'g',
  groupType: 'consumer',
  state: 'Stable',
  protocol: 'uniform',
  protocolType: 'consumer',
  groupEpoch: 5,
  members: [],
  coordinatorId: 0,
  topicOffsets: [],
  allowedActions: null,
  lagSum: 0,
  isInUse: true,
  noEditPerms: false,
  noDeletePerms: false,
  ...overrides,
});

describe('isConsumerGroupWithoutDetails', () => {
  test('is true only for a consumer group without a group epoch', () => {
    expect(isConsumerGroupWithoutDetails(group({ groupEpoch: undefined }))).toBe(true);
    expect(isConsumerGroupWithoutDetails(group({}))).toBe(false);
    expect(isConsumerGroupWithoutDetails(group({ groupType: 'classic', groupEpoch: undefined }))).toBe(false);
  });
});

describe('isBehindGroupEpoch', () => {
  test('is true when the member epoch is below the group epoch of a consumer group', () => {
    expect(isBehindGroupEpoch(group({}), member('a', 4))).toBe(true);
    expect(isBehindGroupEpoch(group({}), member('a', 5))).toBe(false);
    expect(isBehindGroupEpoch(group({}), member('a'))).toBe(false);
    expect(isBehindGroupEpoch(group({ groupType: 'classic' }), member('a', 4))).toBe(false);
  });
});

describe('formatAssignment', () => {
  test('sorts the partitions and tolerates a missing partition list', () => {
    expect(formatAssignment({ topicName: 'orders', partitionIds: [3, 1, 2] })).toBe('orders: 1, 2, 3');
    expect(formatAssignment({ topicName: 'orders', partitionIds: undefined as unknown as number[] })).toBe('orders: ');
  });
});

describe('membersSummary', () => {
  test('counts the members and, for a consumer group, those behind the group epoch', () => {
    expect(membersSummary(group({ groupType: 'classic' }), [member('a')])).toBe('1 member');
    expect(membersSummary(group({}), [member('a', 5), member('b', 5)])).toBe('2 members, all at the group epoch');
    expect(membersSummary(group({}), [member('a', 5), member('b', 4)])).toBe('2 members, 1 behind the group epoch');
  });
});
