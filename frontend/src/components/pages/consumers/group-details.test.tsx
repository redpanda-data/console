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

import { screen, waitFor } from 'test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { refreshConsumerGroupMock, refreshConsumerGroupAclsMock } = vi.hoisted(() => ({
  refreshConsumerGroupMock: vi.fn(),
  refreshConsumerGroupAclsMock: vi.fn(),
}));

vi.mock('state/ui-state', () => ({
  setPageHeader: vi.fn(),
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

vi.mock('state/app-global', () => ({
  appGlobal: {
    onRefresh: null,
    historyPush: vi.fn(),
  },
}));

vi.mock('state/backend-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('state/backend-api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      refreshConsumerGroup: refreshConsumerGroupMock,
      refreshConsumerGroupAcls: refreshConsumerGroupAclsMock,
      refreshPartitionsForTopic: vi.fn(),
    },
  };
});

vi.mock('config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('config')>();
  return {
    ...actual,
    config: { jwt: '' },
    isFeatureFlagEnabled: vi.fn(() => false),
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

const renderGroupDetails = () =>
  renderWithFileRoutes(
    <GroupDetails groupId={GROUP_ID} matchedPath={`/groups/${GROUP_ID}`} onSearchChange={() => {}} search={{}} />
  );

describe('GroupDetails - unconsumed partitions', () => {
  beforeEach(() => {
    useApiStore.setState({
      consumerGroups: new Map([[GROUP_ID, mockGroup]]),
      consumerGroupAcls: new Map(),
    });
    useSupportedFeaturesStore.setState({ patchGroup: true, deleteGroup: true, deleteGroupOffsets: true });
  });

  afterEach(() => {
    useApiStore.setState({ consumerGroups: new Map(), consumerGroupAcls: new Map() });
  });

  test('edit button is enabled for consumed partition and disabled for unconsumed partitions', async () => {
    renderGroupDetails();

    await waitFor(() => {
      expect(screen.getByTestId('partition-edit-0')).toBeInTheDocument();
    });

    // Partition 0 has a committed offset → edit button renders as <button>
    expect(screen.getByTestId('partition-edit-0').tagName).toBe('BUTTON');

    // Partitions 1 and 2 have no committed offset → edit button renders as disabled <span>
    expect(screen.getByTestId('partition-edit-1').tagName).toBe('SPAN');
    expect(screen.getByTestId('partition-edit-2').tagName).toBe('SPAN');
  });

  test('unconsumed partitions render "—" for group offset and lag', async () => {
    renderGroupDetails();

    await waitFor(() => {
      expect(screen.getByTestId('partition-edit-1')).toBeInTheDocument();
    });

    // Each unconsumed partition (1 and 2) shows "—" for both group offset and lag = 4 dashes minimum
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });
});
