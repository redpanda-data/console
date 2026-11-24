import { afterEach, expect, test } from '@rstest/core';
import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { useState } from 'react';

import type { PartitionSelection } from './reassign-partitions';
import { StepSelectPartitions } from './step1-partitions';
import { StepReview } from './step3-review';
import { useApiStore } from '../../../state/backend-api';
import type { Topic } from '../../../state/rest-interfaces';

const initialState = useApiStore.getState();
afterEach(() => {
  useApiStore.setState(initialState, true);
});
const topics: Topic[] = ['zebra', 'alpha'].map((topicName) => ({
  topicName,
  isInternal: false,
  partitionCount: 2,
  replicationFactor: 1,
  cleanupPolicy: 'delete',
  documentation: 'UNKNOWN',
  logDirSummary: { totalSizeBytes: 0, replicaErrors: null, hint: null },
  allowedActions: undefined,
}));
const partitions = (topicName: string) =>
  [2, 1].map((id) => ({
    id,
    topicName,
    partitionError: null,
    replicas: [1],
    offlineReplicas: [],
    inSyncReplicas: [1],
    leader: 1,
    partitionLogDirs: [],
    waterMarksError: null,
    waterMarkLow: 0,
    waterMarkHigh: 0,
    replicaSize: 0,
    hasErrors: false,
  }));
const seed = () =>
  useApiStore.setState({
    topics,
    clusterInfo: {
      controllerId: 1,
      kafkaVersion: 'v26.2.0',
      brokers: [1, 2].map((brokerId) => ({
        brokerId,
        logDirSize: 0,
        address: `broker-${brokerId}:9092`,
        rack: null,
        config: { configs: [], error: undefined },
      })),
    },
    topicPartitions: new Map(topics.map((topic) => [topic.topicName, partitions(topic.topicName)])),
  });

function PartitionSelectionHarness() {
  const [selection, setSelection] = useState<PartitionSelection>({});
  return (
    <StepSelectPartitions
      onPartitionSelectionChange={setSelection}
      partitionSelection={selection}
      throttledTopics={[]}
    />
  );
}

test('sorts selectable topics by name', async () => {
  seed();
  const user = userEvent.setup();
  render(<PartitionSelectionHarness />);
  await user.click(screen.getByRole('button', { name: 'Topic' }));
  await user.click(screen.getByRole('menuitem', { name: 'Asc' }));
  expect(within(screen.getAllByRole('row')[1]).getByRole('checkbox', { name: 'Select topic alpha' })).toBeVisible();
});

const renderReview = () => {
  const topicsWithMoves = topics.map((topic) => ({
    topicName: topic.topicName,
    topic,
    allPartitions: partitions(topic.topicName),
    selectedPartitions: partitions(topic.topicName).map((partition) => ({
      ...partition,
      brokersBefore: [1],
      brokersAfter: [2],
      numAddedBrokers: 1,
      numRemovedBrokers: 1,
      changedLeader: true,
      anyChanges: true,
    })),
  }));
  render(
    <StepReview
      assignments={{
        topics: topics.map((topic) => ({
          topicName: topic.topicName,
          partitions: partitions(topic.topicName).map((partition) => ({ partitionId: partition.id, replicas: [2] })),
        })),
      }}
      topicsWithMoves={topicsWithMoves}
    />
  );
};

async function sortAscending(user: UserEvent, column: string) {
  await user.click(screen.getByRole('button', { name: column }));
  await user.click(screen.getByRole('menuitem', { name: 'Asc' }));
}

const partitionTable = () => {
  const table = screen.getByRole('columnheader', { name: 'Partition' }).closest('table');
  if (!table) {
    throw new Error('Missing partition table');
  }
  return table;
};

test('sorts review topics and expanded partitions', async () => {
  seed();
  const user = userEvent.setup();
  renderReview();
  await sortAscending(user, 'Topic');
  const firstRow = screen.getAllByRole('row')[1];
  expect(within(firstRow).getByText('alpha')).toBeVisible();
  await user.click(within(firstRow).getByRole('button', { name: 'Expand row' }));
  await sortAscending(user, 'Partition');
  expect(within(within(partitionTable()).getAllByRole('row')[1]).getAllByRole('cell')[0]).toHaveTextContent('1');
});

test('keeps the sort menu open when the page re-renders', async () => {
  seed();
  const user = userEvent.setup();
  const { rerender } = render(<PartitionSelectionHarness />);
  await user.click(screen.getByRole('button', { name: 'Size' }));
  expect(screen.getByRole('menuitem', { name: 'Asc' })).toBeVisible();
  rerender(<PartitionSelectionHarness />);
  expect(screen.getByRole('menuitem', { name: 'Asc' })).toBeVisible();
});
