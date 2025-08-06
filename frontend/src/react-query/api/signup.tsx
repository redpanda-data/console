import { create } from '@bufbuild/protobuf';
import { createConnectQueryKey, useMutation } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  type LicenseSignupRequest,
  LicenseSignupRequestSchema,
  type LicenseSignupResponse,
  SignupService,
} from 'protogen/redpanda/api/console/v1alpha1/signup_pb';
import { licenseSignup } from 'protogen/redpanda/api/console/v1alpha1/signup-SignupService_connectquery';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const useLicenseSignupMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(licenseSignup, {
    onSuccess: async (response) => {
      // Invalidate license-related queries to refresh the license data
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: SignupService.method.licenseSignup,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      // Don't show toast for registration errors as they're handled in the modal
      console.error('License signup failed:', error);
      return error;
    },
  });
}; 