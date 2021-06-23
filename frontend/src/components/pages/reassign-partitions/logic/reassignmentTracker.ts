
// Helper class
// - manages timers for refreshing current reassignments
// - tracks progress history for each reassignment to estimate speed and ETA

import { autorun, IReactionDisposer, observable, transaction, untracked } from "mobx";
import { api } from "../../../../state/backendApi";
import { PartitionReassignments } from "../../../../state/restInterfaces";
import { clone, toJson } from "../../../../utils/jsonUtils";

const refreshIntervals = {
    cluster: 6000,
    reassignments: 4000,
    // partitions = automatic, same as reassignment
} as const;


export interface ReassignmentState {
    id: string; // used to match instances of 'ReassignmentState' and 'PartitionReassignments'

    topicName: string;
    partitions: {
        partitionId: number;
        replicas: number[];
        addingReplicas: number[];
        removingReplicas: number[];

        // computed
        maxReplicaSize: number; // max size of one replica
        currentSize: { brokerId: number, replicaSize: number; }[]; // size as reported by each *new* broker
    }[];


    // computed

    // sum of total network traffic:
    // meaning that partitions that are being added to multiple new brokers,
    // will also be counted multiple times.
    // This value can actually increase while the reassignment is in progress (because data is being written to the leader),
    // which in turn can cause the progress to actually go backwards!
    totalTransferSize: number;

    // total remaining bytes that have to be transferred
    // we use this to calculate estimated speed and ETA since it also includes the (potentially changing) totalTransferSize
    remainingPrev: { value: number; timestamp: Date } | null;
    remaining: { value: number; timestamp: Date } | null;

    // 1 - (remaining / totalTransferSize)
    progressPercent: number | null;

    estimateSpeed: number | null; // in bytes per second
    estimateCompletionTime: Date | null;

    // set when a reassignment has completed
    actualTimeCompleted: Date | null;
}


export class ReassignmentTracker {
    clusterTimer: NodeJS.Timer | null = null;
    reassignTimer: NodeJS.Timer | null = null;

    @observable trackingReassignments: ReassignmentState[] = [];


    constructor() {
        this.refreshReassignments = this.refreshReassignments.bind(this);
        this.createReassignmentState = this.createReassignmentState.bind(this);
        this.updateReassignmentState = this.updateReassignmentState.bind(this);
        this.computeId = this.computeId.bind(this);
        this.stop = this.stop.bind(this);
        this.start = this.start.bind(this);
    }

    start() {
        const alreadyStarted = this.reassignTimer != null;
        if (alreadyStarted) return;

        // Active reassignments
        this.reassignTimer = setInterval(() => this.refreshReassignments(), refreshIntervals.reassignments);

        // Broker status
        this.clusterTimer = setInterval(() => api.refreshCluster(true), refreshIntervals.cluster);

        // Immediately refresh as well
        setImmediate(() => {
            this.refreshReassignments();
            api.refreshCluster(true);
        });
    }

    async refreshReassignments() { // timer

        // Save current state, refresh, save new state
        await api.refreshPartitionReassignments(true);
        const liveReassignments = (clone(api.partitionReassignments) ?? [])
            .map(r => ({ id: this.computeId(r), ...r }));

        // Update relevant topic-partitions
        const topics = liveReassignments.map(r => r.topicName);
        if (topics.length > 0) await api.refreshPartitions(topics, true);

        transaction(() => {
            // Add new reassignments
            for (const r of liveReassignments) {
                const existingState = this.trackingReassignments.first(x => x.id == r.id);
                if (existingState == null) {
                    // console.log('adding new state', { id: r.id, reassignment: r });
                    const state = this.createReassignmentState(r);
                    this.trackingReassignments.push(state);
                }
            }

            // Mark removed reassignments as completed
            for (const r of this.trackingReassignments) {
                if (r.actualTimeCompleted != null) continue; // no need to the ones already marked as completed

                const live = liveReassignments.first(x => x.id == r.id);
                if (!live) {
                    // this tracked reassignment does not exist in the live assignments anymore
                    r.actualTimeCompleted = new Date();
                    r.progressPercent = 100;
                }
            }

            // Update running reassignments
            for (const r of this.trackingReassignments.slice()) {
                this.updateReassignmentState(r);
            }

            // Remove reassignments that are in completed state for >10sec
            const expiredTrackers = this.trackingReassignments.filter(x => {
                if (x.actualTimeCompleted == null) return false; // not yet complete
                const age = (new Date().getTime() - x.actualTimeCompleted.getTime()) / 1000;
                return age > 10;
            });
            this.trackingReassignments.removeAll(x => expiredTrackers.includes(x));

        });
    }

