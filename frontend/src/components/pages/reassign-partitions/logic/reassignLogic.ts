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

import { untracked } from 'mobx';
import { Topic, Partition, Broker, BrokerConfig } from '../../../../state/restInterfaces';
import { toJson } from '../../../../utils/jsonUtils';

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
    const getExBroker = (brokerId: number): ExBroker => {
        const exBroker = allExBrokers.find(x => x.brokerId == brokerId);
        if (exBroker === undefined) throw new Error('cannot find ExBroker with brokerId ' + brokerId);
        return exBroker;
    };

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
    const skewActual = calcRange(allExBrokers, x => x.actualLeader);

    const optimizationLog: { skewBefore: number, skewAfter: number, swaps: number }[] = [];
    for (let round = 0; round < 10; round++) {
        const { range: skewBefore } = calcRange(allExBrokers, x => x.plannedLeader);
        const leaderSwitchCount = balanceLeaders(selectedTopicPartitions, resultAssignments, allExBrokers, apiData);
        const { range: skewAfter } = calcRange(allExBrokers, x => x.plannedLeader);

        optimizationLog.push({
            skewBefore,
            skewAfter,
            swaps: leaderSwitchCount
        });

        if (skewAfter == 0 || skewBefore <= skewAfter) {
            break;
        }
    }

    const skewPlannedInCluster = calcRange(allExBrokers, x => x.plannedLeader);
    console.debug('leader skew in cluster', {
        actual: {
            skew: skewActual.range,
            min: `${skewActual.minValue} partitions (brokerId ${skewActual.min?.brokerId})`,
            max: `${skewActual.maxValue} partitions (brokerId ${skewActual.max?.brokerId})`,
        },

        planned: {
            skew: skewPlannedInCluster.range,
            min: `${skewPlannedInCluster.minValue} partitions (brokerId ${skewPlannedInCluster.min?.brokerId})`,
            max: `${skewPlannedInCluster.maxValue} partitions (brokerId ${skewPlannedInCluster.max?.brokerId})`,
        },

        log: optimizationLog
    });

    const criticalBrokers = findRiskyPartitions(allExBrokers, selectedTopicPartitions, resultAssignments, getExBroker);
    reportRiskyPartitions(criticalBrokers);

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

    // Track how many replicas (of this topic!) were assigned to each broker
    const brokerReplicaCount: BrokerReplicaCount[] = targetBrokers.map(b => ({ broker: b, assignedReplicas: 0 }));

    // Find the most suitable brokers for each partition
    partitions.sort((a, b) => a.id - b.id);
    for (const partition of partitions) {
        // Find brokers to host the replicas (order is not important, leader is determined later)
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

    // Track brokers we've used so far (trying to not use any broker twice)
    const consumedBrokers: ExBroker[] = [];

    // Track racks we've used so far (trying to not use any rack twice)
    const replicasInRack = (rack: string) => brokerReplicaCount.filter(x => x.broker.rack == rack).sum(x => x.assignedReplicas);

    for (let i = 0; i < replicas; i++) {

        // Sort to find the best broker (better brokers first)
        brokerReplicaCount.sort((a, b) => {
            // Precondition
            // Each broker can't host more than 1 replica of a partition
            const aConsumed = consumedBrokers.includes(a.broker);
            const bConsumed = consumedBrokers.includes(b.broker);
            if (aConsumed && !bConsumed) return 1;
            if (!aConsumed && bConsumed) return -1;

            // 1. Prefer distribution across different racks.
            //    If we already assigned a replica to one broker, we'd like to
            //    assign the next replica to a broker in a different rack.
            //    (-> robustness against outages of a whole rack)
            const replicasInRackA = replicasInRack(a.broker.rack);
            const replicasInRackB = replicasInRack(b.broker.rack);
            if (replicasInRackA < replicasInRackB) return -1;
            if (replicasInRackB < replicasInRackA) return 1;

            // 2. Prefer the broker hosting the fewest replicas (for *this* topic).
            //    (-> balanced replicas across user-selected brokers)
            const topicReplicasOnA = a.assignedReplicas;
            const topicReplicasOnB = b.assignedReplicas;
            if (topicReplicasOnA < topicReplicasOnB) return -1;
            if (topicReplicasOnB < topicReplicasOnA) return 1;

            // 3. Prefer the broker hosting the fewest replicas (over *all* topics).
            //    (-> balanced replica count across cluster)
            const replicasOnA = a.broker.plannedReplicas;
            const replicasOnB = b.broker.plannedReplicas;
            if (replicasOnA < replicasOnB) return -1;
            if (replicasOnB < replicasOnA) return 1;

            // 4. Prefer using the same brokers as before.
            //    (-> no network traffic)
            const aIsSource = sourceBrokers.includes(a.broker);
            const bIsSource = sourceBrokers.includes(b.broker);
            if (aIsSource && !bIsSource) return -1;
            if (bIsSource && !aIsSource) return 1;

            // 5. Prefer using the same rack as before.
            //    (-> less expensive network traffic)
            const aIsSameRack = sourceRacks.includes(a.broker.rack);
            const bIsSameRack = sourceRacks.includes(b.broker.rack);
            if (aIsSameRack && !bIsSameRack) return -1;
            if (bIsSameRack && !aIsSameRack) return 1;

            // 6. Prefer brokers with free disk space
            //    (-> balanced disk-space across cluster)
            const diskOnA = a.broker.plannedSize;
            const diskOnB = b.broker.plannedSize;
            if (diskOnA < diskOnB) return -1;
            if (diskOnB < diskOnA) return 1;

            // They're identical, so it doesn't matter which one we use.
            return 0;
        });

        // Take the best broker
        const bestTrackedBroker = brokerReplicaCount[0];
        const bestBroker = bestTrackedBroker.broker;
        bestTrackedBroker.assignedReplicas++; // increase temporary counter (which only tracks assignments within the topic)
        resultBrokers.push(bestBroker);
        consumedBrokers.push(bestBroker);

        // Increase total number of assigned replicas
        bestBroker.assignedReplicas++;
        // The new assignment will take up disk space, which must be tracked as well.
        bestBroker.assignedSize += partition.replicaSize;
    }

    // Count the first broker in the list as the leader
    resultBrokers[0].assignedLeader++;

    return resultBrokers;
}


