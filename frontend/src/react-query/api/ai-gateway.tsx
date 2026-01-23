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
import {
  type ListModelProvidersRequest,
  ListModelProvidersRequestSchema,
  type ListModelProvidersResponse,
} from 'protogen/redpanda/api/aigateway/v1/model_providers_pb';
import { listModelProviders } from 'protogen/redpanda/api/aigateway/v1/model_providers-ModelProvidersService_connectquery';
import {
  type ListModelsRequest,
  ListModelsRequestSchema,
  type ListModelsResponse,
} from 'protogen/redpanda/api/aigateway/v1/models_pb';
import { listModels } from 'protogen/redpanda/api/aigateway/v1/models-ModelsService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';

const AI_GATEWAY_DEFAULT_PAGE_SIZE = 50;

/**
 * Hook to list AI Gateways using the AI Gateway v1 API
 * Creates its own AI Gateway transport pointing to: /.redpanda/api/
 * Dev server proxies /.redpanda/api/redpanda.aigateway.v1 to AI Gateway service
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
    staleTime: 60_000, // 1 minute - prevent excessive refetching
    gcTime: 300_000, // 5 minutes cache
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
};

/**
 * Hook to list Model Providers using the AI Gateway v1 API
 * Lists available LLM providers (OpenAI, Anthropic, Google, etc.)
 */
export const useListModelProvidersQuery = (
  input?: MessageInit<ListModelProvidersRequest>,
  options?: QueryOptions<GenMessage<ListModelProvidersRequest>, ListModelProvidersResponse>
): UseQueryResult<ListModelProvidersResponse, ConnectError> => {
  const transport = useAIGatewayTransport();

  const listModelProvidersRequest = create(ListModelProvidersRequestSchema, {
    pageToken: input?.pageToken ?? '',
    pageSize: input?.pageSize ?? AI_GATEWAY_DEFAULT_PAGE_SIZE,
    filter: input?.filter ?? '',
  });

  return useQuery(listModelProviders, listModelProvidersRequest, {
    enabled: options?.enabled,
    transport,
    staleTime: 60_000, // 1 minute - prevent excessive refetching
    gcTime: 300_000, // 5 minutes cache
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
};

/**
 * Hook to list Models using the AI Gateway v1 API
 * Lists available models, optionally filtered by provider
 *
 * @example
 * // Filter by provider
 * useListModelsQuery({ filter: 'provider = "openai"' })
 */
export const useListModelsQuery = (
  input?: MessageInit<ListModelsRequest>,
  options?: QueryOptions<GenMessage<ListModelsRequest>, ListModelsResponse>
): UseQueryResult<ListModelsResponse, ConnectError> => {
  const transport = useAIGatewayTransport();

  const listModelsRequest = create(ListModelsRequestSchema, {
    pageToken: input?.pageToken ?? '',
    pageSize: input?.pageSize ?? AI_GATEWAY_DEFAULT_PAGE_SIZE,
    filter: input?.filter ?? '',
    orderBy: input?.orderBy ?? '',
  });

  return useQuery(listModels, listModelsRequest, {
    enabled: options?.enabled,
    transport,
    staleTime: 60_000, // 1 minute - prevent excessive refetching
    gcTime: 300_000, // 5 minutes cache
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
};
