import { afterEach, expect, rs, test } from '@rstest/core';
import { act, render, screen } from '@testing-library/react';

import ReassignPartitions from './reassign-partitions';
import { StepReview } from './step3-review';
import { useApiStore } from '../../../state/backend-api';
import type { Partition, Topic } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';

const initialApiState = useApiStore.getState();
const initialThrottle = uiSettings.reassignment.maxReplicationTraffic;
afterEach(() => {
  useApiStore.setState(initialApiState, true);
  uiSettings.reassignment = { ...uiSettings.reassignment, maxReplicationTraffic: initialThrottle };
  rs.restoreAllMocks();
});

const topic: Topic = {
  topicName: 'alpha',
  isInternal: false,
  partitionCount: 1,
  replicationFactor: 1,
  cleanupPolicy: 'delete',
  documentation: 'UNKNOWN',
  logDirSummary: { totalSizeBytes: 0, replicaErrors: null, hint: null },
  allowedActions: undefined,
};
const partition: Partition = {
  id: 0,
  topicName: 'alpha',
  partitionError: null,
  replicas: [1],
  offlineReplicas: [],
  inSyncReplicas: [1],
  leader: 1,
  partitionLogDirs: [],
  waterMarksError: null,
  waterMarkLow: 0,
  waterMarkHigh: 0,
  replicaSize: 1024,
  hasErrors: false,
};

const renderStepReview = () => {
  useApiStore.setState({ topics: [topic], topicPartitions: new Map([[topic.topicName, [partition]]]) });
  rs.spyOn(ReassignPartitions.prototype, 'refreshData').mockImplementation(() => undefined);
  render(
    <StepReview
      assignments={{ topics: [{ topicName: topic.topicName, partitions: [{ partitionId: 0, replicas: [2] }] }] }}
      partitionSelection={{ alpha: [0] }}
      reassignPartitions={new ReassignPartitions({ matchedPath: '/reassign-partitions' })}
      topicsWithMoves={[
        {
          topicName: topic.topicName,
          topic,
          allPartitions: [partition],
          selectedPartitions: [
            {
              ...partition,
              brokersBefore: [1],
              brokersAfter: [2],
              numAddedBrokers: 1,
              numRemovedBrokers: 1,
              changedLeader: true,
              anyChanges: true,
            },
          ],
        },
      ]}
    />
  );
};

test('follows the throttle setting without waiting for a re-render', () => {
  renderStepReview();
  const throttleValue = () => screen.getByText('Traffic Throttle').nextElementSibling;
  expect(throttleValue()).toHaveTextContent('disabled');
  // The write the slider handler makes: a nested assignment would not notify the settings store.
  act(() => {
    uiSettings.reassignment = { ...uiSettings.reassignment, maxReplicationTraffic: 1024 };
  });
  expect(throttleValue()).toHaveTextContent('1 kiB/s');
});
