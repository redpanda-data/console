import { afterEach, expect, rs, test } from '@rstest/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ReassignPartitions from './reassign-partitions';
import { StepSelectPartitions } from './step1-partitions';
import { StepReview } from './step3-review';
import { appGlobal } from '../../../state/app-global';
import { useApiStore } from '../../../state/backend-api';
import type { Partition, Topic } from '../../../state/rest-interfaces';

const initialState = useApiStore.getState();
const initialRefresh = appGlobal.onRefresh;
afterEach(() => {
  useApiStore.setState(initialState, true);
  appGlobal.onRefresh = initialRefresh;
  rs.restoreAllMocks();
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
const partitions = (topicName: string): Partition[] =>
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
    topicPartitions: new Map(topics.map((topic) => [topic.topicName, partitions(topic.topicName)])),
  });

test('sorts selectable topics by name', async () => {
  seed();
  const user = userEvent.setup();
  render(<StepSelectPartitions onPartitionSelectionChange={rs.fn()} partitionSelection={{}} throttledTopics={[]} />);
  await user.click(screen.getByRole('button', { name: 'Topic' }));
  await user.click(screen.getByRole('menuitem', { name: 'Asc' }));
  expect(within(screen.getAllByRole('row')[1]).getByRole('checkbox', { name: 'Select topic alpha' })).toBeVisible();
});

test('sorts review topics and expanded partitions', async () => {
  seed();
  const user = userEvent.setup();
  rs.spyOn(ReassignPartitions.prototype, 'refreshData').mockImplementation(() => undefined);
  const parent = new ReassignPartitions({ matchedPath: '/reassign-partitions' });
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
      partitionSelection={{}}
      reassignPartitions={parent}
      topicsWithMoves={topicsWithMoves}
    />
  );
  await user.click(screen.getByRole('button', { name: 'Topic' }));
  await user.click(screen.getByRole('menuitem', { name: 'Asc' }));
  const firstRow = screen.getAllByRole('row')[1];
  expect(within(firstRow).getByText('alpha')).toBeVisible();
  await user.click(within(firstRow).getByRole('button', { name: 'Expand row' }));
  await user.click(screen.getByRole('button', { name: 'Partition' }));
  await user.click(screen.getByRole('menuitem', { name: 'Asc' }));
  const table = screen.getByRole('columnheader', { name: 'Partition' }).closest('table');
  if (!table) {
    throw new Error('Missing partition table');
  }
  expect(within(within(table).getAllByRole('row')[1]).getAllByRole('cell')[0]).toHaveTextContent('1');
});

test('keeps the sort menu open when the page re-renders', async () => {
  seed();
  const user = userEvent.setup();
  const props = { onPartitionSelectionChange: rs.fn(), partitionSelection: {}, throttledTopics: [] };
  const { rerender } = render(<StepSelectPartitions {...props} />);
  await user.click(screen.getByRole('button', { name: 'Size' }));
  expect(screen.getByRole('menuitem', { name: 'Asc' })).toBeVisible();
  // PageComponent forceUpdates the whole page on every store poll — three seconds here.
  rerender(<StepSelectPartitions {...props} />);
  expect(screen.getByRole('menuitem', { name: 'Asc' })).toBeVisible();
});
