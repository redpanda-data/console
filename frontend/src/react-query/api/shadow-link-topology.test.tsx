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

import {
  type Cluster,
  Cluster_State,
  ClusterSchema,
  GetClusterResponseSchema,
  ListClustersResponseSchema,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/cluster_pb';
import {
  GetShadowLinkResponseSchema,
  ListShadowLinksResponseSchema,
  type ShadowLink,
  ShadowLink_State,
  ShadowLinkSchema,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import {
  getCluster,
  listClusters,
} from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/controlplane/v1/cluster-ClusterService_connectquery';
import {
  getShadowLink,
  listShadowLinks,
} from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/controlplane/v1/shadow_link-ShadowLinkService_connectquery';
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport, type Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  ClusterFenceState,
  GetClusterFenceStatusResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { getClusterFenceStatus } from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import { connectQueryWrapper } from 'test-utils';

const flags = rs.hoisted(() => ({ enableClusterFencing: true }));
const host = rs.hoisted(() => ({ embedded: true }));
const transports = rs.hoisted(() => ({
  controlplane: undefined as Transport | undefined,
  peers: new Map<string, Transport>(),
  peerCalls: [] as string[],
}));

rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
  return {
    ...actual,
    isEmbedded: rs.fn(() => host.embedded),
    isFeatureFlagEnabled: rs.fn((key: string) => flags[key as keyof typeof flags] ?? false),
    isServerless: rs.fn(() => false),
  };
});

rs.mock('hooks/use-controlplane-transport', () => ({
  useControlplaneTransport: () => transports.controlplane,
}));

rs.mock('./peer-console-transport', () => ({
  peerConsoleTransport: (url: string) => {
    transports.peerCalls.push(url);
    const transport = transports.peers.get(url);
    if (!transport) {
      throw new Error(`no Console at ${url}`);
    }
    return transport;
  },
}));

import { config } from 'config';

import { PeerFenceReadError, readPeerClusterFence } from './peer-cluster-fence';
import { useShadowLinkTopology } from './shadow-link-topology';

const PROD_CONSOLE = 'https://console-prod.example.com';

const cluster = (id: string, name: string, seed: string, state = Cluster_State.READY): Cluster =>
  create(ClusterSchema, {
    id,
    name,
    state,
    kafkaApi: { seedBrokers: [seed] },
    redpandaConsole: { url: id === 'prod' ? PROD_CONSOLE : `https://console-${id}.example.com` },
  });

const CLUSTERS = [
  cluster('prod', 'prod-us-east-1', 'seed-prod.example.com:9092'),
  cluster('dr', 'dr-us-west-2', 'seed-dr.example.com:9092'),
  cluster('eu', 'telemetry-eu-dr', 'seed-eu.example.com:9092'),
];

type LinkInit = MessageInitShape<typeof ShadowLinkSchema>;

const link = (id: string, shadowRedpandaId: string, clientOptions: LinkInit['clientOptions']): ShadowLink =>
  create(ShadowLinkSchema, { id, name: id, shadowRedpandaId, state: ShadowLink_State.ACTIVE, clientOptions });

const LINKS = [
  link('orders-dr', 'dr', {
    bootstrapServers: ['seed-prod.example.com:9092'],
    authenticationConfiguration: {
      authentication: { case: 'scramConfiguration', value: { username: 'shadow-orders' } },
    },
  }),
  link('edge-dr', 'eu', {
    bootstrapServers: ['seed-prod.example.com:30092'],
    tlsSettings: { enabled: true, cert: '-----BEGIN CERTIFICATE-----' },
  }),
  link('vendor-dr', 'dr', { bootstrapServers: ['kafka.vendor.example.org:9092'] }),
];

type Backend = {
  links?: ShadowLink[];
  clusters?: Cluster[];
  failList?: boolean;
  failDetails?: string[];
};

const controlplane = ({ links = LINKS, clusters = CLUSTERS, failList, failDetails = [] }: Backend = {}) => {
  const calls: string[] = [];
  transports.controlplane = createRouterTransport(({ rpc }) => {
    rpc(listShadowLinks, () => {
      calls.push('ListShadowLinks');
      if (failList) {
        throw new ConnectError('nope', Code.Unavailable);
      }
      return create(ListShadowLinksResponseSchema, {
        shadowLinks: links.map(({ id, name, shadowRedpandaId, state }) => ({ id, name, shadowRedpandaId, state })),
      });
    });
    rpc(getShadowLink, ({ id }) => {
      calls.push(`GetShadowLink ${id}`);
      const found = links.find((candidate) => candidate.id === id);
      if (!found || failDetails.includes(id)) {
        throw new ConnectError('nope', Code.Internal);
      }
      return create(GetShadowLinkResponseSchema, { shadowLink: found });
    });
    rpc(listClusters, () => {
      calls.push('ListClusters');
      return create(ListClustersResponseSchema, {
        clusters: clusters.map(({ id, name, state }) => create(ClusterSchema, { id, name, state })),
      });
    });
    rpc(getCluster, ({ id }) => {
      calls.push(`GetCluster ${id}`);
      const found = clusters.find((candidate) => candidate.id === id);
      if (!found) {
        throw new ConnectError('nope', Code.NotFound);
      }
      return create(GetClusterResponseSchema, { cluster: found });
    });
  });
  return calls;
};

