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

import { timestampDate } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError, type Transport } from '@connectrpc/connect';
import { callUnaryMethod, createConnectQueryKey, useQuery, useTransport } from '@connectrpc/connect-query';
import { type QueryClient, useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  BOX_SETTINGS_UPDATE_PATHS,
  type BoxPhase,
  type BoxSummary,
  getBrokerProgress,
  isBlockingPhase,
  isTransitionPhase,
  SHADOW_CLUSTER_CANT_BOX,
  sameBoxSettings,
  summarizeBox,
  toBoxPhase,
  UNBOXED_SUMMARY,
} from 'components/shadow-box/shadow-box-model';
import { config, isFeatureFlagEnabled, isServerless } from 'config';
import {
  box,
  getShadowBoxBrokerStatus,
  getShadowBoxStatus,
  unbox,
  updateShadowBoxSettings,
} from 'protogen/redpanda/api/console/v1alpha1/shadowbox-ShadowBoxService_connectquery';
import type { GetShadowBoxStatusResponse } from 'protogen/redpanda/core/admin/v2/shadow_box_pb';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { useShadowBoxStore } from 'stores/shadow-box-store';
import {
  createShadowBoxSimulatorTransport,
  isShadowBoxSimulatorEnabled,
  SHADOW_BOX_SIMULATOR_EVENT,
  SHADOW_BOX_SIMULATOR_STORAGE_KEY,
} from 'utils/shadow-box-simulator';

const TRANSITION_POLL_MS = 1500;
const STEADY_POLL_MS = 15_000;
/** A change still applying after this long is waiting on a broker that isn't answering, so ease off. */
const STALLED_TRANSITION_MS = 2 * 60 * 1000;
const STALLED_POLL_MS = 10_000;

const transitionPollMs = (data: GetShadowBoxStatusResponse | undefined): number => {
  const changedAt = data?.box?.stateChangedAt;
  const stalled = changedAt !== undefined && Date.now() - timestampDate(changedAt).getTime() > STALLED_TRANSITION_MS;
  return stalled ? STALLED_POLL_MS : TRANSITION_POLL_MS;
};

