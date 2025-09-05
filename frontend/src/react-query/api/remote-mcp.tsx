import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import {
  useQueryClient,
  useMutation as useTanstackMutation,
  useQuery as useTanstackQuery,
} from '@tanstack/react-query';
import { config } from 'config';
import {
  type GetMCPServerRequest,
  GetMCPServerRequestSchema,
  type ListMCPServersRequest,
  ListMCPServersRequest_FilterSchema,
  ListMCPServersRequestSchema,
  type ListMCPServersResponse,
  type MCPServer,
  MCPServer_State,
  MCPServerService,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import {
  createMCPServer,
  deleteMCPServer,
  getMCPServer,
  getMCPServerServiceConfigSchema,
  lintMCPConfig,
  listMCPServers,
  startMCPServer,
  stopMCPServer,
  updateMCPServer,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp-MCPServerService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

// TODO: Make this dynamic so that pagination can be used properly
const MCP_SERVER_MAX_PAGE_SIZE = 50;

export const useListMCPServersQuery = (
  input?: MessageInit<ListMCPServersRequest>,
  options?: QueryOptions<GenMessage<ListMCPServersRequest>, ListMCPServersResponse>,
) => {
  const listMCPServersRequest = create(ListMCPServersRequestSchema, {
    pageToken: '',
    pageSize: MCP_SERVER_MAX_PAGE_SIZE,
    filter: input?.filter
      ? create(ListMCPServersRequest_FilterSchema, {
          displayNameContains: input.filter.displayNameContains,
          tags: input.filter.tags,
          secretId: input.filter.secretId,
        })
      : undefined,
  });

  return useQuery(listMCPServers, listMCPServersRequest, {
    enabled: options?.enabled,
  });
};

export const useGetMCPServerQuery = (input?: MessageInit<GetMCPServerRequest>, options?: { enabled?: boolean }) => {
  const getMCPServerRequest = create(GetMCPServerRequestSchema, { id: input?.id });

  return useQuery(getMCPServer, getMCPServerRequest, {
    enabled: options?.enabled,
  });
};

export const useCheckMCPServerNameUniqueness = () => {
  const { data: servers, isLoading } = useListMCPServersQuery();

  const checkNameUniqueness = (displayName: string, excludeId?: string): boolean => {
    if (!servers?.mcpServers || isLoading) return true;

    return !servers.mcpServers.some(
      (server) => server.displayName.toLowerCase() === displayName.toLowerCase() && server.id !== excludeId,
    );
  };

  return { checkNameUniqueness, isLoading };
};

export const useCreateMCPServerMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createMCPServer, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: MCPServerService.method.listMCPServers,
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
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'MCP server',
      });
    },
  });
};

export const useUpdateMCPServerMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(updateMCPServer, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: MCPServerService.method.listMCPServers,
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
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'update',
        entity: 'MCP server',
      });
    },
  });
};

export const useDeleteMCPServerMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(deleteMCPServer, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: MCPServerService.method.listMCPServers,
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
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'delete',
        entity: 'MCP server',
      });
    },
  });
};

export const useStopMCPServerMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(stopMCPServer, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: MCPServerService.method.getMCPServer,
          cardinality: 'finite',
        }),
        exact: false,
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: MCPServerService.method.listMCPServers,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'stop',
        entity: 'MCP server',
      });
    },
  });
};

export const useStartMCPServerMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(startMCPServer, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: MCPServerService.method.getMCPServer,
          cardinality: 'finite',
        }),
        exact: false,
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: MCPServerService.method.listMCPServers,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'start',
        entity: 'MCP server',
      });
    },
  });
};

export const useGetMCPServerServiceConfigSchemaQuery = () => {
  return useQuery(getMCPServerServiceConfigSchema, {});
};

export const useLintMCPConfigMutation = () => {
  return useMutation(lintMCPConfig, {
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'lint',
        entity: 'MCP config',
      });
    },
  });
};

// Shared function to create MCP client with session management
export const createMCPClientWithSession = async (
  serverUrl: string,
  clientName: string,
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
      capabilities: {
        tools: {},
      },
    },
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

export interface CallMCPToolParams {
  serverUrl: string;
  toolName: string;
  parameters: Record<string, unknown>;
}

export const useCallMCPServerToolMutation = () => {
  return useTanstackMutation({
    mutationFn: async ({ serverUrl, toolName, parameters }: CallMCPToolParams) => {
      const { client } = await createMCPClientWithSession(serverUrl, 'redpanda-console');

      return client.callTool({
        name: toolName,
        arguments: parameters,
      });
    },
    onError: (error) => {
      const connectError = ConnectError.from(error);

      return formatToastErrorMessageGRPC({
        error: connectError,
        action: 'call',
        entity: 'MCP tool',
      });
    },
  });
};

export const GITHUB_CODE_SNIPPETS_API_BASE_URL =
  'https://raw.githubusercontent.com/redpanda-data/how-to-connect-code-snippets';

interface CodeSnippetRequest {
  language?: string;
}

const fetchCodeSnippet = async (language?: string): Promise<string> => {
  if (!language) {
    return '';
  }

  const response = await fetch(`${GITHUB_CODE_SNIPPETS_API_BASE_URL}/main/${language}/readme.md`);

  if (!response.ok) {
    throw new Error(`Failed to fetch code snippet: ${response.status} ${response.statusText}`);
  }

  const content = await response.text();

  return content;
};

export const useGetCodeSnippetQuery = (input: CodeSnippetRequest) => {
  return useTanstackQuery({
    queryKey: ['code-snippet', input.language],
    queryFn: () => fetchCodeSnippet(input.language),
    enabled: input.language !== '',
  });
};

export interface UseListMCPServerToolsParams {
  mcpServer?: MCPServer;
}

export const useListMCPServerTools = ({ mcpServer }: UseListMCPServerToolsParams) => {
  return useTanstackQuery({
    queryKey: ['mcp-server-tools', mcpServer?.url],
    queryFn: () => listMCPServerTools(mcpServer?.url || ''),
    enabled: !!mcpServer?.url && mcpServer?.state === MCPServer_State.RUNNING,
  });
};
