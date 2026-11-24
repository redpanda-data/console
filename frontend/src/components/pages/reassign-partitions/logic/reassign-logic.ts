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

import type { Broker, BrokerConfig, Partition, Topic } from '../../../../state/rest-interfaces';
import { toJson } from '../../../../utils/json-utils';

/** Partitions of one topic selected for reassignment. */
export type TopicPartitions = {
  topic: Topic;
  partitions: Partition[];
};

/** Proposed replica placements keyed first by topic name, then by partition ID. */
export type TopicAssignments = {
  [topicName: string]: {
    [partitionId: number]: PartitionAssignments;
  };
};
export type PartitionAssignments = {
  partition: Partition;
  /** One broker per replica, with the preferred leader first. */
  brokers: Broker[];
};

type BrokerReplicaCount = {
  broker: ExBroker;
  assignedReplicas: number;
};

export type ApiData = { brokers: Broker[]; topics: Topic[]; topicPartitions: Map<string, Partition[]> };

function computeReassignments(apiData: ApiData, selectedTopicPartitions: TopicPartitions[], targetBrokers: Broker[]) {
  checkArguments(apiData, selectedTopicPartitions, targetBrokers);

  const allExBrokers = createExBrokers(apiData, selectedTopicPartitions);
  const targetExBrokers = allExBrokers.filter((exb) => targetBrokers.some((b) => exb.brokerId === b.brokerId));

  const resultAssignments = createEmptyAssignments(selectedTopicPartitions);

  distributeReplicas(selectedTopicPartitions, targetExBrokers, allExBrokers, resultAssignments);

  const optimizationLog = optimizeLeaders(selectedTopicPartitions, resultAssignments, allExBrokers, apiData);
  logLeaderSkew(allExBrokers, optimizationLog);

  const criticalBrokers = findRiskyPartitions(allExBrokers, selectedTopicPartitions, resultAssignments, (brokerId) =>
    exBrokerById(allExBrokers, brokerId)
  );
  reportRiskyPartitions(criticalBrokers);

  return resultAssignments;
}

function exBrokerById(allExBrokers: ExBroker[], brokerId: number) {
  const exBroker = allExBrokers.find((x) => x.brokerId === brokerId);
  if (exBroker === undefined) {
    throw new Error(`cannot find ExBroker with brokerId ${brokerId}`);
  }
  return exBroker;
}

function createExBrokers(apiData: ApiData, selectedTopicPartitions: TopicPartitions[]) {
  const allExBrokers = apiData.brokers.map((b) => new ExBroker(b));

  for (const broker of allExBrokers) {
    broker.recompute(apiData, selectedTopicPartitions);
  }

  return allExBrokers;
}

function createEmptyAssignments(selectedTopicPartitions: TopicPartitions[]) {
  const resultAssignments: TopicAssignments = {};
  for (const t of selectedTopicPartitions) {
    resultAssignments[t.topic.topicName] = {};
    for (const partition of t.partitions) {
      resultAssignments[t.topic.topicName][partition.id] = { partition, brokers: [] };
    }
  }
  return resultAssignments;
}

function distributeReplicas(
  selectedTopicPartitions: TopicPartitions[],
  targetExBrokers: ExBroker[],
  allExBrokers: ExBroker[],
  resultAssignments: TopicAssignments
) {
  for (const topicPartitions of selectedTopicPartitions) {
    if (topicPartitions.topic.replicationFactor <= 0) {
      continue;
    }
    if (topicPartitions.partitions.length === 0) {
      continue;
    }

    computeTopicAssignments(
      topicPartitions,
      targetExBrokers,
      allExBrokers,
      resultAssignments[topicPartitions.topic.topicName]
    );
  }
}

type LeaderOptimizationRound = { skewBefore: number; skewAfter: number; swaps: number };

