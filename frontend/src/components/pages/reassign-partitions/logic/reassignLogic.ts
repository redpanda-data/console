import { untracked } from "mobx";
import { Topic, Partition, Broker, ConfigEntry } from "../../../../state/restInterfaces";
import { toJson } from "../../../../utils/jsonUtils";

// Requirements:
// 1. Each replica must be on a different broker (unless replicationFactor < brokerCount makes it impossible).
// 2. Partitions should be balanced as evenly as possible across the brokers

// Optimization:
// If, while we're looking for a broker to assigning a replica to, we find there are multiple "good" brokers, we can
// optimize according to the following priority list.
//   1. rack: try to stay within the same rack, maybe even the same broker (is that neccesary?)
//   2. partition count, brokers should have roughly the same number of replicas (need to get all topics, all their partitions to even know which broker has which partitions)
//   3. disk space, only if partition count is equal and can't help us decide

// also optimize network traffic: that means trying to stay "inter rack" (bc that traffic is mostly free)
//
// maybe "unassign" all replicas, subtracing used disk space from that broker,
// then, from a fresh start, assign preferably to the original broker, or to a broker in the same rack, or ... (using optimization priorities)


// Input for a reassignment computation. A selection of partitions that should be reassigned.
export type TopicPartitions = {
    topic: Topic // topic the partitions belong to
    partitions: Partition[], // selected partitions
}

// Result of a reassignment computation. Tells you what brokers to use for each partition in each topic.
export type TopicAssignments = {
    [topicName: string]: {
        [partitionId: number]: PartitionAssignments
    }
};
export type PartitionAssignments = {
    partition: Partition,
    brokers: Broker[] // brokers the replicas are on; meaning length is always equal to the replicationFactor
};

type BrokerReplicaCount = { // track how many replicas were assigned to a broker (over all partitions)
    broker: ExBroker;
    assignedReplicas: number;
};

export type ApiData = { brokers: Broker[], topics: Topic[], topicPartitions: Map<string, Partition[]> };


function computeReassignments(
    apiData: ApiData,
    selectedTopicPartitions: TopicPartitions[],
    targetBrokers: Broker[]
): TopicAssignments {

    checkArguments(apiData, selectedTopicPartitions, targetBrokers);

    // Track information like used disk space per broker, so we extend each broker with some metadata
    const allExBrokers = apiData.brokers.map(b => new ExBroker(b));
    const targetExBrokers = allExBrokers.filter(exb => targetBrokers.find(b => exb.brokerId == b.brokerId) != undefined);

    // Recompute broker stats:
    // For the sake of calculation, it is easier to start with a fresh slate.
    // So we first 'virtually' remove these assignments by going through each replica
    // and subtracting its size(disk space) from broker it is on.
    for (const broker of allExBrokers)
        broker.recompute(apiData, selectedTopicPartitions);


    const resultAssignments: TopicAssignments = {};
    for (const t of selectedTopicPartitions) {
        resultAssignments[t.topic.topicName] = {};
        for (const partition of t.partitions)
            resultAssignments[t.topic.topicName][partition.id] = { partition: partition, brokers: [] };
    }

    // Distribute:
    // Go through each topic, assign the replicas of its partitions to the brokers
    for (const topicPartitions of selectedTopicPartitions) {
        if (topicPartitions.topic.replicationFactor <= 0) continue; // must be an error?
        if (topicPartitions.partitions.length == 0) continue; // no partitions to be reassigned in this topic

        computeTopicAssignments(topicPartitions, targetExBrokers, allExBrokers, resultAssignments[topicPartitions.topic.topicName]);
    }

    // Optimize Leaders:
    // Every broker should have roughly the same number of partitions it leads.
    let leaderSwitchCount = 0;
    for (const t of selectedTopicPartitions) {
        for (const p of t.partitions) {
            // map plain brokers to extended brokers (those with attached tracking data)
            const newBrokers = resultAssignments[t.topic.topicName][p.id].brokers.map(b => allExBrokers.first(e => e.brokerId == b.brokerId)!);
            const newLeader = allExBrokers.first(b => b.brokerId == newBrokers[0].brokerId)!;

            // from all the brokers that will soon be the ones hosting this partitions replicas,
            // is there one that would be better suited to be the leader?
            // Sort them by ascending leader count (number of partitions they lead)
            // We must make a copy of the newBrokers aray because we don't want to modify it (yet)
            const sortedBrokers = newBrokers.slice(0);
            sortedBrokers.sort((a, b) => (a.initialLeader + a.assignedLeader) - (b.initialLeader + b.assignedLeader));

            const bestLeader = sortedBrokers[0];

            if (bestLeader != newLeader) {
                // We found a better leader, swap the two and adjust their tracking info
                const indexBest = newBrokers.indexOf(bestLeader);
                if (indexBest < 0) throw new Error('cannot find new/best leader in exBroker array');

                // Swap the two brokers
                newBrokers[0] = bestLeader;
                newBrokers[indexBest] = newLeader;

                // adjust tracking info
                newLeader.assignedLeader--;
                bestLeader.assignedLeader++;

                // adjust final assignments
                // mapping our extendedBrokers back to the "simple" brokers
                resultAssignments[t.topic.topicName][p.id].brokers = newBrokers.map(exBroker => apiData.brokers.first(b => b.brokerId == exBroker.brokerId)!);

                leaderSwitchCount++;
            }
        }
    }
    console.debug(`optimize leaders: ${leaderSwitchCount} leaders switched`);

    return resultAssignments;
}

