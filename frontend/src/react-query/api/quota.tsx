import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import type { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ListQuotasRequest,
  ListQuotasRequestSchema,
  type ListQuotasResponse,
  Quota_EntityType,
  Quota_ValueType,
} from 'protogen/redpanda/api/dataplane/v1/quota_pb';
import {
  batchDeleteQuota,
  batchSetQuota,
  deleteQuota,
  listQuotas,
  setQuota,
} from 'protogen/redpanda/api/dataplane/v1/quota-QuotaService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';

export const MAX_QUOTA_PAGE_SIZE = 1000;

/**
 * Hook to list quotas with optional filtering
 */
export const useListQuotasQuery = (
  request: MessageInit<ListQuotasRequest>,
  options?: QueryOptions<GenMessage<ListQuotasRequest>, ListQuotasResponse>,
) => {
  const quotaRequest = create(ListQuotasRequestSchema, request);

  return useQuery(listQuotas, quotaRequest, {
    enabled: options?.enabled,
  });
};

/**
 * Hook to create or update a single quota
 */
export const useSetQuotaMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(setQuota, {
    onSuccess: () => {
      // Invalidate and refetch quota list
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey(listQuotas),
      });
    },
    onError: (error: ConnectError) => {
      console.error('Failed to set quota:', error);
    },
  });
};

/**
 * Hook to delete a single quota
 */
export const useDeleteQuotaMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(deleteQuota, {
    onSuccess: () => {
      // Invalidate and refetch quota list
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey(listQuotas),
      });
    },
    onError: (error: ConnectError) => {
      console.error('Failed to delete quota:', error);
    },
  });
};

/**
 * Hook to create or update multiple quotas in batch
 */
export const useBatchSetQuotaMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(batchSetQuota, {
    onSuccess: () => {
      // Invalidate and refetch quota list
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey(listQuotas),
      });
    },
    onError: (error: ConnectError) => {
      console.error('Failed to batch set quotas:', error);
    },
  });
};

/**
 * Hook to delete multiple quotas in batch
 */
export const useBatchDeleteQuotaMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(batchDeleteQuota, {
    onSuccess: () => {
      // Invalidate and refetch quota list
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey(listQuotas),
      });
    },
    onError: (error: ConnectError) => {
      console.error('Failed to batch delete quotas:', error);
    },
  });
};

/**
 * Utility function to get user-friendly entity type labels
 */
export const getEntityTypeLabel = (entityType: Quota_EntityType): string => {
  switch (entityType) {
    case Quota_EntityType.CLIENT_ID:
      return 'Client ID';
    case Quota_EntityType.CLIENT_ID_PREFIX:
      return 'Client ID Prefix';
    case Quota_EntityType.USER:
      return 'User';
    case Quota_EntityType.IP:
      return 'IP Address';
    default:
      return 'Unknown';
  }
};

/**
 * Utility function to get user-friendly value type labels
 */
export const getValueTypeLabel = (valueType: Quota_ValueType): string => {
  switch (valueType) {
    case Quota_ValueType.PRODUCER_BYTE_RATE:
      return 'Producer Rate';
    case Quota_ValueType.CONSUMER_BYTE_RATE:
      return 'Consumer Rate';
    case Quota_ValueType.CONTROLLER_MUTATION_RATE:
      return 'Controller Mutation Rate';
    case Quota_ValueType.REQUEST_PERCENTAGE:
      return 'Request Percentage';
    default:
      return 'Unknown';
  }
};

/**
 * Utility function to get supported entity types (excluding unsupported ones)
 */
export const getSupportedEntityTypes = (): Quota_EntityType[] => {
  return [
    Quota_EntityType.CLIENT_ID,
    Quota_EntityType.CLIENT_ID_PREFIX,
    // USER and IP are not supported in Redpanda, so we exclude them
  ];
};

/**
 * Utility function to get supported value types (excluding unsupported ones)
 */
export const getSupportedValueTypes = (): Quota_ValueType[] => {
  return [
    Quota_ValueType.PRODUCER_BYTE_RATE,
    Quota_ValueType.CONSUMER_BYTE_RATE,
    Quota_ValueType.CONTROLLER_MUTATION_RATE,
    // REQUEST_PERCENTAGE is not supported in Redpanda, so we exclude it
  ];
};

/**
 * Utility function to format byte rate values with appropriate units
 */
export const formatByteRate = (value: number): string => {
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB/s`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(2)} KB/s`;
  }
  return `${value} B/s`;
};

/**
 * Utility function to parse byte rate input with unit conversion
 */
export const parseByteRate = (value: string, unit: 'B/s' | 'KB/s' | 'MB/s' | 'GB/s'): number => {
  const numValue = Number.parseFloat(value);
  if (Number.isNaN(numValue)) return 0;

  switch (unit) {
    case 'GB/s':
      return numValue * 1024 * 1024 * 1024;
    case 'MB/s':
      return numValue * 1024 * 1024;
    case 'KB/s':
      return numValue * 1024;
    default:
      return numValue;
  }
};
