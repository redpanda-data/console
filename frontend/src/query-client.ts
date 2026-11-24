import { Code, ConnectError } from '@connectrpc/connect';
import { QueryClient } from '@tanstack/react-query';
import { DEFAULT_CACHE_STALE_TIME } from 'react-query/react-query.utils';

function isConnectError(error: Error | ConnectError): error is ConnectError {
  return error instanceof ConnectError;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_CACHE_STALE_TIME,
      retry: (failureCount, error) => {
        if (failureCount > 3) {
          return false;
        }

        if (isConnectError(error)) {
          return error.code === Code.Internal || error.code === Code.Unknown;
        }

        return false;
      },
    },
    mutations: {
      retry: (failureCount, error) => {
        if (failureCount > 3) {
          return false;
        }

        if (isConnectError(error)) {
          return error.code === Code.PermissionDenied;
        }

        return false;
      },
    },
  },
});

/**
 * Queries retry internal and unknown Connect errors. Mutations retry permission
 * denials to allow RBAC changes to propagate.
 */
export default queryClient;
