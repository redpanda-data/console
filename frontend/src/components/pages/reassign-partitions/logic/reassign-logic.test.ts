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

import { type ApiData, computeReassignments, type TopicAssignments, type TopicPartitions } from './reassign-logic';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Broker, Partition, Topic } from '../../../../state/rest-interfaces';

const makeBroker = (brokerId: number, rack: string): Broker => ({
  brokerId,
  logDirSize: 0,
  address: `broker-${brokerId}`,
  rack,
  config: { configs: undefined, error: undefined },
});

const makeTopic = (topicName: string, partitionCount: number, replicationFactor: number): Topic => ({
  topicName,
  isInternal: false,
  partitionCount,
  replicationFactor,
  cleanupPolicy: 'delete',
  documentation: 'UNKNOWN',
  logDirSummary: { totalSizeBytes: 0, replicaErrors: null, hint: null },
  allowedActions: undefined,
});

const makePartition = (id: number, replicas: number[], replicaSize: number): Partition =>
  ({
    id,
    partitionError: null,
    replicas,
    offlineReplicas: null,
    inSyncReplicas: replicas,
    leader: replicas[0],
    partitionLogDirs: replicas.map((brokerId) => ({ error: '', brokerId, partitionId: id, size: replicaSize })),
    waterMarksError: null,
    waterMarkLow: 0,
    waterMarkHigh: 100,
    replicaSize,
  }) as Partition;

// Four brokers in two racks. Every replica of `alpha` sits in rack a, `beta` spans both racks.
const brokers = [makeBroker(0, 'a'), makeBroker(1, 'a'), makeBroker(2, 'b'), makeBroker(3, 'b')];
const alpha = makeTopic('alpha', 4, 2);
const beta = makeTopic('beta', 2, 3);
const alphaPartitions = [0, 1, 2, 3].map((id) => makePartition(id, [0, 1], 100 + id));
const betaPartitions = [makePartition(0, [0, 1, 2], 50), makePartition(1, [1, 2, 3], 70)];

const apiData: ApiData = {
  brokers,
  topics: [alpha, beta],
  topicPartitions: new Map([
    ['alpha', alphaPartitions],
    ['beta', betaPartitions],
  ]),
};

/** Fresh partition objects per test, since the computation sorts the selected partitions in place. */
const select = (topic: Topic, partitions: Partition[]): TopicPartitions => ({ topic, partitions: [...partitions] });

/** topic -> partition -> replica brokerIds, the first being the planned leader. */
const replicaIds = (assignments: TopicAssignments) =>
  Object.fromEntries(
    Object.entries(assignments).map(([topicName, partitions]) => [
      topicName,
      Object.fromEntries(Object.entries(partitions).map(([id, a]) => [id, a.brokers.map((b) => b.brokerId)])),
    ])
  );

describe('computeReassignments', () => {
  let debug: ReturnType<typeof spyOn>;
  let error: ReturnType<typeof spyOn>;
  let table: ReturnType<typeof spyOn>;

  beforeEach(() => {
    debug = spyOn(console, 'debug').mockImplementation(() => undefined);
    error = spyOn(console, 'error').mockImplementation(() => undefined);
    table = spyOn(console, 'table').mockImplementation(() => undefined);
  });

  afterEach(() => {
    debug.mockRestore();
    error.mockRestore();
    table.mockRestore();
  });

  test('spreads replicas across racks and balances leaders over all target brokers', () => {
    const result = computeReassignments(
      apiData,
      [select(alpha, alphaPartitions), select(beta, betaPartitions)],
      brokers
    );

    expect(replicaIds(result)).toEqual(EXPECTED_ALL_BROKERS);
    expect(error).not.toHaveBeenCalled();
    // Two balancing rounds: the second swaps leaders without lowering the skew, which ends the loop.
    expect(debug).toHaveBeenCalledWith('leader skew in cluster', {
      actual: { skew: 5, min: '0 partitions (brokerId 2)', max: '5 partitions (brokerId 0)' },
      planned: { skew: 1, min: '1 partitions (brokerId 0)', max: '2 partitions (brokerId 2)' },
      log: [
        { skewBefore: 3, skewAfter: 1, swaps: 4 },
        { skewBefore: 1, skewAfter: 1, swaps: 3 },
      ],
    });
  });

  test('moves every replica onto the selected target brokers', () => {
    const result = computeReassignments(apiData, [select(alpha, alphaPartitions)], [brokers[2], brokers[3]]);

    expect(replicaIds(result)).toEqual(EXPECTED_RACK_B);
    // Rack b alone now hosts every replica, so losing it takes each partition offline.
    expect(error).toHaveBeenCalledWith('Issues in topic "alpha" (RF: 2) (4 issues).');
    expect(table).toHaveBeenCalledWith(
      [0, 1, 2, 3].map((partitionId) => ({ partitionId, criticalBrokers: '', criticalRacks: 'b' }))
    );
  });

  test('rejects a selection without partitions', () => {
    expect(() => computeReassignments(apiData, [select(alpha, [])], brokers)).toThrow('No partitions selected');
  });

  test('rejects fewer target brokers than the highest replication factor', () => {
    expect(() => computeReassignments(apiData, [select(beta, betaPartitions)], [brokers[0], brokers[1]])).toThrow(
      'You selected 2 target brokers, but the following topics have a replicationFactor of 3'
    );
  });
});

const EXPECTED_ALL_BROKERS = {
  alpha: { 0: [0, 2], 1: [3, 1], 2: [2, 0], 3: [3, 1] },
  beta: { 0: [2, 0, 1], 1: [1, 2, 3] },
};

const EXPECTED_RACK_B = {
  alpha: { 0: [2, 3], 1: [2, 3], 2: [3, 2], 3: [3, 2] },
};
