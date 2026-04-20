import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import {
  callUnaryMethod,
  createConnectQueryKey,
  useMutation,
  useQuery as useConnectQuery,
  useTransport,
} from '@connectrpc/connect-query';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GetSecretRequestSchema,
  type GetSecretResponse,
  ListSecretsRequestSchema,
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
  ListResourcesRequest_FilterSchema,
  ListResourcesRequestSchema,
  type ListResourcesResponse,
  ListSecretsFilterSchema,
  type ListSecretsRequest as ListSecretsRequestDataPlane,
  ListSecretsRequestSchema as ListSecretsRequestSchemaDataPlane,
  type Secret,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { listResources } from 'protogen/redpanda/api/dataplane/v1/secret-SecretService_connectquery';
import { type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

// Matches the server-side upper bound declared in redpanda/api/dataplane/v1/secret.proto.
export const SECRETS_LIST_PAGE_SIZE = 50;

export const useListSecretsQuery = (
  input?: MessageInit<ListSecretsRequestDataPlane>,
  options?: { enabled?: boolean }
) => {
  const transport = useTransport();
  const nameContains = input?.filter?.nameContains;

  return useQuery({
    queryKey: [
      ...createConnectQueryKey({
        schema: SecretService.method.listSecrets,
        cardinality: 'finite',
      }),
      { nameContains: nameContains ?? '' },
    ],
    enabled: options?.enabled,
    queryFn: async () => {
      const secrets: Secret[] = [];
      let pageToken = '';
      for (;;) {
        const request = create(ListSecretsRequestSchema, {
          request: create(ListSecretsRequestSchemaDataPlane, {
            pageSize: SECRETS_LIST_PAGE_SIZE,
            pageToken,
            filter: nameContains
              ? create(ListSecretsFilterSchema, { nameContains })
              : undefined,
          }),
        });
        const response = await callUnaryMethod(transport, listSecrets, request);
        for (const secret of response.response?.secrets ?? []) {
          if (secret) {
            secrets.push(secret);
          }
        }
        const next = response.response?.nextPageToken ?? '';
        if (!next) {
          break;
        }
        pageToken = next;
      }
      return { secrets };
    },
  });
};

export const useGetSecretQuery = (
  input?: MessageInit<GetSecretRequestDataPlane>,
  options?: QueryOptions<GenMessage<GetSecretResponse>>
) => {
  const getSecretRequestDataPlane = create(GetSecretRequestSchemaDataPlane, { id: input?.id });
  const getSecretRequest = create(GetSecretRequestSchema, { request: getSecretRequestDataPlane });

  return useConnectQuery(getSecret, getSecretRequest, { enabled: options?.enabled });
};

export const useListResourcesForSecretQuery = (
  secretId: string,
  options?: QueryOptions<GenMessage<ListResourcesResponse>>
) => {
  const filter = create(ListResourcesRequest_FilterSchema, { secretId });
  const request = create(ListResourcesRequestSchema, { filter });

  return useConnectQuery(listResources, request, {
    enabled: !!secretId && options?.enabled !== false,
  });
};

export const useCreateSecretMutation = (options?: { skipInvalidation?: boolean }) => {
  const queryClient = useQueryClient();

  return useMutation(createSecret, {
    onSuccess: async () => {
      if (!options?.skipInvalidation) {
        await queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({
            schema: SecretService.method.listSecrets,
            cardinality: 'finite',
          }),
          exact: false,
        });
      }
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'secret',
      }),
  });
};

export const useUpdateSecretMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(updateSecret, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: SecretService.method.listSecrets,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'update',
        entity: 'secret',
      }),
  });
};

export const useDeleteSecretMutation = (options?: { skipInvalidation?: boolean }) => {
  const queryClient = useQueryClient();

  return useMutation(deleteSecret, {
    onSuccess: async () => {
      if (!options?.skipInvalidation) {
        await queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({
            schema: SecretService.method.listSecrets,
            cardinality: 'finite',
          }),
          exact: false,
        });
      }
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'delete',
        entity: 'secret',
      }),
  });
};
