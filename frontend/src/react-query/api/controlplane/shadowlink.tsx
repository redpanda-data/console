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

import {
  type DeleteShadowLinkOperationSchema as CpDeleteShadowLinkOperationSchema,
  type DeleteShadowLinkRequestSchema as CpDeleteShadowLinkRequestSchema,
  GetShadowLinkRequestSchema as CpGetShadowLinkRequestSchema,
  ListShadowLinksRequestSchema as CpListShadowLinksRequestSchema,
  type UpdateShadowLinkOperationSchema as CpUpdateShadowLinkOperationSchema,
  type UpdateShadowLinkRequestSchema as CpUpdateShadowLinkRequestSchema,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import {
  deleteShadowLink as cpDeleteShadowLink,
  getShadowLink as cpGetShadowLink,
  listShadowLinks as cpListShadowLinks,
  updateShadowLink as cpUpdateShadowLink,
} from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/controlplane/v1/shadow_link-ShadowLinkService_connectquery';
import { create } from '@bufbuild/protobuf';
import { createConnectQueryKey, type UseMutationOptions, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { config, isEmbedded } from 'config';
import { useControlplaneTransport } from 'hooks/use-controlplane-transport';
import { MAX_PAGE_SIZE } from 'react-query/react-query.utils';

/* ==================== CONTROLPLANE HOOKS ==================== */
/* These hooks are used when running in embedded mode (cloud UI) */
/* They create their own controlplane transport internally */

/**
 * Hook to list shadow links using controlplane API
 * Creates its own controlplane transport, no TransportProvider needed
 */
export const useControlplaneListShadowLinksQuery = (opts?: { enabled?: boolean }) => {
  const transport = useControlplaneTransport();
  const embedded = isEmbedded();
  const clusterId = config.clusterId;
  const hasValidClusterId = Boolean(clusterId) && clusterId !== 'default';

  const request = create(CpListShadowLinksRequestSchema, {
    filter: {
      shadowRedpandaId: clusterId ?? '',
    },
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
  });

  // Only make request in embedded mode with a valid (non-default) clusterId
  const isEnabled = embedded && hasValidClusterId && (opts?.enabled ?? true);

  return useQuery(cpListShadowLinks, request, { enabled: isEnabled, transport });
};

/**
 * Hook to get a shadow link by ID using controlplane API
 * Creates its own controlplane transport, no TransportProvider needed
 */
export const useControlplaneGetShadowLinkQuery = (request: { id: string }, opts?: { enabled?: boolean }) => {
  const transport = useControlplaneTransport();
  const getShadowLinkRequest = create(CpGetShadowLinkRequestSchema, {
    id: request.id,
  });

  return useQuery(cpGetShadowLink, getShadowLinkRequest, { enabled: opts?.enabled ?? true, transport });
};

/**
 * Hook to get a shadow link by name using controlplane API (requires ID lookup)
 * First lists shadow links to find ID by name, then fetches full details
 * Creates its own controlplane transport, no TransportProvider needed
 */
export const useControlplaneGetShadowLinkByNameQuery = (request: { name: string }, opts?: { enabled?: boolean }) => {
  // First, list to find ID by name
  const listQuery = useControlplaneListShadowLinksQuery({ enabled: opts?.enabled });

  const shadowLinkId = listQuery.data?.shadowLinks?.find((sl) => sl.name === request.name)?.id;

  // Then fetch full details by ID
  const getQuery = useControlplaneGetShadowLinkQuery({ id: shadowLinkId ?? '' }, { enabled: !!shadowLinkId });

  return {
    data: getQuery.data?.shadowLink,
    isLoading: listQuery.isLoading || (!!shadowLinkId && getQuery.isLoading),
    error: listQuery.error || getQuery.error,
    refetch: async () => {
      await listQuery.refetch();
      await getQuery.refetch();
    },
  };
};

/**
 * Hook to update a shadow link using controlplane API
 * Creates its own controlplane transport, no TransportProvider needed
 */
export const useControlplaneUpdateShadowLinkMutation = (
  options?: UseMutationOptions<typeof CpUpdateShadowLinkRequestSchema, typeof CpUpdateShadowLinkOperationSchema>
) => {
  const transport = useControlplaneTransport();
  const queryClient = useQueryClient();

  return useMutation(cpUpdateShadowLink, {
    transport,
    onSuccess: async () => {
      // Invalidate controlplane list query
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: cpListShadowLinks,
          cardinality: 'finite',
        }),
        exact: false,
      });
      // Invalidate controlplane get query
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: cpGetShadowLink,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    ...options,
  });
};

/**
 * Hook to delete a shadow link using controlplane API
 * Creates its own controlplane transport, no TransportProvider needed
 */
export const useControlplaneDeleteShadowLinkMutation = (
  options?: UseMutationOptions<typeof CpDeleteShadowLinkRequestSchema, typeof CpDeleteShadowLinkOperationSchema>
) => {
  const transport = useControlplaneTransport();
  const queryClient = useQueryClient();

  return useMutation(cpDeleteShadowLink, {
    transport,
    onSuccess: async () => {
      // Invalidate controlplane list query
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: cpListShadowLinks,
          cardinality: 'finite',
        }),
        exact: false,
      });
      // Invalidate controlplane get query
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: cpGetShadowLink,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    ...options,
  });
};
