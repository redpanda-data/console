import { Partition, PartitionReassignmentRequest, Topic, TopicAssignment } from "../../../../state/restInterfaces";
import { clone } from "../../../../utils/jsonUtils";
import { PartitionSelection } from "../ReassignPartitions";
import { PartitionWithMoves, TopicWithMoves } from "../Step3.Review";
import { ApiData, TopicAssignments, TopicPartitions } from "./reassignLogic";

export function partitionSelectionToTopicPartitions(
    partitionSelection: PartitionSelection,
    apiTopicPartitions: Map<string, Partition[] | null>,
    apiTopics: Topic[]
): TopicPartitions[] {

    const ar: TopicPartitions[] = [];
    for (const [topicName, partitions] of apiTopicPartitions) {
        if (partitions == null) continue;
        if (partitionSelection[topicName] == null) continue;
        const topic = apiTopics?.first(t => t.topicName == topicName);
        if (topic == null) continue;

        const relevantPartitions = partitions.filter(p => partitionSelection[topicName].includes(p.id));
        ar.push({ topic: topic, partitions: relevantPartitions });
    }
    return ar;
}

export function computeMovedReplicas(
    partitionSelection: PartitionSelection,
    assignments: PartitionReassignmentRequest,
    apiTopics: Topic[],
    apiTopicPartitions: Map<string, Partition[] | null>,
): TopicWithMoves[] {
    const ar = [];
    // For each partition in each topic:
    // - get Partition objects
    // - compute number of moved replicas
    for (const [topicName, allPartitions] of apiTopicPartitions) {
        if (allPartitions == null) continue;
        if (partitionSelection[topicName] == null || partitionSelection[topicName].length == 0) continue;
        const topic = apiTopics?.first(t => t.topicName == topicName);
        if (topic == null) continue;

        const selectedPartitions = allPartitions.filter(p => partitionSelection[topicName].includes(p.id));
        const partitionsWithMoves: PartitionWithMoves[] = [];

        // Count how many replicas will be moved
        for (const partition of selectedPartitions) {
            const oldBrokers = partition.replicas;
            const newBrokers = assignments.topics
                .first(t => t.topicName == topicName)?.partitions
                .first(e => e.partitionId == partition.id)?.replicas;

            let moves = 0;
            if (newBrokers) {
                const intersection = oldBrokers.intersection(newBrokers);
                moves = oldBrokers.length - intersection.length;
            }
            partitionsWithMoves.push({ ...partition, movedReplicas: moves, brokersBefore: oldBrokers, brokersAfter: newBrokers ?? [] });
        }

        ar.push({
            topicName: topicName,
            topic: topic,
            allPartitions: allPartitions,
            selectedPartitions: partitionsWithMoves,
        });
    }
    return ar;
}

/**
 * Returns a clone of topicAssignments with redundant reassignments removed
*/
export function removeRedundantReassignments(topicAssignments: TopicAssignments, apiData: ApiData): TopicAssignments {

    topicAssignments = clone(topicAssignments);

    // Remove partition reassignments that have no effect
    let totalRemovedPartitions = 0;
    const emptyTopics: string[] = [];
    for (const t in topicAssignments) {
        const topicAssignment = topicAssignments[t];
        const curTopicPartitions = apiData.topicPartitions.get(t);
        if (!curTopicPartitions) continue;

        const partitionIdsToRemove: string[] = [];
        let originalReassignedPartitionsCount = 0;
        for (const partitionId in topicAssignment) {
            originalReassignedPartitionsCount++;
            const a = topicAssignment[partitionId];
            const brokersBefore = curTopicPartitions.first(p => p.id == Number(partitionId))?.replicas;
            if (!brokersBefore) continue;
            const brokersAfter = a.brokers;

            if (brokersBefore.length != brokersAfter.length) {
                console.warn('remove empty reassignments: brokersBefore.length != brokersAfter.length');
                continue;
            }

            let sameBrokers = true;
            for (let i = 0; i < brokersBefore.length; i++) {
                if (brokersBefore[i] != brokersAfter[i].brokerId) {
                    sameBrokers = false;
                    break;
                }
            }

            if (sameBrokers)
                partitionIdsToRemove.push(partitionId);
        }

        totalRemovedPartitions += partitionIdsToRemove.length;

        if (partitionIdsToRemove.length == originalReassignedPartitionsCount) {
            // All partition reassignments for this topic have are redundant, remove the whole topic
            emptyTopics.push(t);
        }
        else if (partitionIdsToRemove.length > 0) {
            // Only some of the reassignments need to be removed
            for (const r of partitionIdsToRemove)
                delete topicAssignment[Number(r)];
        }
        else {
            // All are required
        }
    }


    // Remove topics that are completely redundant
    for (const t of emptyTopics)
        delete topicAssignments[t];

    console.log('removed redundant partition reassignments', {
        totalRemovedTopics: emptyTopics.length,
        totalRemovedPartitions: totalRemovedPartitions,
        removedTopics: emptyTopics,
        optimizedAssignments: clone(topicAssignments)
    });

    return topicAssignments;
}

export function topicAssignmentsToReassignmentRequest(topicAssignments: TopicAssignments): PartitionReassignmentRequest {
    // Construct reassignment request from topicAssignments
    const topics = [];
    for (const t in topicAssignments) {
        const topicAssignment = topicAssignments[t];
        const partitions: { partitionId: number, replicas: number[] | null }[] = [];
        for (const partitionId in topicAssignment)
            partitions.push({
                partitionId: Number(partitionId),
                replicas: topicAssignment[partitionId].brokers.map(b => b.brokerId)
            });

        topics.push({ topicName: t, partitions: partitions });
    }

    return { topics: topics };
}