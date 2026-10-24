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

import type { ApiData, TopicAssignments } from './reassign-logic';
import { computeMovedReplicas, partitionSelectionToTopicPartitions, removeRedundantReassignments } from './utils';
import { describe, expect, test } from 'bun:test';
import type { Broker, Partition, Topic } from '../../../../state/rest-interfaces';

const makeBroker = (brokerId: number): Broker => ({
  brokerId,
  logDirSize: 0,
  address: `broker-${brokerId}`,
  rack: null,
  config: { configs: undefined, error: undefined },
});

const makeTopic = (topicName: string, replicationFactor: number): Topic => ({
  topicName,
  isInternal: false,
  partitionCount: 3,
  replicationFactor,
  cleanupPolicy: 'delete',
  documentation: 'UNKNOWN',
  logDirSummary: { totalSizeBytes: 0, replicaErrors: null, hint: null },
  allowedActions: undefined,
});

const makePartition = (id: number, replicas: number[]): Partition =>
  ({ id, replicas, leader: replicas[0], partitionLogDirs: [], replicaSize: 10 }) as unknown as Partition;

const brokers = [0, 1, 2, 3].map(makeBroker);
const alpha = makeTopic('alpha', 2);
const beta = makeTopic('beta', 3);
const alphaPartitions = [makePartition(0, [0, 1]), makePartition(1, [0, 1]), makePartition(2, [1, 0])];
const betaPartitions = [makePartition(0, [0, 1, 2])];

const topicPartitions = new Map<string, Partition[] | null>([
  ['alpha', alphaPartitions],
  ['beta', betaPartitions],
  ['hidden', null],
]);

// Fresh objects: the clone inside removeRedundantReassignments serializes a repeated object only once.
const brokersById = (ids: number[]) => ids.map((id) => makeBroker(id));

describe('partitionSelectionToTopicPartitions', () => {
  test('resolves the selected partition ids of each topic', () => {
    expect(partitionSelectionToTopicPartitions({ alpha: [0, 2] }, topicPartitions, [alpha, beta])).toEqual([
      { topic: alpha, partitions: [alphaPartitions[0], alphaPartitions[2]] },
    ]);
  });

  test('gives up when a topic or its partitions are not loaded', () => {
    expect(partitionSelectionToTopicPartitions({ gamma: [0] }, topicPartitions, [alpha, beta])).toBeUndefined();
    expect(
      partitionSelectionToTopicPartitions({ hidden: [0] }, topicPartitions, [alpha, beta, makeTopic('hidden', 1)])
    ).toBeUndefined();
  });
});

describe('computeMovedReplicas', () => {
  test('counts added and removed brokers and leader changes per selected partition', () => {
    const result = computeMovedReplicas(
      { alpha: [0, 1, 2], beta: [0] },
      {
        topics: [
          {
            topicName: 'alpha',
            partitions: [
              { partitionId: 0, replicas: [2, 3] },
              { partitionId: 1, replicas: [0, 1] },
              { partitionId: 2, replicas: [0, 1] },
            ],
          },
          { topicName: 'beta', partitions: [{ partitionId: 0, replicas: [0, 2, 1] }] },
        ],
      },
      [alpha, beta],
      topicPartitions
    );

    expect(
      result.map((t) => ({
        topicName: t.topicName,
        moves: t.selectedPartitions.map(
          ({ id, brokersAfter, numAddedBrokers, numRemovedBrokers, changedLeader, anyChanges }) => ({
            id,
            brokersAfter,
            numAddedBrokers,
            numRemovedBrokers,
            changedLeader,
            anyChanges,
          })
        ),
      }))
    ).toEqual([
      {
        topicName: 'alpha',
        moves: [
          {
            id: 0,
            brokersAfter: [2, 3],
            numAddedBrokers: 2,
            numRemovedBrokers: 2,
            changedLeader: true,
            anyChanges: true,
          },
          {
            id: 1,
            brokersAfter: [0, 1],
            numAddedBrokers: 0,
            numRemovedBrokers: 0,
            changedLeader: false,
            anyChanges: false,
          },
          {
            id: 2,
            brokersAfter: [0, 1],
            numAddedBrokers: 0,
            numRemovedBrokers: 0,
            changedLeader: true,
            anyChanges: true,
          },
        ],
      },
      {
        topicName: 'beta',
        // Same leader, but the followers swapped places.
        moves: [
          {
            id: 0,
            brokersAfter: [0, 2, 1],
            numAddedBrokers: 0,
            numRemovedBrokers: 0,
            changedLeader: false,
            anyChanges: true,
          },
        ],
      },
    ]);
  });

  test('skips unselected topics and reports no moves for a partition without a new assignment', () => {
    const result = computeMovedReplicas({ alpha: [1], beta: [] }, { topics: [] }, [alpha, beta], topicPartitions);

    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe(alpha);
    expect(result[0].allPartitions).toBe(alphaPartitions);
    expect(result[0].selectedPartitions).toEqual([
      {
        ...alphaPartitions[1],
        brokersBefore: [0, 1],
        brokersAfter: [],
        numAddedBrokers: 0,
        numRemovedBrokers: 0,
        changedLeader: false,
        anyChanges: false,
      },
    ]);
  });
});

describe('removeRedundantReassignments', () => {
  const apiData: ApiData = {
    brokers,
    topics: [alpha, beta],
    topicPartitions: topicPartitions as Map<string, Partition[]>,
  };

  test('drops partitions that keep their replicas, and topics left without any', () => {
    const assignments: TopicAssignments = {
      alpha: {
        0: { partition: alphaPartitions[0], brokers: brokersById([0, 1]) },
        1: { partition: alphaPartitions[1], brokers: brokersById([2, 3]) },
        2: { partition: alphaPartitions[2], brokers: brokersById([0, 1]) },
      },
      beta: {
        0: { partition: betaPartitions[0], brokers: brokersById([0, 1, 2]) },
      },
    };

    const result = removeRedundantReassignments(assignments, apiData);

    expect(Object.keys(result)).toEqual(['alpha']);
    expect(Object.keys(result.alpha)).toEqual(['1', '2']);
    expect(result.alpha[1].brokers.map((b) => b.brokerId)).toEqual([2, 3]);
    // The input is left untouched.
    expect(Object.keys(assignments.alpha)).toEqual(['0', '1', '2']);
  });

  test('keeps a reassignment that changes the replica count', () => {
    const assignments: TopicAssignments = {
      alpha: { 0: { partition: alphaPartitions[0], brokers: brokersById([0, 1, 2]) } },
    };

    expect(Object.keys(removeRedundantReassignments(assignments, apiData).alpha)).toEqual(['0']);
  });
});