function optimizeLeaders(
  selectedTopicPartitions: TopicPartitions[],
  resultAssignments: TopicAssignments,
  allExBrokers: ExBroker[],
  apiData: ApiData
) {
  const optimizationLog: LeaderOptimizationRound[] = [];
  for (let round = 0; round < 10; round++) {
    const { range: skewBefore } = calcRange(allExBrokers, (x) => x.plannedLeader);
    const leaderSwitchCount = balanceLeaders(selectedTopicPartitions, resultAssignments, allExBrokers, apiData);
    const { range: skewAfter } = calcRange(allExBrokers, (x) => x.plannedLeader);

    optimizationLog.push({
      skewBefore,
      skewAfter,
      swaps: leaderSwitchCount,
    });

    if (skewAfter === 0 || skewBefore <= skewAfter) {
      break;
    }
  }
  return optimizationLog;
}

function logLeaderSkew(allExBrokers: ExBroker[], optimizationLog: LeaderOptimizationRound[]) {
  const skewActual = calcRange(allExBrokers, (x) => x.actualLeader);
  const skewPlannedInCluster = calcRange(allExBrokers, (x) => x.plannedLeader);
  // biome-ignore lint/suspicious/noConsole: intentional console usage
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

    log: optimizationLog,
  });
}

/**
 * Plans replica placement, then balances leadership without changing replica
 * membership. The selected replicas are subtracted from broker usage before
 * placing them again; an offline replica's estimated size is used when its log
 * directory is missing.
 *
 * Placement ranks unused brokers first, then rack diversity, replicas for the
 * topic, total replicas, existing broker, existing rack, and projected bytes.
 * The first preference that separates two brokers decides. A single replica or
 * a single rack can still make the partition unavailable if that broker or rack
 * goes down.
 */
export { computeReassignments };

function computeTopicAssignments(
  topicPartitions: TopicPartitions,
  targetBrokers: ExBroker[],
  allBrokers: ExBroker[],
  resultAssignments: { [partitionId: number]: PartitionAssignments }
) {
  const { topic, partitions } = topicPartitions;

  if (partitions.length === 0) {
    return;
  }

  const replicationFactor = topic.replicationFactor;
  if (replicationFactor <= 0) {
    return;
  }

  const brokerReplicaCount: BrokerReplicaCount[] = targetBrokers.map((b) => ({ broker: b, assignedReplicas: 0 }));

  partitions.sort((a, b) => a.id - b.id);
  for (const partition of partitions) {
    resultAssignments[partition.id].brokers = computeReplicaAssignments(
      partition,
      replicationFactor,
      brokerReplicaCount,
      allBrokers
    );
  }
}

type CandidateContext = {
  consumedBrokers: ExBroker[];
  sourceBrokers: ExBroker[];
  sourceRacks: string[];
  replicasInRack: (rack: string) => number;
};

type CandidateCriterion = (a: BrokerReplicaCount, b: BrokerReplicaCount, ctx: CandidateContext) => number;

const preferMatching = (aMatches: boolean, bMatches: boolean) => {
  if (aMatches && !bMatches) {
    return -1;
  }
  if (bMatches && !aMatches) {
    return 1;
  }
  return 0;
};

const preferLower = (aValue: number, bValue: number) => {
  if (aValue < bValue) {
    return -1;
  }
  if (bValue < aValue) {
    return 1;
  }
  return 0;
};

const CANDIDATE_CRITERIA: CandidateCriterion[] = [
  (a, b, ctx) => preferMatching(!ctx.consumedBrokers.includes(a.broker), !ctx.consumedBrokers.includes(b.broker)),

  (a, b, ctx) => preferLower(ctx.replicasInRack(a.broker.rack), ctx.replicasInRack(b.broker.rack)),

  (a, b) => preferLower(a.assignedReplicas, b.assignedReplicas),

  (a, b) => preferLower(a.broker.plannedReplicas, b.broker.plannedReplicas),

  (a, b, ctx) => preferMatching(ctx.sourceBrokers.includes(a.broker), ctx.sourceBrokers.includes(b.broker)),

  (a, b, ctx) => preferMatching(ctx.sourceRacks.includes(a.broker.rack), ctx.sourceRacks.includes(b.broker.rack)),

  (a, b) => preferLower(a.broker.plannedSize, b.broker.plannedSize),
];

