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

import { Cluster_State } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/cluster_pb';
import { ShadowLink_State } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import {
  getCluster,
  listClusters,
} from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/controlplane/v1/cluster-ClusterService_connectquery';
import {
  getShadowLink,
  listShadowLinks,
} from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/controlplane/v1/shadow_link-ShadowLinkService_connectquery';
import { Code, ConnectError, type ConnectRouter, createConnectRouter } from '@connectrpc/connect';
import { createFetchHandler } from '@connectrpc/connect/protocol';
import { expect, onTestFinished, test } from '@rstest/core';
import { act, render, waitFor } from '@testing-library/react';
import { config } from 'config';
import { http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { ClusterFenceState } from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { getClusterFenceStatus } from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import { useClusterFenceStore } from 'stores/cluster-fence-store';
import { connectQueryWrapper } from 'test-utils';

import { ShadowLinkTopologySync } from './shadow-link-topology-sync';

const CONTROLPLANE = 'https://controlplane.test';
const PROD_CONSOLE = 'https://console-prod.test';
const SOURCE_SEED = 'seed-prod.test:9092';
const LINK_NAME = 'orders-dr';
const peerQueryKey = ['cluster-fence-peer-status', 'prod', PROD_CONSOLE] as const;
const guardedFetch = globalThis.fetch;

const clusters = [
  {
    id: 'prod',
    name: 'prod-us-east-1',
    state: Cluster_State.READY,
    kafkaApi: { seedBrokers: [SOURCE_SEED] },
    redpandaConsole: { url: PROD_CONSOLE },
  },
  { id: 'dr', name: 'dr-us-west-2', state: Cluster_State.READY },
];
const link = { id: LINK_NAME, name: LINK_NAME, shadowRedpandaId: 'dr', state: ShadowLink_State.ACTIVE };

function controlplaneRouter() {
  return createConnectRouter()
    .rpc(listShadowLinks, () => ({ shadowLinks: [link] }))
    .rpc(getShadowLink, () => ({ shadowLink: { ...link, clientOptions: { bootstrapServers: [SOURCE_SEED] } } }))
    .rpc(listClusters, () => ({ clusters }))
    .rpc(getCluster, ({ id }) => {
      const cluster = clusters.find((entry) => entry.id === id);
      if (!cluster) {
        throw new ConnectError('Unknown cluster', Code.NotFound);
      }
      return { cluster };
    });
}

function httpHandlers(baseUrl: string, router: ConnectRouter) {
  return router.handlers.map((handler) => {
    const handle = createFetchHandler(handler);
    return http.post(baseUrl + handler.requestPath, ({ request }) => handle(request));
  });
}

function serveTopology() {
  let revision = 18n;
  const reads: bigint[] = [];
  const peer = createConnectRouter().rpc(getClusterFenceStatus, () => {
    reads.push(revision);
    return {
      fence: {
        state: ClusterFenceState.FENCED,
        revision,
        stateChangedAt: { seconds: 1_794_301_200n },
        settings: { readPolicy: { exemptPrincipals: ['shadow-orders'] } },
      },
      brokers: [{ nodeId: 0, fence: { state: ClusterFenceState.FENCED, revision } }],
    };
  });
  const server = setupServer(...httpHandlers(CONTROLPLANE, controlplaneRouter()), ...httpHandlers(PROD_CONSOLE, peer));
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in topology sync');
    },
  });
  onTestFinished(() => server.close());
  return {
    reads,
    publishRevision: (next: bigint) => {
      revision = next;
    },
  };
}

function configureHost() {
  const { jwt, clusterId, controlplaneUrl, featureFlags, isServerless } = config;
  Object.assign(config, {
    jwt: 'host-token',
    clusterId: 'dr',
    controlplaneUrl: CONTROLPLANE,
    featureFlags: { ...featureFlags, enableClusterFencing: true },
    isServerless: false,
  });
  onTestFinished(() => {
    Object.assign(config, { jwt, clusterId, controlplaneUrl, featureFlags, isServerless });
  });
}

const topology = () => useClusterFenceStore.getState().topology;

async function renderTopologySync() {
  configureHost();
  const backend = serveTopology();
  const { wrapper, queryClient } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });
  const { rerender, unmount } = render(<ShadowLinkTopologySync />, { wrapper });
  await waitFor(() =>
    expect(topology()?.sources[LINK_NAME]).toMatchObject({
      kind: 'cloud',
      clusterId: 'prod',
      fence: { status: 'known', state: 'fenced', revision: 18n, brokers: [{ nodeId: 0, status: 'confirmed' }] },
    })
  );
  const refetchPeerFence = async () => {
    await act(() => queryClient.invalidateQueries({ queryKey: peerQueryKey }));
    rerender(<ShadowLinkTopologySync />);
  };
  return { ...backend, refetchPeerFence, unmount };
}

test('retains equivalent topology, publishes a new revision, and clears on unmount', async () => {
  const { refetchPeerFence, publishRevision, reads, unmount } = await renderTopologySync();
  const original = topology();

  await refetchPeerFence();
  expect(reads).toEqual([18n, 18n]);
  expect(topology()).toBe(original);

  publishRevision(19n);
  await refetchPeerFence();
  await waitFor(() => expect(topology()?.sources[LINK_NAME]).toMatchObject({ fence: { revision: 19n } }));

  unmount();
  expect(topology()).toBeNull();
});
