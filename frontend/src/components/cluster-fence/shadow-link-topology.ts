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
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/cluster_pb';
import {
  type ShadowLink,
  ShadowLink_State,
  type ShadowLinkListItem,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import { getLinkIdentity } from 'components/pages/shadowlinks/details/failover-model';
import { fromControlplaneShadowLink } from 'components/pages/shadowlinks/mappers/controlplane';
import { isUuid } from 'utils/uuid.utils';

import type { BrokerProgress, FencePhase, FenceSummary, LinkIdentity } from './cluster-fence-model';

/**
 * Why another cluster's fence can't be shown.
 * - `unsupported`: the cluster doesn't serve the cluster fence API.
 * - `forbidden`: the viewer doesn't have permission to read it.
 * - `inactive`: the feature turns on once every broker runs Redpanda v26.3.1.
 * - `no-leader`: the cluster has no controller leader right now; Console keeps trying.
 * - `not-running`: the cluster isn't running.
 * - `error`: anything else.
 */
export type PeerFenceUnavailableReason =
  | 'unsupported'
  | 'forbidden'
  | 'inactive'
  | 'no-leader'
  | 'not-running'
  | 'error';

/** One broker's copy of another cluster's fence. */
export type ShadowLinkPeerFenceBroker = Pick<BrokerProgress, 'nodeId' | 'status'>;

/** Another cluster's cluster fence, as Console last read it from that cluster's own Console. */
export type ShadowLinkPeerFence =
  | { status: 'loading' }
  | { status: 'unavailable'; reason: PeerFenceUnavailableReason }
  | (Omit<FenceSummary, 'phase'> & {
      status: 'known';
      state: FencePhase;
      /** Each broker's copy; empty when the cluster reported none. */
      brokers: ShadowLinkPeerFenceBroker[];
    });

export type ShadowLinkSource =
  | { kind: 'cloud'; clusterId: string; clusterName: string; fence: ShadowLinkPeerFence }
  /** A source Redpanda Cloud doesn't manage, such as a link to a self-hosted cluster. */
  | { kind: 'external'; bootstrapServers: string[] };

export type ShadowLinkReader = Required<Pick<LinkIdentity, 'authentication'>> &
  Pick<LinkIdentity, 'principal'> & {
    linkName: string;
    shadowClusterId: string;
    shadowClusterName: string;
  };

/** The shadow links around this cluster, which only Redpanda Cloud can list. */
export type ShadowLinkTopology = {
  /** This cluster's name in Cloud, for confirmations that ask the user to type it. Undefined until it loads. */
  clusterName: string | undefined;
  /** Links elsewhere in the organization whose source is this cluster. */
  readers: ShadowLinkReader[];
  /** Where each shadow link on this cluster reads from, keyed by link name. */
  sources: Record<string, ShadowLinkSource>;
  /**
   * True while some links are still being resolved, so `readers` and `sources` may be missing
   * entries. Once false, a link missing from `sources` is one Console couldn't resolve.
   */
  resolving: boolean;
  /**
   * True when Console couldn't check every link, for example because a request failed, so `readers`
   * may be missing some even once `resolving` is false.
   */
  readersIncomplete: boolean;
};

/** An active or paused link reads from its source: one still being created, or failed or being deleted, doesn't. */
export const isReadingLinkState = (state: ShadowLink_State): boolean =>
  state === ShadowLink_State.ACTIVE || state === ShadowLink_State.PAUSED;

const LINK_SOURCE_STATES = new Set([Cluster_State.READY, Cluster_State.UPGRADING, Cluster_State.SUSPENDED]);

/**
 * A cluster that may be a link's source and that GetCluster can read. One being created, deleted or
 * failed to create may carry a UUID GetCluster rejects, which would leave the topology resolving for good.
 */
export const canBeLinkSource = (cluster: Pick<Cluster, 'id' | 'state'>): boolean =>
  LINK_SOURCE_STATES.has(cluster.state) && cluster.id !== '' && !isUuid(cluster.id);

/** Only a running cluster answers for its fence. */
export const canReadFence = (cluster: Pick<Cluster, 'state'>): boolean =>
  cluster.state === Cluster_State.READY || cluster.state === Cluster_State.UPGRADING;

const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:\/\//;

const normalizeEndpoint = (endpoint: string) => endpoint.trim().toLowerCase().replace(SCHEME_PREFIX, '');

const hostOf = (endpoint: string) => {
  const normalized = normalizeEndpoint(endpoint);
  const portSeparator = normalized.lastIndexOf(':');
  return portSeparator > 0 ? normalized.slice(0, portSeparator) : normalized;
};

type Endpoints = { exact: ReadonlySet<string>; hosts: ReadonlySet<string> };

const endpointsOf = (bootstrapServers: readonly string[]): Endpoints => ({
  exact: new Set(bootstrapServers.map(normalizeEndpoint)),
  hosts: new Set(bootstrapServers.map(hostOf)),
});

const seedsOf = (cluster: Cluster) => cluster.kafkaApi?.seedBrokers ?? [];

const matchesExactly = (endpoints: Endpoints, cluster: Cluster) =>
  seedsOf(cluster).some((seed) => endpoints.exact.has(normalizeEndpoint(seed)));

const matchesHost = (endpoints: Endpoints, cluster: Cluster) =>
  seedsOf(cluster).some((seed) => endpoints.hosts.has(hostOf(seed)));

/**
 * The control plane turns a link's source cluster into bootstrap servers when the link is created,
 * and doesn't keep the cluster's id, so the source is found by matching those servers against each
 * cluster's seed brokers. An exact host:port match wins; a host-only match covers seed brokers and
 * bootstrap servers that name the same listener on different ports.
 */
export const findSourceCluster = (
  bootstrapServers: readonly string[],
  clusters: readonly Cluster[],
  shadowClusterId: string
): Cluster | undefined => {
  const candidates = clusters.filter((cluster) => cluster.id !== shadowClusterId);
  const endpoints = endpointsOf(bootstrapServers);
  return (
    candidates.find((cluster) => matchesExactly(endpoints, cluster)) ??
    candidates.find((cluster) => matchesHost(endpoints, cluster))
  );
};

/**
 * Whether a link reads from `self`, or what that waits on. Exact host:port matches never clash. A
 * host-only match only counts once no other cluster matches those servers too: clusters can share a
 * host on different ports, as local ones do.
 */
const readsFrom = (
  link: Pick<ShadowLinkListItem, 'shadowRedpandaId'>,
  bootstrapServers: readonly string[],
  self: Cluster,
  others: SourceCandidates
): boolean | 'pending' | 'failed' => {
  const endpoints = endpointsOf(bootstrapServers);
  if (matchesExactly(endpoints, self)) {
    return true;
  }
  if (!matchesHost(endpoints, self)) {
    return false;
  }
  const claimed = others.clusters.some(
    (cluster) => cluster.id !== link.shadowRedpandaId && cluster.id !== self.id && matchesHost(endpoints, cluster)
  );
  if (claimed || others.complete) {
    return !claimed;
  }
  return others.failed ? 'failed' : 'pending';
};

/** A lookup that is still loading, failed, or answered. */
export type Loaded<T> = { status: 'pending' } | { status: 'failed' } | { status: 'ready'; value: T };

/**
 * The clusters that may be a link's source, with the seed brokers only GetCluster carries. `complete`
 * once every one is in; `failed` once some couldn't load, so a link that matches none may still be
 * from Cloud.
 */
export type SourceCandidates = { clusters: Cluster[]; complete: boolean; failed: boolean };

type LinkResolution = { kind: 'source'; source: ShadowLinkSource } | { kind: 'pending' } | { kind: 'unresolved' };

const LOADING_FENCE: ShadowLinkPeerFence = { status: 'loading' };

const resolveOwnLink = (
  details: Loaded<ShadowLink>,
  candidates: SourceCandidates,
  clusterId: string
): LinkResolution => {
  if (details.status !== 'ready') {
    return details.status === 'failed' ? { kind: 'unresolved' } : { kind: 'pending' };
  }
  const bootstrapServers = details.value.clientOptions?.bootstrapServers ?? [];
  const cluster = findSourceCluster(bootstrapServers, candidates.clusters, clusterId);
  if (cluster) {
    return {
      kind: 'source',
      source: { kind: 'cloud', clusterId: cluster.id, clusterName: cluster.name, fence: LOADING_FENCE },
    };
  }
  // Until every candidate is in, no match means "not yet", not "outside Cloud".
  if (candidates.complete) {
    return { kind: 'source', source: { kind: 'external', bootstrapServers } };
  }
  return candidates.failed ? { kind: 'unresolved' } : { kind: 'pending' };
};

const readerOf = (link: ShadowLinkListItem, details: ShadowLink, clusterNames: ReadonlyMap<string, string>) => {
  const { authentication = 'none', principal } = getLinkIdentity(fromControlplaneShadowLink(details));
  return {
    linkName: link.name,
    shadowClusterId: link.shadowRedpandaId,
    shadowClusterName: clusterNames.get(link.shadowRedpandaId) ?? link.shadowRedpandaId,
    authentication,
    principal,
  } satisfies ShadowLinkReader;
};

export type TopologyInputs = {
  clusterId: string;
  /** Every shadow link in the organization; `complete` is false when a later page failed. */
  links: { items: ShadowLinkListItem[]; loading: boolean; complete: boolean };
  /** Details of the links this cluster's topology needs, keyed by link id. */
  details: ReadonlyMap<string, Loaded<ShadowLink>>;
  /** This cluster, from GetCluster: its seed brokers decide which links read from it. */
  self: Loaded<Cluster>;
  /** Names of the organization's clusters, keyed by id, for links' shadow clusters. */
  clusterNames: ReadonlyMap<string, string>;
  /** The cluster list has loaded, or failed to, so a reader's shadow cluster has its name or never will. */
  clusterNamesSettled: boolean;
  /** The other clusters, for links' sources and for telling apart clusters that share a host. */
  candidates: SourceCandidates;
};

/** The links whose details the topology needs: this cluster's own, and every other one that reads. */
export const linksNeedingDetails = (links: readonly ShadowLinkListItem[], clusterId: string) =>
  links.filter((link) => link.shadowRedpandaId === clusterId || isReadingLinkState(link.state));

const PENDING: Loaded<never> = { status: 'pending' };

const resolveSources = (
  ownLinks: readonly ShadowLinkListItem[],
  details: TopologyInputs['details'],
  candidates: SourceCandidates,
  clusterId: string
) => {
  const sources: Record<string, ShadowLinkSource> = {};
  let pending = false;
  for (const link of ownLinks) {
    const resolution = resolveOwnLink(details.get(link.id) ?? PENDING, candidates, clusterId);
    if (resolution.kind === 'source') {
      sources[link.name] = resolution.source;
    }
    pending ||= resolution.kind === 'pending';
  }
  return { sources, pending };
};

type ReaderLookup = Pick<TopologyInputs, 'self' | 'clusterNames' | 'candidates'>;

/** The link as a reader of this cluster, undefined when it reads from elsewhere, or why that isn't known. */
const readerFrom = (
  link: ShadowLinkListItem,
  details: Loaded<ShadowLink>,
  { self, clusterNames, candidates }: ReaderLookup
): ShadowLinkReader | 'pending' | 'failed' | undefined => {
  if (details.status === 'failed' || self.status === 'failed') {
    return 'failed';
  }
  if (details.status === 'pending' || self.status === 'pending') {
    return 'pending';
  }
  const reads = readsFrom(link, details.value.clientOptions?.bootstrapServers ?? [], self.value, candidates);
  if (reads === true) {
    return readerOf(link, details.value, clusterNames);
  }
  return reads === false ? undefined : reads;
};

const resolveReaders = (
  links: readonly ShadowLinkListItem[],
  details: TopologyInputs['details'],
  lookup: ReaderLookup
) => {
  const results = links.map((link) => readerFrom(link, details.get(link.id) ?? PENDING, lookup));
  return {
    readers: results.filter((result): result is ShadowLinkReader => typeof result === 'object'),
    pending: results.includes('pending'),
    failed: results.includes('failed'),
  };
};

/**
 * Whether telling who reads from this cluster needs the other clusters' seed brokers: only when some
 * link's servers match this cluster's host but not its exact host:port, so another cluster on the
 * same host could be its source.
 */
export const needsOtherClusters = ({
  clusterId,
  links,
  details,
  self,
}: Pick<TopologyInputs, 'clusterId' | 'links' | 'details' | 'self'>): boolean => {
  if (self.status !== 'ready') {
    return false;
  }
  return linksNeedingDetails(links.items, clusterId).some((link) => {
    const linkDetails = details.get(link.id);
    if (link.shadowRedpandaId === clusterId || linkDetails?.status !== 'ready') {
      return false;
    }
    const endpoints = endpointsOf(linkDetails.value.clientOptions?.bootstrapServers ?? []);
    return !matchesExactly(endpoints, self.value) && matchesHost(endpoints, self.value);
  });
};

/**
 * Who reads from this cluster and, for each link on it, where that link reads from, with every Cloud
 * source's fence still loading (see `withPeerFences`). A link reads from this cluster when its
 * bootstrap servers match this cluster's seed brokers and no other cluster's.
 */
export const buildShadowLinkTopology = ({
  clusterId,
  links,
  details,
  self,
  clusterNames,
  clusterNamesSettled,
  candidates,
}: TopologyInputs): ShadowLinkTopology => {
  const needed = linksNeedingDetails(links.items, clusterId);
  const own = resolveSources(
    needed.filter((link) => link.shadowRedpandaId === clusterId),
    details,
    candidates,
    clusterId
  );
  const others = resolveReaders(
    needed.filter((link) => link.shadowRedpandaId !== clusterId),
    details,
    { self, clusterNames, candidates }
  );
  // A reader's shadow cluster shows by id until the cluster list gives its name.
  const namesPending = others.readers.length > 0 && !clusterNamesSettled;
  return {
    clusterName: self.status === 'ready' ? self.value.name : clusterNames.get(clusterId),
    readers: others.readers,
    sources: own.sources,
    resolving: links.loading || own.pending || others.pending || namesPending,
    readersIncomplete: !links.complete || others.failed,
  };
};

/** The Cloud clusters this cluster's links read from, each once. */
export const sourceClusterIds = (topology: ShadowLinkTopology): string[] => [
  ...new Set(Object.values(topology.sources).flatMap((source) => (source.kind === 'cloud' ? [source.clusterId] : []))),
];

/** Fills in each Cloud source's fence; one with no reading yet stays loading. */
export const withPeerFences = (
  topology: ShadowLinkTopology,
  fences: ReadonlyMap<string, ShadowLinkPeerFence>
): ShadowLinkTopology => ({
  ...topology,
  sources: Object.fromEntries(
    Object.entries(topology.sources).map(([linkName, source]) => [
      linkName,
      source.kind === 'cloud' ? { ...source, fence: fences.get(source.clusterId) ?? LOADING_FENCE } : source,
    ])
  ),
});
