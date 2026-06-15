/**
 * AI Gateway v2 MCP Servers Query Hook
 *
 * IMPORTANT: All queries in this file must use the aigw v2 transport.
 * Use `useAigwTransport()` hook to create the transport that points to /.aigw/api/
 */

import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { useAigwTransport } from 'hooks/use-aigw-transport';
import {
  type ListMCPServersRequest,
  ListMCPServersRequestSchema,
  type ListMCPServersResponse,
} from 'protogen/redpanda/api/adp/v1alpha1/mcp_server_pb';
import { listMCPServers } from 'protogen/redpanda/api/adp/v1alpha1/mcp_server-MCPServerService_connectquery';
import { useMemo } from 'react';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';

/**
 * Hook to list MCP Servers using the AI Gateway v2 API.
 * Lists managed and remote MCP servers registered in aigw's store.
 *
 * The server pages results (default 50, created_at desc), so this walks
 * next_page_token until exhausted — a single-page read silently hides every
 * server older than the newest page. page_size stays unset: the server owns
 * that policy.
 *
 * @note This hook uses the aigw v2 transport - requires /.aigw/api/ proxy configuration
 *
 * @example
 * const { data } = useListAigwMCPServersQuery();
 * const servers = data?.mcpServers ?? [];
 */
export const useListAigwMCPServersQuery = (
  input?: MessageInit<ListMCPServersRequest>,
  options?: QueryOptions<GenMessage<ListMCPServersRequest>, ListMCPServersResponse>
) => {
  const transport = useAigwTransport();

  const request = create(ListMCPServersRequestSchema, {
    pageToken: '',
    ...(input?.filter && { filter: input.filter }),
  }) as ListMCPServersRequest & Required<Pick<ListMCPServersRequest, 'pageToken'>>;

  const result = useInfiniteQueryWithAllPages(listMCPServers, request, {
    enabled: options?.enabled,
    getNextPageParam: (lastPage) => lastPage?.nextPageToken || undefined,
    pageParamKey: 'pageToken',
    transport,
  });

  const mcpServers = useMemo(() => result.data?.pages.flatMap((page) => page?.mcpServers ?? []) ?? [], [result.data]);

  const data = useMemo(() => ({ mcpServers }), [mcpServers]);

  return {
    ...result,
    data,
  };
};
