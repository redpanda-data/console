import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import {
  useQueryClient,
  useMutation as useTanstackMutation,
  useQuery as useTanstackQuery,
} from '@tanstack/react-query';
import { config, isFeatureFlagEnabled } from 'config';
import {
  type GetMCPServerRequest as GetMCPServerRequestV1,
  GetMCPServerRequestSchema as GetMCPServerRequestSchemaV1,
  type GetMCPServerResponse as GetMCPServerResponseV1,
  type ListMCPServersRequest as ListMCPServersRequestV1,
  ListMCPServersRequest_FilterSchema as ListMCPServersRequest_FilterSchemaV1,
  ListMCPServersRequestSchema as ListMCPServersRequestSchemaV1,
  type ListMCPServersResponse as ListMCPServersResponseV1,
  type MCPServer as MCPServerV1,
  MCPServer_State as MCPServer_StateV1,
  MCPServerService as MCPServerServiceV1,
} from 'protogen/redpanda/api/dataplane/v1/mcp_pb';
import {
  createMCPServer as createMCPServerV1,
  deleteMCPServer as deleteMCPServerV1,
  getMCPServer as getMCPServerV1,
  getMCPServerServiceConfigSchema as getMCPServerServiceConfigSchemaV1,
  lintMCPConfig as lintMCPConfigV1,
  listMCPServers as listMCPServersV1,
  startMCPServer as startMCPServerV1,
  stopMCPServer as stopMCPServerV1,
  updateMCPServer as updateMCPServerV1,
} from 'protogen/redpanda/api/dataplane/v1/mcp-MCPServerService_connectquery';
import {
  type GetMCPServerRequest as GetMCPServerRequestV1Alpha3,
  GetMCPServerRequestSchema as GetMCPServerRequestSchemaV1Alpha3,
  type GetMCPServerResponse as GetMCPServerResponseV1Alpha3,
  type ListMCPServersRequest as ListMCPServersRequestV1Alpha3,
  ListMCPServersRequest_FilterSchema as ListMCPServersRequest_FilterSchemaV1Alpha3,
  ListMCPServersRequestSchema as ListMCPServersRequestSchemaV1Alpha3,
  type ListMCPServersResponse as ListMCPServersResponseV1Alpha3,
  type MCPServer as MCPServerV1Alpha3,
  MCPServer_State as MCPServer_StateV1Alpha3,
  MCPServerService as MCPServerServiceV1Alpha3,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import {
  createMCPServer as createMCPServerV1Alpha3,
  deleteMCPServer as deleteMCPServerV1Alpha3,
  getMCPServer as getMCPServerV1Alpha3,
  getMCPServerServiceConfigSchema as getMCPServerServiceConfigSchemaV1Alpha3,
  lintMCPConfig as lintMCPConfigV1Alpha3,
  listMCPServers as listMCPServersV1Alpha3,
  startMCPServer as startMCPServerV1Alpha3,
  stopMCPServer as stopMCPServerV1Alpha3,
  updateMCPServer as updateMCPServerV1Alpha3,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp-MCPServerService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

// TODO: Make this dynamic so that pagination can be used properly
const MCP_SERVER_MAX_PAGE_SIZE = 50;

// Export unified types
export type GetMCPServerRequest = GetMCPServerRequestV1 | GetMCPServerRequestV1Alpha3;
export type GetMCPServerResponse = GetMCPServerResponseV1 | GetMCPServerResponseV1Alpha3;
export type ListMCPServersRequest = ListMCPServersRequestV1 | ListMCPServersRequestV1Alpha3;
export type ListMCPServersResponse = ListMCPServersResponseV1 | ListMCPServersResponseV1Alpha3;
export type MCPServer = MCPServerV1 | MCPServerV1Alpha3;

export const useListMCPServersQuery = (
  input?: MessageInit<ListMCPServersRequest>,
  options?: QueryOptions<GenMessage<ListMCPServersRequest>, ListMCPServersResponse>
) => {
  const useMcpV1 = isFeatureFlagEnabled('enableMcpServiceAccount');

  const listMCPServersRequest = create(
    useMcpV1 ? ListMCPServersRequestSchemaV1 : ListMCPServersRequestSchemaV1Alpha3,
    {
      pageToken: '',
      pageSize: MCP_SERVER_MAX_PAGE_SIZE,
      filter: input?.filter
        ? create(useMcpV1 ? ListMCPServersRequest_FilterSchemaV1 : ListMCPServersRequest_FilterSchemaV1Alpha3, {
            displayNameContains: input.filter.displayNameContains,
            tags: input.filter.tags,
            secretId: input.filter.secretId,
          })
        : undefined,
    }
  );

  return useQuery(useMcpV1 ? listMCPServersV1 : listMCPServersV1Alpha3, listMCPServersRequest, {
    enabled: options?.enabled,
  });
};

export const useGetMCPServerQuery = (
  input?: MessageInit<GetMCPServerRequest>,
  options?: QueryOptions<GenMessage<GetMCPServerResponse>>
) => {
  const useMcpV1 = isFeatureFlagEnabled('enableMcpServiceAccount');
  const getMCPServerRequest = create(useMcpV1 ? GetMCPServerRequestSchemaV1 : GetMCPServerRequestSchemaV1Alpha3, {
    id: input?.id,
  });

  const MCPServer_State = useMcpV1 ? MCPServer_StateV1 : MCPServer_StateV1Alpha3;

  return useQuery(useMcpV1 ? getMCPServerV1 : getMCPServerV1Alpha3, getMCPServerRequest, {
    enabled: options?.enabled,
    refetchInterval:
      options?.refetchInterval ??
      ((query) => (query?.state?.data?.mcpServer?.state === MCPServer_State.STARTING ? 2 * 1000 : false)),
    refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
  });
};

export const useCheckMCPServerNameUniqueness = () => {
  const { data: servers, isLoading } = useListMCPServersQuery();

  const checkNameUniqueness = (displayName: string, excludeId?: string): boolean => {
    if (!servers?.mcpServers || isLoading) {
      return true;
    }

    return !servers.mcpServers.some(
      (server) => server.displayName.toLowerCase() === displayName.toLowerCase() && server.id !== excludeId
    );
  };

  return { checkNameUniqueness, isLoading };
};

export const useCreateMCPServerMutation = () => {
  const queryClient = useQueryClient();
  const useMcpV1 = isFeatureFlagEnabled('enableMcpServiceAccount');

  return useMutation(useMcpV1 ? createMCPServerV1 : createMCPServerV1Alpha3, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: (useMcpV1 ? MCPServerServiceV1 : MCPServerServiceV1Alpha3).method.listMCPServers,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'MCP server',
      }),
  });
};

