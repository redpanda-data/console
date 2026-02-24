/**
 * AI Gateway Models Query Hook
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
  type ListModelsRequest,
  ListModelsRequestSchema,
  type ListModelsResponse,
} from 'protogen/redpanda/api/aigateway/v1/models_pb';
import { listModels } from 'protogen/redpanda/api/aigateway/v1/models-ModelsService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';

const AI_GATEWAY_DEFAULT_PAGE_SIZE = 50;

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
 * @note This hook uses AI Gateway transport - requires /.redpanda/api/ proxy configuration
 *
 * @example
 * // Filter by provider
 * useListModelsQuery({ filter: 'provider = "openai"' })
 *
 * @example
 * // Filter by provider and enabled status
 * useListModelsQuery({ filter: 'provider = "openai" AND enabled = "true"' })
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
