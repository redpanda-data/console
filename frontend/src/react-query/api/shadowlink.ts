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

import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import type { ConnectError } from '@connectrpc/connect';
import {
  createConnectQueryKey,
  type UseInfiniteQueryOptions,
  type UseMutationOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import type { FormValues } from 'components/pages/shadowlinks/create/model';
import {
  buildControlplaneUpdateRequest,
  buildDataplaneUpdateRequest,
} from 'components/pages/shadowlinks/edit/shadowlink-edit-utils';
import {
  buildDefaultFormValuesFromControlplane,
  fromControlplaneShadowLink,
} from 'components/pages/shadowlinks/mappers/controlplane';
import { buildDefaultFormValues, fromDataplaneShadowLink } from 'components/pages/shadowlinks/mappers/dataplane';
import { mapControlplaneStateToUnified, type UnifiedShadowLink } from 'components/pages/shadowlinks/model';
import { isEmbedded } from 'config';
import {
  type CreateShadowLinkResponseSchema,
  type ListShadowLinksRequest,
  ListShadowLinksRequestSchema,
  type UpdateShadowLinkResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import {
  createShadowLink,
  deleteShadowLink,
  listShadowLinks,
  updateShadowLink,
} from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import {
  type GetShadowLinkRequest,
  GetShadowLinkRequestSchema,
  type GetShadowLinkResponseSchema,
  type GetShadowMetricsRequest,
  GetShadowMetricsRequestSchema,
  type GetShadowMetricsResponse,
  type GetShadowTopicRequest,
  GetShadowTopicRequestSchema,
  type GetShadowTopicResponse,
  type ListShadowLinkTopicsRequest,
  ListShadowLinkTopicsRequestSchema,
  type ListShadowLinkTopicsResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import {
  failOver,
  getShadowLink,
  getShadowMetrics,
  getShadowTopic,
  listShadowLinkTopics,
} from 'protogen/redpanda/api/dataplane/v1/shadowlink-ShadowLinkService_connectquery';
import type {
  CreateShadowLinkRequestSchema,
  UpdateShadowLinkRequestSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useCallback, useMemo } from 'react';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';

import {
  useControlplaneDeleteShadowLinkMutation,
  useControlplaneGetShadowLinkByNameQuery,
  useControlplaneUpdateShadowLinkMutation,
} from './controlplane/shadowlink';

/**
 * Hook to list all shadow links
 */
export const useListShadowLinksQuery = (request: MessageInit<ListShadowLinksRequest>, opts?: { enabled: boolean }) => {
  const listShadowLinksRequest = create(ListShadowLinksRequestSchema, request);

  return useQuery(listShadowLinks, listShadowLinksRequest, opts && { enabled: opts?.enabled });
};
export const useGetShadowLinkQuery = (
  request: MessageInit<GetShadowLinkRequest>,
  options?: QueryOptions<typeof GetShadowLinkResponseSchema>
) => {
  const getShadowLinkRequest = create(GetShadowLinkRequestSchema, request);

  return useQuery(getShadowLink, getShadowLinkRequest, options);
};

export const useGetShadowMetricsQuery = (
  request: MessageInit<GetShadowMetricsRequest>,
  options?: QueryOptions<GenMessage<GetShadowMetricsResponse>, GetShadowMetricsResponse>
) => {
  const getShadowMetricsRequest = create(GetShadowMetricsRequestSchema, request);

  return useQuery(getShadowMetrics, getShadowMetricsRequest, options);
};

export const useListShadowTopicQuery = (request: MessageInit<ListShadowLinkTopicsRequest>) => {
  const listShadowTopicsRequest = create(ListShadowLinkTopicsRequestSchema, request);

  return useQuery(listShadowLinkTopics, listShadowTopicsRequest);
};

export const useGetShadowTopicQuery = (
  request: MessageInit<GetShadowTopicRequest>,
  options?: QueryOptions<GenMessage<GetShadowTopicResponse>, GetShadowTopicResponse>
) => {
  const getShadowTopicRequest = create(GetShadowTopicRequestSchema, request);

  return useQuery(getShadowTopic, getShadowTopicRequest, options);
};

export const useListShadowTopicInfiniteQuery = (
  request: MessageInit<ListShadowLinkTopicsRequest>,
  options?: Partial<
    UseInfiniteQueryOptions<
      typeof ListShadowLinkTopicsRequestSchema,
      typeof ListShadowLinkTopicsResponseSchema,
      'pageToken'
    >
  >
) => {
  const baseRequest = create(ListShadowLinkTopicsRequestSchema, {
    pageToken: '',
    ...request,
  });

  return useInfiniteQuery(listShadowLinkTopics, baseRequest, {
    getNextPageParam: (lastPage) => lastPage?.nextPageToken || undefined,
    pageParamKey: 'pageToken',
    ...options,
  });
};

export const useInvalidateShadowLinkList = () => {
  const queryClient = useQueryClient();
  const invalid = async () => {
    await queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: listShadowLinks,
        cardinality: 'finite',
      }),
      exact: false,
    });
  };

  return {
    invalid,
  };
};