function balanceLeaders(selectedTopicPartitions: TopicPartitions[], resultAssignments: TopicAssignments, allExBrokers: ExBroker[], apiData: ApiData) {
    let leaderSwitchCount = 0;
    for (const t of selectedTopicPartitions) {
        for (const p of t.partitions) {
            // map plain brokers to extended brokers (those with attached tracking data)
            const newBrokers = resultAssignments[t.topic.topicName][p.id].brokers.map(b => allExBrokers.first(e => e.brokerId == b.brokerId)!);
            const plannedLeader = newBrokers[0];

            // from all the brokers that will soon be the ones hosting this partitions replicas,
            // is there one that would be better suited to be the leader?
            // Sort them by ascending leader count (number of partitions they lead)
            // We must make a copy of the newBrokers aray because we don't want to modify it (yet)
            const sortedBrokers = newBrokers.slice(0);
            sortedBrokers.sort((a, b) => a.plannedLeader - b.plannedLeader);

            const betterLeader = sortedBrokers[0];

            if (betterLeader != plannedLeader) {
                // We found a better leader, swap the two and adjust their tracking info
                const betterLeaderIndex = newBrokers.indexOf(betterLeader);
                if (betterLeaderIndex < 0)
                    throw new Error('cannot find new/best leader in exBroker array');

                // Swap the two brokers
                newBrokers[0] = betterLeader;
                newBrokers[betterLeaderIndex] = plannedLeader;

                // Adjust tracking info for leaders and consumed disk size
                plannedLeader.assignedLeader--;
                plannedLeader.assignedSize -= p.replicaSize;
                betterLeader.assignedLeader++;
                betterLeader.assignedSize += p.replicaSize;

                // Update final assignments
                // mapping our extendedBrokers back to the "simple" brokers
                resultAssignments[t.topic.topicName][p.id].brokers = newBrokers.map(exBroker => apiData.brokers.first(b => b.brokerId == exBroker.brokerId)!);

                leaderSwitchCount++;
            }
        }
    }

    return leaderSwitchCount;
}

