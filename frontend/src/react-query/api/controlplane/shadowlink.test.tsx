/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { ListShadowLinksRequest } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import { listShadowLinks } from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/controlplane/v1/shadow_link-ShadowLinkService_connectquery';
import { createConnectRouter } from '@connectrpc/connect';
import { createFetchHandler } from '@connectrpc/connect/protocol';
import { afterAll, afterEach, beforeAll, expect, onTestFinished, test } from '@rstest/core';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { config } from 'config';
import { http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { connectQueryWrapper } from 'test-utils';

import { useControlplaneListShadowLinksQuery } from './shadowlink';

const CONTROLPLANE = 'https://controlplane.test';
const HOST_JWT = 'embedded-test-token';
const server = setupServer();
const guardedFetch = globalThis.fetch;

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the controlplane list tests');
    },
  });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

function configureHost(jwt: string | undefined, clusterId: string) {
  const initial = { jwt: config.jwt, clusterId: config.clusterId, controlplaneUrl: config.controlplaneUrl };
  Object.assign(config, { jwt, clusterId, controlplaneUrl: CONTROLPLANE });
  onTestFinished(() => {
    Object.assign(config, initial);
  });
}

function serveShadowLinks() {
  const requests: Array<{ cluster: ListShadowLinksRequest['filter']; authorization: string | null }> = [];
  const { handlers } = createConnectRouter().rpc(listShadowLinks, ({ filter }, { requestHeader }) => {
    requests.push({ cluster: filter, authorization: requestHeader.get('Authorization') });
    return {
      shadowLinks: [{ id: 'sl-1', name: 'shadow-link-1', shadowRedpandaId: filter?.shadowRedpandaId }],
    };
  });
  for (const handler of handlers) {
    const handle = createFetchHandler(handler);
    server.use(http.post(CONTROLPLANE + handler.requestPath, ({ request }) => handle(request)));
  }
  return requests;
}

function renderList({ enabled, jwt, clusterId }: { enabled?: boolean; jwt?: string; clusterId: string }) {
  configureHost(jwt, clusterId);
  const requests = serveShadowLinks();
  const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });
  const options = enabled === undefined ? undefined : { enabled };
  const { result } = renderHook(() => useControlplaneListShadowLinksQuery(options), { wrapper });
  return { result, requests };
}

test('lists only the embedded cluster’s links using the host token', async () => {
  const { result, requests } = renderList({ jwt: HOST_JWT, clusterId: 'cluster-abc-123' });

  await waitFor(() => expect(result.current.data?.shadowLinks).toHaveLength(1));
  expect(result.current.data?.shadowLinks[0]).toMatchObject({ id: 'sl-1', shadowRedpandaId: 'cluster-abc-123' });
  expect(requests).toMatchObject([
    { cluster: { shadowRedpandaId: 'cluster-abc-123' }, authorization: 'Bearer embedded-test-token' },
  ]);
});

test.each([
  { mode: 'standalone', clusterId: 'default' },
  { mode: 'embedded with the query disabled', clusterId: 'cluster-abc-123', jwt: HOST_JWT, enabled: false },
])('does not request controlplane links: $mode', ({ mode: _mode, ...options }) => {
  const { result, requests } = renderList(options);
  expect(result.current.fetchStatus).toBe('idle');
  expect(result.current.data).toBeUndefined();
  expect(requests).toEqual([]);
});