/**
 * Hook to create a new shadow link
 */
export const useCreateShadowLinkMutation = (
  transportOptions?: UseMutationOptions<typeof CreateShadowLinkRequestSchema, typeof CreateShadowLinkResponseSchema>
) => {
  const { invalid } = useInvalidateShadowLinkList();

  return useMutation(createShadowLink, {
    onSettled: async (_, error) => {
      if (!error) {
        await invalid();
      }
    },
    ...transportOptions,
  });
};

/**
 * Hook to update an existing shadow link
 */
export const useUpdateShadowLinkMutation = (
  transportOptions?: UseMutationOptions<typeof UpdateShadowLinkRequestSchema, typeof UpdateShadowLinkResponseSchema>
) => {
  const { invalid } = useInvalidateShadowLinkList();

  return useMutation(updateShadowLink, {
    onSettled: async (_, error) => {
      if (!error) {
        await invalid();
      }
    },
    ...transportOptions,
  });
};

/**
 * Hook to delete a shadow link
 */
export const useDeleteShadowLinkMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: ConnectError) => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation(deleteShadowLink, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listShadowLinks,
          cardinality: 'finite',
        }),
        exact: false,
      });
      options?.onSuccess?.();
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
};

/**
 * Unified hook to delete a shadow link that works in both console and controlplane modes.
 * Automatically uses the appropriate API based on embedded mode.
 *
 * In embedded mode: uses controlplane API with ID-based deletion
 * In non-embedded mode: uses dataplane API with name-based deletion
 *
 * @param params.name - The shadow link name
 * @returns Unified delete interface with delete function and loading states
 */
export const useDeleteShadowLinkUnified = (params: { name: string }) => {
  const embedded = isEmbedded();

  // Get shadowlink ID for embedded mode (controlplane uses ID-based deletion)
  const controlplaneQuery = useControlplaneGetShadowLinkByNameQuery({ name: params.name }, { enabled: embedded });
  const shadowLinkId = controlplaneQuery.data?.id;

  // Mutations
  const dataplaneDelete = useDeleteShadowLinkMutation();
  const controlplaneDelete = useControlplaneDeleteShadowLinkMutation();

  const deleteShadowLinkUnified = useCallback(
    (options?: { force?: boolean; onSuccess?: () => void; onError?: (error: ConnectError) => void }) => {
      if (embedded && shadowLinkId) {
        return controlplaneDelete.mutate(
          { id: shadowLinkId },
          { onSuccess: options?.onSuccess, onError: options?.onError }
        );
      }
      if (!embedded) {
        return dataplaneDelete.mutate(
          { name: params.name, force: options?.force ?? false },
          { onSuccess: options?.onSuccess, onError: options?.onError }
        );
      }
    },
    [embedded, shadowLinkId, params.name, controlplaneDelete, dataplaneDelete]
  );

  return {
    /** Function to delete the shadow link */
    deleteShadowLink: deleteShadowLinkUnified,
    /** Whether a delete operation is currently in progress */
    isPending: embedded ? controlplaneDelete.isPending : dataplaneDelete.isPending,
    /** Whether the shadowlink ID is being loaded (only relevant in embedded mode) */
    isLoadingId: embedded && controlplaneQuery.isLoading,
    /** Whether the delete can be performed (ID is available in embedded mode, or always true in non-embedded mode) */
    canDelete: embedded ? !!shadowLinkId : true,
  };
};

/**
 * Hook to failover a shadow link
 */
export const useFailoverShadowLinkMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: ConnectError) => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation(failOver, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listShadowLinks,
          cardinality: 'finite',
        }),
        exact: false,
      });
      options?.onSuccess?.();
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
};

/* ==================== UNIFIED HOOK ==================== */

export type UnifiedShadowLinkResult = {
  data: UnifiedShadowLink | undefined;
  isLoading: boolean;
  /** Combined error - null if we have usable data */
  error: ConnectError | null;
  /** Dataplane-specific error */
  dataplaneError: ConnectError | null;
  /** Controlplane-specific error (embedded mode only) */
  controlplaneError: ConnectError | null;
  refetch: () => Promise<void>;
};

/**
 * Unified hook to get shadow link data that works in both console and controlplane modes.
 * Automatically uses the appropriate API based on embedded mode.
 * No TransportProvider wrapper needed - controlplane transport is created internally.
 *
 * In embedded mode: uses dataplane data but overrides state from controlplane API.
 * If dataplane fails but controlplane succeeds, returns controlplane data with partial info.
 *
 * @param params.name - The shadow link name
 * @returns Unified shadow link data with granular error information
 */
