import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  cancelDebugBundleProcess,
  createDebugBundle,
  deleteDebugBundleFile,
  getClusterHealth,
  getDebugBundleStatus,
} from 'protogen/redpanda/api/console/v1alpha1/debug_bundle-DebugBundleService_connectquery';
import {
  DebugBundleService,
  type GetClusterHealthRequest,
  GetClusterHealthRequestSchema,
  type GetDebugBundleStatusRequest,
  GetDebugBundleStatusRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import type {
  GetClusterHealthResponse,
  GetDebugBundleStatusResponse,
} from 'protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

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

      showToast({
        id: TOASTS.DEBUG_BUNDLE.CREATE.SUCCESS,
        title: 'Debug bundle creation started successfully',
        status: 'success',
      });
    },
    onError: (error) => {
      showToast({
        id: TOASTS.DEBUG_BUNDLE.CREATE.ERROR,
        title: formatToastErrorMessageGRPC({
          error,
          action: 'create',
          entity: 'debug bundle',
        }),
        status: 'error',
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

export const useCancelDebugBundleProcessMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(cancelDebugBundleProcess, {
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: DebugBundleService.method.getDebugBundleStatus,
          cardinality: 'infinite',
        }),
        exact: false,
      });

      showToast({
        id: TOASTS.DEBUG_BUNDLE.CANCEL.SUCCESS,
        resourceName: variables?.jobId,
        title: 'Debug bundle process cancelled successfully',
        status: 'success',
      });
    },
    onError: (error, variables) => {
      showToast({
        id: TOASTS.DEBUG_BUNDLE.CANCEL.ERROR,
        resourceName: variables?.jobId,
        title: formatToastErrorMessageGRPC({
          error,
          action: 'cancel',
          entity: 'debug bundle process',
        }),
        status: 'error',
      });
    },
  });
};

export const useDeleteDebugBundleFileMutationWithToast = () => {
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

      showToast({
        id: TOASTS.DEBUG_BUNDLE.DELETE.SUCCESS,
        title: 'Debug bundle file deleted successfully',
        status: 'success',
      });
    },
    onError: (error) => {
      showToast({
        id: TOASTS.DEBUG_BUNDLE.DELETE.ERROR,
        title: formatToastErrorMessageGRPC({
          error,
          action: 'delete',
          entity: 'debug bundle file',
        }),
        status: 'error',
      });
    },
  });
};