    createReassignmentState(r: PartitionReassignments): ReassignmentState {
        return {
            id: this.computeId(r),

            topicName: r.topicName,
            partitions: r.partitions.map(p => ({
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
    }

    updateReassignmentState(state: ReassignmentState) {

        // partition stats
        const topicPartitions = api.topicPartitions.get(state.topicName);
        for (const p of state.partitions) {
            const logDirs = topicPartitions?.first(e => e.id == p.partitionId)?.partitionLogDirs.filter(l => !l.error);
            if (!logDirs || logDirs.length == 0) continue;

            // current size (on new brokers)
            const newSizeOnBrokers: { brokerId: number; replicaSize: number; }[] = [];
            for (const b of p.addingReplicas) {
                const logDir = logDirs.first(l => l.brokerId == b);
                if (logDir && !logDir.error)
                    newSizeOnBrokers.push({ brokerId: b, replicaSize: logDir.size });
                else
                    newSizeOnBrokers.push({ brokerId: b, replicaSize: 0 });
            }
            p.currentSize = newSizeOnBrokers;

            // max size (on any broker)
            p.maxReplicaSize = logDirs.max(e => e.size);
        }

        // total transfer size (size of each partition multiplied by how many brokers need to receive that partition)
        state.totalTransferSize = state.partitions.sum(p => p.maxReplicaSize * p.addingReplicas.length);

        const newTransferred = state.partitions.sum(p => p.currentSize.sum(x => x.replicaSize));
        const newRemaining = state.totalTransferSize - newTransferred;

        if (state.remainingPrev == null || state.remainingPrev.value != newRemaining) {
            // only set a new transferred statistic when the new value is different from the previous one
            // otherwise we'd end up with the same value for prev and cur with different timestamps
            state.remainingPrev = state.remaining;
            state.remaining = { value: newRemaining, timestamp: new Date(), };
            state.progressPercent = (1 - (state.remaining.value / state.totalTransferSize)) * 100;
        }

        // estimate speed (only if we have cur and prev)
        if (state.remaining && state.remainingPrev && state.remaining.value != state.remainingPrev.value) {
            const intervalSec = (state.remaining.timestamp.getTime() - state.remainingPrev.timestamp.getTime()) / 1000;
            const deltaRemaining = state.remaining.value - state.remainingPrev.value;
            state.estimateSpeed = (deltaRemaining * -1) / intervalSec;
        }

        // estimate completion time
        if (state.estimateSpeed !== null && state.remaining !== null) {
            const remainingTimeSec = state.remaining.value / state.estimateSpeed;
            state.estimateCompletionTime = new Date(new Date().getTime() + (remainingTimeSec * 1000));
        }

        return state;
    }

    // compute a stable ID for a PartitionReassignment
    computeId(r: PartitionReassignments): string {
        const id: any[] = [];
        id.push(r.topicName);

        // for (const p of r.partitions)
        //     id.push(p.partitionId);

        return toJson(id);
    }

    stop() {
        if (this.clusterTimer !== null) {
            clearInterval(this.clusterTimer);
            this.clusterTimer = null;
        }

        if (this.reassignTimer !== null) {
            clearInterval(this.reassignTimer);
            this.reassignTimer = null;
        }
    }
}
