/**
 * AI Gateway Query Hooks
 *
 * IMPORTANT: All queries in this file must use the AI Gateway transport.
 * Use `useAIGatewayTransport()` hook to create the transport that points to /.redpanda/api/
 *
 * The AI Gateway transport is configured to proxy requests through:
 * - Dev: /.redpanda/api/redpanda.api.aigateway.v1.* proxied to AI Gateway service
 * - Prod: /.redpanda/api/redpanda.api.aigateway.v1.* handled by backend proxy
 */

import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import type { ConnectError } from '@connectrpc/connect';
import { useQuery } from '@connectrpc/connect-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useAIGatewayTransport } from 'hooks/use-ai-gateway-transport';
import {
  type ListGatewaysRequest,
  ListGatewaysRequestSchema,
  type ListGatewaysResponse,
} from 'protogen/redpanda/api/aigateway/v1/gateway_pb';
import { listGateways } from 'protogen/redpanda/api/aigateway/v1/gateway-GatewayService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';

const AI_GATEWAY_DEFAULT_PAGE_SIZE = 50;

/**
 * Hook to list AI Gateways using the AI Gateway v1 API
 *
 * @note This hook uses AI Gateway transport - requires /.redpanda/api/ proxy configuration
 *
 * @example
 * // List all gateways
 * useListGatewaysQuery()
 *
 * @example
 * // List gateways with custom page size
 * useListGatewaysQuery({ pageSize: 100 })
 */
export const useListGatewaysQuery = (
  input?: MessageInit<ListGatewaysRequest>,
  options?: QueryOptions<GenMessage<ListGatewaysRequest>, ListGatewaysResponse>
): UseQueryResult<ListGatewaysResponse, ConnectError> => {
  const transport = useAIGatewayTransport();

  const listGatewaysRequest = create(ListGatewaysRequestSchema, {
    parent: input?.parent ?? '',
    pageToken: input?.pageToken ?? '',
    pageSize: input?.pageSize ?? AI_GATEWAY_DEFAULT_PAGE_SIZE,
  });

  return useQuery(listGateways, listGatewaysRequest, {
    enabled: options?.enabled,
    transport,
  });
};
