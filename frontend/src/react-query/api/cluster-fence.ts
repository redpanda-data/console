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
  type BrokerProgress,
  type FencePhase,
  type FenceSummary,
  getBrokerProgress,
  isBlockingPhase,
  isTransitionPhase,
  type ReadPolicy,
  SHADOW_CLUSTER_CANT_FENCE,
  sameFenceSettings,
  summarizeFence,
  toFencePhase,
  UNFENCED_SUMMARY,
} from 'components/cluster-fence/cluster-fence-model';
import { isEmbedded, isFeatureFlagEnabled, isServerless } from 'config';
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
import { useClusterFenceStore } from 'stores/cluster-fence-store';

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
 * In Cloud, fencing waits for the host's `enableClusterFencing` flag; self-hosted Console has no
 * flag for it, so only whether the cluster supports fencing decides. Serverless clusters can't be
 * shadow link sources. The Failover tab reads the source's fence through the host, so on a shadow
 * cluster this is all it needs; fencing this cluster also needs its backend to serve
 * ClusterFenceService for a cluster that supports fencing.
 */
export const isGuidedFailoverEnabled = (): boolean =>
  !isServerless() && (!isEmbedded() || isFeatureFlagEnabled('enableClusterFencing'));

const invalidateStatus = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({
    queryKey: createConnectQueryKey({ schema: getClusterFenceStatus, cardinality: 'finite' }),
    exact: false,
  });

/**
 * No fencing on this cluster, which reads as "no fence to show", not as an error: the API isn't
 * there, or a read fails its precondition while some broker runs a Redpanda without the feature.
 */
const UNSUPPORTED_CODES = new Set([Code.Unimplemented, Code.NotFound, Code.FailedPrecondition]);

/** Why the status can't be shown, when it can't. */
const accessOf = (error: unknown): 'ok' | 'unsupported' | 'forbidden' => {
  if (!(error instanceof ConnectError)) {
    return 'ok';
  }
  if (UNSUPPORTED_CODES.has(error.code)) {
    return 'unsupported';
  }
  return error.code === Code.PermissionDenied ? 'forbidden' : 'ok';
};

/** Not answered for this viewer, and asking again won't change that until they sign in as someone else. */
const isSettledReadError = (error: unknown): boolean => accessOf(error) !== 'ok';

const isNoLeaderError = (error: unknown): boolean => error instanceof ConnectError && error.code === Code.Unavailable;

/** No controller leader is usually brief, so ask again soon. */
const NO_LEADER_POLL_MS = 5000;

/** One broker's own copy, read straight from that broker while the cluster has no controller leader. */
export type BrokerOwnCopy = { nodeId?: number; phase?: FencePhase; revision?: bigint; errorMessage?: string };

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
      queryKey: ['cluster-fence-broker-status', nodeId ?? 'self'],
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
              return {
                nodeId: broker.nodeId,
                phase: toFencePhase(broker.fence.state),
                revision: broker.fence.revision,
              };
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

/** The status query, polled at the pace the fence's state calls for. */
const useClusterFenceStatusRead = (available: boolean) =>
  useQuery(
    getClusterFenceStatus,
    {},
    {
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
        const phase = toFencePhase(data?.fence?.state);
        return phase && isTransitionPhase(phase) ? transitionPollMs(data) : STEADY_POLL_MS;
      },
      refetchOnWindowFocus: (state) => !isSettledReadError(state.state.error),
      /** Once the API is known to be missing, a newly mounted guard or banner doesn't ask again. */
      retryOnMount: false,
    }
  );

/** Hands the phase to the store that code outside React reads, or null while it isn't known. */
const usePublishedFencePhase = (phase: FencePhase | null) => {
  useEffect(() => {
    useClusterFenceStore.getState().setPhase(phase);
  }, [phase]);
};

/**
 * The cluster's cluster fence, polled quickly while brokers are still applying a change. Every
 * consumer shares one query, so the banner, the Shadow Links page and the write guards agree.
 * A cluster without fencing, or a viewer without permission to read it, stops polling and the banner
 * and guards hide; without fencing, the Shadow Links page shows no fence at all.
 */
