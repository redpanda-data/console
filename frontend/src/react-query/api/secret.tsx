import type { PartialMessage } from '@bufbuild/protobuf';
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
  GetSecretRequest,
  ListSecretsRequest,
  type ListSecretsResponse,
} from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { GetSecretRequest as GetSecretRequestDataPlane } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { ListSecretsRequest as ListSecretsRequestDataPlane } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { MAX_PAGE_SIZE, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

export const useListSecretsQuery = (
  input?: PartialMessage<ListSecretsRequestDataPlane>,
  options?: QueryOptions<ListSecretsRequestDataPlane, ListSecretsResponse, ListSecretsResponse>,
) => {
  const listSecretsRequestDataPlane = new ListSecretsRequestDataPlane({
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listSecretsRequest = new ListSecretsRequest({
    request: listSecretsRequestDataPlane,
  }) as PartialMessage<ListSecretsRequest> & Required<Pick<PartialMessage<ListSecretsRequest>, 'request'>>;

  const listSecretsResult = useInfiniteQueryWithAllPages(listSecrets, listSecretsRequest, {
    pageParamKey: 'request',
    enabled: options?.enabled,
  });

  const allRetrievedSecrets = listSecretsResult?.data?.pages?.flatMap(({ response }) => response?.secrets);

  return {
    ...listSecretsResult,
    data: {
      secrets: allRetrievedSecrets,
    },
  };
};

export const useGetSecretQuery = (input?: PartialMessage<GetSecretRequestDataPlane>) => {
  const getSecretRequestDataPlane = new GetSecretRequestDataPlane({ id: input?.id });
  const getSecretRequest = new GetSecretRequest({ request: getSecretRequestDataPlane });

  return useQuery(getSecret, getSecretRequest);
};

export const useCreateSecretMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(createSecret, {
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [listSecrets.service.typeName],
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
        queryKey: [listSecrets.service.typeName],
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
        queryKey: [listSecrets.service.typeName],
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
