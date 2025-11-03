import type { Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { addBearerTokenInterceptor, config } from 'config';
import { protobufRegistry } from 'protobuf-registry';
import { useMemo } from 'react';

/**
 * Custom hook to create and memoize a Connect transport for controlplane API calls
 * @returns Transport instance configured for controlplane communication
 */
export const useControlplaneTransport = (): Transport => {
  const controlplaneTransport = useMemo(
    () =>
      createConnectTransport({
        baseUrl: config.controlplaneUrl,
        interceptors: [addBearerTokenInterceptor],
        jsonOptions: {
          registry: protobufRegistry,
        },
      }),
    []
  );

  return controlplaneTransport;
};