const untrackedCompute = function (apiData: ApiData,
    selectedTopicPartitions: TopicPartitions[],
    targetBrokers: Broker[]
): TopicAssignments {
    return untracked(() => computeReassignments(apiData, selectedTopicPartitions, targetBrokers));
}
export { untrackedCompute as computeReassignments };

// Compute, for the partitions of a single topic, to which brokers their replicas should be assigned to.
function computeTopicAssignments(
    topicPartitions: TopicPartitions,
    targetBrokers: ExBroker[],
    allBrokers: ExBroker[],
    resultAssignments: { [partitionId: number]: PartitionAssignments; },
) {
    const { topic, partitions } = topicPartitions;

    // shouldn't happen, if the user didn't select any partitions, the entry for that topic shouldn't be there either
    if (partitions.length == 0) return;

    const replicationFactor = topic.replicationFactor;
    if (replicationFactor <= 0) return; // normally it shouldn't be possible; every topic must have at least 1 replica for each of its partitions

    // todo: first create a list of potential assignments, and then only apply the best one, repeat

    // Track how many replicas (of this topic, ignoring from which partitions exactly) were assigned to each broker
    const brokerReplicaCount: BrokerReplicaCount[] = targetBrokers.map(b => ({ broker: b, assignedReplicas: 0 }));

    // For each partition, distribute the replicas to the brokers.
    for (const partition of partitions) {
        // Determine what broker for which replica
        const replicaAssignments = computeReplicaAssignments(partition, replicationFactor, brokerReplicaCount, allBrokers);

        resultAssignments[partition.id].brokers = replicaAssignments;
    }
}


// todo:
// The current approach is "greedy" in that it just wants to assign a replica to whatever broker.
// But because of 'example#2' it is possible that we'll end up causing a lot of network traffic that
// could have been avoided if we had just the two brokers.

// A better appraoch would be to find the best broker for each replica, but instead of commiting to that immediately,
// we'd first save that as a "pending" assignment, along with a score of how much work that assignment would be.
// That'd give us a list of pending assignments, which we can sort by their score.
// To determine that score we'd just re-use the first two very simple metrics (same broker is best: score=2, and same rack is almost as good: score=1)