function compareCandidates(a: BrokerReplicaCount, b: BrokerReplicaCount, ctx: CandidateContext) {
  for (const criterion of CANDIDATE_CRITERIA) {
    const order = criterion(a, b, ctx);
    if (order !== 0) {
      return order;
    }
  }

  return 0;
}

function takeBestBroker(brokerReplicaCount: BrokerReplicaCount[], ctx: CandidateContext, replicaSize: number) {
  brokerReplicaCount.sort((a, b) => compareCandidates(a, b, ctx));

  const bestTrackedBroker = brokerReplicaCount[0];
  const bestBroker = bestTrackedBroker.broker;
  bestTrackedBroker.assignedReplicas += 1;
  ctx.consumedBrokers.push(bestBroker);

  bestBroker.assignedReplicas += 1;
  bestBroker.assignedSize += replicaSize;

  return bestBroker;
}

function computeReplicaAssignments(
  partition: Partition,
  replicas: number,
  brokerReplicaCount: BrokerReplicaCount[],
  allBrokers: ExBroker[]
) {
  // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
  const sourceBrokers = partition.replicas.map((id) => allBrokers.first((b) => b.brokerId === id)!);
  if (sourceBrokers.any((x) => x === null)) {
    throw new Error(
      `replicas of partition ${partition.id} (${toJson(partition.replicas)}) define a brokerId which can't be found in 'allBrokers': ${toJson(allBrokers.map((b) => ({ id: b.brokerId, address: b.address, rack: b.rack })))}`
    );
  }

  const ctx: CandidateContext = {
    consumedBrokers: [],
    sourceBrokers,
    sourceRacks: sourceBrokers.map((b) => b.rack).distinct(),
    replicasInRack: (rack: string) =>
      brokerReplicaCount.filter((x) => x.broker.rack === rack).sum((x) => x.assignedReplicas),
  };

  const resultBrokers: ExBroker[] = [];
  for (let i = 0; i < replicas; i++) {
    resultBrokers.push(takeBestBroker(brokerReplicaCount, ctx, partition.replicaSize));
  }

  resultBrokers[0].assignedLeader += 1;

  return resultBrokers;
}

function balanceLeaders(
  selectedTopicPartitions: TopicPartitions[],
  resultAssignments: TopicAssignments,
  allExBrokers: ExBroker[],
  apiData: ApiData
) {
  let leaderSwitchCount = 0;
  for (const t of selectedTopicPartitions) {
    for (const p of t.partitions) {
      if (balancePartitionLeader(resultAssignments[t.topic.topicName][p.id], p, allExBrokers, apiData)) {
        leaderSwitchCount += 1;
      }
    }
  }

  return leaderSwitchCount;
}

function balancePartitionLeader(
  assignment: PartitionAssignments,
  p: Partition,
  allExBrokers: ExBroker[],
  apiData: ApiData
) {
  const newBrokers = assignment.brokers.map(
    // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
    (b) => allExBrokers.first((e) => e.brokerId === b.brokerId)!
  );
  const plannedLeader = newBrokers[0];

  const sortedBrokers = newBrokers.slice(0);
  sortedBrokers.sort((a, b) => a.plannedLeader - b.plannedLeader);

  const betterLeader = sortedBrokers[0];
  if (betterLeader === plannedLeader) {
    return false;
  }

  swapLeader(newBrokers, betterLeader, p.replicaSize);

  assignment.brokers = newBrokers.map(
    // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
    (exBroker) => apiData.brokers.first((b) => b.brokerId === exBroker.brokerId)!
  );

  return true;
}

