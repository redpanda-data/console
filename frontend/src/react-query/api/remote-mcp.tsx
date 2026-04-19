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
  type GetMCPServerResponse,
  type ListMCPServersRequest,
  ListMCPServersRequest_FilterSchema,
  ListMCPServersRequestSchema,
  type ListMCPServersResponse,
  type MCPServer,
  MCPServer_State,
  MCPServer_Tool_ComponentType,
  MCPServerService,
} from 'protogen/redpanda/api/dataplane/v1/mcp_pb';
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
} from 'protogen/redpanda/api/dataplane/v1/mcp-MCPServerService_connectquery';
import { useMemo } from 'react';
import { ConsoleJWTOAuthProvider } from 'react-query/api/mcp-oauth-provider';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export { MCPServer_State, MCPServer_Tool_ComponentType };
export type { MCPServer };

export const useListMCPServersQuery = (
  input?: MessageInit<ListMCPServersRequest>,
  options?: QueryOptions<GenMessage<ListMCPServersRequest>, ListMCPServersResponse>
) => {
  // The React compiler auto-memoizes this to prevent infinite re-renders
  const listMCPServersRequest = create(ListMCPServersRequestSchema, {
    pageToken: '',
    pageSize: MAX_PAGE_SIZE,
    filter: input?.filter
      ? create(ListMCPServersRequest_FilterSchema, {
          displayNameContains: input.filter.displayNameContains,
          tags: input.filter.tags,
          secretId: input.filter.secretId,
        })
      : undefined,
  }) as ListMCPServersRequest & Required<Pick<ListMCPServersRequest, 'pageToken'>>;

  const result = useInfiniteQueryWithAllPages(listMCPServers, listMCPServersRequest, {
    enabled: options?.enabled !== false,
    getNextPageParam: (lastPage) => lastPage?.nextPageToken || undefined,
    pageParamKey: 'pageToken',
  });

  const mcpServers = useMemo(() => {
    const allMcpServers = result?.data?.pages?.flatMap((page) => page?.mcpServers ?? []);
    return allMcpServers ?? [];
  }, [result.data]);

  const data = useMemo(() => ({ mcpServers }), [mcpServers]);

  return {
    ...result,
    data,
  };
};

export const useGetMCPServerQuery = (
  input?: MessageInit<GetMCPServerRequest>,
  options?: QueryOptions<GenMessage<GetMCPServerResponse>>
) => {
  const getMCPServerRequest = create(GetMCPServerRequestSchema, {
    id: input?.id,
  });

  return useQuery(getMCPServer, getMCPServerRequest, {
    enabled: options?.enabled !== false,
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

  return useMutation(createMCPServer, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: MCPServerService.method.listMCPServers,
          cardinality: 'infinite',
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

  return useMutation(updateMCPServer, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: MCPServerService.method.listMCPServers,
          cardinality: 'infinite',
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

  return useMutation(deleteMCPServer, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: MCPServerService.method.listMCPServers,
          cardinality: 'infinite',
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
          cardinality: 'infinite',
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
          cardinality: 'infinite',
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

export const useGetMCPServerServiceConfigSchemaQuery = () => useQuery(getMCPServerServiceConfigSchema, {});

export const useLintMCPConfigMutation = () =>
  useMutation(lintMCPConfig, {
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'lint',
        entity: 'MCP config',
      }),
  });

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
  const authProvider = new ConsoleJWTOAuthProvider({ getJwt: () => config.jwt, clientName });
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    authProvider,
    // allow: direct-query MCP SDK transport requires a raw fetch to stream SSE — ConnectRPC does not apply here
    fetch: async (input, init) => {
      const response = await fetch(input, {
        ...init,
        headers: {
          ...init?.headers,
          'Content-Type': 'application/json',
          ...(config.jwt && { Authorization: `Bearer ${config.jwt}` }),
          'Mcp-Session-Id': client?.transport?.sessionId ?? '',
        },
      });
      return response;
    },
  });

  transport.onerror = (error) => {
    // biome-ignore lint/suspicious/noConsole: transport-level errors have no UI surface
    console.error('[MCP] transport error', { serverUrl, error });
  };

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

      try {
        return await client.callTool(
          {
            name: toolName,
            arguments: parameters,
          },
          undefined,
          { signal }
        );
      } finally {
        await client.close?.();
      }
    },
    onError: (error) => {
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        return;
      }

      const connectError = ConnectError.from(error);

      toast.error(
        formatToastErrorMessageGRPC({
          error: connectError,
          action: 'call',
          entity: 'MCP tool',
        })
      );
    },
  });

export type MCPStreamTaskStatus = 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled';

export type MCPStreamProgress = {
  taskId?: string;
  status?: MCPStreamTaskStatus;
  statusMessage?: string;
  progress?: number;
  total?: number;
};

