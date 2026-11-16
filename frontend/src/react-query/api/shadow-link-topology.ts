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

import type {
  Cluster,
  GetClusterResponse,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/cluster_pb';
import type {
  GetShadowLinkResponse,
  ShadowLink,
  ShadowLinkListItem,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import {
  getCluster,
  listClusters,
} from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/controlplane/v1/cluster-ClusterService_connectquery';
import {
  getShadowLink,
  listShadowLinks,
} from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/controlplane/v1/shadow_link-ShadowLinkService_connectquery';
import type { Transport } from '@connectrpc/connect';
import { createQueryOptions, useQuery } from '@connectrpc/connect-query';
import { type UseQueryResult, useQueries } from '@tanstack/react-query';
import {
  buildShadowLinkTopology,
  canBeLinkSource,
  canReadFence,
  type Loaded,
  linksNeedingDetails,
  needsOtherClusters,
  type ShadowLinkPeerFence,
  type ShadowLinkTopology,
  type SourceCandidates,
  sourceClusterIds,
  withPeerFences,
} from 'components/cluster-fence/shadow-link-topology';
import { config, isEmbedded } from 'config';
import { useControlplaneTransport } from 'hooks/use-controlplane-transport';
import { useCallback, useMemo } from 'react';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';

import { isGuidedFailoverEnabled } from './cluster-fence';
import {
  peerFenceRefetchInterval,
  peerFenceRetry,
  readPeerClusterFence,
  unreadablePeerFence,
} from './peer-cluster-fence';

const PAGE_SIZE = 100;
const STALE_MS = 60_000;

const NO_LINKS: ShadowLinkListItem[] = [];
const NO_CLUSTERS: Cluster[] = [];

const loadedOf = <T>(value: T | undefined, isError: boolean): Loaded<T> => {
  if (value !== undefined) {
    return { status: 'ready', value };
  }
  return isError ? { status: 'failed' } : { status: 'pending' };
};

type AllPages<Item> = {
  items: Item[] | undefined;
  /** Every page is in. */
  complete: boolean;
  /** A page failed before the list was complete; a failed refresh of a complete list keeps it. */
  failed: boolean;
};

const useAllPages = <Item>(
  pages: Item[][] | undefined,
  query: { hasNextPage: boolean; isError: boolean }
): AllPages<Item> => {
  const items = useMemo(() => pages?.flat(), [pages]);
  const complete = items !== undefined && !query.hasNextPage;
  const failed = query.isError && !complete;
  return useMemo(() => ({ items, complete, failed }), [items, complete, failed]);
};

const useOrganizationLinks = (transport: Transport, enabled: boolean) => {
  const query = useInfiniteQueryWithAllPages(
    listShadowLinks,
    { pageSize: PAGE_SIZE, pageToken: '' },
    {
      pageParamKey: 'pageToken',
      getNextPageParam: (page) => page.nextPageToken || undefined,
      transport,
      enabled,
      staleTime: STALE_MS,
    }
  );
  const pages = useMemo(() => query.data?.pages.map((page) => page.shadowLinks), [query.data]);
  const all = useAllPages(pages, query);
  return useMemo(
    () => ({
      items: all.items ?? NO_LINKS,
      loading: !(all.complete || all.failed),
      /** False when a page failed part way through, so some links may be missing. */
      complete: !all.failed,
      /** Not even the first page loaded. */
      unavailable: all.failed && all.items === undefined,
    }),
    [all]
  );
};

const useOrganizationClusters = (transport: Transport, enabled: boolean) => {
  const query = useInfiniteQueryWithAllPages(
    listClusters,
    { pageSize: PAGE_SIZE, pageToken: '' },
    {
      pageParamKey: 'pageToken',
      getNextPageParam: (page) => page.nextPageToken || undefined,
      transport,
      enabled,
      staleTime: STALE_MS,
    }
  );
  const pages = useMemo(() => query.data?.pages.map((page) => page.clusters), [query.data]);
  return useAllPages(pages, query);
};

const combineDetails = (ids: readonly string[]) => (results: UseQueryResult<GetShadowLinkResponse>[]) => {
  const byId = new Map<string, Loaded<ShadowLink>>();
  results.forEach((result, index) => {
    const id = ids[index];
    if (id) {
      byId.set(id, loadedOf(result.data?.shadowLink, result.isError));
    }
  });
  return byId;
};

/** Details of the links the topology needs, which carry the bootstrap servers and user the list doesn't. */
const useLinkDetails = (transport: Transport, links: readonly ShadowLinkListItem[], clusterId: string) => {
  const ids = useMemo(() => linksNeedingDetails(links, clusterId).map((link) => link.id), [links, clusterId]);
  const combine = useMemo(() => combineDetails(ids), [ids]);
  return useQueries({
    queries: ids.map((id) => ({ ...createQueryOptions(getShadowLink, { id }, { transport }), staleTime: STALE_MS })),
    combine,
  });
};

const combineCandidates = (results: UseQueryResult<GetClusterResponse>[]) => {
  const clusters: Cluster[] = [];
  let pending = false;
  let failed = false;
  for (const result of results) {
    const cluster = result.data?.cluster;
    if (cluster) {
      clusters.push(cluster);
    } else if (result.isError) {
      failed = true;
    } else {
      pending = true;
    }
  }
  return { clusters, pending, failed };
};

/**
 * The organization's other clusters, with the seed brokers and Console URLs ListClusters doesn't
 * carry. Only read when needed: for this cluster's own links' sources, or to tell which of several
 * clusters on one host a link reads from.
 */
const useSourceCandidates = (
  transport: Transport,
  clusterId: string,
  clusters: AllPages<Cluster>,
  enabled: boolean
): SourceCandidates => {
  const ids = useMemo(
    () =>
      enabled
        ? (clusters.items ?? NO_CLUSTERS)
            .filter((cluster) => cluster.id !== clusterId && canBeLinkSource(cluster))
            .map((cluster) => cluster.id)
        : [],
    [enabled, clusters.items, clusterId]
  );
  const seeds = useQueries({
    queries: ids.map((id) => ({ ...createQueryOptions(getCluster, { id }, { transport }), staleTime: STALE_MS })),
    combine: combineCandidates,
  });
  const complete = enabled && clusters.complete && !seeds.pending && !seeds.failed;
  const failed = enabled && (clusters.failed || seeds.failed);
  return useMemo(() => ({ clusters: seeds.clusters, complete, failed }), [seeds.clusters, complete, failed]);
};

const NOT_RUNNING: ShadowLinkPeerFence = { status: 'unavailable', reason: 'not-running' };

/** Each source cluster's fence, keyed by cluster id; one still loading has no entry. */
const usePeerFences = (sources: readonly Cluster[]) => {
  const readable = useMemo(() => sources.filter(canReadFence), [sources]);
  const combine = useCallback(
    (results: UseQueryResult<ShadowLinkPeerFence>[]) => {
      const fences = new Map<string, ShadowLinkPeerFence>();
      for (const cluster of sources) {
        if (!canReadFence(cluster)) {
          fences.set(cluster.id, NOT_RUNNING);
        }
      }
      readable.forEach((cluster, index) => {
        const result = results[index];
        if (result?.data) {
          fences.set(cluster.id, result.data);
        } else if (result?.isError) {
          fences.set(cluster.id, unreadablePeerFence(result.error));
        }
      });
      return fences;
    },
    [sources, readable]
  );
  return useQueries({
    queries: readable.map((cluster) => {
      const consoleUrl = cluster.redpandaConsole?.url || undefined;
      return {
        queryKey: ['cluster-fence-peer-status', cluster.id, consoleUrl],
        queryFn: ({ signal }: { signal: AbortSignal }) => readPeerClusterFence(consoleUrl, signal),
        retry: peerFenceRetry,
        staleTime: 10_000,
        refetchInterval: peerFenceRefetchInterval,
      };
    }),
    combine,
  });
};

const hasClusterId = (clusterId: string | undefined): clusterId is string =>
  Boolean(clusterId) && clusterId !== 'default';

const useSelfCluster = (transport: Transport, clusterId: string, enabled: boolean): Loaded<Cluster> => {
  const query = useQuery(getCluster, { id: clusterId }, { transport, enabled, staleTime: STALE_MS });
  return useMemo(() => loadedOf(query.data?.cluster, query.isError), [query.data, query.isError]);
};

const useClusterNames = (clusters: Cluster[] | undefined) =>
  useMemo(() => new Map((clusters ?? NO_CLUSTERS).map((cluster) => [cluster.id, cluster.name])), [clusters]);

/** The topology from the control plane alone, with every source's fence still loading. */
const useResolvedTopology = (clusterId: string, enabled: boolean) => {
  const transport = useControlplaneTransport();
  const links = useOrganizationLinks(transport, enabled);
  const self = useSelfCluster(transport, clusterId, enabled);
  const clusters = useOrganizationClusters(transport, enabled && links.items.length > 0);
  const details = useLinkDetails(transport, links.items, clusterId);
  const candidates = useSourceCandidates(
    transport,
    clusterId,
    clusters,
    links.items.some((link) => link.shadowRedpandaId === clusterId) ||
      needsOtherClusters({ clusterId, links, details, self })
  );
  const clusterNames = useClusterNames(clusters.items);
  const topology = useMemo(
    () =>
      enabled && !links.unavailable
        ? buildShadowLinkTopology({
            clusterId,
            links,
            details,
            self,
            clusterNames,
            clusterNamesSettled: clusters.complete || clusters.failed,
            candidates,
          })
        : null,
    [enabled, clusterId, links, details, self, clusterNames, clusters, candidates]
  );
  return { topology, candidates };
};

/** The source clusters to read fences from, with the Console URL and state GetCluster gave. */
const useSourceClusters = (topology: ShadowLinkTopology | null, candidates: readonly Cluster[]) => {
  const ids = topology ? sourceClusterIds(topology).join(',') : '';
  return useMemo(() => {
    const wanted = new Set(ids.split(','));
    return candidates.filter((cluster) => wanted.has(cluster.id));
  }, [ids, candidates]);
};

/**
 * The shadow links around this cluster, from the Redpanda Cloud control plane, with the signed-in
 * user's own token: who reads from this cluster, and, for each link on it, where it reads from and
 * that source's fence, read from the source's own Console. Only embedded in Cloud, and only with
 * fencing on. Null otherwise, or when the link list can't load, so the pages fall back to what this
 * cluster can see on its own, as in a self-hosted Console.
 */
export const useShadowLinkTopology = (): ShadowLinkTopology | null => {
  const clusterId = hasClusterId(config.clusterId) ? config.clusterId : '';
  const enabled = isEmbedded() && isGuidedFailoverEnabled() && clusterId !== '';
  const { topology, candidates } = useResolvedTopology(clusterId, enabled);
  const fences = usePeerFences(useSourceClusters(topology, candidates.clusters));
  return useMemo(() => topology && withPeerFences(topology, fences), [topology, fences]);
};
