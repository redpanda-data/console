import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import type {
  GetClusterHealthResponse,
  GetDebugBundleStatusResponse,
} from 'protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import {
  DebugBundleService,
  type GetClusterHealthRequest,
  GetClusterHealthRequestSchema,
  type GetDebugBundleStatusRequest,
  GetDebugBundleStatusRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import {
  cancelDebugBundleProcess,
  createDebugBundle,
  deleteDebugBundleFile,
  getClusterHealth,
  getDebugBundleStatus,
} from 'protogen/redpanda/api/console/v1alpha1/debug_bundle-DebugBundleService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const useGetClusterHealthQuery = (
  options?: QueryOptions<GenMessage<GetClusterHealthRequest>, GetClusterHealthResponse>,
) => {
  const getClusterHealthRequest = create(GetClusterHealthRequestSchema, {});

  return useQuery(getClusterHealth, getClusterHealthRequest, {
    enabled: options?.enabled !== false,
  });
};

export const useCreateDebugBundleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createDebugBundle, {
    onSuccess: async (_data, _variables) => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: DebugBundleService.method.getDebugBundleStatus,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'debug bundle',
      });
    },
  });
};

export const useGetDebugBundleStatusQuery = (
  input?: MessageInit<GetDebugBundleStatusRequest>,
  options?: QueryOptions<GenMessage<GetDebugBundleStatusRequest>, GetDebugBundleStatusResponse>,
) => {
  const getDebugBundleStatusRequest = create(GetDebugBundleStatusRequestSchema, {
    brokerIds: input?.brokerIds ?? [],
  });

  return useQuery(getDebugBundleStatus, getDebugBundleStatusRequest, {
    enabled: options?.enabled,
  });
};

export const useCancelDebugBundleProcessMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(cancelDebugBundleProcess, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: DebugBundleService.method.getDebugBundleStatus,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'cancel',
        entity: 'debug bundle process',
      });
    },
  });
};

export const useDeleteDebugBundleFileMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(deleteDebugBundleFile, {
    onSuccess: async (_data, _variables) => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: DebugBundleService.method.getDebugBundleStatus,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'delete',
        entity: 'debug bundle file',
      });
    },
  });
};