const subscribeToSimulator = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SHADOW_BOX_SIMULATOR_STORAGE_KEY) {
      onChange();
    }
  };
  window.addEventListener(SHADOW_BOX_SIMULATOR_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(SHADOW_BOX_SIMULATOR_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
};

/**
 * The Cutover tab reads the source's box through the host, or has the operator confirm it by hand,
 * so it needs only the flag: whether this shadow cluster serves the Shadow Box API doesn't matter.
 */
export const isCutoverAvailable = (): boolean => isFeatureFlagEnabled('enableShadowBoxing') && !isServerless();

const useShadowBoxSimulatorEnabled = () =>
  useSyncExternalStore(subscribeToSimulator, isShadowBoxSimulatorEnabled, () => false);

/**
 * Shadow boxing is shown when its flag is on and this cluster's backend serves the Shadow Box API,
 * or when the dev simulator stands in for it. Serverless clusters can't be shadow link sources.
 */
const useShadowBoxAvailability = (): boolean => {
  const supported = useSupportedFeaturesStore((state) => state.shadowBoxService);
  const simulated = useShadowBoxSimulatorEnabled();
  return isFeatureFlagEnabled('enableShadowBoxing') && !isServerless() && (supported || simulated);
};

/** One simulator transport per cluster, so every consumer shares the same status query. */
const simulatorTransports = new Map<string, Transport>();

const getSimulatorTransport = (clusterKey: string): Transport => {
  let transport = simulatorTransports.get(clusterKey);
  if (!transport) {
    transport = createShadowBoxSimulatorTransport(clusterKey);
    simulatorTransports.set(clusterKey, transport);
  }
  return transport;
};

const useShadowBoxTransport = () => {
  const transport = useTransport();
  const simulated = useShadowBoxSimulatorEnabled();
  return simulated ? getSimulatorTransport(config.clusterId ?? 'default') : transport;
};

const statusQueryKey = () => createConnectQueryKey({ schema: getShadowBoxStatus, cardinality: 'finite' });

const invalidateStatus = (queryClient: QueryClient, options?: { cancelRefetch: boolean }) =>
  queryClient.invalidateQueries({ queryKey: statusQueryKey(), exact: false }, options);

/** The API isn't there for this cluster, which reads as "no box to show", not as an error. */
const UNSUPPORTED_CODES = new Set([Code.Unimplemented, Code.NotFound]);

/** Not answered for this viewer, and asking again won't change that until they sign in as someone else. */
const isSettledReadError = (error: unknown): boolean =>
  error instanceof ConnectError && (UNSUPPORTED_CODES.has(error.code) || error.code === Code.PermissionDenied);

const isNoLeaderError = (error: unknown): boolean => error instanceof ConnectError && error.code === Code.Unavailable;

/** No controller leader is usually brief, so ask again soon. */
const NO_LEADER_POLL_MS = 5000;

/** Why the status can't be shown, when it can't. */
export type ShadowBoxAccess = 'ok' | 'unsupported' | 'forbidden';

const accessOf = (error: unknown): ShadowBoxAccess => {
  if (!(error instanceof ConnectError)) {
    return 'ok';
  }
  if (UNSUPPORTED_CODES.has(error.code)) {
    return 'unsupported';
  }
  return error.code === Code.PermissionDenied ? 'forbidden' : 'ok';
};

/** One broker's own copy, read straight from that broker while the cluster has no controller leader. */
export type BrokerOwnCopy = { nodeId?: number; phase?: BoxPhase; revision?: bigint; errorMessage?: string };

/**
 * GetShadowBoxStatus needs the controller leader; GetShadowBoxBrokerStatus doesn't. While the first
 * fails with UNAVAILABLE, this asks each broker the last status listed (or the broker that takes the
 * call, when none was) for its own copy, so Console still knows whether brokers are blocking.
 */
const useBrokerOwnCopies = (enabled: boolean, nodeIds: number[]) => {
  const transport = useShadowBoxTransport();
  const targets: (number | undefined)[] = nodeIds.length > 0 ? nodeIds : [undefined];
  const results = useQueries({
    queries: targets.map((nodeId) => ({
      queryKey: ['shadow-box-broker-status', nodeId ?? 'self'],
      queryFn: () => callUnaryMethod(transport, getShadowBoxBrokerStatus, { nodeId }),
      enabled,
      retry: false,
      refetchInterval: NO_LEADER_POLL_MS,
    })),
  });
  return useMemo<BrokerOwnCopy[]>(
    () =>
      enabled
        ? results.map((result, index) => {
            const broker = result.data?.broker;
            if (broker?.box) {
              return { nodeId: broker.nodeId, phase: toBoxPhase(broker.box.state), revision: broker.box.revision };
            }
            return {
              nodeId: targets[index],
              errorMessage: result.error instanceof ConnectError ? result.error.rawMessage : undefined,
            };
          })
        : [],
    // biome-ignore lint/correctness/useExhaustiveDependencies: `targets` follows `nodeIds`
    [enabled, results, nodeIds]
  );
};

/**
 * The cluster's shadow box, polled quickly while brokers are still applying a change. Every
 * consumer shares one query, so the banner, the Shadow Links page and the write guards agree.
 * A cluster without the API, or a viewer who isn't a superuser, stops polling: the banner and
 * guards hide, and the Shadow Links page says why.
 */
export const useShadowBoxStatusQuery = () => {
  const available = useShadowBoxAvailability();
  const transport = useShadowBoxTransport();
  const queryClient = useQueryClient();
  const setPhase = useShadowBoxStore((state) => state.setPhase);

  const query = useQuery(
    getShadowBoxStatus,
    {},
    {
      transport,
      enabled: available,
      retry: (failureCount, error) => !(isSettledReadError(error) || isNoLeaderError(error)) && failureCount < 2,
      refetchInterval: (state) => {
        const { error, data } = state.state;
        if (isSettledReadError(error)) {
          return false;
        }
        if (isNoLeaderError(error)) {
          return NO_LEADER_POLL_MS;
        }
        const phase = toBoxPhase(data?.box?.state);
        return phase && isTransitionPhase(phase) ? transitionPollMs(data) : STEADY_POLL_MS;
      },
      refetchOnWindowFocus: (state) => !isSettledReadError(state.state.error),
      /** Once the API is known to be missing, a newly mounted guard or banner doesn't ask again. */
      retryOnMount: false,
    }
  );

  useEffect(() => {
    if (!available) {
      return;
    }
    // Every mounted consumer hears the same event; joining the refetch already in flight keeps it to one.
    return subscribeToSimulator(() => {
      invalidateStatus(queryClient, { cancelRefetch: false });
    });
  }, [available, queryClient]);

  const access = accessOf(query.error);
  const parsed = useMemo(() => summarizeBox(query.data?.box), [query.data]);
  const brokers = useMemo(() => getBrokerProgress(query.data), [query.data]);
  const noLeader = available && isNoLeaderError(query.error);
  const ownCopies = useBrokerOwnCopies(
    noLeader,
    brokers.map((broker) => broker.nodeId)
  );
  const known = available && access === 'ok' && parsed !== undefined;
  const summary = parsed ?? UNBOXED_SUMMARY;
  /** Without a status, a broker's own blocking copy is enough to disable the writes it rejects. */
  const blocking = known
    ? isBlockingPhase(summary.phase)
    : ownCopies.some((copy) => copy.phase && isBlockingPhase(copy.phase));

  useEffect(() => {
    setPhase(known ? summary.phase : null);
  }, [known, summary.phase, setPhase]);

  return {
    ...query,
    /** The flag is on and this cluster can serve the API, and it hasn't said it doesn't. */
    available: available && access !== 'unsupported',
    access,
    /** True once a status with a state Console understands has loaded; until then, treat the cluster as unboxed. */
    known,
    /** A status loaded, but with no box or a state this version of Console doesn't know. */
    unreadable: available && query.data !== undefined && parsed === undefined,
    /** The cluster has no controller leader right now, so `ownCopies` stand in for the status. */
    noLeader,
    ownCopies,
    /** Whether some broker rejects writes now, as far as Console can tell. */
    blocking,
    summary,
    brokers,
  };
};

export type BoxSettingsInput = {
  exemptPrincipals: string[];
  allowAllReads: boolean;
  skipTransactionExpiration: boolean;
};

const toSettingsInit = (settings: BoxSettingsInput) => ({
  readPolicy: { exemptPrincipals: settings.exemptPrincipals, allowAllReads: settings.allowAllReads },
  skipTransactionExpiration: settings.skipTransactionExpiration,
});

/** Matches `isStaleRevisionError`, so it reads like the server's own stale-revision failure. */
const staleRevision = () => new ConnectError('the shadow box revision has changed', Code.FailedPrecondition);

/**
 * Box always uses the saved settings. When the dialog changed them, this saves them first and boxes
 * at the revision the save returned, but only if that box still carries exactly these settings: the
 * response can already include someone else's later change, and Box must not apply settings nobody
 * here reviewed.
 *
 * `savedBox` is the box as this hook's own save left it, until `reset`. When Box fails after the save,
 * the box has moved on to that revision because of this call, not someone else.
 */
export const useBoxClusterMutation = () => {
  const transport = useShadowBoxTransport();
  const queryClient = useQueryClient();
  const [savedBox, setSavedBox] = useState<BoxSummary>();

  const mutation = useMutation({
    mutationFn: async ({ settings, opened }: { settings: BoxSettingsInput; opened: BoxSummary }) => {
      let { revision } = opened;
      if (!sameBoxSettings(settings, opened)) {
        const saved = summarizeBox(
          (
            await callUnaryMethod(transport, updateShadowBoxSettings, {
              settings: toSettingsInit(settings),
              updateMask: { paths: BOX_SETTINGS_UPDATE_PATHS },
              expectedRevision: opened.revision,
            })
          ).box
        );
        if (!saved) {
          throw new ConnectError('the settings were saved, but the response had no box', Code.Internal);
        }
        if (!sameBoxSettings(settings, saved)) {
          throw staleRevision();
        }
        setSavedBox(saved);
        ({ revision } = saved);
      }
      return callUnaryMethod(transport, box, { expectedRevision: revision });
    },
    onSettled: () => invalidateStatus(queryClient),
  });

  const { reset: resetMutation } = mutation;
  const reset = useCallback(() => {
    setSavedBox(undefined);
    resetMutation();
  }, [resetMutation]);
  return { ...mutation, savedBox, reset };
};

export const useUpdateShadowBoxSettingsMutation = () => {
  const transport = useShadowBoxTransport();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ settings, expectedRevision }: { settings: BoxSettingsInput; expectedRevision: bigint }) =>
      callUnaryMethod(transport, updateShadowBoxSettings, {
        settings: toSettingsInit(settings),
        updateMask: { paths: BOX_SETTINGS_UPDATE_PATHS },
        expectedRevision,
      }),
    onSettled: () => invalidateStatus(queryClient),
  });
};