export const useUpdateMCPServerMutation = () => {
  const queryClient = useQueryClient();
  const useMcpV1 = isFeatureFlagEnabled('enableMcpServiceAccount');

  return useMutation(useMcpV1 ? updateMCPServerV1 : updateMCPServerV1Alpha3, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: (useMcpV1 ? MCPServerServiceV1 : MCPServerServiceV1Alpha3).method.listMCPServers,
          cardinality: 'finite',
        }),
        exact: false,
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: MCPServerService.method.getMCPServer,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'update',
        entity: 'MCP server',
      }),
  });
};

export const useDeleteMCPServerMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: ConnectError) => void;
}) => {
  const queryClient = useQueryClient();
  const useMcpV1 = isFeatureFlagEnabled('enableMcpServiceAccount');

  return useMutation(useMcpV1 ? deleteMCPServerV1 : deleteMCPServerV1Alpha3, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: (useMcpV1 ? MCPServerServiceV1 : MCPServerServiceV1Alpha3).method.listMCPServers,
          cardinality: 'finite',
        }),
        exact: false,
      });
      options?.onSuccess?.();
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
};

export const useStopMCPServerMutation = () => {
  const queryClient = useQueryClient();
  const useMcpV1 = isFeatureFlagEnabled('enableMcpServiceAccount');

  return useMutation(useMcpV1 ? stopMCPServerV1 : stopMCPServerV1Alpha3, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: (useMcpV1 ? MCPServerServiceV1 : MCPServerServiceV1Alpha3).method.getMCPServer,
          cardinality: 'finite',
        }),
        exact: false,
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: (useMcpV1 ? MCPServerServiceV1 : MCPServerServiceV1Alpha3).method.listMCPServers,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'stop',
        entity: 'MCP server',
      }),
  });
};

export const useStartMCPServerMutation = () => {
  const queryClient = useQueryClient();
  const useMcpV1 = isFeatureFlagEnabled('enableMcpServiceAccount');

  return useMutation(useMcpV1 ? startMCPServerV1 : startMCPServerV1Alpha3, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: (useMcpV1 ? MCPServerServiceV1 : MCPServerServiceV1Alpha3).method.getMCPServer,
          cardinality: 'finite',
        }),
        exact: false,
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: (useMcpV1 ? MCPServerServiceV1 : MCPServerServiceV1Alpha3).method.listMCPServers,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'start',
        entity: 'MCP server',
      }),
  });
};

