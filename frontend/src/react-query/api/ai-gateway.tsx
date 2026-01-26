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
  });
};

// Provider regex for stripping name prefix
const PROVIDER_PREFIX_REGEX = /^model_providers\//;

// Transform function for model providers - strips "model_providers/" prefix from names
const transformModelProviders = (response: ListModelProvidersResponse) => ({
  ...response,
  modelProviders: response.modelProviders.map((provider) => ({
    ...provider,
    name: provider.name.replace(PROVIDER_PREFIX_REGEX, ''),
  })),
});

/**
 * Hook to list Model Providers using the AI Gateway v1 API
 * Lists available LLM providers (OpenAI, Anthropic, Google, etc.)
 *
 * @note Provider names are automatically transformed to strip the "model_providers/" prefix
 */
export const useListModelProvidersQuery = (
  input?: MessageInit<ListModelProvidersRequest>,
  options?: QueryOptions<GenMessage<ListModelProvidersRequest>, ListModelProvidersResponse>
): UseQueryResult<ReturnType<typeof transformModelProviders>, ConnectError> => {
  const transport = useAIGatewayTransport();

  const listModelProvidersRequest = create(ListModelProvidersRequestSchema, {
    pageToken: input?.pageToken ?? '',
    pageSize: input?.pageSize ?? AI_GATEWAY_DEFAULT_PAGE_SIZE,
    ...(input?.filter && { filter: input.filter }),
  });

  return useQuery(listModelProviders, listModelProvidersRequest, {
    enabled: options?.enabled,
    transport,
    select: transformModelProviders,
  });
};

// Model regex for stripping name prefix
const MODEL_PREFIX_REGEX = /^models\/[^/]+\//;

// Transform function for models - strips "models/provider/" prefix from names
// e.g., "models/openai/gpt-4o-mini" -> "gpt-4o-mini"
const transformModels = (response: ListModelsResponse) => ({
  ...response,
  models: response.models.map((model) => ({
    ...model,
    name: model.name.replace(MODEL_PREFIX_REGEX, ''),
  })),
});

/**
 * Hook to list Models using the AI Gateway v1 API
 * Lists available models, optionally filtered by provider
 *
 * @note Model names are automatically transformed to strip the "models/provider/" prefix
 *
 * @example
 * // Filter by provider
 * useListModelsQuery({ filter: 'provider = "openai"' })
 */
export const useListModelsQuery = (
  input?: MessageInit<ListModelsRequest>,
  options?: QueryOptions<GenMessage<ListModelsRequest>, ListModelsResponse>
): UseQueryResult<ReturnType<typeof transformModels>, ConnectError> => {
  const transport = useAIGatewayTransport();

  const listModelsRequest = create(ListModelsRequestSchema, {
    pageToken: input?.pageToken ?? '',
    pageSize: input?.pageSize ?? AI_GATEWAY_DEFAULT_PAGE_SIZE,
    ...(input?.filter && { filter: input.filter }),
    ...(input?.orderBy && { orderBy: input.orderBy }),
  });

  return useQuery(listModels, listModelsRequest, {
    enabled: options?.enabled,
    transport,
    select: transformModels,
  });
};
