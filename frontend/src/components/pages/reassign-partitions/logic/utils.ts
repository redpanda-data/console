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
import type { Partition, PartitionReassignmentRequest, Topic } from '../../../../state/rest-interfaces';
import { clone } from '../../../../utils/json-utils';
import type { PartitionSelection } from '../reassign-partitions';
import type { PartitionWithMoves, TopicWithMoves } from '../step3-review';

export function partitionSelectionToTopicPartitions(
  partitionSelection: PartitionSelection,
  apiTopicPartitions: Map<string, Partition[] | null>,
  apiTopics: Topic[]
): TopicPartitions[] | undefined {
  const ar: TopicPartitions[] = [];

  for (const topicName in partitionSelection) {
    if (Object.hasOwn(partitionSelection, topicName)) {
      const topic = apiTopics.first((x) => x.topicName === topicName);
      if (!topic) {
        return; // topic not available
      }

      const allPartitions = apiTopicPartitions.get(topicName);
      if (!allPartitions) {
        return; // partitions for topic not available
      }

      const partitionIds = partitionSelection[topicName];
      const relevantPartitions = partitionIds.map((id) => allPartitions.first((p) => p.id === id));
      if (relevantPartitions.any((p) => p === null)) {
        return; // at least one selected partition not available
      }

      // we've checked that there can't be any falsy partitions
      // so we assert that 'relevantPartitions' is the right type
      ar.push({ topic, partitions: relevantPartitions as Partition[] });
    }
  }

  return ar;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 31, refactor later
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
    if (allPartitions === null) {
      continue;
    }
    if (
      partitionSelection[topicName] === undefined ||
      partitionSelection[topicName] === null ||
      partitionSelection[topicName].length === 0
    ) {
      continue;
    }
    const topic = apiTopics?.first((t) => t.topicName === topicName);
    if (topic === null || topic === undefined) {
      continue;
    }

    const selectedPartitions = allPartitions.filter((p) => partitionSelection[topicName].includes(p.id));
    const partitionsWithMoves: PartitionWithMoves[] = [];

    // Count how many replicas will be moved
    for (const partition of selectedPartitions) {
      const oldBrokers = partition.replicas;
      const newBrokers = assignments.topics
        .first((t) => t.topicName === topicName)
        ?.partitions.first((e) => e.partitionId === partition.id)?.replicas;

      let added = 0;
      let removed = 0;
      let changedLeader = false;
      let anyChanges = false;

      if (newBrokers) {
        // find those brokers that are completely new (did not previously host a replica of this partition)
        added = newBrokers.except(oldBrokers).length;
        removed = oldBrokers.except(newBrokers).length;
        changedLeader = oldBrokers[0] !== newBrokers[0];

        anyChanges = changedLeader || oldBrokers.length !== newBrokers.length;
        if (!anyChanges) {
          for (let i = 0; i < oldBrokers.length && !anyChanges; i++) {
            if (oldBrokers[i] !== newBrokers[i]) {
              anyChanges = true;
            }
          }
        }
      }
      partitionsWithMoves.push({
        ...partition,
        brokersBefore: oldBrokers,
        brokersAfter: newBrokers ?? [],
        numAddedBrokers: added,
        numRemovedBrokers: removed,
        changedLeader,
        anyChanges,
      });
    }

    ar.push({
      topicName,
      topic,
      allPartitions,
      selectedPartitions: partitionsWithMoves,
    });
  }
  return ar;
}

/**
 * Returns a clone of topicAssignments with redundant reassignments removed
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity increased due to for-in guards, refactor later
export function removeRedundantReassignments(topicAssignments: TopicAssignments, apiData: ApiData): TopicAssignments {
  const result = clone(topicAssignments);

  // Remove partition reassignments that have no effect
  let _totalRemovedPartitions = 0;
  const emptyTopics: string[] = [];
  for (const t in result) {
    if (Object.hasOwn(result, t)) {
      const topicAssignment = result[t];
      const curTopicPartitions = apiData.topicPartitions.get(t);
      if (!curTopicPartitions) {
        continue;
      }

      const partitionIdsToRemove: string[] = [];
      let originalReassignedPartitionsCount = 0;
      for (const partitionId in topicAssignment) {
        if (Object.hasOwn(topicAssignment, partitionId)) {
          originalReassignedPartitionsCount++;
          const a = topicAssignment[partitionId];
          const brokersBefore = curTopicPartitions.first((p) => p.id === Number(partitionId))?.replicas;
          if (!brokersBefore) {
            continue;
          }
          const brokersAfter = a.brokers;

          if (brokersBefore.length !== brokersAfter.length) {
            continue;
          }

          let sameBrokers = true;
          for (let i = 0; i < brokersBefore.length; i++) {
            if (brokersBefore[i] !== brokersAfter[i].brokerId) {
              sameBrokers = false;
              break;
            }
          }

          if (sameBrokers) {
            partitionIdsToRemove.push(partitionId);
          }
        }
      }

      _totalRemovedPartitions += partitionIdsToRemove.length;

      if (partitionIdsToRemove.length === originalReassignedPartitionsCount) {
        // All partition reassignments for this topic have are redundant, remove the whole topic
        emptyTopics.push(t);
      } else if (partitionIdsToRemove.length > 0) {
        // Only some of the reassignments need to be removed
        for (const r of partitionIdsToRemove) {
          delete topicAssignment[Number(r)];
        }
      } else {
        // All are required
      }
    }
  }

  // Remove topics that are completely redundant
  for (const t of emptyTopics) {
    delete result[t];
  }

  return result;
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