function computeReplicaAssignments(partition: Partition, replicas: number, brokerReplicaCount: BrokerReplicaCount[], allBrokers: ExBroker[]): ExBroker[] {
    const resultBrokers: ExBroker[] = []; // result
    const sourceBrokers = partition.replicas.map(id => allBrokers.first(b => b.brokerId == id)!);
    if (sourceBrokers.any(x => x == null)) throw new Error(`replicas of partition ${partition.id} (${toJson(partition.replicas)}) define a brokerId which can't be found in 'allBrokers': ${toJson(allBrokers.map(b => ({ id: b.brokerId, address: b.address, rack: b.rack })))}`);
    const sourceRacks = sourceBrokers.map(b => b.rack).distinct();

    // Track brokers we've used so far so we don't use any broker twice
    const consumedBrokers: ExBroker[] = [];

    for (let i = 0; i < replicas; i++) {
        // For each replica to be assigned, we create a set of potential brokers.
        // The potential brokers are those that have least assignments from this partition.
        // If we'd only assign based on the additional metrics, all replicas would be assigned to only one broker (which would be bad if rf=1)

        brokerReplicaCount.sort((a, b) => a.assignedReplicas - b.assignedReplicas);
        const filteredBrokerCounts = brokerReplicaCount.filter(b => !consumedBrokers.includes(b.broker));
        const minAssignments = filteredBrokerCounts[0].assignedReplicas;
        const potential = filteredBrokerCounts.filter(b => b.assignedReplicas == minAssignments);

        // Multiple brokers, sort by additional metrics
        if (potential.length > 1) {
            potential.sort((a, b) => {
                // 1. Same broker as before is better than a different one
                const aIsSame = sourceBrokers.includes(a.broker);
                const bIsSame = sourceBrokers.includes(b.broker);
                if (aIsSame && !bIsSame) return -1;
                if (bIsSame && !aIsSame) return 1;

                // 2. A broker from the same rack is better than one from a different rack
                const aIsSameRack = sourceRacks.includes(a.broker.rack);
                const bIsSameRack = sourceRacks.includes(b.broker.rack);
                if (aIsSameRack && !bIsSameRack) return -1;
                if (bIsSameRack && !aIsSameRack) return 1;

                // 3. Neither of the given brokers is in the same rack as any source broker.
                //    So we decide by which broker has the fewest total partitions/replicas assigned to it.
                const replicasOnA = a.broker.initialReplicas + a.broker.assignedReplicas;
                const replicasOnB = b.broker.initialReplicas + b.broker.assignedReplicas;
                if (replicasOnA < replicasOnB) return -1;
                if (replicasOnB < replicasOnA) return 1;

                // 5. Both brokers actually have the same number of assigned replicas!
                //    But maybe one of them uses less disk space than the other?
                const diskOnA = a.broker.initialSize + a.broker.assignedSize;
                const diskOnB = a.broker.initialSize + b.broker.assignedSize;
                if (diskOnA < diskOnB) return -1;
                if (diskOnB < diskOnA) return 1;

                // They're identical, so it doesn't matter which one we use.
                return 0;
            });
        }

        // Take the best broker
        potential[0].assignedReplicas++; // increase temporary counter (which only tracks assignments within the topic)
        const bestBroker = potential[0].broker;
        resultBrokers.push(bestBroker);
        consumedBrokers.push(bestBroker);

        // increase total number of assigned replicas
        bestBroker.assignedReplicas++;
        // The new assignment will take up disk space, which must be tracked as well.
        bestBroker.assignedSize += partition.replicaSize;
        // if the broker is the first one, it is the leader
        bestBroker.assignedLeader++;
    }

    return resultBrokers;
}


// Broker extended with tracking information.
// Used to quickly determine which is the best broker for a given replica, without having to recompute the tracked information all the time
// (Otherwise we'd have to iterate over every topic/partition/replica all the time)
class ExBroker implements Broker {
    brokerId: number;
    logDirSize: number;
    address: string;
    rack: string;
    configs: ConfigEntry[];

    // Values as they actually are currently in the cluster
    actualReplicas: number = 0; // number of all replicas (no matter from which topic) assigned to this broker
    actualSize: number = 0; // total size used by all the replicas assigned to this broker
    actualLeader: number = 0; // for how many partitions is this broker the leader?

    // 'actual' values minus everything that is to be reassigned
    // in other words: the state of the broker without counting anything we're about to reassign
    initialReplicas: number = 0;
    initialSize: number = 0;
    initialLeader: number = 0;

    // values of the current assignments
    // counting only whenever we assign something to this broker.
    assignedReplicas: number = 0;
    assignedSize: number = 0;
    assignedLeader: number = 0;

    constructor(sourceBroker: Broker) {
        Object.assign(this, sourceBroker);
    }

    recompute(apiData: ApiData, selectedTopicPartitions: TopicPartitions[]) {
        this.recomputeActual(apiData);
        this.recomputeInitial(selectedTopicPartitions);
    }

