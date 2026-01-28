import type { Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { addBearerTokenInterceptor } from 'config';
import { protobufRegistry } from 'protobuf-registry';
import { useMemo } from 'react';

/**
 * Custom hook to create and memoize a Connect transport for AI Gateway API calls
 *
 * Uses base path: /.redpanda/api/
 * Connect Query will append the service path: redpanda.api.aigateway.v1.GatewayService/ListGateways
 * Full path becomes: /.redpanda/api/redpanda.api.aigateway.v1.GatewayService/ListGateways
 *
 * Dev server proxies /.redpanda/api/redpanda.api.aigateway.v1 to:
 *   https://ai-gateway.${CLUSTER_ID}.clusters.ign.rdpa.co
 *
 * @returns Transport instance configured for AI Gateway communication
 */
export const useAIGatewayTransport = (): Transport => {
  const aiGatewayTransport = useMemo(() => {
    // Use /.redpanda/api/ base path (AI Gateway's Connect RPC endpoint prefix)
    // Dev server will proxy to the correct AI Gateway based on cluster ID
    const baseUrl = '/.redpanda/api';

    return createConnectTransport({
      baseUrl,
      interceptors: [addBearerTokenInterceptor],
      jsonOptions: {
        registry: protobufRegistry,
      },
    });
  }, []);

  return aiGatewayTransport;
};