export const useGetMCPServerServiceConfigSchemaQuery = () => {
  const useMcpV1 = isFeatureFlagEnabled('enableMcpServiceAccount');
  return useQuery(useMcpV1 ? getMCPServerServiceConfigSchemaV1 : getMCPServerServiceConfigSchemaV1Alpha3, {});
};

export const useLintMCPConfigMutation = () => {
  const useMcpV1 = isFeatureFlagEnabled('enableMcpServiceAccount');
  return useMutation(useMcpV1 ? lintMCPConfigV1 : lintMCPConfigV1Alpha3, {
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'lint',
        entity: 'MCP config',
      }),
  });
};

// Shared function to create MCP client with session management
export const createMCPClientWithSession = async (
  serverUrl: string,
  clientName: string
): Promise<{
  client: InstanceType<typeof import('@modelcontextprotocol/sdk/client/index.js').Client>;
  transport: InstanceType<
    typeof import('@modelcontextprotocol/sdk/client/streamableHttp.js').StreamableHTTPClientTransport
  >;
}> => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

  // Create MCP client
  const client = new Client(
    {
      name: clientName,
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  // Create StreamableHTTP transport for HTTP endpoints
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    fetch: async (input, init) => {
      const response = await fetch(input, {
        ...init,
        headers: {
          ...init?.headers,
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.jwt}`,
          'Mcp-Session-Id': client?.transport?.sessionId ?? '',
        },
      });
      return response;
    },
  });

  // Connect the client to the transport
  await client.connect(transport);

  return { client, transport };
};

export const listMCPServerTools = async (serverUrl: string) => {
  const { client } = await createMCPClientWithSession(serverUrl, 'redpanda-console');

  return client.listTools();
};

export type CallMCPToolParams = {
  serverUrl: string;
  toolName: string;
  parameters: Record<string, unknown>;
  signal?: AbortSignal;
};

export const useCallMCPServerToolMutation = () =>
  useTanstackMutation({
    mutationFn: async ({ serverUrl, toolName, parameters, signal }: CallMCPToolParams) => {
      const { client } = await createMCPClientWithSession(serverUrl, 'redpanda-console');

      return client.callTool(
        {
          name: toolName,
          arguments: parameters,
        },
        undefined,
        { signal }
      );
    },
    onError: (error) => {
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        return;
      }

      const connectError = ConnectError.from(error);

      return formatToastErrorMessageGRPC({
        error: connectError,
        action: 'call',
        entity: 'MCP tool',
      });
    },
  });

export const GITHUB_CODE_SNIPPETS_API_BASE_URL =
  'https://raw.githubusercontent.com/redpanda-data/how-to-connect-code-snippets';

type CodeSnippetRequest = {
  language?: string;
};

const fetchMCPCodeSnippet = async (language?: string): Promise<string> => {
  if (!language) {
    return '';
  }
  const response = await fetch(`${GITHUB_CODE_SNIPPETS_API_BASE_URL}/refs/heads/main/mcp/${language}/README.md`);

  if (!response.ok) {
    throw new Error(`Failed to fetch code snippet: ${response.status} ${response.statusText}`);
  }

  const content = await response.text();

  return content;
};

export const useGetMCPCodeSnippetQuery = (input: CodeSnippetRequest) =>
  useTanstackQuery({
    queryKey: ['mcp-code-snippet', input.language],
    queryFn: () => fetchMCPCodeSnippet(input.language),
    enabled: input.language !== '',
  });

export type UseListMCPServerToolsParams = {
  mcpServer?: MCPServer;
};

export const useListMCPServerTools = ({ mcpServer }: UseListMCPServerToolsParams) => {
  const queryClient = useQueryClient();

  return useTanstackQuery({
    queryKey: ['mcp-server-tools', mcpServer?.url],
    queryFn: async () => {
      // Refetch getMCPServer data before listing tools
      if (mcpServer?.id) {
        await queryClient.refetchQueries({
          queryKey: createConnectQueryKey({
            schema: MCPServerService.method.getMCPServer,
            input: create(GetMCPServerRequestSchema, { id: mcpServer.id }),
            cardinality: 'finite',
          }),
        });
      }

      return listMCPServerTools(mcpServer?.url || '');
    },
    enabled: !!mcpServer?.url && mcpServer?.state === MCPServer_State.RUNNING,
  });
};
