import type { Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { addBearerTokenInterceptor, config, isEmbedded } from 'config';
import { protobufRegistry } from 'protobuf-registry';
import { useMemo } from 'react';

/**
 * Transport for the new AI Gateway (aigw v2) management API.
 * Uses config.aigwUrl from cluster.aiGateway.v2Url.
 *
 * In Development:
 *   - Uses base path: /.aigw/api
 *   - Dev server proxies to the aigw v2 management endpoint
 *
 * In Production (Embedded):
 *   - Uses config.aigwUrl set by cloud-ui parent app
 *
 * In Production (Standalone):
 *   - Uses relative path /.aigw/api (backend handles routing)
 */
export const useAigwTransport = (): Transport => {
  return useMemo(() => {
    // In embedded mode (cloud-ui), use the aigw URL from parent config.
    // This must be checked first — even in dev builds, isEmbedded() is true
    // when loaded as MFE, and relative paths would resolve against cloud-ui's origin.
    if (isEmbedded() && config.aigwUrl) {
      return createConnectTransport({
        baseUrl: config.aigwUrl,
        interceptors: [addBearerTokenInterceptor],
        jsonOptions: { registry: protobufRegistry },
      });
    }

    // Standalone dev/prod — relies on dev server proxy or backend routing.
    return createConnectTransport({
      baseUrl: '/.aigw/api',
      interceptors: [addBearerTokenInterceptor],
      jsonOptions: { registry: protobufRegistry },
    });
  }, []);
};
