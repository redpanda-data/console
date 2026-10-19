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
  type ShadowBoxSettings,
  ShadowBoxSettingsSchema,
  ShadowBoxState,
  type UpdateShadowBoxSettingsRequest,
} from 'protogen/redpanda/core/admin/v2/shadow_box_pb';

import { IsDev } from './env';

/**
 * Dev-only stand-in for the Shadow Box API, which no released Redpanda serves yet. State lives in
 * localStorage under a key Cloud UI's dev build reads too, so boxing a cluster in embedded Console
 * shows up on Cloud UI's pages. Cloud UI's copy of the read side is
 * `apps/cloud-ui/src/core/store/dev/shadow-box-simulator.ts` in cloudv2; keep the two in step.
 */
export const SHADOW_BOX_SIMULATOR_STORAGE_KEY = 'redpanda:shadow-box-simulator';
export const SHADOW_BOX_SIMULATOR_EVENT = 'redpanda:shadow-box-simulator-change';

export type SimulatorOptions = {
  brokerCount: number;
  /** The last broker never confirms, so Box stays in Boxing and that broker reports an error. */
  unreachableBroker: boolean;
  /** Box fails the way it does while a data migration is unfinished. */
  blockingMigration: boolean;
};

type SimulatedSettings = {
  exemptPrincipals: string[];
  allowAllReads: boolean;
  skipTransactionExpiration: boolean;
};

type SimulatedCluster = {
  revision: number;
  target: 'boxed' | 'unboxed';
  /** When the last finished transition completed; absent until the first one finishes. */
  settledAt: string | null;
  /** The change brokers are still applying, if any. A `null` delay is a broker that never confirms. */
  transition: { startedAt: string; brokerDelaysMs: (number | null)[] } | null;
  settings: SimulatedSettings;
};

type SimulatorState = {
  version: 1;
  enabled: boolean;
  options: SimulatorOptions;
  clusters: Record<string, SimulatedCluster>;
};

const DEFAULT_OPTIONS: SimulatorOptions = { brokerCount: 3, unreachableBroker: false, blockingMigration: false };

const DEFAULT_SETTINGS: SimulatedSettings = {
  exemptPrincipals: [],
  allowAllReads: false,
  skipTransactionExpiration: false,
};

const emptyState = (): SimulatorState => ({ version: 1, enabled: false, options: DEFAULT_OPTIONS, clusters: {} });

const readState = (): SimulatorState => {
  try {
    const raw = window.localStorage.getItem(SHADOW_BOX_SIMULATOR_STORAGE_KEY);
    if (!raw) {
      return emptyState();
    }
    const parsed = JSON.parse(raw) as Partial<SimulatorState>;
    if (parsed?.version !== 1) {
      return emptyState();
    }
    return {
      version: 1,
      enabled: parsed.enabled === true,
      options: { ...DEFAULT_OPTIONS, ...parsed.options },
      clusters: parsed.clusters ?? {},
    };
  } catch {
    return emptyState();
  }
};

