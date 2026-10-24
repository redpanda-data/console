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

export function partitionSelectionToTopicPartitions(
  partitionSelection: PartitionSelection,
  apiTopicPartitions: Map<string, Partition[] | null>,
  apiTopics: Topic[]
): TopicPartitions[] | undefined {
  const ar: TopicPartitions[] = [];

  for (const topicName of Object.keys(partitionSelection)) {
    const topicPartitions = resolveTopicPartitions(
      topicName,
      partitionSelection[topicName],
      apiTopicPartitions,
      apiTopics
    );
    if (!topicPartitions) {
      return; // topic, its partitions, or a selected partition is not available
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
): TopicPartitions | undefined {
  const topic = apiTopics.first((x) => x.topicName === topicName);
  if (!topic) {
    return; // topic not available
  }

  const allPartitions = apiTopicPartitions.get(topicName);
  if (!allPartitions) {
    return; // partitions for topic not available
  }

  const relevantPartitions = partitionIds.map((id) => allPartitions.first((p) => p.id === id));
  if (relevantPartitions.any((p) => p === null)) {
    return; // at least one selected partition not available
  }

  // we've checked that there can't be any falsy partitions
  // so we assert that 'relevantPartitions' is the right type
  return { topic, partitions: relevantPartitions as Partition[] };
}

export function computeMovedReplicas(
  partitionSelection: PartitionSelection,
  assignments: PartitionReassignmentRequest,
  apiTopics: Topic[],
  apiTopicPartitions: Map<string, Partition[] | null>
): TopicWithMoves[] {
  const ar: TopicWithMoves[] = [];
  // For each partition in each topic:
  // - get Partition objects
  // - compute number of moved replicas
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
): TopicWithMoves | undefined {
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
  };
}

// Count how many replicas will be moved
function selectedPartitionsWithMoves(
  allPartitions: Partition[],
  selectedIds: number[],
  topicName: string,
  assignments: PartitionReassignmentRequest
): PartitionWithMoves[] {
  const selected = new Set(selectedIds);
  const assignedTopic = assignments.topics.first((t) => t.topicName === topicName);
  return allPartitions
    .filter((p) => selected.has(p.id))
    .map((partition) =>
      partitionWithMoves(partition, assignedTopic?.partitions.first((e) => e.partitionId === partition.id)?.replicas)
    );
}

const NO_REPLICA_MOVES = { numAddedBrokers: 0, numRemovedBrokers: 0, changedLeader: false, anyChanges: false };

function partitionWithMoves(partition: Partition, newBrokers: number[] | null | undefined): PartitionWithMoves {
  const oldBrokers = partition.replicas;
  return {
    ...partition,
    brokersBefore: oldBrokers,
    brokersAfter: newBrokers ?? [],
    ...(newBrokers ? replicaMoves(oldBrokers, newBrokers) : NO_REPLICA_MOVES),
  };
}

function replicaMoves(oldBrokers: number[], newBrokers: number[]) {
  const changedLeader = oldBrokers[0] !== newBrokers[0];
  return {
    // find those brokers that are completely new (did not previously host a replica of this partition)
    numAddedBrokers: newBrokers.except(oldBrokers).length,
    numRemovedBrokers: oldBrokers.except(newBrokers).length,
    changedLeader,
    anyChanges:
      changedLeader || oldBrokers.length !== newBrokers.length || oldBrokers.some((b, i) => b !== newBrokers[i]),
  };
}

/**
 * Returns a clone of topicAssignments with redundant reassignments removed
 */
export function removeRedundantReassignments(topicAssignments: TopicAssignments, apiData: ApiData): TopicAssignments {
  const result = clone(topicAssignments);

  // Remove partition reassignments that have no effect
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
    // All partition reassignments for this topic have are redundant, remove the whole topic
    delete result[t];
    return;
  }

  // Only some of the reassignments need to be removed (or all are required)
  for (const r of partitionIdsToRemove) {
    delete topicAssignment[Number(r)];
  }
}

/** Whether the reassignment puts the replicas on the same brokers, in the same order, as before. */
function keepsReplicas(brokersBefore: number[] | undefined, brokersAfter: Broker[]) {
  return (
    brokersBefore !== undefined &&
    brokersBefore.length === brokersAfter.length &&
    brokersBefore.every((brokerId, i) => brokerId === brokersAfter[i].brokerId)
  );
}

export function topicAssignmentsToReassignmentRequest(
  topicAssignments: TopicAssignments
): PartitionReassignmentRequest {
  // Construct reassignment request from topicAssignments
  const topics: { topicName: string; partitions: { partitionId: number; replicas: number[] | null }[] }[] = [];
  for (const t in topicAssignments) {
    if (Object.hasOwn(topicAssignments, t)) {
      const topicAssignment = topicAssignments[t];
      const partitions: { partitionId: number; replicas: number[] | null }[] = [];
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
