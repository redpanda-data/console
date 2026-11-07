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

import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, useState } from 'react';
import { act, screen } from 'test-utils';

const { refreshConsumerGroupMock, refreshConsumerGroupAclsMock } = rs.hoisted(() => ({
  refreshConsumerGroupMock: rs.fn(),
  refreshConsumerGroupAclsMock: rs.fn(),
}));

rs.mock('state/ui-state', () => ({
  setPageHeader: rs.fn(),
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

rs.mock('state/app-global', () => ({
  appGlobal: {
    onRefresh: null,
    historyPush: rs.fn(),
  },
}));

rs.mock('state/backend-api', () => {
  const actual = rs.requireActual<typeof import('state/backend-api')>('state/backend-api');
  return {
    ...actual,
    api: {
      ...actual.api,
      refreshConsumerGroup: refreshConsumerGroupMock,
      refreshConsumerGroupAcls: refreshConsumerGroupAclsMock,
      refreshPartitionsForTopic: rs.fn(),
    },
  };
});

rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
  return {
    ...actual,
    config: { jwt: '' },
    isFeatureFlagEnabled: rs.fn(() => false),
  };
});

import { useApiStore } from 'state/backend-api';
import type { GroupDescription } from 'state/rest-interfaces';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { renderWithFileRoutes } from 'test-utils';

import GroupDetails from './group-details';

const TOPIC = 'test-topic';
const GROUP_ID = 'test-group';

// Backend now returns all partitions in partitionOffsets.
// Partition 0: committed offset 5. Partitions 1 and 2: no committed offset (groupOffset: null).
const mockGroup: GroupDescription = {
  groupId: GROUP_ID,
  groupType: 'classic',
  state: 'Empty',
  protocol: '',
  protocolType: 'consumer',
  members: [],
  coordinatorId: 0,
  topicOffsets: [
    {
      topic: TOPIC,
      summedLag: 1,
      partitionCount: 3,
      partitionsWithOffset: 1,
      partitionOffsets: [
        { partitionId: 0, groupOffset: 5, error: undefined, highWaterMark: 6, lag: 1 },
        { partitionId: 1, groupOffset: null, error: undefined, highWaterMark: 5, lag: 0 },
        { partitionId: 2, groupOffset: null, error: undefined, highWaterMark: 3, lag: 0 },
      ],
    },
  ],
  allowedActions: null,
  lagSum: 1,
  isInUse: false,
  noEditPerms: false,
  noDeletePerms: false,
};

const renderGroupDetails = (search: { tab?: 'topics' | 'members' | 'acl' } = {}) =>
  renderWithFileRoutes(
    <GroupDetails groupId={GROUP_ID} matchedPath={`/groups/${GROUP_ID}`} onSearchChange={() => {}} search={search} />
  );

type GroupSearch = ComponentProps<typeof GroupDetails>['search'];

/** Holds the search params in state, as the route does, so a tab switch really changes the tab. */
const StatefulGroupDetails = () => {
  const [search, setSearch] = useState<GroupSearch>({ tab: 'topics' });
  return (
    <GroupDetails
      groupId={GROUP_ID}
      matchedPath={`/groups/${GROUP_ID}`}
      onSearchChange={(updates) => setSearch((prev) => ({ ...prev, ...updates }))}
      search={search}
    />
  );
};

const partitionTable = () => {
  const table = screen.getByRole('columnheader', { name: 'Partition' }).closest('table');
  if (!table) {
    throw new Error('Missing partition table');
  }
  return table;
};

const firstRowPartitionCell = (table: HTMLElement) =>
  within(within(table).getAllByRole('row')[1]).getAllByRole('cell')[0];

const partitionOffset = (partitionId: number, groupOffset: number) => ({
  partitionId,
  groupOffset,
  error: undefined,
  highWaterMark: groupOffset,
  lag: 0,
});

/** A KIP-848 group with two members, one of which has not yet reached the group epoch. */
const mockConsumerGroup: GroupDescription = {
  ...mockGroup,
  groupType: 'consumer',
  state: 'Reconciling',
  protocol: 'uniform',
  protocolType: 'consumer',
  groupEpoch: 8,
  targetAssignmentEpoch: 8,
  members: [
    {
      id: 'member-a',
      clientId: 'billing-app',
      clientHost: '/10.0.0.11',
      memberEpoch: 8,
      assignments: [{ topicName: TOPIC, partitionIds: [0, 1] }],
      targetAssignments: [{ topicName: TOPIC, partitionIds: [0, 1] }],
      subscribedTopics: [TOPIC],
      hasMissingPartitionIds: false,
      hasMissingAssignments: false,
    },
    {
      id: 'member-b',
      clientId: 'billing-app',
      clientHost: '/10.0.0.12',
      memberEpoch: 7,
      assignments: [{ topicName: TOPIC, partitionIds: [2] }],
      targetAssignments: [],
      subscribedTopics: [TOPIC],
      hasMissingPartitionIds: false,
      hasMissingAssignments: false,
    },
  ],
  topicOffsets: [
    {
      topic: TOPIC,
      summedLag: 0,
      partitionCount: 3,
      partitionsWithOffset: 3,
      partitionOffsets: [partitionOffset(0, 5), partitionOffset(1, 5), partitionOffset(2, 5)],
    },
  ],
  lagSum: 0,
  isInUse: true,
};

describe('the GroupDetails - unconsumed partitions', () => {
  beforeEach(() => {
    useApiStore.setState({
      consumerGroups: new Map([[GROUP_ID, mockGroup]]),
      consumerGroupAcls: new Map(),
    });
    useSupportedFeaturesStore.setState({ patchGroup: true, deleteGroup: true, deleteGroupOffsets: true });
  });

  afterEach(() => {
    // This afterEach runs before the harness's RTL cleanup() (test hooks are
    // LIFO), so the GroupDetails tree is still mounted and its PageComponent
    // store subscription fires forceUpdate() on this reset. Wrap the store
    // mutation in act() so that re-render is flushed inside act().
    act(() => {
      useApiStore.setState({ consumerGroups: new Map(), consumerGroupAcls: new Map() });
    });
  });

  test('edit button is enabled for consumed partition and disabled for unconsumed partitions', async () => {
    renderGroupDetails();

    // findBy* polls inside act(), flushing the class component's async
    // refreshData updates and the GroupState Popover's deferred effects.
    expect(await screen.findByTestId('partition-edit-0')).toBeInTheDocument();

    // Partition 0 has a committed offset → edit button renders as <button>
    expect(screen.getByTestId('partition-edit-0').tagName).toBe('BUTTON');

    // Partitions 1 and 2 have no committed offset → edit button renders as disabled <span>
    expect(screen.getByTestId('partition-edit-1').tagName).toBe('SPAN');
    expect(screen.getByTestId('partition-edit-2').tagName).toBe('SPAN');
  });

  test('unconsumed partitions render "—" for group offset and lag', async () => {
    renderGroupDetails();

    // findBy* polls inside act(), flushing the class component's async
    // refreshData updates and the GroupState Popover's deferred effects.
    expect(await screen.findByTestId('partition-edit-1')).toBeInTheDocument();

    // Each unconsumed partition (1 and 2) shows "—" for both group offset and lag = 4 dashes minimum
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });
});

describe('the GroupDetails - consumer (KIP-848) group', () => {
  afterEach(() => {
    act(() => {
      useApiStore.setState({ consumerGroups: new Map(), consumerGroupAcls: new Map() });
    });
  });

  test('the stat card shows the type, the assignor and both epochs in place of the protocol type', async () => {
    useApiStore.setState({ consumerGroups: new Map([[GROUP_ID, mockConsumerGroup]]), consumerGroupAcls: new Map() });
    renderGroupDetails();

    expect(await screen.findByText('Assignor')).toBeInTheDocument();
    expect(screen.getByText('uniform')).toBeInTheDocument();
    expect(screen.getByText('Consumer')).toBeInTheDocument();
    expect(screen.getByText('Group Epoch')).toBeInTheDocument();
    expect(screen.getByText('Target Assignment Epoch')).toBeInTheDocument();
    expect(screen.getByText('Reconciling')).toBeInTheDocument();
    expect(screen.queryByText('Protocol Type')).not.toBeInTheDocument();
    expect(screen.queryByTestId('group-details-unavailable')).not.toBeInTheDocument();
  });

  test('the Members tab lists each member with its epoch and highlights the one behind the group epoch', async () => {
    useApiStore.setState({ consumerGroups: new Map([[GROUP_ID, mockConsumerGroup]]), consumerGroupAcls: new Map() });
    renderGroupDetails({ tab: 'members' });

    expect(await screen.findByTestId('group-members-summary')).toHaveTextContent('2 members, 1 behind the group epoch');
    expect(screen.getByText('Member Epoch')).toBeInTheDocument();
    expect(screen.getByText('Target Assignment')).toBeInTheDocument();
    expect(screen.getByTestId('group-member-member-a')).not.toHaveAttribute('data-behind');
    expect(screen.getByTestId('group-member-member-b')).toHaveAttribute('data-behind', 'true');
    expect(screen.getAllByText(`${TOPIC}: 0, 1`)).toHaveLength(2);
  });

  test('a classic group hides the epoch and target assignment columns of the Members tab', async () => {
    const classicGroup: GroupDescription = {
      ...mockGroup,
      state: 'Stable',
      protocol: 'range',
      isInUse: true,
      members: [
        {
          id: 'rpk-1',
          clientId: 'rpk',
          clientHost: '/10.0.0.21',
          assignments: [{ topicName: TOPIC, partitionIds: [0, 1, 2] }],
          hasMissingPartitionIds: false,
          hasMissingAssignments: false,
        },
      ],
    };
    useApiStore.setState({ consumerGroups: new Map([[GROUP_ID, classicGroup]]), consumerGroupAcls: new Map() });
    renderGroupDetails({ tab: 'members' });

    expect(await screen.findByTestId('group-members-summary')).toHaveTextContent('1 member');
    expect(screen.getByText('Protocol Type')).toBeInTheDocument();
    expect(screen.queryByText('Member Epoch')).not.toBeInTheDocument();
    expect(screen.queryByText('Target Assignment')).not.toBeInTheDocument();
  });

  test('a consumer group the broker could not describe shows a notice', async () => {
    const listedOnly: GroupDescription = { ...mockGroup, groupType: 'consumer', state: 'Stable', isInUse: true };
    useApiStore.setState({ consumerGroups: new Map([[GROUP_ID, listedOnly]]), consumerGroupAcls: new Map() });
    renderGroupDetails();

    expect(await screen.findByTestId('group-details-unavailable')).toBeInTheDocument();
  });
  test('the partition sort survives a switch to the Members tab and back', async () => {
    useApiStore.setState({ consumerGroups: new Map([[GROUP_ID, mockGroup]]), consumerGroupAcls: new Map() });
    const user = userEvent.setup();
    renderWithFileRoutes(<StatefulGroupDetails />);
    expect(await screen.findByTestId('partition-edit-0')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Partition' }));
    await user.click(screen.getByRole('menuitem', { name: 'Desc' }));
    expect(firstRowPartitionCell(partitionTable())).toHaveTextContent('2');

    await user.click(screen.getByRole('tab', { name: 'Members' }));
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'Partition' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'Topics' }));

    expect(firstRowPartitionCell(partitionTable())).toHaveTextContent('2');
  });
});