function swapLeader(newBrokers: ExBroker[], betterLeader: ExBroker, replicaSize: number) {
  const plannedLeader = newBrokers[0];
  const betterLeaderIndex = newBrokers.indexOf(betterLeader);
  if (betterLeaderIndex < 0) {
    throw new Error('cannot find new/best leader in exBroker array');
  }

  newBrokers[0] = betterLeader;
  newBrokers[betterLeaderIndex] = plannedLeader;

  plannedLeader.assignedLeader -= 1;
  plannedLeader.assignedSize -= replicaSize;
  betterLeader.assignedLeader += 1;
  betterLeader.assignedSize += replicaSize;
}

type RiskyPartition = {
  topic: Topic;
  partition: Partition;
  criticalRacks: string[];
  criticalBrokers: ExBroker[];
};

function findRiskyPartitions(
  targetBrokers: ExBroker[],
  selectedTopicPartitions: TopicPartitions[],
  resultAssignments: TopicAssignments,
  getExBroker: (id: number) => ExBroker
) {
  const targetRacks = targetBrokers.map((b) => b.rack).distinct();

  return selectedTopicPartitions
    .flatMap(({ topic, partitions }) =>
      partitions.map((partition) => {
        const replicaBrokers = resultAssignments[topic.topicName][partition.id].brokers.map((b) =>
          getExBroker(b.brokerId)
        );
        return assessPartitionRisk(topic, partition, replicaBrokers, targetBrokers, targetRacks);
      })
    )
    .filter((riskyPartition) => riskyPartition.criticalRacks.length > 0 || riskyPartition.criticalBrokers.length > 0);
}

function assessPartitionRisk(
  topic: Topic,
  partition: Partition,
  replicaBrokers: ExBroker[],
  targetBrokers: ExBroker[],
  targetRacks: string[]
) {
  return {
    topic,
    partition,
    criticalBrokers: targetBrokers.filter((b) => replicaBrokers.except([b]).length === 0),
    criticalRacks: targetRacks.filter((rack) => replicaBrokers.filter((x) => x.rack !== rack).length === 0),
  } satisfies RiskyPartition;
}

function reportRiskyPartitions(riskyPartitions: RiskyPartition[]) {
  for (const { key: topic, items: partitionIssues } of riskyPartitions.groupInto((x) => x.topic)) {
    if (topic.replicationFactor <= 1) {
      continue;
    }

    const issues = partitionIssues.filter((x) => x.criticalBrokers.length > 0 || x.criticalRacks.length > 0);
    if (issues.length === 0) {
      continue;
    }

    const table = issues.map((x) => ({
      partitionId: x.partition.id,
      criticalBrokers: x.criticalBrokers.map((b) => String(b.brokerId)).join(', '),
      criticalRacks: x.criticalRacks.join(', '),
    }));
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(`Issues in topic "${topic.topicName}" (RF: ${topic.replicationFactor}) (${issues.length} issues).`);
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.table(table);
  }
}

class ExBroker implements Broker {
  brokerId: number;
  logDirSize: number;
  address: string;
  rack: string;
  config: BrokerConfig;

  actualReplicas = 0;
  actualSize = 0;
  actualLeader = 0;

  initialReplicas = 0;
  initialSize = 0;
  initialLeader = 0;

  assignedReplicas = 0;
  assignedSize = 0;
  assignedLeader = 0;

  get plannedReplicas() {
    return this.initialReplicas + this.assignedReplicas;
  }
  get plannedSize() {
    return this.initialSize + this.assignedSize;
  }
  get plannedLeader() {
    return this.initialLeader + this.assignedLeader;
  }

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

    if (apiData.topicPartitions === null) {
      throw new Error(
        `cannot recompute actual usage of broker '${this.brokerId}' because 'api.topicPartitions == null' (no permissions?)`
      );
    }

