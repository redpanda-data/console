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
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/cluster_pb';
import {
  type ShadowLink,
  ShadowLink_State,
  ShadowLinkListItemSchema,
  ShadowLinkSchema,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import { create } from '@bufbuild/protobuf';

import {
  buildShadowLinkTopology,
  canBeLinkSource,
  findSourceCluster,
  type Loaded,
  needsOtherClusters,
  sourceClusterIds,
  type TopologyInputs,
  withPeerFences,
} from './shadow-link-topology';
import { describe, expect, test } from 'bun:test';

const cluster = (id: string, seedBroker: string) =>
  create(ClusterSchema, { id, name: `${id}-cluster`, kafkaApi: { seedBrokers: [seedBroker] } });

const prod = cluster('prod', 'seed-abc.byoc.prd.cloud.redpanda.com:9092');
const dr = cluster('dr', 'seed-def.byoc.prd.cloud.redpanda.com:9092');

describe('findSourceCluster', () => {
  test.each([
    ['matches a bootstrap server against a seed broker', 'seed-abc.byoc.prd.cloud.redpanda.com:9092', prod],
    ['ignores scheme and case', 'TCP://Seed-ABC.byoc.prd.cloud.redpanda.com:9092', prod],
    ['falls back to the host when the ports differ', 'seed-abc.byoc.prd.cloud.redpanda.com:30092', prod],
    ['never picks the link’s own shadow cluster', 'seed-def.byoc.prd.cloud.redpanda.com:9092', undefined],
  ])('%s', (_, server, expected) => {
    expect(findSourceCluster([server], [prod, dr], 'dr')).toBe(expected);
  });
});

test('canBeLinkSource skips clusters that aren’t running and ids GetCluster rejects', () => {
  const at = (state: Cluster_State, id = 'prod') => canBeLinkSource({ id, state });
  expect(at(Cluster_State.READY)).toBe(true);
  expect(at(Cluster_State.SUSPENDED)).toBe(true);
  expect(at(Cluster_State.CREATING)).toBe(false);
  expect(at(Cluster_State.READY, '0f8fad5b-d9cb-469f-a165-70867728950e')).toBe(false);
});

const toProd = create(ShadowLinkSchema, {
  id: 'orders-dr',
  name: 'orders-dr',
  shadowRedpandaId: 'dr',
  clientOptions: { bootstrapServers: ['seed-abc.byoc.prd.cloud.redpanda.com:9092'] },
});
const external = create(ShadowLinkSchema, {
  id: 'vendor-dr',
  name: 'vendor-dr',
  shadowRedpandaId: 'dr',
  clientOptions: { bootstrapServers: ['kafka-01.corp.example:9092'] },
});

const listItem = ({ id, name, shadowRedpandaId }: ShadowLink, state = ShadowLink_State.ACTIVE) =>
  create(ShadowLinkListItemSchema, { id, name, shadowRedpandaId, state });

const ready = <T>(value: T): Loaded<T> => ({ status: 'ready', value });

const inputs = (overrides: Partial<TopologyInputs> = {}): TopologyInputs => ({
  clusterId: 'dr',
  links: { items: [listItem(toProd), listItem(external)], loading: false, complete: true },
  details: new Map([
    ['orders-dr', ready(toProd)],
    ['vendor-dr', ready(external)],
  ]),
  self: ready(dr),
  clusterNames: new Map([
    ['prod', 'prod-cluster'],
    ['dr', 'dr-cluster'],
  ]),
  clusterNamesSettled: true,
  candidates: { clusters: [prod], complete: true, failed: false },
  ...overrides,
});

describe('buildShadowLinkTopology', () => {
  test('resolves a Cloud source with its fence still loading, and one Cloud doesn’t manage', () => {
    expect(buildShadowLinkTopology(inputs())).toEqual({
      clusterName: 'dr-cluster',
      readers: [],
      sources: {
        'orders-dr': { kind: 'cloud', clusterId: 'prod', clusterName: 'prod-cluster', fence: { status: 'loading' } },
        'vendor-dr': { kind: 'external', bootstrapServers: ['kafka-01.corp.example:9092'] },
      },
      resolving: false,
      readersIncomplete: false,
    });
  });

  test('never calls a source external before every candidate cluster is in', () => {
    const partial = buildShadowLinkTopology(inputs({ candidates: { clusters: [], complete: false, failed: false } }));
    expect(partial.sources).toEqual({});
    expect(partial.resolving).toBe(true);

    const failed = buildShadowLinkTopology(inputs({ candidates: { clusters: [], complete: false, failed: true } }));
    expect(failed.sources).toEqual({});
    expect(failed.resolving).toBe(false);
  });

  test('a link whose details failed is left out of `sources` once nothing is still resolving', () => {
    const topology = buildShadowLinkTopology(
      inputs({
        details: new Map<string, Loaded<ShadowLink>>([
          ['orders-dr', { status: 'failed' }],
          ['vendor-dr', ready(external)],
        ]),
      })
    );
    expect(Object.keys(topology.sources)).toEqual(['vendor-dr']);
    expect(topology.resolving).toBe(false);
  });

  test('on the source, a reader waits for this cluster’s seeds, and a failed lookup marks the list incomplete', () => {
    const onProd = (self: Loaded<Cluster>) =>
      buildShadowLinkTopology(
        inputs({ clusterId: 'prod', self, candidates: { clusters: [], complete: false, failed: false } })
      );

    expect(onProd(ready(prod)).readers.map((reader) => reader.linkName)).toEqual(['orders-dr']);
    expect(onProd({ status: 'pending' })).toMatchObject({ readers: [], resolving: true });
    expect(onProd({ status: 'failed' })).toMatchObject({ readers: [], resolving: false, readersIncomplete: true });
  });

  test('waits for the cluster list before showing a reader’s shadow cluster by name', () => {
    const onProd = (clusterNamesSettled: boolean) =>
      buildShadowLinkTopology(inputs({ clusterId: 'prod', self: ready(prod), clusterNamesSettled }));
    expect(onProd(false).resolving).toBe(true);
    expect(onProd(true)).toMatchObject({ resolving: false, readers: [{ shadowClusterName: 'dr-cluster' }] });
  });

  test('a link that isn’t reading, such as one still being created, isn’t a reader', () => {
    const topology = buildShadowLinkTopology(
      inputs({
        clusterId: 'prod',
        self: ready(prod),
        links: { items: [listItem(toProd, ShadowLink_State.CREATING)], loading: false, complete: true },
      })
    );
    expect(topology.readers).toEqual([]);
  });

  test('a list that stopped part way through may be missing readers', () => {
    const topology = buildShadowLinkTopology(
      inputs({ links: { items: [listItem(toProd)], loading: false, complete: false } })
    );
    expect(topology.readersIncomplete).toBe(true);
  });
});

test('withPeerFences fills in each Cloud source’s fence, keeping others as they are', () => {
  const topology = buildShadowLinkTopology(inputs());
  expect(sourceClusterIds(topology)).toEqual(['prod']);

  const fenced = withPeerFences(topology, new Map([['prod', { status: 'unavailable', reason: 'forbidden' } as const]]));
  expect(fenced.sources['orders-dr']).toMatchObject({ fence: { status: 'unavailable', reason: 'forbidden' } });
  expect(fenced.sources['vendor-dr']).toBe(topology.sources['vendor-dr']);
});

describe('clusters that share a host, as local ones do', () => {
  const local = (id: string, port: number) => cluster(id, `redpanda-0.localhost:${port}`);
  const a = local('a', 30_092);
  const b = local('b', 31_092);
  const c = local('c', 32_092);
  const linkFrom = (port: number) =>
    create(ShadowLinkSchema, {
      id: 'a-to-c',
      name: 'a-to-c',
      shadowRedpandaId: 'c',
      clientOptions: { bootstrapServers: [`redpanda-0.localhost:${port}`] },
    });
  const onB = (link: ShadowLink, candidates: TopologyInputs['candidates']) =>
    inputs({
      clusterId: 'b',
      self: ready(b),
      links: { items: [listItem(link)], loading: false, complete: true },
      details: new Map([['a-to-c', ready(link)]]),
      candidates,
    });

  test('a link to another cluster on the same host doesn’t read from this one', () => {
    const exactToA = onB(linkFrom(30_092), { clusters: [a, c], complete: true, failed: false });
    expect(needsOtherClusters(exactToA)).toBe(true);
    expect(buildShadowLinkTopology(exactToA).readers).toEqual([]);
  });

  test('an exact match needs no other cluster', () => {
    const exactToB = onB(linkFrom(31_092), { clusters: [], complete: false, failed: false });
    expect(needsOtherClusters(exactToB)).toBe(false);
    expect(buildShadowLinkTopology(exactToB).readers.map((reader) => reader.linkName)).toEqual(['a-to-c']);
  });

  test('a host-only match waits for the other clusters, then counts only if none of them claims it', () => {
    const otherPort = linkFrom(39_092);
    expect(buildShadowLinkTopology(onB(otherPort, { clusters: [], complete: false, failed: false }))).toMatchObject({
      readers: [],
      resolving: true,
    });
    expect(
      buildShadowLinkTopology(onB(otherPort, { clusters: [a, c], complete: true, failed: false })).readers
    ).toEqual([]);
    expect(
      buildShadowLinkTopology(
        onB(otherPort, { clusters: [cluster('a', 'elsewhere:9092')], complete: true, failed: false })
      ).readers
    ).toHaveLength(1);
  });
});