/** Sends the revision the dialog opened with, so a stale tab can't release a box someone has since re-applied. */
export const useUnboxClusterMutation = () => {
  const transport = useShadowBoxTransport();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ expectedRevision }: { expectedRevision: bigint }) =>
      callUnaryMethod(transport, unbox, { expectedRevision }),
    onSettled: () => invalidateStatus(queryClient),
  });
};

const STALE_REVISION = /revision has changed/i;

/**
 * Box's preconditions all fail with FAILED_PRECONDITION, so the message is the only way to tell them
 * apart. These are hints: the server's own message is always shown with them.
 */
const PRECONDITION_HINTS: { pattern: RegExp; sentence: string }[] = [
  { pattern: /shadow link is configured|shadow link/i, sentence: SHADOW_CLUSTER_CANT_BOX },
  {
    pattern: /not active|feature/i,
    sentence: 'Shadow boxing turns on once every broker runs Redpanda v26.3.1 or later.',
  },
  {
    pattern: /migration/i,
    sentence: 'A data migration on this cluster hasn’t finished. Box it once the migration is done.',
  },
  { pattern: /recovery/i, sentence: 'A cluster recovery is running. Box the cluster once it finishes.' },
  {
    pattern: /storage mode|read.?replica/i,
    sentence: 'A topic uses a storage mode shadow boxing doesn’t support, such as a read replica.',
  },
];