type RiskyPartition = {
    topic: Topic,
    partition: Partition,
    criticalRacks: string[], // if this rack is offline, the whole partition will be unavailable
    criticalBrokers: ExBroker[], // if this broker is offline...
};

function findRiskyPartitions(
    targetBrokers: ExBroker[],
    selectedTopicPartitions: TopicPartitions[],
    resultAssignments: TopicAssignments,
    getExBroker: (id: number) => ExBroker
): RiskyPartition[] {
    const targetRacks = targetBrokers.map(b => b.rack).distinct();

    const riskyPartitions: RiskyPartition[] = [];

    for (const t of selectedTopicPartitions) {
        const { topic, partitions } = t;
        const topicAssignments = resultAssignments[topic.topicName];
        for (const partition of partitions) {
            const partitionAssignments = topicAssignments[partition.id];
            const replicaBrokers = partitionAssignments.brokers.map(b => getExBroker(b.brokerId));

            // Will this partition be unavailable when any one broker is offline?
            // If so, which are the "critical" brokers (or racks) for each partition?
            const riskyPartition: RiskyPartition = {
                topic, partition,
                criticalBrokers: [],
                criticalRacks: [],
            };

            // Check if the partition would be offline if each single broker is offline
            for (const b of targetBrokers) {
                const remainingBrokers = replicaBrokers.except([b]);
                if (remainingBrokers.length == 0)
                    riskyPartition.criticalBrokers.push(b);
            }

            // Check for offline racks
            for (const rack of targetRacks) {
                const remainingBrokers = replicaBrokers.filter(x => x.rack !== rack);
                if (remainingBrokers.length == 0)
                    riskyPartition.criticalRacks.push(rack);
            }

            if (riskyPartition.criticalRacks.length > 0 || riskyPartition.criticalBrokers.length > 0)
                riskyPartitions.push(riskyPartition);
        }
    }

    return riskyPartitions;
}

// If there are any critical brokers or racks, this might indicate a bug in the distribution algorithm.
// Except for situations where a topic has a replication factor of 1 (each partition will always be on only one broker),
// or when there is only a single rack available (happens when brokers have null or empty string set as their rack).
function reportRiskyPartitions(riskyPartitions: RiskyPartition[]) {
    for (const { key: topic, items: partitionIssues } of riskyPartitions.groupInto(x => x.topic)) {

        // topics with rf:1 will always be an issue
        if (topic.replicationFactor <= 1)
            continue;

        // check if any partition has any issues
        const issues = partitionIssues.filter(x => x.criticalBrokers.length > 0 || x.criticalRacks.length > 0);
        if (issues.length == 0)
            continue;

        // at least one partition with issues, report as table
        const table = issues.map(x => ({
            partitionId: x.partition.id,
            criticalBrokers: x.criticalBrokers.map(b => String(b.brokerId)).join(', '),
            criticalRacks: x.criticalRacks.join(', '),
        }));
        console.error(`Issues in topic "${topic.topicName}" (RF: ${topic.replicationFactor}) (${issues.length} issues).`);
        console.table(table);
    }
}

// Broker extended with tracking information.
// Used to quickly determine which is the best broker for a given replica, without having to recompute the tracked information all the time
// (Otherwise we'd have to iterate over every topic/partition/replica all the time)
class ExBroker implements Broker {
    brokerId: number;
    logDirSize: number;
    address: string;
    rack: string;
    config: BrokerConfig;

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

    get plannedReplicas(): number { return this.initialReplicas + this.assignedReplicas; }
    get plannedSize(): number { return this.initialSize + this.assignedSize; }
    get plannedLeader(): number { return this.initialLeader + this.assignedLeader; }


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

                if (replicasAssignedToThisBroker > 0) {
                    // This broker hosts a replica of this partition
                    // find size of the logdir for the partition on this broker
                    const logDirEntry = p.partitionLogDirs.first(x => !x.error && x.brokerId == this.brokerId);
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
    }