const peerConsole = (url: string, answer: () => MessageInitShape<typeof GetClusterFenceStatusResponseSchema>) => {
  transports.peers.set(
    url,
    createRouterTransport(({ rpc }) => {
      rpc(getClusterFenceStatus, () => create(GetClusterFenceStatusResponseSchema, answer()));
    })
  );
};

const fencedProd = () => ({
  fence: {
    state: ClusterFenceState.FENCED,
    revision: 18n,
    settings: { readPolicy: { exemptPrincipals: ['shadow-orders'] } },
  },
  brokers: [
    { nodeId: 0, fence: { state: ClusterFenceState.FENCED, revision: 18n } },
    { nodeId: 1, fence: { state: ClusterFenceState.FENCING, revision: 17n } },
    { nodeId: 2, errorMessage: 'connection refused' },
  ],
});

const renderTopology = (clusterId: string) => {
  config.clusterId = clusterId;
  const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useShadowLinkTopology(), { wrapper });
};

const settled = (result: { current: ReturnType<typeof useShadowLinkTopology> }) =>
  waitFor(() => expect(result.current?.resolving).toBe(false));

describe('useShadowLinkTopology', () => {
  const originalClusterId = config.clusterId;

  beforeEach(() => {
    flags.enableClusterFencing = true;
    host.embedded = true;
    transports.peers.clear();
    transports.peerCalls.length = 0;
  });

  afterEach(() => {
    config.clusterId = originalClusterId;
  });

  describe('on a source', () => {
    test('lists the links that read from it, with how each authenticates', async () => {
      controlplane();
      const { result } = renderTopology('prod');

      await settled(result);
      expect(result.current).toEqual({
        clusterName: 'prod-us-east-1',
        readers: [
          {
            linkName: 'orders-dr',
            shadowClusterId: 'dr',
            shadowClusterName: 'dr-us-west-2',
            authentication: 'sasl',
            principal: 'shadow-orders',
          },
          {
            linkName: 'edge-dr',
            shadowClusterId: 'eu',
            shadowClusterName: 'telemetry-eu-dr',
            authentication: 'mtls',
            principal: undefined,
          },
        ],
        sources: {},
        resolving: false,
        readersIncomplete: false,
      });
      expect(transports.peerCalls).toEqual([]);
    });

    test('says the readers may be incomplete when a link’s details don’t load', async () => {
      controlplane({ failDetails: ['edge-dr'] });
      const { result } = renderTopology('prod');

      await settled(result);
      expect(result.current?.readers.map((reader) => reader.linkName)).toEqual(['orders-dr']);
      expect(result.current?.readersIncomplete).toBe(true);
    });
  });

  describe('on a shadow', () => {
    test('finds each link’s source and reads its fence from the source’s own Console', async () => {
      controlplane();
      peerConsole(PROD_CONSOLE, fencedProd);
      const { result } = renderTopology('dr');

      await waitFor(() => expect(result.current?.sources['orders-dr']).toMatchObject({ fence: { status: 'known' } }));
      expect(result.current?.sources).toEqual({
        'orders-dr': {
          kind: 'cloud',
          clusterId: 'prod',
          clusterName: 'prod-us-east-1',
          fence: {
            status: 'known',
            state: 'fenced',
            revision: 18n,
            stateChangedAt: undefined,
            exemptPrincipals: ['shadow-orders'],
            allowAllReads: false,
            brokers: [
              { nodeId: 0, status: 'confirmed' },
              { nodeId: 1, status: 'behind' },
              { nodeId: 2, status: 'not-answering' },
            ],
          },
        },
        'vendor-dr': { kind: 'external', bootstrapServers: ['kafka.vendor.example.org:9092'] },
      });
      expect(result.current?.readers).toEqual([]);
      expect(transports.peerCalls).toContain(PROD_CONSOLE);
    });

    test('a source’s fence that its Console doesn’t serve, or won’t show this viewer, reads as unavailable', async () => {
      controlplane();
      transports.peers.set(
        PROD_CONSOLE,
        createRouterTransport(({ rpc }) => {
          rpc(getClusterFenceStatus, () => {
            throw new ConnectError('denied', Code.PermissionDenied);
          });
        })
      );
      const { result } = renderTopology('dr');

      await waitFor(() =>
        expect(result.current?.sources['orders-dr']).toMatchObject({
          fence: { status: 'unavailable', reason: 'forbidden' },
        })
      );
    });

    test('doesn’t read the fence of a source that isn’t running', async () => {
      controlplane({
        clusters: CLUSTERS.map((entry) =>
          entry.id === 'prod' ? create(ClusterSchema, { ...entry, state: Cluster_State.SUSPENDED }) : entry
        ),
      });
      const { result } = renderTopology('dr');

      await settled(result);
      expect(result.current?.sources['orders-dr']).toMatchObject({
        kind: 'cloud',
        fence: { status: 'unavailable', reason: 'not-running' },
      });
      expect(transports.peerCalls).toEqual([]);
    });
  });

  describe('falling back', () => {
    test('is null when the link list can’t load, so pages fall back to what the cluster sees itself', async () => {
      const calls = controlplane({ failList: true });
      const { result } = renderTopology('prod');

      await waitFor(() => expect(calls).toContain('ListShadowLinks'));
      await waitFor(() => expect(result.current).toBeNull());
    });

    test('asks nothing outside Cloud, or with fencing off', async () => {
      const calls = controlplane();
      host.embedded = false;
      const standalone = renderTopology('prod');
      flags.enableClusterFencing = false;
      host.embedded = true;
      const flagOff = renderTopology('prod');

      await act(async () => {
        await Promise.resolve();
      });
      expect(standalone.result.current).toBeNull();
      expect(flagOff.result.current).toBeNull();
      expect(calls).toEqual([]);
    });

    test('with no shadow links in the organization, reads nothing past the list and its own cluster', async () => {
      const calls = controlplane({ links: [] });
      const { result } = renderTopology('prod');

      await settled(result);
      await waitFor(() => expect(result.current?.clusterName).toBe('prod-us-east-1'));
      expect(result.current).toMatchObject({ readers: [], sources: {}, readersIncomplete: false });
      expect([...calls].sort()).toEqual(['GetCluster prod', 'ListShadowLinks']);
    });
  });
});