const writeState = (state: SimulatorState) => {
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

export const setShadowBoxSimulatorOptions = (options: Partial<SimulatorOptions>) => {
  const state = readState();
  writeState({ ...state, options: { ...state.options, ...options } });
};

export const resetShadowBoxSimulator = () => {
  const state = readState();
  writeState({ ...state, clusters: {} });
};

const brokerDelays = (options: SimulatorOptions, stepMs: number): (number | null)[] =>
  Array.from({ length: options.brokerCount }, (_, index) => {
    if (options.unreachableBroker && index === options.brokerCount - 1) {
      return null;
    }
    return stepMs * (index + 1) + Math.round(Math.random() * 600);
  });

const transitionEnd = (transition: NonNullable<SimulatedCluster['transition']>): number | null => {
  if (transition.brokerDelaysMs.some((delay) => delay === null)) {
    return null;
  }
  return new Date(transition.startedAt).getTime() + Math.max(...(transition.brokerDelaysMs as number[]));
};

/** Folds a transition that has finished into the settled state, so the next change starts clean. */
const settle = (cluster: SimulatedCluster, now: number): SimulatedCluster => {
  if (!cluster.transition) {
    return cluster;
  }
  const end = transitionEnd(cluster.transition);
  if (end === null || end > now) {
    return cluster;
  }
  return { ...cluster, transition: null, settledAt: new Date(end).toISOString() };
};

const newCluster = (): SimulatedCluster => ({
  revision: -1,
  target: 'unboxed',
  settledAt: null,
  transition: null,
  settings: DEFAULT_SETTINGS,
});

const toSettings = (settings: SimulatedSettings): ShadowBoxSettings =>
  create(ShadowBoxSettingsSchema, {
    scope: { selection: { case: 'allResources', value: {} } },
    readPolicy: { exemptPrincipals: settings.exemptPrincipals, allowAllReads: settings.allowAllReads },
    skipTransactionExpiration: settings.skipTransactionExpiration,
  });

const finalState = (target: SimulatedCluster['target']) =>
  target === 'boxed' ? ShadowBoxState.BOXED : ShadowBoxState.UNBOXED;

const transitState = (target: SimulatedCluster['target']) =>
  target === 'boxed' ? ShadowBoxState.BOXING : ShadowBoxState.UNBOXING;

const boxMessage = (cluster: SimulatedCluster, now: number): ShadowBox => {
  const settled = settle(cluster, now);
  const inFlight = settled.transition;
  const changedAt = inFlight ? inFlight.startedAt : settled.settledAt;
  return create(ShadowBoxSchema, {
    state: inFlight ? transitState(settled.target) : finalState(settled.target),
    revision: BigInt(settled.revision),
    stateChangedAt: changedAt ? timestampFromDate(new Date(changedAt)) : undefined,
    settings: toSettings(settled.settings),
  });
};

const brokerMessages = (cluster: SimulatedCluster, options: SimulatorOptions, now: number): ShadowBoxBrokerStatus[] => {
  const leader = boxMessage(cluster, now);
  const inFlight = settle(cluster, now).transition;
  return Array.from({ length: options.brokerCount }, (_, nodeId) => {
    if (!inFlight) {
      return create(ShadowBoxBrokerStatusSchema, { nodeId, box: leader });
    }
    const delay = inFlight.brokerDelaysMs[nodeId];
    if (delay === null || delay === undefined) {
      return create(ShadowBoxBrokerStatusSchema, {
        nodeId,
        errorMessage: `Broker ${nodeId} did not answer: the request timed out`,
      });
    }
    const applied = now >= new Date(inFlight.startedAt).getTime() + delay;
    return create(ShadowBoxBrokerStatusSchema, {
      nodeId,
      box: applied
        ? create(ShadowBoxSchema, { ...leader, state: finalState(cluster.target) })
        : create(ShadowBoxSchema, {
            ...leader,
            revision: leader.revision - BigInt(1),
            state: cluster.target === 'boxed' ? ShadowBoxState.UNBOXED : ShadowBoxState.BOXED,
          }),
    });
  });
};

const assertRevision = (cluster: SimulatedCluster, expected: bigint | undefined) => {
  if (expected !== undefined && expected !== BigInt(cluster.revision)) {
    throw new ConnectError('Shadow boxing revision has changed', Code.FailedPrecondition);
  }
};

const applySettingsUpdate = (current: SimulatedSettings, request: UpdateShadowBoxSettingsRequest) => {
  const paths = request.updateMask?.paths ?? [];
  const incoming = request.settings;
  const replaceAll = paths.length === 0;
  const next = { ...current };
  if (replaceAll || paths.includes('read_policy')) {
    next.exemptPrincipals = incoming?.readPolicy?.exemptPrincipals ?? [];
    next.allowAllReads = incoming?.readPolicy?.allowAllReads ?? false;
  }
  if (!replaceAll && paths.includes('read_policy.exempt_principals')) {
    next.exemptPrincipals = Array.from(
      new Set([...current.exemptPrincipals, ...(incoming?.readPolicy?.exemptPrincipals ?? [])])
    );
  }
  if (!replaceAll && paths.includes('read_policy.allow_all_reads')) {
    next.allowAllReads = incoming?.readPolicy?.allowAllReads ?? false;
  }
  if (replaceAll || paths.includes('skip_transaction_expiration')) {
    next.skipTransactionExpiration = incoming?.skipTransactionExpiration ?? false;
  }
  return next;
};

const sameSettings = (a: SimulatedSettings, b: SimulatedSettings) =>
  a.allowAllReads === b.allowAllReads &&
  a.skipTransactionExpiration === b.skipTransactionExpiration &&
  a.exemptPrincipals.length === b.exemptPrincipals.length &&
  a.exemptPrincipals.every((principal, index) => principal === b.exemptPrincipals[index]);

const SIMULATED_LATENCY_MS = 180;
const BOX_STEP_MS = 1400;
const UNBOX_STEP_MS = 800;

const withLatency = async <T>(work: () => T): Promise<T> => {
  await new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));
  return work();
};

