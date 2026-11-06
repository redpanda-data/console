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
import { Code, ConnectError } from '@connectrpc/connect';
import { callUnaryMethod, createConnectQueryKey, useQuery, useTransport } from '@connectrpc/connect-query';
import { type QueryClient, useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  BOX_SETTINGS_UPDATE_PATHS,
  type BoxPhase,
  type BoxSummary,
  type BrokerProgress,
  getBrokerProgress,
  isBlockingPhase,
  isTransitionPhase,
  SHADOW_CLUSTER_CANT_BOX,
  sameBoxSettings,
  summarizeBox,
  toBoxPhase,
  UNBOXED_SUMMARY,
} from 'components/shadow-box/shadow-box-model';
import { isFeatureFlagEnabled, isServerless } from 'config';
import type { GetClusterFenceStatusResponse } from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import {
  fence,
  getClusterFenceBrokerStatus,
  getClusterFenceStatus,
  unfence,
  updateClusterFenceSettings,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { useShadowBoxStore } from 'stores/shadow-box-store';

const TRANSITION_POLL_MS = 1500;
const STEADY_POLL_MS = 15_000;
/** A change still applying after this long is waiting on a broker that isn't answering, so ease off. */
const STALLED_TRANSITION_MS = 2 * 60 * 1000;
const STALLED_POLL_MS = 10_000;

const transitionPollMs = (data: GetClusterFenceStatusResponse | undefined): number => {
  const changedAt = data?.fence?.stateChangedAt;
  const stalled = changedAt !== undefined && Date.now() - timestampDate(changedAt).getTime() > STALLED_TRANSITION_MS;
  return stalled ? STALLED_POLL_MS : TRANSITION_POLL_MS;
};

/**
 * The Failover tab reads the source's fence through the host, so on this shadow cluster it needs
 * only the flag; whether the host can read that fence decides the rest (see useFailoverReadiness).
 */
export const isGuidedFailoverEnabled = (): boolean => isFeatureFlagEnabled('enableShadowBoxing') && !isServerless();

/**
 * Shadow boxing is shown when its flag is on and this cluster's backend serves ClusterFenceService for
 * a cluster that supports fencing. Serverless clusters can't be shadow link sources.
 */
const useShadowBoxAvailability = (): boolean => {
  const supported = useSupportedFeaturesStore((state) => state.clusterFence);
  return isFeatureFlagEnabled('enableShadowBoxing') && !isServerless() && supported;
};

const statusQueryKey = () => createConnectQueryKey({ schema: getClusterFenceStatus, cardinality: 'finite' });

const invalidateStatus = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: statusQueryKey(), exact: false });

/**
 * No fencing on this cluster, which reads as "no fence to show", not as an error: the API isn't
 * there, or a read fails its precondition while some broker runs a Redpanda without the feature.
 */
const UNSUPPORTED_CODES = new Set([Code.Unimplemented, Code.NotFound, Code.FailedPrecondition]);

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
 * GetClusterFenceStatus needs the controller leader; GetClusterFenceBrokerStatus doesn't. While the first
 * fails with UNAVAILABLE, this asks each broker the last status listed (or the broker that takes the
 * call, when none was) for its own copy, so Console still knows whether brokers are blocking.
 */
const useBrokerOwnCopies = (enabled: boolean, brokers: BrokerProgress[]) => {
  const transport = useTransport();
  const targets = useMemo<(number | undefined)[]>(
    () => (brokers.length > 0 ? brokers.map((broker) => broker.nodeId) : [undefined]),
    [brokers]
  );
  const results = useQueries({
    queries: targets.map((nodeId) => ({
      queryKey: ['shadow-box-broker-status', nodeId ?? 'self'],
      queryFn: () => callUnaryMethod(transport, getClusterFenceBrokerStatus, { nodeId }),
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
            if (broker?.fence) {
              return { nodeId: broker.nodeId, phase: toBoxPhase(broker.fence.state), revision: broker.fence.revision };
            }
            return {
              nodeId: broker?.nodeId ?? targets[index],
              errorMessage:
                broker?.errorMessage ?? (result.error instanceof ConnectError ? result.error.rawMessage : undefined),
            };
          })
        : [],
    [enabled, results, targets]
  );
};

/** The status query, polled at the pace the box's state calls for. */
const useShadowBoxStatusRead = (available: boolean) => {
  const transport = useTransport();

  const query = useQuery(
    getClusterFenceStatus,
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
        const phase = toBoxPhase(data?.fence?.state);
        return phase && isTransitionPhase(phase) ? transitionPollMs(data) : STEADY_POLL_MS;
      },
      refetchOnWindowFocus: (state) => !isSettledReadError(state.state.error),
      /** Once the API is known to be missing, a newly mounted guard or banner doesn't ask again. */
      retryOnMount: false,
    }
  );

  return query;
};

/** Hands the phase to the store the write guards read, or null while it isn't known. */
const usePublishedBoxPhase = (phase: BoxPhase | null) => {
  const setPhase = useShadowBoxStore((state) => state.setPhase);
  useEffect(() => {
    setPhase(phase);
  }, [phase, setPhase]);
};

/**
 * The cluster's shadow box, polled quickly while brokers are still applying a change. Every
 * consumer shares one query, so the banner, the Shadow Links page and the write guards agree.
 * A cluster without fencing, or a viewer without permission to read it, stops polling and the banner
 * and guards hide; without fencing, the Shadow Links page shows no fence at all.
 */