    private recomputeInitial(selectedTopicPartitions: TopicPartitions[]) {
        // Subtract the stats of the selected partitions
        let selectedReplicas = 0;
        let selectedSize = 0;
        let selectedLeader = 0;

        for (const topic of selectedTopicPartitions)
            for (const p of topic.partitions) {
                const replicasOnBroker = p.replicas.count(x => x == this.brokerId);
                selectedReplicas += replicasOnBroker;
                selectedLeader += (p.leader == this.brokerId) ? 1 : 0;

                if (replicasOnBroker > 0) {
                    // using 'first()' because each broker has exactly one logDirEntry (or maybe zero if broker is offline)
                    const logDirEntry = p.partitionLogDirs.first(x => !x.error && x.brokerId == this.brokerId);
                    if (logDirEntry) {
                        // direct match
                        selectedSize += logDirEntry.size;
                    } else {
                        // broker offline, use fallback
                        selectedSize += p.replicaSize;
                    }
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
    throwIfNullOrEmpty('apiData.brokers', apiData.brokers);
    throwIfNullOrEmpty('apiData.topics', apiData.topics);
    throwIfNullOrEmpty('apiData.topicPartitions', apiData.topicPartitions);
    const topicsMissingPartitionData = apiData.topics.filter(t => apiData.topicPartitions.get(t.topicName) == null);
    if (topicsMissingPartitionData.length > 0)
        throw new Error('apiData is missing topicPartitions for these topics: ' + topicsMissingPartitionData.map(t => t.topicName).join(', '))

    // Require at least one selected partition
    if (selectedTopicPartitions.sum(x => x.partitions.length) == 0)
        throw new Error('No partitions selected');

    // Require at least as many brokers as the highest replication factor of any selected partition
    const maxRf = selectedTopicPartitions
        .groupInto(t => t.topic.replicationFactor) // group topics by replication factor
        .sort((a, b) => b.key - a.key)[0]; // sort descending, then take first group
    if (maxRf.key > targetBrokers.length)
        throw new Error(`You selected ${targetBrokers.length} target brokers, but the following topics have a replicationFactor of ${maxRf.key}, so at least ${maxRf.key} target brokers are required: ${toJson(maxRf.items.map(t => t.topic.topicName))}`);
}

function throwIfNullOrEmpty(name: string, obj: any[] | Map<any, any>) {
    if (obj == null)
        throw new Error(name + ' is null');

    if (Array.isArray(obj)) {
        if (obj.length == 0)
            throw new Error(name + ' is empty');
    } else {
        if (obj.size == 0)
            throw new Error(name + ' is empty');
    }
}

function calcRange<T>(ar: T[], selector: (item: T) => number): {
    range: number,
    min: T | undefined,
    minValue: number,

    max: T | undefined,
    maxValue: number,
} {
    if (ar.length == 0) return {
        range: 0,
        min: undefined,
        minValue: 0,
        max: undefined,
        maxValue: 0
    };

    const max = ar.maxBy(selector)!;
    const maxVal = selector(max);

    const min = ar.minBy(selector)!;
    const minVal = selector(min);

    const range = maxVal - minVal;

    return {
        range: range,
        min: min,
        minValue: minVal,
        max: max,
        maxValue: maxVal,
    };
}

function dumpBrokerInfo(title: string, brokers: ExBroker[]) {
    console.log(title);
    console.table(brokers.map((x: ExBroker) => ({
        id: x.brokerId,
        address: x.address,
        actualLeader: x.actualLeader,
        plannedLeader: x.plannedLeader,

        actualReplicas: x.actualReplicas,
        plannedReplicas: x.plannedReplicas,

        actualSize: x.actualSize,
        plannedSize: x.plannedSize,

        full: {
            ...x
        }
    })), [
        'address',
        'actualLeader',
        'plannedLeader',
        'actualReplicas',
        'plannedReplicas',
        'actualSize',
        'plannedSize'
    ]);
}
