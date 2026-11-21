/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DeleteRecordsModal } from './delete-records-modal';
import { config } from '../../../../runtime-config';
import { useApiStore } from '../../../../state/backend-api';
import type { Topic } from '../../../../state/rest-interfaces';

const testTopic: Topic = {
  allowedActions: ['all'],
  cleanupPolicy: 'compact',
  partitionCount: 3,
  replicationFactor: 3,
  isInternal: false,
  documentation: 'UNKNOWN',
  topicName: 'test_topic',
  logDirSummary: {
    totalSizeBytes: 1024,
    hint: null,
    replicaErrors: [],
  },
};

describe('the DeleteRecordsModal', () => {
  afterEach(() => {
    rs.restoreAllMocks();
  });

  test('renders all expected elements in step 1', () => {
    mockPartitionsFetch();
    render(
      <DeleteRecordsModal afterClose={rs.fn()} onCancel={rs.fn()} onFinish={rs.fn()} topic={testTopic} visible={true} />
    );

    expect(screen.getByText('Delete records in topic')).toBeInTheDocument();
    expect(screen.getByText('All Partitions')).toBeInTheDocument();
    expect(screen.getByText('Specific Partition')).toBeInTheDocument();
    expect(screen.getByText('Choose End Offset')).toBeInTheDocument();
  });

  test('reports a rejected offset lookup and releases the loading button', async () => {
    const user = userEvent.setup();
    const restoreLookup = installRejectedOffsetLookup();
    try {
      const onFinish = rs.fn();
      render(
        <DeleteRecordsModal afterClose={rs.fn()} onCancel={rs.fn()} onFinish={onFinish} topic={testTopic} visible />
      );
      await requestTimestampDeletion(user);
      expect(await screen.findByText('Offset lookup failed')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Ok' })).toBeEnabled();
      expect(onFinish).not.toHaveBeenCalled();
    } finally {
      restoreLookup();
    }
  });

  test('shows the permission error when deleting at a timestamp in one partition fails', async () => {
    const { deleteRecords, restore } = installFailedTimestampDelete();
    try {
      const onFinish = rs.fn();
      render(
        <DeleteRecordsModal afterClose={rs.fn()} onCancel={rs.fn()} onFinish={onFinish} topic={testTopic} visible />
      );

      await requestTimestampDeletion(userEvent.setup(), 'Specific Partition');

      expect(deleteRecords).toHaveBeenCalledWith(testTopic.topicName, 42, 0);
      expect(await screen.findByText(/You are not allowed to delete records on this topic/)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Ok' })).toBeEnabled();
      expect(onFinish).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

function installRejectedOffsetLookup() {
  const originalLookup = useApiStore.getState().getTopicOffsetsByTimestamp;
  const lookup = rs.fn<typeof originalLookup>().mockRejectedValue(new Error('Offset lookup failed'));
  mockPartitionsFetch();
  useApiStore.setState({ getTopicOffsetsByTimestamp: lookup });
  return () => useApiStore.setState({ getTopicOffsetsByTimestamp: originalLookup });
}

function installFailedTimestampDelete() {
  const original = useApiStore.getState();
  const deleteRecords = rs.fn<typeof original.deleteTopicRecords>().mockResolvedValue(undefined);
  const lookup = rs.fn<typeof original.getTopicOffsetsByTimestamp>().mockResolvedValue([
    {
      topicName: testTopic.topicName,
      partitions: [{ error: undefined, partitionId: 0, offset: 42, timestamp: 1 }],
    },
  ]);
  mockPartitionsFetch();
  useApiStore.setState({ deleteTopicRecords: deleteRecords, getTopicOffsetsByTimestamp: lookup });
  return {
    deleteRecords,
    restore: () =>
      useApiStore.setState({
        deleteTopicRecords: original.deleteTopicRecords,
        getTopicOffsetsByTimestamp: original.getTopicOffsetsByTimestamp,
      }),
  };
}

function mockPartitionsFetch() {
  const originalFetch = config.fetch;
  rs.spyOn(config, 'fetch').mockImplementation((input, init) => {
    if (input === `${config.restBasePath}/topics/test_topic/partitions` && (init?.method ?? 'GET') === 'GET') {
      return Promise.resolve(Response.json({ partitions: [] }));
    }
    return originalFetch(input, init);
  });
}

async function requestTimestampDeletion(
  user: ReturnType<typeof userEvent.setup>,
  target: 'All Partitions' | 'Specific Partition' = 'All Partitions'
) {
  await user.click(screen.getByText(target));
  await user.click(screen.getByRole('button', { name: 'Choose End Offset' }));
  await user.click(screen.getByText('Timestamp'));
  await user.click(screen.getByRole('button', { name: 'Delete Records' }));
}
