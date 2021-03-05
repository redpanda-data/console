import { Partition, PartitionReassignmentRequest, Topic } from "../../../../state/restInterfaces";
import { PartitionSelection } from "../ReassignPartitions";
import { PartitionWithMoves, TopicWithMoves } from "../Step3.Review";
import { TopicPartitions } from "./reassignLogic";

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
            partitionsWithMoves.push({ ...partition, movedReplicas: moves });
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