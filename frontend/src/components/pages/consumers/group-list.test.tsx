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

import { afterEach, describe, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from 'nuqs/adapters/testing';
import { config } from 'runtime-config';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';
import type { GroupDescription, GroupType } from 'types/consumer-groups';

import { computeGroupStatistics, GroupList } from './group-list';

// Broker lookup is separate from the group table's filtering and URL state.
rs.mock('components/misc/broker-list', () => ({ BrokerList: () => null }));

afterEach(() => {
  rs.restoreAllMocks();
});

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

describe('compute group statistics', () => {
  test('counts the groups per type, classic first, and per state in first-seen order', () => {
    const statistics = computeGroupStatistics([
      group('billing', 'consumer', 'Stable'),
      group('orders', 'classic', 'Empty'),
      group('payments', 'classic', 'Stable'),
    ]);

    expect(statistics.total).toBe(3);
    expect(statistics.byType).toStrictEqual([
      { type: 'classic', label: 'Classic', count: 2 },
      { type: 'consumer', label: 'Consumer', count: 1 },
    ]);
    expect(statistics.byState).toStrictEqual([
      { state: 'Stable', count: 2 },
      { state: 'Empty', count: 1 },
    ]);
  });

  test('lists only the types that have groups', () => {
    const statistics = computeGroupStatistics([group('orders', 'classic', 'Stable')]);

    expect(statistics.byType).toStrictEqual([{ type: 'classic', label: 'Classic', count: 1 }]);
  });
});

function renderTypeFilteredList() {
  const onUrlUpdate = rs.fn<OnUrlUpdateFunction>();
  rs.spyOn(config, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
    if (url !== `${config.restBasePath}/consumer-groups`) {
      return Promise.reject(new Error(`Unexpected group fixture request: ${url}`));
    }
    return Promise.resolve(
      Response.json({
        consumerGroups: [
          group('billing', 'classic', 'Stable'),
          group('payments', 'consumer', 'Stable'),
          group('orders', 'classic', 'Empty'),
        ],
      })
    );
  });
  renderWithFileRoutes(
    <NuqsTestingAdapter hasMemory onUrlUpdate={onUrlUpdate} searchParams="?page=1&pageSize=1&state=Stable">
      <GroupList />
    </NuqsTestingAdapter>,
    { initialLocation: '/groups?page=1&pageSize=1&state=Stable' }
  );
  return onUrlUpdate;
}

function typeFilterButton() {
  const button = screen
    .getAllByRole('button', { name: 'Type' })
    .find((candidate) => candidate.getAttribute('aria-haspopup') === 'dialog');
  if (button === undefined) {
    throw new Error('Expected the Type filter dialog trigger, not the Type sort menu');
  }
  return button;
}

describe('the consumer group type filter', () => {
  test('keeps the state filter and resets pagination when the type changes', async () => {
    const user = userEvent.setup();
    const onUrlUpdate = renderTypeFilteredList();
    expect(await screen.findByRole('link', { name: 'payments' })).toBeInTheDocument();
    await user.click(typeFilterButton());
    await user.click(await screen.findByRole('option', { name: 'Classic 1' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'billing' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'payments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'orders' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
    await waitFor(() =>
      expect(Object.fromEntries(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams ?? [])).toStrictEqual({
        pageSize: '1',
        state: 'Stable',
        type: 'classic',
      })
    );
  });
});