    private recomputeActual(apiData: ApiData) {
        this.actualReplicas = 0;
        this.actualSize = 0;
        this.actualLeader = 0;

        if (apiData.topicPartitions == null)
            throw new Error(`cannot recompute actual usage of broker '${this.brokerId}' because 'api.topicPartitions == null' (no permissions?)`);

        for (const [topic, partitions] of apiData.topicPartitions) {
            if (partitions == null) throw new Error(`cannot recompute actual usage of broker '${this.brokerId}' for topic '${topic}', because 'partitions == null' (no permissions?)`);

            for (const p of partitions) {
                // replicas
                const replicasAssignedToThisBroker = p.replicas.count(x => x == this.brokerId);
                this.actualReplicas += replicasAssignedToThisBroker;
                this.actualLeader += p.leader == this.brokerId ? 1 : 0;

                // size: using 'first()' because each broker has exactly one entry (or maybe zero if broker is offline)
                const logDirEntry = p.partitionLogDirs.first(x => x.error == "" && x.brokerId == this.brokerId);
                if (logDirEntry !== undefined)
                    this.actualSize += logDirEntry.size;
                else {
                    // todo:
                    // - fallback to another entry? (using maximum size we find)
                    // - throw error?
                }
            }
        }
    }

    private recomputeInitial(selectedTopicPartitions: TopicPartitions[]) {
        // Subtract the stats of the selected partitions
        let selectedReplicas = 0;
        let selectedSize = 0;
        let selectedLeader = 0;

        for (const topic of selectedTopicPartitions)
            for (const p of topic.partitions) {
                selectedReplicas += p.replicas.count(x => x == this.brokerId);
                selectedLeader += p.leader == this.brokerId ? 1 : 0;

                // using 'first()' because each broker as exactly one logDirEntry (or maybe zero if broker is offline)
                const logDirEntry = p.partitionLogDirs.first(x => x.error == "" && x.brokerId == this.brokerId);
                if (logDirEntry) {
                    // direct match
                    selectedSize += logDirEntry.size;
                } else {
                    // broker offline, assume maximum using the size reported by another broker
                    const fallbackSize = p.partitionLogDirs.filter(x => x.error == "").max(x => x.size);
                    selectedSize += fallbackSize;
                }
            }

        // Since at the start we'll pretend the selected partitions are not assigned to any broker
        // we'll get our "initial" from actual minus selecte.
        this.initialReplicas = this.actualReplicas - selectedReplicas;
        this.initialSize = this.actualSize - selectedSize;
        this.initialLeader = this.actualLeader - selectedLeader;
    }
}


function checkArguments(
    apiData: ApiData,
    selectedTopicPartitions: TopicPartitions[],
    targetBrokers: Broker[]) {
    // Check for missing or invalid api data
    throwIfNullOrEmpty("apiData.brokers", apiData.brokers);
    throwIfNullOrEmpty("apiData.topics", apiData.topics);
    throwIfNullOrEmpty("apiData.topicPartitions", apiData.topicPartitions);
    const topicsMissingPartitionData = apiData.topics.filter(t => apiData.topicPartitions.get(t.topicName) == null);
    if (topicsMissingPartitionData.length > 0)
        throw new Error("apiData is missing topicPartitions for these topics: " + topicsMissingPartitionData.map(t => t.topicName).join(', '))

    // Require at least one selected partition
    if (selectedTopicPartitions.sum(x => x.partitions.length) == 0)
        throw new Error("No partitions selected");

    // Require at least as many brokers as the highest replication factor of any selected partition
    const maxRf = selectedTopicPartitions
        .groupInto(t => t.topic.replicationFactor) // group topics by replication factor
        .sort((a, b) => b.key - a.key)[0]; // sort descending, then take first group
    if (maxRf.key > targetBrokers.length)
        throw new Error(`You selected ${targetBrokers.length} target brokers, but the following topics have a replicationFactor of ${maxRf.key}, so at least ${maxRf.key} target brokers are required: ${toJson(maxRf.items.map(t => t.topic.topicName))}`);
}

function throwIfNullOrEmpty(name: string, obj: any[] | Map<any, any>) {
    if (obj == null)
        throw new Error(name + " is null");

    if (Array.isArray(obj)) {
        if (obj.length == 0)
            throw new Error(name + " is empty");
    } else {
        if (obj.size == 0)
            throw new Error(name + " is empty");
    }
}