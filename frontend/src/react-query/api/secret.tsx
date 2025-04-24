import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  createSecret,
  deleteSecret,
  getSecret,
  listSecrets,
  updateSecret,
} from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import {
  GetSecretRequestSchema,
  type ListSecretsRequest,
  ListSecretsRequestSchema,
  type ListSecretsResponse,
  SecretService,
} from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import {
  type GetSecretRequest as GetSecretRequestDataPlane,
  GetSecretRequestSchema as GetSecretRequestSchemaDataPlane,
  ListSecretsRequestSchema as ListSecretsRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type { ListSecretsRequest as ListSecretsRequestDataPlane } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

export const useListSecretsQuery = (
  input?: MessageInit<ListSecretsRequestDataPlane>,
  options?: QueryOptions<GenMessage<ListSecretsRequest>, ListSecretsResponse>,
) => {
  const listSecretsRequestDataPlane = create(ListSecretsRequestSchemaDataPlane, {
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listSecretsRequest = create(ListSecretsRequestSchema, {
    request: listSecretsRequestDataPlane,
  }) as MessageInit<ListSecretsRequest> & Required<Pick<MessageInit<ListSecretsRequest>, 'request'>>;

  const listSecretsResult = useInfiniteQueryWithAllPages(listSecrets, listSecretsRequest, {
    pageParamKey: 'request',
    enabled: options?.enabled,
    // Need to cast to ensure reflection works properly
    getNextPageParam: (lastPage) => lastPage.response?.nextPageToken as MessageInit<ListSecretsRequestDataPlane>,
  });

  const allRetrievedSecrets = listSecretsResult?.data?.pages?.flatMap(({ response }) => response?.secrets);

  return {
    ...listSecretsResult,
    data: {
      secrets: allRetrievedSecrets,
    },
  };
};

export const useGetSecretQuery = (input?: MessageInit<GetSecretRequestDataPlane>) => {
  const getSecretRequestDataPlane = create(GetSecretRequestSchemaDataPlane, { id: input?.id });
  const getSecretRequest = create(GetSecretRequestSchema, { request: getSecretRequestDataPlane });

  return useQuery(getSecret, getSecretRequest);
};

export const useCreateSecretMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(createSecret, {
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [SecretService.typeName],
        exact: false,
      });

      showToast({
        id: TOASTS.SECRET.CREATE.SUCCESS,
        resourceName: variables?.request?.id,
        title: 'Secret created successfully',
        status: 'success',
      });
    },
    onError: (error, variables) => {
      showToast({
        id: TOASTS.SECRET.CREATE.ERROR,
        resourceName: variables?.request?.id,
        title: formatToastErrorMessageGRPC({
          error,
          action: 'create',
          entity: 'secret',
        }),
        status: 'error',
      });
    },
  });
};

export const useUpdateSecretMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(updateSecret, {
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [SecretService.typeName],
        exact: false,
      });

      showToast({
        id: TOASTS.SECRET.UPDATE.SUCCESS,
        resourceName: variables?.request?.id,
        title: 'Secret updated successfully',
        status: 'success',
      });
    },
    onError: (error, variables) => {
      showToast({
        id: TOASTS.SECRET.UPDATE.ERROR,
        resourceName: variables?.request?.id,
        title: formatToastErrorMessageGRPC({
          error,
          action: 'update',
          entity: 'secret',
        }),
        status: 'error',
      });
    },
  });
};

export const useDeleteSecretMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(deleteSecret, {
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [SecretService.typeName],
        exact: false,
      });

      showToast({
        id: TOASTS.SECRET.DELETE.SUCCESS,
        resourceName: variables?.request?.id,
        title: 'Secret deleted successfully',
        status: 'success',
      });
    },
    onError: (error, variables) => {
      showToast({
        id: TOASTS.SECRET.DELETE.ERROR,
        resourceName: variables?.request?.id,
        title: formatToastErrorMessageGRPC({
          error,
          action: 'delete',
          entity: 'secret',
        }),
        status: 'error',
      });
    },
  });
};
