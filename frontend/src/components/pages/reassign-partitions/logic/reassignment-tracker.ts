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

import { api } from '../../../../state/backend-api';
import type { Partition, PartitionReassignments } from '../../../../state/rest-interfaces';
import { IsDev } from '../../../../utils/env';
import { clone, toJson } from '../../../../utils/json-utils';

const refreshIntervals = {
  cluster: 6000,
  reassignments: 3000,
} as const;

export type ReassignmentState = {
  /** Stable ID matching the same reassignment across backend refreshes. */
  id: string;

  topicName: string;
  partitions: {
    partitionId: number;
    replicas: number[];
    addingReplicas: number[];
    removingReplicas: number[];

    /** Largest reported replica size, or -1 before metadata arrives. */
    maxReplicaSize: number;
    /** Bytes reported by each broker receiving a new replica. */
    currentSize: { brokerId: number; replicaSize: number }[];
  }[];

  /** Bytes to copy, counting each new replica separately. Writes to the leader can increase this and reduce progress. */
  totalTransferSize: number;

  /** Previous sample used with `remaining` to estimate speed and ETA. */
  remainingPrev: { value: number; timestamp: Date } | null;
  /** Latest sample of bytes still to copy. */
  remaining: { value: number; timestamp: Date } | null;

  /** Percentage transferred, or null before the first sample. */
  progressPercent: number | null;

  /** Estimated bytes transferred per second. */
  estimateSpeed: number | null;
  estimateCompletionTime: Date | null;

  actualTimeCompleted: Date | null;
};

/** Refreshes active reassignments and broker data, tracking transfer speed and ETA per reassignment. */
export class ReassignmentTracker {
  clusterTimer: number | null = null;
  reassignTimer: number | null = null;

  trackingReassignments: ReassignmentState[] = [];

  constructor() {
    this.refreshReassignments = this.refreshReassignments.bind(this);
    this.createReassignmentState = this.createReassignmentState.bind(this);
    this.stop = this.stop.bind(this);
    this.start = this.start.bind(this);
  }

  start() {
    const alreadyStarted = this.reassignTimer !== null;
    if (alreadyStarted) {
      return;
    }

    this.reassignTimer = window.setInterval(
      // biome-ignore lint/suspicious/noConsole: existing console error logging
      () => this.refreshReassignments().catch(console.error),
      refreshIntervals.reassignments
    );

    this.clusterTimer = window.setInterval(() => api.refreshCluster(true), refreshIntervals.cluster);

    setTimeout(async () => {
      await this.refreshReassignments();
      api.refreshCluster(true);
    });
  }

  async refreshReassignments() {
    await api.refreshPartitionReassignments(true);
    const liveReassignments = (clone(api.partitionReassignments) ?? []).map((r) => ({
      id: this.computeId(r),
      ...r,
    }));

    const topics = liveReassignments.map((r) => r.topicName);
    if (topics.length > 0) {
      await api.refreshPartitions(topics, true);
    }

    this.addNewReassignments(liveReassignments);
    this.markRemovedReassignmentsCompleted(liveReassignments);

    for (const r of this.trackingReassignments.slice()) {
      this.updateReassignmentState(r);
    }

    this.removeExpiredReassignments();
  }

  addNewReassignments(liveReassignments: (PartitionReassignments & { id: string })[]) {
    for (const r of liveReassignments) {
      const existingState = this.trackingReassignments.first((x) => x.id === r.id);
      if (existingState === null) {
        const state = this.createReassignmentState(r);
        this.trackingReassignments.push(state);
      }
    }
  }

  markRemovedReassignmentsCompleted(liveReassignments: { id: string }[]) {
    for (const r of this.trackingReassignments) {
      if (r.actualTimeCompleted !== null) {
        continue;
      }

      const live = liveReassignments.first((x) => x.id === r.id);
      if (!live) {
        r.actualTimeCompleted = new Date();
        r.progressPercent = 100;
        r.remaining = { value: 0, timestamp: new Date() };
      }
    }
  }

