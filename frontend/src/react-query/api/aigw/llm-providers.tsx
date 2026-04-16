/**
 * AI Gateway v2 LLM Providers Query Hook
 *
 * IMPORTANT: All queries in this file must use the aigw v2 transport.
 * Use `useAigwTransport()` hook to create the transport that points to /.aigw/api/
 */

import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import type { ConnectError } from '@connectrpc/connect';
import { useQuery } from '@connectrpc/connect-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useAigwTransport } from 'hooks/use-aigw-transport';
import {
  type ListLLMProvidersRequest,
  ListLLMProvidersRequestSchema,
  type ListLLMProvidersResponse,
} from 'protogen/redpanda/api/adp/v1alpha1/llm_provider_pb';
import { listLLMProviders } from 'protogen/redpanda/api/adp/v1alpha1/llm_provider-LLMProviderService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';

const AIGW_DEFAULT_PAGE_SIZE = 50;

/**
 * Hook to list LLM Providers using the AI Gateway v2 API.
 * Lists available LLM providers (OpenAI, Anthropic, Google, Bedrock, etc.)
 *
 * @note This hook uses the aigw v2 transport - requires /.aigw/api/ proxy configuration
 *
 * @example
 * const { data } = useListLLMProvidersQuery();
 * const providers = data?.llmProviders ?? [];
 * const allModels = providers.flatMap(p => p.models);
 */
export const useListLLMProvidersQuery = (
  input?: MessageInit<ListLLMProvidersRequest>,
  options?: QueryOptions<GenMessage<ListLLMProvidersRequest>, ListLLMProvidersResponse>
): UseQueryResult<ListLLMProvidersResponse, ConnectError> => {
  const transport = useAigwTransport();

  const request = create(ListLLMProvidersRequestSchema, {
    pageToken: input?.pageToken ?? '',
    pageSize: input?.pageSize ?? AIGW_DEFAULT_PAGE_SIZE,
    ...(input?.filter && { filter: input.filter }),
  });

  return useQuery(listLLMProviders, request, {
    enabled: options?.enabled,
    transport,
  });
};
