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

import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { getBrokerProgress, isTransitionPhase, summarizeFence } from 'components/cluster-fence/cluster-fence-model';
import type { ShadowLinkPeerFence } from 'components/cluster-fence/shadow-link-topology';
import {
  ClusterFenceService,
  type GetClusterFenceStatusResponse,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';

import { peerConsoleTransport } from './peer-console-transport';

const TRANSITION_POLL_MS = 3000;
const STEADY_POLL_MS = 30_000;
const NO_LEADER_POLL_MS = 5000;
const SLOW_POLL_MS = 120_000;

/**
 * A private cluster the viewer can't reach would otherwise hold the read until the browser gives up
 * on the connection, minutes later, and the Failover tab with it. Enforced with the request's signal,
 * not Connect's `timeoutMs`, which would add a header other clusters' Consoles may not allow from
 * this origin.
 */
export const PEER_FENCE_READ_TIMEOUT_MS = 10_000;

type ReadFailure = 'no-leader' | 'timeout' | 'error';

/** A read worth trying again. The query keeps the last fence it read. */
export class PeerFenceReadError extends Error {
  readonly reason: ReadFailure;

  constructor(message: string, { reason, ...options }: ErrorOptions & { reason: ReadFailure }) {
    super(message, options);
    this.name = 'PeerFenceReadError';
    this.reason = reason;
  }
}

const withDeadline = (signal: AbortSignal | undefined, timeoutMs: number) => {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new ConnectError(`no answer within ${timeoutMs} ms`, Code.DeadlineExceeded));
  }, timeoutMs);
  const forward = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    forward();
  } else {
    signal?.addEventListener('abort', forward, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forward);
    },
  };
};

const isConsoleAnswer = (error: ConnectError) => error.metadata.get('content-type')?.includes('json') ?? false;

const isMissingRoute = (error: ConnectError) => error.code === Code.Unimplemented;

const settledReading: (error: unknown) => ShadowLinkPeerFence = (error) => {
  if (error instanceof PeerFenceReadError) {
    throw error;
  }
  if (!(error instanceof ConnectError)) {
    throw new PeerFenceReadError(String(error), { reason: 'error', cause: error });
  }
  if (!(isConsoleAnswer(error) || isMissingRoute(error))) {
    throw new PeerFenceReadError(error.message, { reason: 'error', cause: error });
  }
  switch (error.code) {
    case Code.Unimplemented:
    case Code.NotFound:
      return { status: 'unavailable', reason: 'unsupported' };
    case Code.PermissionDenied:
      return { status: 'unavailable', reason: 'forbidden' };
    case Code.FailedPrecondition:
      return { status: 'unavailable', reason: 'inactive' };
    case Code.Unavailable:
      throw new PeerFenceReadError(error.message, { reason: 'no-leader', cause: error });
    default:
      throw new PeerFenceReadError(error.message, { reason: 'error', cause: error });
  }
};

const toKnownFence: (response: GetClusterFenceStatusResponse) => ShadowLinkPeerFence = (response) => {
  const summary = summarizeFence(response.fence);
  if (!summary) {
    throw new PeerFenceReadError('The cluster answered without a fence this Console can read', { reason: 'error' });
  }
  const { phase, ...fence } = summary;
  return {
    status: 'known',
    state: phase,
    ...fence,
    brokers: getBrokerProgress(response).map(({ nodeId, status }) => ({ nodeId, status })),
  };
};

/**
 * Another cluster's fence, read from that cluster's Console at `consoleUrl`.
 *
 * Only the peer Console's own JSON codes establish fence errors. Do not mistake gateway HTTP 503/403 pages for controller loss or permission denial. An unmatched route is treated as unsupported; aborted reads are not failures.
 *
 * Transient reads retry while retaining the last fence. Do not depend on Redpanda's error wording.
 */
export const readPeerClusterFence: (
  consoleUrl: string | undefined,
  signal?: AbortSignal,
  timeoutMs?: number
) => Promise<ShadowLinkPeerFence> = async (consoleUrl, signal, timeoutMs = PEER_FENCE_READ_TIMEOUT_MS) => {
  if (!consoleUrl) {
    return { status: 'unavailable', reason: 'unsupported' };
  }
  const deadline = withDeadline(signal, timeoutMs);
  try {
    const client = createClient(ClusterFenceService, peerConsoleTransport(consoleUrl));
    return toKnownFence(await client.getClusterFenceStatus({}, { signal: deadline.signal }));
  } catch (error) {
    if (deadline.timedOut()) {
      throw new PeerFenceReadError(`No answer within ${timeoutMs} ms`, { reason: 'timeout', cause: error });
    }
    return signal?.aborted ? Promise.reject(error) : settledReading(error);
  } finally {
    deadline.dispose();
  }
};

const failureOf = (error: unknown) => (error instanceof PeerFenceReadError ? error.reason : 'error');

/** What a failed read with nothing to show reads as, so the page says why instead of loading. */
export const unreadablePeerFence: (error: unknown) => ShadowLinkPeerFence = (error) => ({
  status: 'unavailable',
  reason: failureOf(error) === 'no-leader' ? 'no-leader' : 'error',
});

/** One retry, except after a timeout: trying again straight away would only wait as long again. */
export const peerFenceRetry = (failureCount: number, error: unknown) =>
  failureCount < 1 && failureOf(error) !== 'timeout';

type PeerFenceQueryState = {
  state: { data?: ShadowLinkPeerFence; error?: unknown; status: 'pending' | 'error' | 'success' };
};

/**
 * Quick while brokers apply a change or the cluster has no controller leader, steady while a failed
 * refresh still shows the last fence, slow after a failure with nothing to show or while the feature
 * isn't on yet, and not at all once the API is known to be missing or the viewer can't read it.
 */
export const peerFenceRefetchInterval: (query: PeerFenceQueryState) => number | false = (query) => {
  if (query.state.status === 'error') {
    if (failureOf(query.state.error) === 'no-leader') {
      return NO_LEADER_POLL_MS;
    }
    return query.state.data ? STEADY_POLL_MS : SLOW_POLL_MS;
  }
  const fence = query.state.data;
  if (fence?.status === 'unavailable') {
    return fence.reason === 'inactive' ? SLOW_POLL_MS : false;
  }
  return fence?.status === 'known' && isTransitionPhase(fence.state) ? TRANSITION_POLL_MS : STEADY_POLL_MS;
};
