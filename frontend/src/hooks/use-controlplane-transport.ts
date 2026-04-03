import type { Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { addBearerTokenInterceptor, config } from 'config';
import { protobufRegistry } from 'protobuf-registry';
import { useMemo } from 'react';
import { useTokenRefreshInterceptor } from 'utils/token-refresh-interceptor';

/**
 * Custom hook to create and memoize a Connect transport for controlplane API calls
 * @returns Transport instance configured for controlplane communication
 */
export const useControlplaneTransport = (): Transport => {
  const tokenRefreshInterceptor = useTokenRefreshInterceptor();

  const controlplaneTransport = useMemo(
    () =>
      createConnectTransport({
        baseUrl: config.controlplaneUrl,
        fetch: config.fetch,
        interceptors: [addBearerTokenInterceptor, ...(tokenRefreshInterceptor ? [tokenRefreshInterceptor] : [])],
        jsonOptions: {
          registry: protobufRegistry,
        },
      }),
    [tokenRefreshInterceptor]
  );

  return controlplaneTransport;
};