export const useClusterFenceStatusQuery = () => {
  const available = useSupportedFeaturesStore((state) => state.clusterFence) && isGuidedFailoverEnabled();
  const query = useClusterFenceStatusRead(available);
  const access = accessOf(query.error);
  const { parsed, brokers } = useMemo(
    () => ({ parsed: summarizeFence(query.data?.fence), brokers: getBrokerProgress(query.data) }),
    [query.data]
  );
  const noLeader = available && isNoLeaderError(query.error);
  const ownCopies = useBrokerOwnCopies(noLeader, brokers);
  const known = available && access === 'ok' && parsed !== undefined;
  const summary = parsed ?? UNFENCED_SUMMARY;
  usePublishedFencePhase(known ? summary.phase : null);

  return {
    ...query,
    /** The flag is on and this cluster can serve the API, and it hasn't said it has no fencing. */
    available: available && access !== 'unsupported',
    access,
    /** True once a status with a state Console understands has loaded; until then, treat the cluster as unfenced. */
    known,
    /** A status loaded, but with no fence or a state this version of Console doesn't know. */
    unreadable: available && query.data !== undefined && parsed === undefined,
    /** Each broker's own copy, read while the cluster has no controller leader to give the status. */
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

/**
 * `read_policy` replaces the whole policy, which is the only way to remove a name;
 * `read_policy.exempt_principals` would only add names.
 */
const saveSettings = async (transport: Transport, settings: ReadPolicy, expectedRevision: bigint) =>
  (
    await callUnaryMethod(transport, updateClusterFenceSettings, {
      settings: { readPolicy: settings },
      updateMask: { paths: ['read_policy'] },
      expectedRevision,
    })
  ).fence;

/**
 * Fence always uses the saved settings. When the dialog changed them, this saves them first and fences
 * at the revision the save returned, but only if that fence still carries exactly these settings: the
 * response can already include someone else's later change, and Fence must not apply settings nobody
 * here reviewed.
 *
 * `savedFence` is the fence as this hook's own save left it, until `reset`. When Fence fails after the save,
 * the fence has moved on to that revision because of this call, not someone else.
 */
export const useFenceClusterMutation = () => {
  const transport = useTransport();
  const queryClient = useQueryClient();
  const [savedFence, setSavedFence] = useState<FenceSummary>();

  const mutation = useMutation({
    mutationFn: async ({ settings, opened }: { settings: ReadPolicy; opened: FenceSummary }) => {
      let { revision } = opened;
      if (!sameFenceSettings(settings, opened)) {
        const saved = summarizeFence(await saveSettings(transport, settings, opened.revision));
        if (!saved) {
          throw new ConnectError('the settings were saved, but the response had no fence', Code.Internal);
        }
        if (!sameFenceSettings(settings, saved)) {
          // Worded to match isStaleRevisionError, like the server's own stale-revision failure.
          throw new ConnectError('the fence revision has changed', Code.FailedPrecondition);
        }
        setSavedFence(saved);
        ({ revision } = saved);
      }
      return callUnaryMethod(transport, fence, { expectedRevision: revision });
    },
    onSettled: () => invalidateStatus(queryClient),
  });

  const { reset: resetMutation } = mutation;
  const reset = useCallback(() => {
    setSavedFence(undefined);
    resetMutation();
  }, [resetMutation]);
  return { ...mutation, savedFence, reset };
};

export const useUpdateClusterFenceSettingsMutation = () => {
  const transport = useTransport();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ settings, expectedRevision }: { settings: ReadPolicy; expectedRevision: bigint }) =>
      saveSettings(transport, settings, expectedRevision),
    onSettled: () => invalidateStatus(queryClient),
  });
};

/** Sends the revision the dialog opened with, so a stale tab can't release a fence someone has since re-applied. */
export const useUnfenceClusterMutation = () => {
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
 * Fence's preconditions all fail with FAILED_PRECONDITION, so the message is the only way to tell them
 * apart. These are hints: the server's own message is always shown with them.
 */
const PRECONDITION_HINTS: { pattern: RegExp; sentence: string }[] = [
  { pattern: /shadow link/i, sentence: SHADOW_CLUSTER_CANT_FENCE },
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

/** A stale `expected_revision`: someone else changed the fence since this page read it. */
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

/** Turns a cluster fence API failure into a sentence that says what to do next. */
export const describeClusterFenceError = (error: unknown): string => {
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
export const describeClusterFenceReadError = (error: unknown): string => {
  if (!(error instanceof ConnectError)) {
    return describeClusterFenceError(error);
  }
  switch (error.code) {
    case Code.PermissionDenied:
      return 'You don’t have permission to view this cluster’s fence.';
    case Code.Unavailable:
      return 'This cluster has no controller leader right now, so its fence can’t be read. Console keeps trying.';
    case Code.DeadlineExceeded:
      return 'The cluster didn’t answer in time.';
    default:
      return describeClusterFenceError(error);
  }
};