  removeExpiredReassignments() {
    this.trackingReassignments = this.trackingReassignments.filter((x) => {
      if (x.actualTimeCompleted === null) {
        return true;
      }
      const age = (Date.now() - x.actualTimeCompleted.getTime()) / 1000;
      return !(age > 8 && IsDev);
    });
  }

  createReassignmentState(r: PartitionReassignments) {
    const state: ReassignmentState = {
      id: this.computeId(r),

      topicName: r.topicName,
      partitions: r.partitions.map((p) => ({
        partitionId: p.partitionId,
        replicas: p.replicas,
        addingReplicas: p.addingReplicas,
        removingReplicas: p.removingReplicas,

        maxReplicaSize: -1,
        currentSize: [],
      })),

      totalTransferSize: -1,
      remaining: null,
      remainingPrev: null,
      progressPercent: null,

      estimateSpeed: null,
      estimateCompletionTime: null,
      actualTimeCompleted: null,
    };
    return state;
  }

  updateReassignmentState = updateReassignmentState;

  computeId = computeId;

  stop() {
    if (this.clusterTimer !== null) {
      window.clearInterval(this.clusterTimer);
      this.clusterTimer = null;
    }

    if (this.reassignTimer !== null) {
      window.clearInterval(this.reassignTimer);
      this.reassignTimer = null;
    }
  }
}

function updatePartitionSizes(state: ReassignmentState) {
  const topicPartitions = api.topicPartitions.get(state.topicName);
  for (const p of state.partitions) {
    const logDirs = topicPartitions?.first((e) => e.id === p.partitionId)?.partitionLogDirs.filter((l) => !l.error);
    if (!logDirs || logDirs.length === 0) {
      continue;
    }

    p.currentSize = sizesOnAddingBrokers(p.addingReplicas, logDirs);

    p.maxReplicaSize = logDirs.max((e) => e.size);
  }
}

function sizesOnAddingBrokers(addingReplicas: number[], logDirs: Partition['partitionLogDirs']) {
  return addingReplicas.map((b) => {
    const logDir = logDirs.first((l) => l.brokerId === b);
    return { brokerId: b, replicaSize: logDir && !logDir.error ? logDir.size : 0 };
  });
}

function updateRemaining(state: ReassignmentState) {
  state.totalTransferSize = state.partitions.sum((p) => p.maxReplicaSize * p.addingReplicas.length);

  const newTransferred = state.partitions.sum((p) => p.currentSize.sum((x) => x.replicaSize));
  const newRemaining = state.totalTransferSize - newTransferred;

  if (state.remainingPrev === null || state.remainingPrev.value !== newRemaining) {
    state.remainingPrev = state.remaining;
    state.remaining = { value: newRemaining, timestamp: new Date() };
    state.progressPercent = (1 - state.remaining.value / state.totalTransferSize) * 100;
  }
}

function updateEstimates(state: ReassignmentState) {
  if (state.remaining && state.remainingPrev && state.remaining.value !== state.remainingPrev.value) {
    const intervalSec = (state.remaining.timestamp.getTime() - state.remainingPrev.timestamp.getTime()) / 1000;
    const deltaRemaining = state.remaining.value - state.remainingPrev.value;
    state.estimateSpeed = -deltaRemaining / intervalSec;
  }

  if (state.estimateSpeed !== null && state.remaining !== null) {
    const remainingTimeSec = state.remaining.value / state.estimateSpeed;
    state.estimateCompletionTime = new Date(Date.now() + remainingTimeSec * 1000);
  }
}

function updateReassignmentState(state: ReassignmentState) {
  updatePartitionSizes(state);
  updateRemaining(state);
  updateEstimates(state);

  return state;
}

function computeId(r: PartitionReassignments) {
  const id: unknown[] = [];
  id.push(r.topicName);

  return toJson(id);
}