    const actual = brokerUsage(allTopicPartitions(apiData.topicPartitions, this.brokerId), this.brokerId, () => 0);
    this.actualReplicas = actual.replicas;
    this.actualSize = actual.size;
    this.actualLeader = actual.leader;
  }

  private recomputeInitial(selectedTopicPartitions: TopicPartitions[]) {
    const selected = brokerUsage(
      selectedTopicPartitions.flatMap((topic) => topic.partitions),
      this.brokerId,
      (p) => p.replicaSize
    );

    this.initialReplicas = this.actualReplicas - selected.replicas;
    this.initialSize = this.actualSize - selected.size;
    this.initialLeader = this.actualLeader - selected.leader;
  }
}

function allTopicPartitions(topicPartitions: ApiData['topicPartitions'], brokerId: number) {
  return [...topicPartitions].flatMap(([topic, partitions]) => {
    if (partitions === null) {
      throw new Error(
        `cannot recompute actual usage of broker '${brokerId}' for topic '${topic}', because 'partitions == null' (no permissions?)`
      );
    }
    return partitions;
  });
}

type BrokerUsage = { replicas: number; size: number; leader: number };

function brokerUsage(partitions: Partition[], brokerId: number, fallbackSize: (p: Partition) => number) {
  const usage: BrokerUsage = { replicas: 0, size: 0, leader: 0 };
  for (const p of partitions) {
    const replicasOnBroker = p.replicas.count((x) => x === brokerId);
    usage.replicas += replicasOnBroker;
    usage.leader += p.leader === brokerId ? 1 : 0;

    if (replicasOnBroker > 0) {
      const logDirEntry = p.partitionLogDirs.first((x) => !x.error && x.brokerId === brokerId);
      usage.size += logDirEntry ? logDirEntry.size : fallbackSize(p);
    }
  }
  return usage;
}

function checkApiData(apiData: ApiData) {
  throwIfNullOrEmpty('apiData.brokers', apiData.brokers);
  throwIfNullOrEmpty('apiData.topics', apiData.topics);
  throwIfNullOrEmpty('apiData.topicPartitions', apiData.topicPartitions);
  const topicsMissingPartitionData = apiData.topics.filter((t) => apiData.topicPartitions.get(t.topicName) === null);
  if (topicsMissingPartitionData.length > 0) {
    throw new Error(
      `apiData is missing topicPartitions for these topics: ${topicsMissingPartitionData.map((t) => t.topicName).join(', ')}`
    );
  }
}

function checkArguments(apiData: ApiData, selectedTopicPartitions: TopicPartitions[], targetBrokers: Broker[]) {
  checkApiData(apiData);

  if (selectedTopicPartitions.sum((x) => x.partitions.length) === 0) {
    throw new Error('No partitions selected');
  }

  const maxRf = selectedTopicPartitions.groupInto((t) => t.topic.replicationFactor).sort((a, b) => b.key - a.key)[0];
  if (maxRf.key > targetBrokers.length) {
    throw new Error(
      `You selected ${targetBrokers.length} target brokers, but the following topics have a replicationFactor of ${maxRf.key}, so at least ${maxRf.key} target brokers are required: ${toJson(maxRf.items.map((t) => t.topic.topicName))}`
    );
  }
}

function throwIfNullOrEmpty(name: string, obj: unknown[] | Map<unknown, unknown>) {
  if (obj === null) {
    throw new Error(`${name} is null`);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      throw new Error(`${name} is empty`);
    }
  } else if (obj.size === 0) {
    throw new Error(`${name} is empty`);
  }
}

function calcRange<T>(ar: T[], selector: (item: T) => number) {
  if (ar.length === 0) {
    return {
      range: 0,
      min: undefined,
      minValue: 0,
      max: undefined,
      maxValue: 0,
    };
  }

  // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
  const max = ar.maxBy(selector)!;
  const maxVal = selector(max);

  // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
  const min = ar.minBy(selector)!;
  const minVal = selector(min);

  const range = maxVal - minVal;

  return {
    range,
    min,
    minValue: minVal,
    max,
    maxValue: maxVal,
  };
}
