import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  GetSecretRequestSchema,
  type ListSecretsRequest,
  ListSecretsRequestSchema,
  type ListSecretsResponse,
  SecretService,
} from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import {
  createSecret,
  deleteSecret,
  getSecret,
  listSecrets,
  updateSecret,
} from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import {
  type GetSecretRequest as GetSecretRequestDataPlane,
  GetSecretRequestSchema as GetSecretRequestSchemaDataPlane,
  ListSecretsFilterSchema,
  type ListSecretsRequest as ListSecretsRequestDataPlane,
  ListSecretsRequestSchema as ListSecretsRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const useListSecretsQuery = (
  input?: MessageInit<ListSecretsRequestDataPlane>,
  options?: QueryOptions<GenMessage<ListSecretsRequest>, ListSecretsResponse>,
) => {
  const listSecretsRequestDataPlane = create(ListSecretsRequestSchemaDataPlane, {
    pageToken: '',
    pageSize: MAX_PAGE_SIZE,
    filter: input?.filter?.nameContains
      ? create(ListSecretsFilterSchema, {
          nameContains: input?.filter?.nameContains,
        })
      : undefined,
  });

  const listSecretsRequest = create(ListSecretsRequestSchema, {
    request: listSecretsRequestDataPlane,
  }) as MessageInit<ListSecretsRequest> & Required<Pick<MessageInit<ListSecretsRequest>, 'request'>>;

  const listSecretsResult = useInfiniteQueryWithAllPages(listSecrets, listSecretsRequest, {
    pageParamKey: 'request',
    enabled: options?.enabled,
    // Required because of protobuf v2 reflection - it does not accept foreign fields when nested under "request", so the format needs to be a dataplane schema
    getNextPageParam: (lastPage) =>
      lastPage.response?.nextPageToken
        ? {
            ...listSecretsRequestDataPlane,
            pageToken: lastPage.response?.nextPageToken,
          }
        : undefined,
  });

  const allRetrievedSecrets = listSecretsResult.data?.pages?.flatMap(({ response }) => response?.secrets);

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

export const useCreateSecretMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createSecret, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: SecretService.method.listSecrets,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'secret',
      });
    },
  });
};

export const useUpdateSecretMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(updateSecret, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: SecretService.method.listSecrets,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'update',
        entity: 'secret',
      });
    },
  });
};

export const useDeleteSecretMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(deleteSecret, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: SecretService.method.listSecrets,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'delete',
        entity: 'secret',
      });
    },
  });
};
