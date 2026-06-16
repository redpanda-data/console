/**
 * AI Gateway v2 LLM Providers Query Hook
 *
 * IMPORTANT: All queries in this file must use the aigw v2 transport.
 * Use `useAigwTransport()` hook to create the transport that points to /.aigw/api/
 */

import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { useAigwTransport } from 'hooks/use-aigw-transport';
import {
  type ListLLMProvidersRequest,
  ListLLMProvidersRequestSchema,
  type ListLLMProvidersResponse,
} from 'protogen/redpanda/api/adp/v1alpha1/llm_provider_pb';
import { listLLMProviders } from 'protogen/redpanda/api/adp/v1alpha1/llm_provider-LLMProviderService_connectquery';
import { useMemo } from 'react';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';

/**
 * Hook to list LLM Providers using the AI Gateway v2 API.
 * Lists available LLM providers (OpenAI, Anthropic, Google, Bedrock, etc.)
 *
 * The server pages results (default 50, created_at desc), so this walks
 * next_page_token until exhausted — a single-page read silently hides every
 * provider older than the newest page. page_size stays unset: the server
 * owns that policy.
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
) => {
  const transport = useAigwTransport();

  const request = create(ListLLMProvidersRequestSchema, {
    pageToken: '',
    ...(input?.filter && { filter: input.filter }),
  }) as ListLLMProvidersRequest & Required<Pick<ListLLMProvidersRequest, 'pageToken'>>;

  const result = useInfiniteQueryWithAllPages(listLLMProviders, request, {
    enabled: options?.enabled,
    getNextPageParam: (lastPage) => lastPage?.nextPageToken || undefined,
    pageParamKey: 'pageToken',
    transport,
  });

  const llmProviders = useMemo(
    () => result.data?.pages.flatMap((page) => page?.llmProviders ?? []) ?? [],
    [result.data]
  );

  const data = useMemo(() => ({ llmProviders }), [llmProviders]);

  return {
    ...result,
    data,
  };
};
