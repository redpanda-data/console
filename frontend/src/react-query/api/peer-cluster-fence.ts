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
/** No controller leader is usually an election, over in seconds. */
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

/**
 * Whether the code came from the other Console's own Connect error, which is JSON. A proxy or load
 * balancer in front of it answers with its own page, and Connect then derives the code from the HTTP
 * status alone, which would read a gateway 503 as "no controller leader" or a WAF 403 as "no
 * permission".
 */
const isConsoleAnswer = (error: ConnectError) => error.metadata.get('content-type')?.includes('json') ?? false;

/** Not served at all, as from a Console without the API: its router answers 404 with no Connect body. */
const isMissingRoute = (error: ConnectError) => error.code === Code.Unimplemented;

/**
 * Answers that won't change by asking again soon read as a fence that can't be shown; the rest throw,
 * so the query retries and keeps the last fence it read. Only the code counts, never the message:
 * Redpanda's wording varies.
 */
const settledReading = (error: unknown): ShadowLinkPeerFence => {
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
    // A read only fails a precondition while some broker runs a Redpanda without the feature.
    case Code.FailedPrecondition:
      return { status: 'unavailable', reason: 'inactive' };
    case Code.Unavailable:
      throw new PeerFenceReadError(error.message, { reason: 'no-leader', cause: error });
    default:
      throw new PeerFenceReadError(error.message, { reason: 'error', cause: error });
  }
};

const toKnownFence = (response: GetClusterFenceStatusResponse): ShadowLinkPeerFence => {
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

/** Another cluster's fence, read from that cluster's Console at `consoleUrl`. */
export const readPeerClusterFence = async (
  consoleUrl: string | undefined,
  signal?: AbortSignal,
  timeoutMs = PEER_FENCE_READ_TIMEOUT_MS
): Promise<ShadowLinkPeerFence> => {
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
    // A query that was cancelled, as when its page closes, isn't a failed read.
    return signal?.aborted ? Promise.reject(error) : settledReading(error);
  } finally {
    deadline.dispose();
  }
};

const failureOf = (error: unknown): ReadFailure => (error instanceof PeerFenceReadError ? error.reason : 'error');

/** What a failed read with nothing to show reads as, so the page says why instead of loading. */
export const unreadablePeerFence = (error: unknown): ShadowLinkPeerFence => ({
  status: 'unavailable',
  reason: failureOf(error) === 'no-leader' ? 'no-leader' : 'error',
});

/** One retry, except after a timeout: trying again straight away would only wait as long again. */
export const peerFenceRetry = (failureCount: number, error: unknown): boolean =>
  failureCount < 1 && failureOf(error) !== 'timeout';

type PeerFenceQueryState = {
  state: { data?: ShadowLinkPeerFence; error?: unknown; status: 'pending' | 'error' | 'success' };
};

/**
 * Quick while brokers apply a change or the cluster has no controller leader, steady while a failed
 * refresh still shows the last fence, slow after a failure with nothing to show or while the feature
 * isn't on yet, and not at all once the API is known to be missing or the viewer can't read it.
 */
export const peerFenceRefetchInterval = (query: PeerFenceQueryState): number | false => {
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
