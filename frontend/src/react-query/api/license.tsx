import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { QueryObserverOptions, useQueryClient } from '@tanstack/react-query';
import {
  listEnterpriseFeatures,
  listLicenses,
  setLicense,
} from 'protogen/redpanda/api/console/v1alpha1/license-LicenseService_connectquery';
import {
  LicenseService,
  type ListEnterpriseFeaturesRequest,
  ListEnterpriseFeaturesRequestSchema,
  type ListEnterpriseFeaturesResponse,
  type ListLicensesRequest,
  ListLicensesRequestSchema,
  type ListLicensesResponse,
} from 'protogen/redpanda/api/console/v1alpha1/license_pb';
import type { QueryOptions } from 'react-query/react-query.utils';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

export const useListLicensesQuery = (options?: QueryOptions<GenMessage<ListLicensesRequest>, ListLicensesResponse>) => {
  const listLicensesRequest = create(ListLicensesRequestSchema);

  return useQuery(listLicenses, listLicensesRequest, {
    enabled: options?.enabled,
  });
};

export const useSetLicenseMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(setLicense, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: LicenseService.method.listLicenses,
          cardinality: 'finite',
        }),
        exact: false,
      });

      showToast({
        id: TOASTS.LICENSE.SET.SUCCESS,
        title: 'License set successfully',
        status: 'success',
      });
    },
    onError: (error) => {
      showToast({
        id: TOASTS.LICENSE.SET.ERROR,
        title: formatToastErrorMessageGRPC({
          error,
          action: 'set',
          entity: 'license',
        }),
        status: 'error',
      });
    },
  });
};

export const useListEnterpriseFeaturesQuery = (
  options?: QueryOptions<GenMessage<ListEnterpriseFeaturesRequest>, ListEnterpriseFeaturesResponse>,
) => {
  const listEnterpriseFeaturesRequest = create(ListEnterpriseFeaturesRequestSchema);

  return useQuery(listEnterpriseFeatures, listEnterpriseFeaturesRequest, {
    enabled: options?.enabled,
  });
};
