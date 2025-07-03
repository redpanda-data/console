import { Code, ConnectError } from '@connectrpc/connect';
import { QueryClient } from '@tanstack/react-query';

function isConnectError(error: Error | ConnectError): error is ConnectError {
  return error instanceof ConnectError;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 1000, // 3 seconds
      retry: (failureCount, error) => {
        if (failureCount > 3) return false;

        if (isConnectError(error)) {
          // Retry only gRPC errors that map to 5xx HTTP error codes
          return error.code === Code.Internal || error.code === Code.Unknown;
        }

        return false;
      },
    },
  },
});

export default queryClient;
