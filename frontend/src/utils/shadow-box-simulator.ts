/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError, createRouterTransport, type Transport } from '@connectrpc/connect';
import { ShadowBoxService } from 'protogen/redpanda/api/console/v1alpha1/shadowbox_pb';
import {
  GetShadowBoxStatusResponseSchema,
  type ShadowBox,
  type ShadowBoxBrokerStatus,
  ShadowBoxBrokerStatusSchema,
  ShadowBoxSchema,
  ShadowBoxSettingsSchema,
  ShadowBoxState,
  type UpdateShadowBoxSettingsRequest,
} from 'protogen/redpanda/core/admin/v2/shadow_box_pb';

import { IsDev } from './env';

/**
 * Dev-only stand-in for the Shadow Box API, which no released Redpanda serves yet. It follows the
 * API as documented: the controller leader records each change at a new revision, each broker picks
 * it up on its own, and a move finishes only once every broker's copy matches, so a broker that's
 * down holds it for as long as it's down. State lives in localStorage under a key Cloud UI's dev build
 * reads too, so boxing a cluster in embedded Console shows up on Cloud UI's pages. Cloud UI's read
 * side, `apps/cloud-ui/src/core/store/dev/shadow-box-simulator.ts` in cloudv2, follows the same
 * record and rules; keep the two in step.
 */
export const SHADOW_BOX_SIMULATOR_STORAGE_KEY = 'redpanda:shadow-box-simulator';
export const SHADOW_BOX_SIMULATOR_EVENT = 'redpanda:shadow-box-simulator-change';

type SimState =
  | 'SHADOW_BOX_STATE_UNBOXED'
  | 'SHADOW_BOX_STATE_BOXING'
  | 'SHADOW_BOX_STATE_BOXED'
  | 'SHADOW_BOX_STATE_UNBOXING';

type SimSettings = { exemptPrincipals: string[]; allowAllReads: boolean; skipTransactionExpiration: boolean };

type SimCopy = { state: SimState; revision: string; settings: SimSettings };

type SimBroker = {
  copy: SimCopy;
  /** The change this broker hasn't picked up yet, and when it will. Applied on read once `at` passes and the broker is up. */
  pending: { copy: SimCopy; at: string } | null;
};

type SimBox = SimCopy & { stateChangedAt: string | null };

type SimCluster = {
  /** The box as the controller leader recorded it at the last change. */
  box: SimBox;
  /** Keyed by node id. */
  brokers: Record<string, SimBroker>;
};

/** Box fails with FAILED_PRECONDITION for one of the reasons the API gives. */
export type SimBoxFailure =
  | 'feature-inactive'
  | 'own-shadow-link'
  | 'data-migration'
  | 'cluster-recovery'
  | 'read-replica';

export type SimulatorOptions = {
  /** Node ids run from 1; broker 1 answers every call. */
  brokerCount: number;
  /** Brokers that don't answer. A down broker never picks up a change, so it holds any move. */
  downBrokers: number[];
  boxFailure: SimBoxFailure | null;
  /** No controller leader: GetShadowBoxStatus and every change return UNAVAILABLE. */
  noLeader: boolean;
  /** Changes apply, then return DEADLINE_EXCEEDED, the way a call over 5 seconds does. */
  slowCalls: boolean;
};

type SimulatorRecord = {
  version: 2;
  enabled: boolean;
  options: SimulatorOptions;
  clusters: Record<string, SimCluster>;
};

const UNBOXED: SimState = 'SHADOW_BOX_STATE_UNBOXED';
const BOXING: SimState = 'SHADOW_BOX_STATE_BOXING';
const BOXED: SimState = 'SHADOW_BOX_STATE_BOXED';
const UNBOXING: SimState = 'SHADOW_BOX_STATE_UNBOXING';

const FINAL_STATE: Partial<Record<SimState, SimState>> = { [BOXING]: BOXED, [UNBOXING]: UNBOXED };

const DEFAULT_OPTIONS: SimulatorOptions = {
  brokerCount: 3,
  downBrokers: [],
  boxFailure: null,
  noLeader: false,
  slowCalls: false,
};

