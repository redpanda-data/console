import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import type { Transport } from '@connectrpc/connect';
import {
  callUnaryMethod,
  createConnectQueryKey,
  useQuery as useConnectQuery,
  useMutation,
  useTransport,
} from '@connectrpc/connect-query';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GetSecretRequestSchema,
  type GetSecretResponse,
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
  ListResourcesRequest_FilterSchema,
  ListResourcesRequestSchema,
  type ListResourcesResponse,
  ListSecretsFilterSchema,
  type ListSecretsRequest as ListSecretsRequestDataPlane,
  ListSecretsRequestSchema as ListSecretsRequestSchemaDataPlane,
  type Secret,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { listResources } from 'protogen/redpanda/api/dataplane/v1/secret-SecretService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

// Matches the server-side upper bound declared in redpanda/api/dataplane/v1/secret.proto.
export const SECRETS_LIST_PAGE_SIZE = 50;
// Hard cap on pagination iterations. At SECRETS_LIST_PAGE_SIZE=50 this allows 10k secrets,
// which is far beyond any realistic tenant. Protects against a misbehaving server returning
// non-empty nextPageToken indefinitely.
export const SECRETS_LIST_MAX_PAGES = 200;

function listSecretsPageRequest(pageToken: string, nameContains: string | undefined) {
  return create(ListSecretsRequestSchema, {
    request: create(ListSecretsRequestSchemaDataPlane, {
      pageSize: SECRETS_LIST_PAGE_SIZE,
      pageToken,
      filter: nameContains ? create(ListSecretsFilterSchema, { nameContains }) : undefined,
    }),
  });
}

// The token of the page after this one, or null when this was the last page.
function nextSecretsPageToken(response: ListSecretsResponse, pageToken: string): string | null {
  const next = response.response?.nextPageToken ?? '';
  if (!next) {
    return null;
  }
  // Guard against a server that returns the same token twice — would otherwise loop forever.
  if (next === pageToken) {
    throw new Error('ListSecrets returned a non-advancing nextPageToken; aborting to avoid infinite loop');
  }
  return next;
}

async function fetchSecretsPage(
  transport: Transport,
  pageToken: string,
  nameContains: string | undefined,
  signal: AbortSignal | undefined
): Promise<{ secrets: Secret[]; next: string | null }> {
  if (signal?.aborted) {
    throw signal.reason ?? new Error('ListSecrets query aborted');
  }
  const request = listSecretsPageRequest(pageToken, nameContains);
  const response = await callUnaryMethod(transport, listSecrets, request, { signal });
  return {
    secrets: (response.response?.secrets ?? []).filter(Boolean),
    next: nextSecretsPageToken(response, pageToken),
  };
}

function listAllSecrets(transport: Transport, nameContains: string | undefined, signal: AbortSignal | undefined) {
  const secrets: Secret[] = [];
  // Each request depends on the preceding response's token; never start pages concurrently.
  const nextPage = async (pageToken: string, iteration: number): Promise<{ secrets: Secret[] }> => {
    if (iteration >= SECRETS_LIST_MAX_PAGES) {
      throw new Error(`ListSecrets exceeded ${SECRETS_LIST_MAX_PAGES} pages; aborting to avoid runaway pagination`);
    }
    const page = await fetchSecretsPage(transport, pageToken, nameContains, signal);
    secrets.push(...page.secrets);
    if (page.next === null) {
      return { secrets };
    }
    return nextPage(page.next, iteration + 1);
  };
  return nextPage('', 0);
}

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
    // Our queryFn throws intentionally on pagination safety violations (non-advancing token,
    // max-pages exceeded). Retrying would multiply the server round-trips for no benefit.
    retry: false,
    queryFn: ({ signal }) => listAllSecrets(transport, nameContains, signal),
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