/** A stale `expected_revision`: someone else changed the box since this page read it. */
export const isStaleRevisionError = (error: unknown): boolean =>
  error instanceof ConnectError && error.code === Code.FailedPrecondition && STALE_REVISION.test(error.rawMessage);

const withServerMessage = (sentence: string, error: ConnectError) =>
  error.rawMessage ? `${sentence} Redpanda said: “${error.rawMessage}”` : sentence;

const CHANGE_ERROR_SENTENCE: Partial<Record<Code, string>> = {
  [Code.Unavailable]: 'There’s no controller leader right now, or a broker is shutting down. Try again in a moment.',
  [Code.DeadlineExceeded]:
    'The call took over 5 seconds and may still apply. Check the box’s state before you try again.',
  [Code.PermissionDenied]: 'Only superusers can box, unbox or change shadow box settings.',
  [Code.Unauthenticated]: 'Redpanda rejected the credentials Console calls its Admin API with.',
  [Code.Internal]: 'Redpanda couldn’t record the change. Check the box’s state before you try again.',
};

/** Turns a Shadow Box API failure into a sentence that says what to do next. */
export const describeShadowBoxError = (error: unknown): string => {
  if (!(error instanceof ConnectError)) {
    return error instanceof Error ? error.message : String(error);
  }
  if (isStaleRevisionError(error)) {
    return 'Someone else changed the box since this page read it. Review its current state, then try again.';
  }
  if (error.code === Code.FailedPrecondition) {
    const hint = PRECONDITION_HINTS.find(({ pattern }) => pattern.test(error.rawMessage));
    return withServerMessage(hint?.sentence ?? 'Redpanda refused the change.', error);
  }
  if (error.code === Code.InvalidArgument) {
    return withServerMessage('Redpanda rejected the request.', error);
  }
  return CHANGE_ERROR_SENTENCE[error.code] ?? error.rawMessage;
};

/** A sentence for a status read that failed, which unlike a change has nothing that may still apply. */
export const describeShadowBoxReadError = (error: unknown): string => {
  if (!(error instanceof ConnectError)) {
    return describeShadowBoxError(error);
  }
  switch (error.code) {
    case Code.PermissionDenied:
      return 'Only superusers can read a cluster’s shadow box.';
    case Code.Unavailable:
      return 'This cluster has no controller leader right now, so its box can’t be read. Console keeps trying.';
    case Code.DeadlineExceeded:
      return 'The cluster didn’t answer in time.';
    case Code.Unimplemented:
    case Code.NotFound:
      return 'This cluster doesn’t report a shadow box. It may run a Redpanda version without shadow boxing.';
    default:
      return describeShadowBoxError(error);
  }
};