const DEFAULT_SETTINGS: SimSettings = { exemptPrincipals: [], allowAllReads: false, skipTransactionExpiration: false };

const BOX_FAILURE_MESSAGE: Record<SimBoxFailure, string> = {
  'feature-inactive': 'shadow boxing is not active until every broker runs v26.3.1',
  'own-shadow-link': 'cannot start while a shadow link is configured',
  'data-migration': 'cannot start while data migration 7 is unfinished',
  'cluster-recovery': 'cannot start while a cluster recovery is running',
  'read-replica': "topic orders-replica uses a storage mode shadow boxing doesn't support (read replica)",
};

const DOWN_BROKER_MESSAGE = 'rpc::errc::disconnected_endpoint(node down)';

const emptyRecord = (): SimulatorRecord => ({ version: 2, enabled: false, options: DEFAULT_OPTIONS, clusters: {} });

const readState = (): SimulatorRecord => {
  try {
    const raw = window.localStorage.getItem(SHADOW_BOX_SIMULATOR_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SimulatorRecord>) : null;
    if (parsed?.version !== 2) {
      return emptyRecord();
    }
    return {
      version: 2,
      enabled: parsed.enabled === true,
      options: { ...DEFAULT_OPTIONS, ...parsed.options },
      clusters: parsed.clusters ?? {},
    };
  } catch {
    return emptyRecord();
  }
};