export type StreamMCPToolParams = CallMCPToolParams & {
  onProgress?: (update: MCPStreamProgress) => void;
  /**
   * Maximum time to wait for the stream to produce a terminal (result/error)
   * message. On timeout, the SDK signal is aborted and the mutation rejects
   * with a descriptive error. Defaults to {@link DEFAULT_STREAM_TIMEOUT_MS}.
   */
  streamTimeoutMs?: number;
};

type CallToolResult = Awaited<
  ReturnType<InstanceType<typeof import('@modelcontextprotocol/sdk/client/index.js').Client>['callTool']>
>;

type MCPClient = InstanceType<typeof import('@modelcontextprotocol/sdk/client/index.js').Client>;

export const DEFAULT_STREAM_TIMEOUT_MS = 120_000;

const serverSupportsToolTasks = (client: MCPClient): boolean => {
  const capabilities = client.getServerCapabilities();
  return capabilities?.tasks?.requests?.tools?.call !== undefined;
};

// Compose a caller signal with a timeout so a hung stream rejects instead of
// blocking forever. Returned cleanup must run in a `finally`.
const buildStreamAbortControl = (signal: AbortSignal | undefined, timeoutMs: number) => {
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);
  const onUserAbort = () => timeoutController.abort();
  if (signal?.aborted) {
    timeoutController.abort();
  } else {
    signal?.addEventListener('abort', onUserAbort, { once: true });
  }
  return {
    composedSignal: timeoutController.signal,
    cleanup: () => {
      clearTimeout(timeoutHandle);
      signal?.removeEventListener('abort', onUserAbort);
    },
  };
};

const drainMCPStream = async <T,>(
  stream: AsyncIterable<{
    type: 'taskCreated' | 'taskStatus' | 'result' | 'error';
    task?: { taskId: string; status: MCPStreamTaskStatus; statusMessage?: string };
    result?: T;
    error?: Error;
  }>,
  onProgress?: (update: MCPStreamProgress) => void
): Promise<T | undefined> => {
  for await (const message of stream) {
    if (message.type === 'taskCreated' || message.type === 'taskStatus') {
      onProgress?.({
        taskId: message.task?.taskId,
        status: message.task?.status,
        statusMessage: message.task?.statusMessage,
      });
      continue;
    }
    if (message.type === 'result') {
      return message.result;
    }
    throw message.error ?? new Error('MCP stream yielded an error event with no payload');
  }
  return;
};

export const useStreamMCPServerToolMutation = () =>
  useTanstackMutation({
    mutationFn: async ({
      serverUrl,
      toolName,
      parameters,
      signal,
      onProgress,
      streamTimeoutMs = DEFAULT_STREAM_TIMEOUT_MS,
    }: StreamMCPToolParams): Promise<CallToolResult> => {
      const { client } = await createMCPClientWithSession(serverUrl, 'redpanda-console');

      try {
        // Older servers respond to callToolStream but never produce a terminal
        // message, which would hang the mutation — fall back to non-streaming.
        if (!serverSupportsToolTasks(client)) {
          return (await client.callTool({ name: toolName, arguments: parameters }, undefined, {
            signal,
          })) as CallToolResult;
        }

        const { composedSignal, cleanup } = buildStreamAbortControl(signal, streamTimeoutMs);

        try {
          const stream = client.experimental.tasks.callToolStream(
            { name: toolName, arguments: parameters },
            undefined,
            {
              signal: composedSignal,
              onprogress: (progress) => {
                onProgress?.({
                  progress: progress.progress,
                  total: progress.total,
                });
              },
            }
          );

          const result = await drainMCPStream(stream, onProgress);
          if (result !== undefined) {
            return result as CallToolResult;
          }

          // Stream closed without a terminal message. Surface timeout explicitly
          // if that was the cause; otherwise fail fast with a watchdog error.
          if (composedSignal.aborted && !signal?.aborted) {
            throw new Error(`MCP tool stream timed out after ${streamTimeoutMs}ms`);
          }
          throw new Error('MCP tool stream ended without a terminal result or error message');
        } finally {
          cleanup();
        }
      } finally {
        await client.close?.();
      }
    },
    onError: (error) => {
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        return;
      }

      const connectError = ConnectError.from(error);

      toast.error(
        formatToastErrorMessageGRPC({
          error: connectError,
          action: 'call',
          entity: 'MCP tool',
        })
      );
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
            input: create(GetMCPServerRequestSchema, {
              id: mcpServer.id,
            }),
            cardinality: 'finite',
          }),
        });
      }

      return listMCPServerTools(mcpServer?.url || '');
    },
    enabled: !!mcpServer?.url && mcpServer?.state === MCPServer_State.RUNNING,
  });
};