/**
 * A transport that answers `ShadowBoxService` from the simulator, keyed by cluster so each embedded
 * cluster keeps its own box.
 */
export const createShadowBoxSimulatorTransport = (clusterKey: string): Transport =>
  createRouterTransport(({ service }) => {
    const mutate = (
      change: (cluster: SimulatedCluster, options: SimulatorOptions, now: number) => SimulatedCluster
    ) => {
      const state = readState();
      const now = Date.now();
      const current = settle(state.clusters[clusterKey] ?? newCluster(), now);
      const next = change(current, state.options, now);
      writeState({ ...state, clusters: { ...state.clusters, [clusterKey]: next } });
      return boxMessage(next, now);
    };

    service(ShadowBoxService, {
      getShadowBoxStatus: () =>
        withLatency(() => {
          const state = readState();
          const now = Date.now();
          const cluster = state.clusters[clusterKey] ?? newCluster();
          return create(GetShadowBoxStatusResponseSchema, {
            box: boxMessage(cluster, now),
            brokers: brokerMessages(cluster, state.options, now),
          });
        }),
      updateShadowBoxSettings: (request) =>
        withLatency(() => ({
          box: mutate((cluster, options, now) => {
            assertRevision(cluster, request.expectedRevision);
            const settings = applySettingsUpdate(cluster.settings, request);
            if (sameSettings(settings, cluster.settings)) {
              return cluster;
            }
            const reboxing = cluster.target === 'boxed';
            return {
              ...cluster,
              settings,
              revision: cluster.revision + 1,
              transition: reboxing
                ? { startedAt: new Date(now).toISOString(), brokerDelaysMs: brokerDelays(options, BOX_STEP_MS) }
                : cluster.transition,
            };
          }),
        })),
      box: (request) =>
        withLatency(() => ({
          box: mutate((cluster, options, now) => {
            assertRevision(cluster, request.expectedRevision);
            if (cluster.target === 'boxed') {
              return cluster;
            }
            if (options.blockingMigration) {
              throw new ConnectError(
                'Cannot box the cluster while data migration 7 is unfinished. Wait for the migration to finish, then box the cluster.',
                Code.FailedPrecondition
              );
            }
            return {
              ...cluster,
              target: 'boxed',
              revision: cluster.revision + 1,
              transition: {
                startedAt: new Date(now).toISOString(),
                brokerDelaysMs: brokerDelays(options, BOX_STEP_MS),
              },
            };
          }),
        })),
      unbox: (request) =>
        withLatency(() => ({
          box: mutate((cluster, options, now) => {
            assertRevision(cluster, request.expectedRevision);
            if (cluster.target === 'unboxed') {
              return cluster;
            }
            return {
              ...cluster,
              target: 'unboxed',
              revision: cluster.revision + 1,
              transition: {
                startedAt: new Date(now).toISOString(),
                brokerDelaysMs: brokerDelays({ ...options, unreachableBroker: false }, UNBOX_STEP_MS),
              },
            };
          }),
        })),
    });
  });