describe('readPeerClusterFence', () => {
  const failingWith = (code: Code) => {
    transports.peers.set(
      PROD_CONSOLE,
      createRouterTransport(({ rpc }) => {
        rpc(getClusterFenceStatus, () => {
          throw new ConnectError('refused', code);
        });
      })
    );
  };

  beforeEach(() => {
    transports.peers.clear();
    transports.peerCalls.length = 0;
  });

  test.each([
    [Code.Unimplemented, 'unsupported'],
    [Code.NotFound, 'unsupported'],
    [Code.PermissionDenied, 'forbidden'],
    [Code.FailedPrecondition, 'inactive'],
  ] as const)('reads %s as a fence it can’t show: %s', async (code, reason) => {
    failingWith(code);
    expect(await readPeerClusterFence(PROD_CONSOLE)).toEqual({ status: 'unavailable', reason });
  });

  test.each([
    [Code.Unavailable, 'no-leader'],
    [Code.Unauthenticated, 'error'],
    [Code.Internal, 'error'],
  ] as const)('fails a %s read for the query to try again: %s', async (code, reason) => {
    failingWith(code);
    const failure = await readPeerClusterFence(PROD_CONSOLE).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PeerFenceReadError);
    expect((failure as PeerFenceReadError).reason).toBe(reason);
  });

  const answeringWith = (status: number, contentType: string, body: string) =>
    transports.peers.set(
      PROD_CONSOLE,
      createConnectTransport({
        baseUrl: PROD_CONSOLE,
        fetch: () => Promise.resolve(new Response(body, { status, headers: { 'content-type': contentType } })),
      })
    );

  test.each([
    [503, 'text/html', '<html>Service Unavailable</html>'],
    [403, 'text/html', '<html>Request blocked</html>'],
    [502, 'application/octet-stream', ''],
  ])(
    'reads a gateway’s own %s page as a failed read, not as an answer from the Console',
    async (status, type, body) => {
      answeringWith(status, type, body);
      const failure = await readPeerClusterFence(PROD_CONSOLE).catch((error: unknown) => error);
      expect((failure as PeerFenceReadError).reason).toBe('error');
    }
  );

  test('reads a Console without the API, whose router answers 404 with no Connect body, as unsupported', async () => {
    answeringWith(404, 'text/plain', '404 page not found');
    expect(await readPeerClusterFence(PROD_CONSOLE)).toEqual({ status: 'unavailable', reason: 'unsupported' });
  });

  test('takes the code from the Console’s own Connect error', async () => {
    answeringWith(403, 'application/json', JSON.stringify({ code: 'permission_denied', message: 'no' }));
    expect(await readPeerClusterFence(PROD_CONSOLE)).toEqual({ status: 'unavailable', reason: 'forbidden' });
  });

  test('gives up on a Console that doesn’t answer in time', async () => {
    transports.peers.set(
      PROD_CONSOLE,
      createRouterTransport(({ rpc }) => {
        rpc(
          getClusterFenceStatus,
          (_request, context) =>
            new Promise((_resolve, reject) => {
              context.signal.addEventListener('abort', () => reject(context.signal.reason));
            })
        );
      })
    );
    const failure = await readPeerClusterFence(PROD_CONSOLE, undefined, 5).catch((error: unknown) => error);
    expect((failure as PeerFenceReadError).reason).toBe('timeout');
  });

  test('has nothing to read without a Console URL', async () => {
    expect(await readPeerClusterFence(undefined)).toEqual({ status: 'unavailable', reason: 'unsupported' });
    expect(transports.peerCalls).toEqual([]);
  });
});