const writeState = (state: SimulatorRecord) => {
  try {
    window.localStorage.setItem(SHADOW_BOX_SIMULATOR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent(SHADOW_BOX_SIMULATOR_EVENT));
};

export const isShadowBoxSimulatorEnabled = (): boolean => Boolean(IsDev) && readState().enabled;

export const getShadowBoxSimulatorOptions = (): SimulatorOptions => readState().options;

export const setShadowBoxSimulatorEnabled = (enabled: boolean) => {
  writeState({ ...readState(), enabled });
};

const REVIVED_PICKUP_MS = 800;

/** A broker brought back picks up the change it missed straight away, as a restarted broker does. */
const reviveBrokers = (clusters: Record<string, SimCluster>, revived: number[], now: number) => {
  if (revived.length === 0) {
    return clusters;
  }
  const soon = now + REVIVED_PICKUP_MS;
  return Object.fromEntries(
    Object.entries(clusters).map(([id, cluster]) => {
      const brokers = { ...cluster.brokers };
      for (const nodeId of revived) {
        const broker = brokers[String(nodeId)];
        if (broker?.pending && Date.parse(broker.pending.at) < soon) {
          brokers[String(nodeId)] = { ...broker, pending: { ...broker.pending, at: new Date(soon).toISOString() } };
        }
      }
      return [id, { ...cluster, brokers }];
    })
  );
};

export const setShadowBoxSimulatorOptions = (options: Partial<SimulatorOptions>) => {
  const state = readState();
  const next = { ...state.options, ...options };
  const revived = state.options.downBrokers.filter((nodeId) => !next.downBrokers.includes(nodeId));
  writeState({ ...state, options: next, clusters: reviveBrokers(state.clusters, revived, Date.now()) });
};

export const resetShadowBoxSimulator = () => {
  writeState({ ...readState(), clusters: {} });
};

const nodeIds = (options: SimulatorOptions) => Array.from({ length: options.brokerCount }, (_, index) => index + 1);

const newCluster = (): SimCluster => ({
  box: { state: UNBOXED, revision: '-1', stateChangedAt: null, settings: DEFAULT_SETTINGS },
  brokers: {},
});

const storedBroker = (cluster: SimCluster, nodeId: number): SimBroker =>
  cluster.brokers[String(nodeId)] ?? {
    copy: { state: UNBOXED, revision: '-1', settings: cluster.box.settings },
    pending: null,
  };

const copyOf = (box: SimBox, state = box.state): SimCopy => ({ state, revision: box.revision, settings: box.settings });

const pickedUp = (broker: SimBroker, now: number) => broker.pending !== null && now >= Date.parse(broker.pending.at);

type ComputedBroker = { nodeId: number; copy?: SimCopy; errorMessage?: string };

type ComputedStatus = { box: SimBox; brokers: ComputedBroker[] };

/** The status at `now`: each broker's copy, and the cluster's box, finished once every broker's copy matches. */
const computeStatus = (cluster: SimCluster, options: SimulatorOptions, now: number): ComputedStatus => {
  let lastPickup = 0;
  const brokers = nodeIds(options).map((nodeId): ComputedBroker => {
    if (options.downBrokers.includes(nodeId)) {
      return { nodeId, errorMessage: DOWN_BROKER_MESSAGE };
    }
    const broker = storedBroker(cluster, nodeId);
    if (broker.pending && pickedUp(broker, now)) {
      lastPickup = Math.max(lastPickup, Date.parse(broker.pending.at));
      return { nodeId, copy: broker.pending.copy };
    }
    return { nodeId, copy: broker.copy };
  });
  const final = FINAL_STATE[cluster.box.state];
  const matches = (copy: SimCopy | undefined) =>
    copy !== undefined && copy.state === cluster.box.state && copy.revision === cluster.box.revision;
  if (final === undefined || !brokers.every((broker) => matches(broker.copy))) {
    return { box: cluster.box, brokers };
  }
  const box: SimBox = { ...cluster.box, state: final, stateChangedAt: new Date(lastPickup || now).toISOString() };
  return { box, brokers: brokers.map(({ nodeId }) => ({ nodeId, copy: copyOf(box) })) };
};

/** Folds the status at `now` back into the record, so the next change starts from what brokers have. */
const settle = (cluster: SimCluster, options: SimulatorOptions, now: number): SimCluster => {
  const status = computeStatus(cluster, options, now);
  const finished = status.box !== cluster.box;
  const brokers = Object.fromEntries(
    nodeIds(options).map((nodeId) => {
      const stored = storedBroker(cluster, nodeId);
      if (finished) {
        return [String(nodeId), { copy: copyOf(status.box), pending: null }];
      }
      const up = !options.downBrokers.includes(nodeId);
      return [
        String(nodeId),
        up && stored.pending && pickedUp(stored, now) ? { copy: stored.pending.copy, pending: null } : stored,
      ];
    })
  );
  return { box: status.box, brokers };
};

const randomInt = (max: number) => Math.floor(Math.random() * (max + 1));

/** Revisions grow by uneven steps, so nothing can treat one as a count of changes. */
const nextRevision = (revision: string) => String(BigInt(revision) + BigInt(2 + randomInt(8)));

const BOX_STEP_MS = 1400;
const UNBOX_STEP_MS = 800;
const SETTINGS_ONLY_MS = 300;

/** Every broker gets the change; broker n picks it up a little after broker n − 1. */
const withPending = (
  cluster: SimCluster,
  options: SimulatorOptions,
  copy: SimCopy,
  now: number,
  stepMs: number | null
): SimCluster['brokers'] =>
  Object.fromEntries(
    nodeIds(options).map((nodeId) => {
      const delay = stepMs === null ? SETTINGS_ONLY_MS : stepMs * nodeId + randomInt(600);
      return [
        String(nodeId),
        { copy: storedBroker(cluster, nodeId).copy, pending: { copy, at: new Date(now + delay).toISOString() } },
      ];
    })
  );

const startMove = (cluster: SimCluster, options: SimulatorOptions, state: SimState, now: number): SimCluster => {
  const box: SimBox = {
    ...cluster.box,
    state,
    revision: nextRevision(cluster.box.revision),
    stateChangedAt: new Date(now).toISOString(),
  };
  const stepMs = state === BOXING ? BOX_STEP_MS : UNBOX_STEP_MS;
  return { box, brokers: withPending(cluster, options, copyOf(box), now, stepMs) };
};

type SimReadPolicy = Pick<SimSettings, 'exemptPrincipals' | 'allowAllReads'>;

/** An empty mask replaces the whole policy, as `read_policy` does; `read_policy.exempt_principals` only adds names. */
const applyReadPolicyUpdate = (
  current: SimReadPolicy,
  request: UpdateShadowBoxSettingsRequest,
  paths: string[]
): SimReadPolicy => {
  const incoming = request.settings?.readPolicy;
  const next = { exemptPrincipals: current.exemptPrincipals, allowAllReads: current.allowAllReads };
  if (paths.length === 0 || paths.includes('read_policy')) {
    next.exemptPrincipals = incoming?.exemptPrincipals ?? [];
    next.allowAllReads = incoming?.allowAllReads ?? false;
  }
  if (paths.includes('read_policy.exempt_principals')) {
    next.exemptPrincipals = Array.from(new Set([...current.exemptPrincipals, ...(incoming?.exemptPrincipals ?? [])]));
  }
  if (paths.includes('read_policy.allow_all_reads')) {
    next.allowAllReads = incoming?.allowAllReads ?? false;
  }
  return next;
};

const applySettingsUpdate = (current: SimSettings, request: UpdateShadowBoxSettingsRequest): SimSettings => {
  const paths = request.updateMask?.paths ?? [];
  const replacesSkip = paths.length === 0 || paths.includes('skip_transaction_expiration');
  return {
    ...applyReadPolicyUpdate(current, request, paths),
    skipTransactionExpiration: replacesSkip
      ? (request.settings?.skipTransactionExpiration ?? false)
      : current.skipTransactionExpiration,
  };
};

const sameSettings = (a: SimSettings, b: SimSettings) =>
  a.allowAllReads === b.allowAllReads &&
  a.skipTransactionExpiration === b.skipTransactionExpiration &&
  a.exemptPrincipals.length === b.exemptPrincipals.length &&
  a.exemptPrincipals.every((principal, index) => principal === b.exemptPrincipals[index]);

/**
 * While boxing or boxed, new settings put the cluster back in Boxing until every broker has them;
 * brokers keep blocking on their old copy meanwhile. Otherwise the state stays as it is.
 */
const changeSettings = (
  cluster: SimCluster,
  options: SimulatorOptions,
  settings: SimSettings,
  now: number
): SimCluster => {
  const blocking = cluster.box.state === BOXING || cluster.box.state === BOXED;
  const box: SimBox = {
    state: blocking ? BOXING : cluster.box.state,
    revision: nextRevision(cluster.box.revision),
    stateChangedAt: cluster.box.state === BOXED ? new Date(now).toISOString() : cluster.box.stateChangedAt,
    settings,
  };
  return { box, brokers: withPending(cluster, options, copyOf(box), now, blocking ? BOX_STEP_MS : null) };
};

const STATE_ENUM: Record<SimState, ShadowBoxState> = {
  [UNBOXED]: ShadowBoxState.UNBOXED,
  [BOXING]: ShadowBoxState.BOXING,
  [BOXED]: ShadowBoxState.BOXED,
  [UNBOXING]: ShadowBoxState.UNBOXING,
};

const toBoxMessage = (copy: SimCopy & { stateChangedAt?: string | null }): ShadowBox =>
  create(ShadowBoxSchema, {
    state: STATE_ENUM[copy.state],
    revision: BigInt(copy.revision),
    stateChangedAt: copy.stateChangedAt ? timestampFromDate(new Date(copy.stateChangedAt)) : undefined,
    settings: create(ShadowBoxSettingsSchema, {
      scope: { selection: { case: 'allResources', value: {} } },
      readPolicy: { exemptPrincipals: copy.settings.exemptPrincipals, allowAllReads: copy.settings.allowAllReads },
      skipTransactionExpiration: copy.settings.skipTransactionExpiration,
    }),
  });

const toBrokerMessage = (broker: ComputedBroker): ShadowBoxBrokerStatus =>
  create(ShadowBoxBrokerStatusSchema, {
    nodeId: broker.nodeId,
    box: broker.copy ? toBoxMessage(broker.copy) : undefined,
    errorMessage: broker.errorMessage,
  });

const assertRevision = (cluster: SimCluster, expected: bigint | undefined) => {
  if (expected !== undefined && expected !== BigInt(cluster.box.revision)) {
    throw new ConnectError('Shadow boxing revision has changed', Code.FailedPrecondition);
  }
};

const noLeaderError = () => new ConnectError('no controller leader', Code.Unavailable);

/** The record, for a call that needs the controller leader. */
const readLeaderState = (): SimulatorRecord => {
  const state = readState();
  if (state.options.noLeader) {
    throw noLeaderError();
  }
  return state;
};

const SIMULATED_LATENCY_MS = 180;

const withLatency = async <T>(work: () => T): Promise<T> => {
  await new Promise((resolve) => {
    setTimeout(resolve, SIMULATED_LATENCY_MS);
  });
  return work();
};

/**
 * A transport that answers `ShadowBoxService` from the simulator, keyed by cluster so each embedded
 * cluster keeps its own box.
 */
export const createShadowBoxSimulatorTransport = (clusterKey: string): Transport =>
  createRouterTransport(({ service }) => {
    /** A change that returns the cluster unchanged is a no-op, and leaves the record alone. */
    const mutate = (change: (cluster: SimCluster, options: SimulatorOptions, now: number) => SimCluster) => {
      const state = readLeaderState();
      const now = Date.now();
      const current = settle(state.clusters[clusterKey] ?? newCluster(), state.options, now);
      const next = change(current, state.options, now);
      if (next === current) {
        return toBoxMessage(current.box);
      }
      writeState({ ...state, clusters: { ...state.clusters, [clusterKey]: next } });
      if (state.options.slowCalls) {
        throw new ConnectError('the request took longer than 5s', Code.DeadlineExceeded);
      }
      return toBoxMessage(next.box);
    };

    const statusOf = (state: SimulatorRecord) =>
      computeStatus(state.clusters[clusterKey] ?? newCluster(), state.options, Date.now());

    service(ShadowBoxService, {
      getShadowBoxStatus: () =>
        withLatency(() => {
          const status = statusOf(readLeaderState());
          return create(GetShadowBoxStatusResponseSchema, {
            box: toBoxMessage(status.box),
            brokers: status.brokers.map(toBrokerMessage),
          });
        }),
      getShadowBoxBrokerStatus: (request) =>
        withLatency(() => {
          const state = readState();
          const nodeId = request.nodeId ?? 1;
          if (!nodeIds(state.options).includes(nodeId)) {
            throw new ConnectError(`broker ${nodeId} is not a cluster member`, Code.NotFound);
          }
          const broker = statusOf(state).brokers.find((candidate) => candidate.nodeId === nodeId);
          if (!broker?.copy) {
            throw new ConnectError(`broker ${nodeId} did not answer`, Code.Unavailable);
          }
          return { broker: toBrokerMessage(broker) };
        }),
      updateShadowBoxSettings: (request) =>
        withLatency(() => ({
          box: mutate((cluster, options, now) => {
            assertRevision(cluster, request.expectedRevision);
            const settings = applySettingsUpdate(cluster.box.settings, request);
            return sameSettings(settings, cluster.box.settings)
              ? cluster
              : changeSettings(cluster, options, settings, now);
          }),
        })),
      box: (request) =>
        withLatency(() => ({
          box: mutate((cluster, options, now) => {
            assertRevision(cluster, request.expectedRevision);
            if (cluster.box.state === BOXING || cluster.box.state === BOXED) {
              return cluster;
            }
            if (options.boxFailure) {
              throw new ConnectError(BOX_FAILURE_MESSAGE[options.boxFailure], Code.FailedPrecondition);
            }
            return startMove(cluster, options, BOXING, now);
          }),
        })),
      unbox: (request) =>
        withLatency(() => ({
          box: mutate((cluster, options, now) => {
            assertRevision(cluster, request.expectedRevision);
            if (cluster.box.state === UNBOXING || cluster.box.state === UNBOXED) {
              return cluster;
            }
            return startMove(cluster, options, UNBOXING, now);
          }),
        })),
    });
  });
