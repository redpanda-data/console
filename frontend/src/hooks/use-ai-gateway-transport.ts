import type { Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { addBearerTokenInterceptor, config, isEmbedded } from 'config';
import { protobufRegistry } from 'protobuf-registry';
import { useMemo } from 'react';

/**
 * Custom hook to create and memoize a Connect transport for AI Gateway API calls
 *
 * In Development:
 *   - Uses base path: /.redpanda/api/
 *   - Dev server proxies to: https://ai-gateway.{clusterId}.clusters.ign.rdpa.co
 *
 * In Production (Embedded):
 *   - Uses config.aiGatewayUrl set by cloud-ui parent app (from REACT_APP_AI_GATEWAY_URL env var)
 *   - Appends /.redpanda/api to the base URL
 *
 * In Production (Standalone):
 *   - Uses relative path /.redpanda/api (backend handles routing)
 *
 * @returns Transport instance configured for AI Gateway communication
 */
export const useAIGatewayTransport = (): Transport => {
  const aiGatewayTransport = useMemo(() => {
    // In development, use relative path and rely on dev server proxy
    if (process.env.NODE_ENV === 'development') {
      return createConnectTransport({
        baseUrl: '/.redpanda/api',
        interceptors: [addBearerTokenInterceptor],
        jsonOptions: {
          registry: protobufRegistry,
        },
      });
    }

    // In production embedded mode (cloud-ui), use AI Gateway URL from config
    if (isEmbedded() && config.aiGatewayUrl) {
      // Ensure URL ends with /.redpanda/api
      const baseUrl = config.aiGatewayUrl.endsWith('/.redpanda/api')
        ? config.aiGatewayUrl
        : `${config.aiGatewayUrl}/.redpanda/api`;

      return createConnectTransport({
        baseUrl,
        interceptors: [addBearerTokenInterceptor],
        jsonOptions: {
          registry: protobufRegistry,
        },
      });
    }

    // Fallback to relative path for standalone mode
    return createConnectTransport({
      baseUrl: '/.redpanda/api',
      interceptors: [addBearerTokenInterceptor],
      jsonOptions: {
        registry: protobufRegistry,
      },
    });
  }, []);

  return aiGatewayTransport;
};