export const useGetShadowLinkUnified = (params: { name: string }): UnifiedShadowLinkResult => {
  const embedded = isEmbedded();

  // In embedded mode, use retry: 1 to fail fast and fallback to controlplane data sooner
  const dataplaneQuery = useGetShadowLinkQuery({ name: params.name }, { retry: embedded ? 1 : undefined });

  // In embedded mode, also fetch controlplane to get the correct state
  const controlplaneQuery = useControlplaneGetShadowLinkByNameQuery({ name: params.name }, { enabled: embedded });

  const shadowLink = dataplaneQuery.data?.shadowLink;
  let unifiedData = shadowLink ? fromDataplaneShadowLink(shadowLink) : undefined;

  // In embedded mode, override state from controlplane
  if (embedded && unifiedData && controlplaneQuery.data) {
    unifiedData.state = mapControlplaneStateToUnified(controlplaneQuery.data.state);
    unifiedData.resourceGroupId = controlplaneQuery.data.resourceGroupId;
    unifiedData.shadowRedpandaId = controlplaneQuery.data.shadowRedpandaId;
    unifiedData.createdAt = controlplaneQuery.data.createdAt
      ? timestampDate(controlplaneQuery.data.createdAt)
      : undefined;
    unifiedData.updatedAt = controlplaneQuery.data.updatedAt
      ? timestampDate(controlplaneQuery.data.updatedAt)
      : undefined;
  }

  // In embedded mode: if dataplane fails but controlplane succeeds, use controlplane data
  if (embedded && !unifiedData && controlplaneQuery.data) {
    unifiedData = fromControlplaneShadowLink(controlplaneQuery.data);
  }

  // Combined error: only error if we have no data at all
  const combinedError = unifiedData ? null : dataplaneQuery.error || controlplaneQuery.error;

  return {
    data: unifiedData,
    isLoading: dataplaneQuery.isLoading || (embedded && controlplaneQuery.isLoading),
    error: combinedError,
    dataplaneError: dataplaneQuery.error,
    controlplaneError: controlplaneQuery.error,
    refetch: async () => {
      await dataplaneQuery.refetch();
      if (embedded) {
        await controlplaneQuery.refetch();
      }
    },
  };
};

/* ==================== EDIT SHADOW LINK HOOK ==================== */

/**
 * Unified hook for editing shadow links that works in both console and controlplane modes.
 * Automatically uses the appropriate API based on embedded mode.
 *
 * Encapsulates:
 * - Data fetching (controlplane vs dataplane)
 * - Form values building
 * - Update mutation
 * - Loading/error states
 *
 * @param name - The shadow link name
 * @returns Unified edit interface with form values and update function
 */
export const useEditShadowLink = (
  name: string
): {
  formValues: FormValues | undefined;
  isLoading: boolean;
  error: ConnectError | null;
  isUpdating: boolean;
  hasData: boolean;
  updateShadowLink: (values: FormValues) => Promise<unknown>;
  dataplaneUpdate: ReturnType<typeof useUpdateShadowLinkMutation>;
  controlplaneUpdate: ReturnType<typeof useControlplaneUpdateShadowLinkMutation>;
} => {
  const embedded = isEmbedded();

  // Queries - in embedded mode, also fetch controlplane for state override
  const dataplaneQuery = useGetShadowLinkQuery({ name }, { retry: embedded ? 1 : undefined, enabled: !embedded });
  const controlplaneQuery = useControlplaneGetShadowLinkByNameQuery({ name }, { enabled: embedded });

  const shadowLink = dataplaneQuery.data?.shadowLink;
  const controlplaneShadowLink = controlplaneQuery.data;
  const shadowLinkId = controlplaneShadowLink?.id;

  // Mutations
  const dataplaneUpdate = useUpdateShadowLinkMutation();
  const controlplaneUpdate = useControlplaneUpdateShadowLinkMutation();

  // Build form values based on data source
  const formValues = useMemo((): FormValues | undefined => {
    if (embedded && controlplaneShadowLink) {
      return buildDefaultFormValuesFromControlplane(controlplaneShadowLink);
    }
    if (!embedded && shadowLink) {
      return buildDefaultFormValues(shadowLink);
    }
    return undefined;
  }, [embedded, controlplaneShadowLink, shadowLink]);

  // Unified update function
  const submitUpdate = useCallback(
    (values: FormValues) => {
      if (embedded && shadowLinkId && controlplaneShadowLink) {
        // Use controlplane API with ID
        const originalValues = buildDefaultFormValuesFromControlplane(controlplaneShadowLink);
        const request = buildControlplaneUpdateRequest(shadowLinkId, values, originalValues);
        return controlplaneUpdate.mutateAsync(request);
      }
      if (shadowLink) {
        // Use dataplane API with name
        const request = buildDataplaneUpdateRequest(name, values, shadowLink);
        return dataplaneUpdate.mutateAsync(request);
      }
      return Promise.reject(new Error('No shadow link data available for update'));
    },
    [embedded, shadowLinkId, controlplaneShadowLink, shadowLink, name, controlplaneUpdate, dataplaneUpdate]
  );

  // Check if data is available based on mode
  const hasData = embedded ? !!controlplaneShadowLink : !!shadowLink;

  return {
    formValues,
    isLoading: embedded ? controlplaneQuery.isLoading : dataplaneQuery.isLoading,
    error: embedded ? controlplaneQuery.error : dataplaneQuery.error,
    isUpdating: embedded ? controlplaneUpdate.isPending : dataplaneUpdate.isPending,
    hasData,
    updateShadowLink: submitUpdate,
    dataplaneUpdate,
    controlplaneUpdate,
  };
};
