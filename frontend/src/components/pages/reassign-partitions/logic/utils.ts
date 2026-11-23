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

import type { ApiData, TopicAssignments, TopicPartitions } from './reassign-logic';
import type { Broker, Partition, PartitionReassignmentRequest, Topic } from '../../../../state/rest-interfaces';
import { clone } from '../../../../utils/json-utils';
import type { PartitionSelection } from '../reassign-partitions';
import type { PartitionWithMoves, TopicWithMoves } from '../step3-review';

/** Resolves all selected partitions, or returns undefined if any selected metadata is unavailable. */
export function partitionSelectionToTopicPartitions(
  partitionSelection: PartitionSelection,
  apiTopicPartitions: Map<string, Partition[] | null>,
  apiTopics: Topic[]
) {
  const ar: TopicPartitions[] = [];

  for (const topicName of Object.keys(partitionSelection)) {
    const topicPartitions = resolveTopicPartitions(
      topicName,
      partitionSelection[topicName],
      apiTopicPartitions,
      apiTopics
    );
    if (!topicPartitions) {
      return;
    }
    ar.push(topicPartitions);
  }

  return ar;
}

function resolveTopicPartitions(
  topicName: string,
  partitionIds: number[],
  apiTopicPartitions: Map<string, Partition[] | null>,
  apiTopics: Topic[]
) {
  const topic = apiTopics.first((x) => x.topicName === topicName);
  if (!topic) {
    return;
  }

  const allPartitions = apiTopicPartitions.get(topicName);
  if (!allPartitions) {
    return;
  }

  const relevantPartitions = partitionIds.map((id) => allPartitions.first((p) => p.id === id));
  if (relevantPartitions.any((p) => p === null)) {
    return;
  }

  return { topic, partitions: relevantPartitions as Partition[] } satisfies TopicPartitions;
}

export function computeMovedReplicas(
  partitionSelection: PartitionSelection,
  assignments: PartitionReassignmentRequest,
  apiTopics: Topic[],
  apiTopicPartitions: Map<string, Partition[] | null>
) {
  const ar: TopicWithMoves[] = [];
  for (const [topicName, allPartitions] of apiTopicPartitions) {
    const topicWithMoves = computeTopicMoves(topicName, allPartitions, partitionSelection, assignments, apiTopics);
    if (topicWithMoves) {
      ar.push(topicWithMoves);
    }
  }
  return ar;
}

function computeTopicMoves(
  topicName: string,
  allPartitions: Partition[] | null,
  partitionSelection: PartitionSelection,
  assignments: PartitionReassignmentRequest,
  apiTopics: Topic[]
) {
  if (allPartitions === null) {
    return;
  }
  const selectedIds = partitionSelection[topicName];
  if (selectedIds === undefined || selectedIds === null || selectedIds.length === 0) {
    return;
  }
  const topic = apiTopics?.first((t) => t.topicName === topicName);
  if (topic === null || topic === undefined) {
    return;
  }

  return {
    topicName,
    topic,
    allPartitions,
    selectedPartitions: selectedPartitionsWithMoves(allPartitions, selectedIds, topicName, assignments),
  } satisfies TopicWithMoves;
}

function selectedPartitionsWithMoves(
  allPartitions: Partition[],
  selectedIds: number[],
  topicName: string,
  assignments: PartitionReassignmentRequest
) {
  const selected = new Set(selectedIds);
  const assignedTopic = assignments.topics.first((t) => t.topicName === topicName);
  return allPartitions
    .filter((p) => selected.has(p.id))
    .map((partition) =>
      partitionWithMoves(partition, assignedTopic?.partitions.first((e) => e.partitionId === partition.id)?.replicas)
    );
}

const NO_REPLICA_MOVES = { numAddedBrokers: 0, numRemovedBrokers: 0, changedLeader: false, anyChanges: false };

function partitionWithMoves(partition: Partition, newBrokers: number[] | null | undefined) {
  const oldBrokers = partition.replicas;
  return {
    ...partition,
    brokersBefore: oldBrokers,
    brokersAfter: newBrokers ?? [],
    ...(newBrokers ? replicaMoves(oldBrokers, newBrokers) : NO_REPLICA_MOVES),
  } satisfies PartitionWithMoves;
}

function replicaMoves(oldBrokers: number[], newBrokers: number[]) {
  const changedLeader = oldBrokers[0] !== newBrokers[0];
  return {
    numAddedBrokers: newBrokers.except(oldBrokers).length,
    numRemovedBrokers: oldBrokers.except(newBrokers).length,
    changedLeader,
    anyChanges:
      changedLeader || oldBrokers.length !== newBrokers.length || oldBrokers.some((b, i) => b !== newBrokers[i]),
  };
}

/**
 * Returns a clone without assignments that keep the same replicas in the same order.
 */
export function removeRedundantReassignments(topicAssignments: TopicAssignments, apiData: ApiData) {
  const result = clone(topicAssignments);

  for (const t of Object.keys(result)) {
    const curTopicPartitions = apiData.topicPartitions.get(t);
    if (curTopicPartitions) {
      removeRedundantPartitions(result, t, curTopicPartitions);
    }
  }

  return result;
}

function removeRedundantPartitions(result: TopicAssignments, t: string, curTopicPartitions: Partition[]) {
  const topicAssignment = result[t];
  const partitionIds = Object.keys(topicAssignment);
  const partitionIdsToRemove = partitionIds.filter((partitionId) =>
    keepsReplicas(
      curTopicPartitions.first((p) => p.id === Number(partitionId))?.replicas,
      topicAssignment[Number(partitionId)].brokers
    )
  );

  if (partitionIdsToRemove.length === partitionIds.length) {
    delete result[t];
    return;
  }

  for (const r of partitionIdsToRemove) {
    delete topicAssignment[Number(r)];
  }
}

function keepsReplicas(brokersBefore: number[] | undefined, brokersAfter: Broker[]) {
  return (
    brokersBefore !== undefined &&
    brokersBefore.length === brokersAfter.length &&
    brokersBefore.every((brokerId, i) => brokerId === brokersAfter[i].brokerId)
  );
}

export function topicAssignmentsToReassignmentRequest(topicAssignments: TopicAssignments) {
  const topics: PartitionReassignmentRequest['topics'] = [];
  for (const t in topicAssignments) {
    if (Object.hasOwn(topicAssignments, t)) {
      const topicAssignment = topicAssignments[t];
      const partitions: PartitionReassignmentRequest['topics'][number]['partitions'] = [];
      for (const partitionId in topicAssignment) {
        if (Object.hasOwn(topicAssignment, partitionId)) {
          partitions.push({
            partitionId: Number(partitionId),
            replicas: topicAssignment[partitionId].brokers.map((b) => b.brokerId),
          });
        }
      }

      topics.push({ topicName: t, partitions });
    }
  }

  return { topics };
}
