/**
 * AI Gateway v2 MCP Servers Query Hook
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
  type ListMCPServersRequest,
  ListMCPServersRequestSchema,
  type ListMCPServersResponse,
} from 'protogen/redpanda/api/adp/v1alpha1/mcp_server_pb';
import { listMCPServers } from 'protogen/redpanda/api/adp/v1alpha1/mcp_server-MCPServerService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';

const AIGW_DEFAULT_PAGE_SIZE = 50;

/**
 * Hook to list MCP Servers using the AI Gateway v2 API.
 * Lists managed and remote MCP servers registered in aigw's store.
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
): UseQueryResult<ListMCPServersResponse, ConnectError> => {
  const transport = useAigwTransport();

  const request = create(ListMCPServersRequestSchema, {
    pageToken: input?.pageToken ?? '',
    pageSize: input?.pageSize ?? AIGW_DEFAULT_PAGE_SIZE,
    ...(input?.filter && { filter: input.filter }),
  });

  return useQuery(listMCPServers, request, {
    enabled: options?.enabled,
    transport,
  });
};