export const useShadowBoxStatusQuery = () => {
  const available = useShadowBoxAvailability();
  const query = useShadowBoxStatusRead(available);
  const access = accessOf(query.error);
  const { parsed, brokers } = useMemo(
    () => ({ parsed: summarizeBox(query.data?.fence), brokers: getBrokerProgress(query.data) }),
    [query.data]
  );
  const noLeader = available && isNoLeaderError(query.error);
  const ownCopies = useBrokerOwnCopies(noLeader, brokers);
  const known = available && access === 'ok' && parsed !== undefined;
  const summary = parsed ?? UNBOXED_SUMMARY;
  usePublishedBoxPhase(known ? summary.phase : null);

  return {
    ...query,
    /** The flag is on and this cluster can serve the API, and it hasn't said it has no fencing. */
    available: available && access !== 'unsupported',
    access,
    /** True once a status with a state Console understands has loaded; until then, treat the cluster as unboxed. */
    known,
    /** A status loaded, but with no box or a state this version of Console doesn't know. */
    unreadable: available && query.data !== undefined && parsed === undefined,
    /** The cluster has no controller leader right now, so `ownCopies` stand in for the status. */
    noLeader,
    ownCopies,
    /**
     * Whether some broker rejects writes now, as far as Console can tell. Without a status, a broker's
     * own blocking copy is enough to disable the writes it rejects.
     */
    blocking: known
      ? isBlockingPhase(summary.phase)
      : ownCopies.some((copy) => copy.phase && isBlockingPhase(copy.phase)),
    summary,
    brokers,
  };
};

export type BoxSettingsInput = {
  exemptPrincipals: string[];
  allowAllReads: boolean;
};

const toSettingsInit = (settings: BoxSettingsInput) => ({
  readPolicy: { exemptPrincipals: settings.exemptPrincipals, allowAllReads: settings.allowAllReads },
});

/** Matches `isStaleRevisionError`, so it reads like the server's own stale-revision failure. */
const staleRevision = () => new ConnectError('the fence revision has changed', Code.FailedPrecondition);

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
  const transport = useTransport();
  const queryClient = useQueryClient();
  const [savedBox, setSavedBox] = useState<BoxSummary>();

  const mutation = useMutation({
    mutationFn: async ({ settings, opened }: { settings: BoxSettingsInput; opened: BoxSummary }) => {
      let { revision } = opened;
      if (!sameBoxSettings(settings, opened)) {
        const saved = summarizeBox(
          (
            await callUnaryMethod(transport, updateClusterFenceSettings, {
              settings: toSettingsInit(settings),
              updateMask: { paths: BOX_SETTINGS_UPDATE_PATHS },
              expectedRevision: opened.revision,
            })
          ).fence
        );
        if (!saved) {
          throw new ConnectError('the settings were saved, but the response had no fence', Code.Internal);
        }
        if (!sameBoxSettings(settings, saved)) {
          throw staleRevision();
        }
        setSavedBox(saved);
        ({ revision } = saved);
      }
      return callUnaryMethod(transport, fence, { expectedRevision: revision });
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
  const transport = useTransport();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ settings, expectedRevision }: { settings: BoxSettingsInput; expectedRevision: bigint }) =>
      callUnaryMethod(transport, updateClusterFenceSettings, {
        settings: toSettingsInit(settings),
        updateMask: { paths: BOX_SETTINGS_UPDATE_PATHS },
        expectedRevision,
      }),
    onSettled: () => invalidateStatus(queryClient),
  });
};

/** Sends the revision the dialog opened with, so a stale tab can't release a box someone has since re-applied. */
export const useUnboxClusterMutation = () => {
  const transport = useTransport();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ expectedRevision }: { expectedRevision: bigint }) =>
      callUnaryMethod(transport, unfence, { expectedRevision }),
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
    sentence: 'Cluster fencing turns on once every broker runs Redpanda v26.3.1 or later.',
  },
  {
    pattern: /migration/i,
    sentence: 'A data migration on this cluster hasn’t finished. Fence it once the migration is done.',
  },
  { pattern: /recovery/i, sentence: 'A cluster recovery is running. Fence the cluster once it finishes.' },
  {
    pattern: /storage (?:mode|configuration)/i,
    sentence:
      'A topic the fence covers uses a storage mode this Redpanda doesn’t recognize, which can happen while brokers run different versions.',
  },
  {
    pattern: /membership changed/i,
    sentence: 'A broker joined or left the cluster while the fence was changing. Check its state, then try again.',
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
    'The call took over 5 seconds and may still apply. Check the fence’s state before you try again.',
  [Code.PermissionDenied]:
    'You don’t have permission to fence or unfence this cluster, or to change its fence settings.',
  [Code.Unauthenticated]: 'Redpanda rejected the credentials Console calls its Admin API with.',
  [Code.Internal]: 'Redpanda couldn’t record the change. Check the fence’s state before you try again.',
};

/** Turns a Shadow Box API failure into a sentence that says what to do next. */
export const describeShadowBoxError = (error: unknown): string => {
  if (!(error instanceof ConnectError)) {
    return error instanceof Error ? error.message : String(error);
  }
  if (isStaleRevisionError(error)) {
    return 'Someone else changed the fence since this page read it. Review its current state, then try again.';
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
      return 'You don’t have permission to view this cluster’s fence.';
    case Code.Unavailable:
      return 'This cluster has no controller leader right now, so its fence can’t be read. Console keeps trying.';
    case Code.DeadlineExceeded:
      return 'The cluster didn’t answer in time.';
    default:
      return describeShadowBoxError(error);
  }
};
