import { Code, ConnectError } from '@connectrpc/connect';
import { QueryClient } from '@tanstack/react-query';
import { DEFAULT_QUERY_STALE_TIME } from 'react-query/react-query.utils';

function isConnectError(error: Error | ConnectError): error is ConnectError {
  return error instanceof ConnectError;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_QUERY_STALE_TIME,
      retry: (failureCount, error) => {
        if (failureCount > 3) {
          return false;
        }

        if (isConnectError(error)) {
          // Retry only gRPC errors that map to 5xx HTTP error codes
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
          // Retry PermissionDenied errors to ensure we have some wiggle room for role propagation/RBAC
          return error.code === Code.PermissionDenied;
        }

        return false;
      },
    },
  },
});

export default queryClient;
