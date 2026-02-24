/**
 * AI Gateway Model Providers Query Hook
 *
 * IMPORTANT: All queries in this file must use the AI Gateway transport.
 * Use `useAIGatewayTransport()` hook to create the transport that points to /.redpanda/api/
 */

import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import type { ConnectError } from '@connectrpc/connect';
import { useQuery } from '@connectrpc/connect-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useAIGatewayTransport } from 'hooks/use-ai-gateway-transport';
import {
  type ListModelProvidersRequest,
  ListModelProvidersRequestSchema,
  type ListModelProvidersResponse,
} from 'protogen/redpanda/api/aigateway/v1/model_providers_pb';
import { listModelProviders } from 'protogen/redpanda/api/aigateway/v1/model_providers-ModelProvidersService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';

const AI_GATEWAY_DEFAULT_PAGE_SIZE = 50;

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
 * @note This hook uses AI Gateway transport - requires /.redpanda/api/ proxy configuration
 *
 * @example
 * // Get all enabled providers
 * useListModelProvidersQuery({ filter: 'enabled = "true"' })
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
