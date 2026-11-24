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

import type { Transport } from '@connectrpc/connect';
import { codeFromString } from '@connectrpc/connect/protocol-connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { addBearerTokenInterceptor } from 'config';
import { protobufRegistry } from 'protobuf-registry';

type Fetch = WindowOrWorkerGlobalScope['fetch'];

const hasConnectCode = (body: unknown) =>
  typeof body === 'object' &&
  body !== null &&
  'code' in body &&
  typeof body.code === 'string' &&
  codeFromString(body.code) !== undefined;

const consoleErrorsOnly: (fetchImpl: Fetch) => Fetch = (fetchImpl) => async (input, init) => {
  const response = await fetchImpl(input, init);
  if (response.status === 200 || response.status === 404 || !response.headers.get('content-type')?.includes('json')) {
    return response;
  }
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => undefined);
  if (hasConnectCode(body)) {
    return response;
  }
  throw new Error(`HTTP ${response.status} without a Connect error code, so not from the cluster’s Console`);
};

/**
 * A new transport to the Console at `consoleUrl`, answered by `fetchImpl` in tests.
 *
 * Reject JSON errors with no Connect code so gateway responses do not masquerade as peer Console responses. Preserve 404 for older Console routers without this API.
 */
export const createPeerConsoleTransport = (
  consoleUrl: string,
  fetchImpl: Fetch = (input, init) => globalThis.fetch(input, init)
) =>
  createConnectTransport({
    baseUrl: consoleUrl,
    fetch: consoleErrorsOnly(fetchImpl) as typeof globalThis.fetch,
    interceptors: [addBearerTokenInterceptor],
    jsonOptions: { registry: protobufRegistry },
  });

const transports = new Map<string, Transport>();

/**
 * Each cluster's Console serves its own cluster fence API, at the URL Cloud lists for it. Calls carry
 * the same token as this Console's own, so the other cluster checks the viewer's own permissions.
 */
export const peerConsoleTransport = (consoleUrl: string) => {
  let transport = transports.get(consoleUrl);
  if (!transport) {
    transport = createPeerConsoleTransport(consoleUrl);
    transports.set(consoleUrl, transport);
  }
  return transport;
};
