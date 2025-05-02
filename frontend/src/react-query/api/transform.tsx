import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  deleteTransform,
  getTransform,
  listTransforms,
} from 'protogen/redpanda/api/console/v1alpha1/transform-TransformService_connectquery';
import {
  type GetTransformRequest,
  GetTransformRequestSchema,
  type ListTransformsRequest,
  ListTransformsRequestSchema,
  TransformService,
} from 'protogen/redpanda/api/console/v1alpha1/transform_pb';
import {
  type GetTransformRequest as GetTransformRequestDataPlane,
  GetTransformRequestSchema as GetTransformRequestSchemaDataPlane,
  type GetTransformResponse,
  type ListTransformsRequest as ListTransformsRequestDataPlane,
  ListTransformsRequestSchema as ListTransformsRequestSchemaDataPlane,
  type ListTransformsResponse,
} from 'protogen/redpanda/api/dataplane/v1/transform_pb';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

export const useListTransformsQuery = (
  input?: MessageInit<ListTransformsRequestDataPlane>,
  options?: QueryOptions<GenMessage<ListTransformsRequest>, ListTransformsResponse>,
) => {
  const listTransformsRequestDataPlane = create(ListTransformsRequestSchemaDataPlane, {
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listTransformsRequest = create(ListTransformsRequestSchema, {
    request: listTransformsRequestDataPlane,
  }) as MessageInit<ListTransformsRequest> & Required<Pick<MessageInit<ListTransformsRequest>, 'request'>>;

  const listTransformsResult = useInfiniteQueryWithAllPages(listTransforms, listTransformsRequest, {
    pageParamKey: 'request',
    enabled: options?.enabled,
    getNextPageParam: (lastPage) =>
      lastPage?.response?.nextPageToken
        ? {
            ...listTransformsRequestDataPlane,
            pageToken: lastPage.response?.nextPageToken,
          }
        : undefined,
  });

  const transforms = listTransformsResult?.data?.pages?.flatMap(({ response }) => response?.transforms);

  return {
    ...listTransformsResult,
    data: {
      transforms,
    },
  };
};

export const useGetTransformQuery = (
  input?: MessageInit<GetTransformRequestDataPlane>,
  options?: QueryOptions<GenMessage<GetTransformRequest>, GetTransformResponse>,
) => {
  const getTransformRequestDataPlane = create(GetTransformRequestSchemaDataPlane, {
    name: input?.name,
  });

  const getTransformRequest = create(GetTransformRequestSchema, {
    request: getTransformRequestDataPlane,
  }) as MessageInit<GetTransformRequest> & Required<Pick<MessageInit<GetTransformRequest>, 'request'>>;

  return useQuery(getTransform, getTransformRequest, {
    enabled: options?.enabled !== false && input?.name !== '',
  });
};

export const useDeleteTransformMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(deleteTransform, {
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: TransformService.method.listTransforms,
          cardinality: 'infinite',
        }),
        exact: false,
      });

      showToast({
        id: TOASTS.TRANSFORM.DELETE.SUCCESS,
        resourceName: variables?.request?.name,
        title: 'Transform deleted successfully',
        status: 'success',
      });
    },
    onError: (error, variables) => {
      showToast({
        id: TOASTS.TRANSFORM.DELETE.ERROR,
        resourceName: variables?.request?.name,
        title: formatToastErrorMessageGRPC({
          error,
          action: 'delete',
          entity: 'transform',
        }),
        status: 'error',
      });
    },
  });
};
