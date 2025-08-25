import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient, useMutation as useTanstackMutation } from '@tanstack/react-query';
import { config } from 'config';
import {
  type GetMCPServerRequest,
  GetMCPServerRequestSchema,
  type ListMCPServersRequest,
  ListMCPServersRequest_FilterSchema,
  ListMCPServersRequestSchema,
  type ListMCPServersResponse,
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

export interface MCPTool {
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
}

export interface MCPToolsListResponse {
  tools: MCPTool[];
}

// TODO: Remove this once the API provides more details about the MCP tools, so that the YAML parsing is not needed.
export const parseMCPToolsFromConfig = (tools: { [key: string]: { configYaml: string } }): MCPTool[] => {
  const mcpTools: MCPTool[] = [];

  for (const [toolName, toolConfig] of Object.entries(tools)) {
    try {
      const lines = toolConfig.configYaml.split('\n');
      let inMeta = false;
      let inMcp = false;
      let description = '';
      let currentProperty: {
        name: string;
        type: string;
        description: string;
        required?: boolean;
      } | null = null;
      const properties: Array<{
        name: string;
        type: string;
        description: string;
        required?: boolean;
      }> = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Look for the meta section
        if (trimmed === 'meta:') {
          inMeta = true;
          continue;
        }

        // Look for the mcp subsection within meta
        if (inMeta && trimmed === 'mcp:') {
          inMcp = true;
          continue;
        }

        // Parse MCP section content
        if (inMeta && inMcp) {
          if (trimmed.startsWith('enabled:')) {
            continue; // Skip enabled flag
          }
          if (trimmed.startsWith('description:')) {
            // Extract description, handling quoted strings
            const descMatch = trimmed.match(/description:\s*["']?([^"']*)["']?/);
            if (descMatch) {
              description = descMatch[1];
            }
          } else if (trimmed === 'properties:') {
            continue; // Start of properties section
          } else if (trimmed.startsWith('- name:')) {
            // Save previous property if exists
            if (currentProperty) {
              properties.push(currentProperty);
            }
            // Start new property
            const name = trimmed.replace('- name:', '').trim();
            currentProperty = {
              name,
              type: 'string',
              description: '',
              required: false,
            };
          } else if (trimmed.startsWith('type:') && currentProperty) {
            currentProperty.type = trimmed.replace('type:', '').trim();
            // biome-ignore lint/suspicious/noDuplicateElseIf: ignore for now
          } else if (trimmed.startsWith('description:') && currentProperty) {
            // Extract description, handling quoted strings
            const descMatch = trimmed.match(/description:\s*["']?([^"']*)["']?/);
            if (descMatch) {
              currentProperty.description = descMatch[1];
            }
          } else if (trimmed.startsWith('required:') && currentProperty) {
            currentProperty.required = trimmed.replace('required:', '').trim() === 'true';
          }
        }

        // Check if we're leaving the meta section
        if (trimmed && !line.startsWith(' ') && !line.startsWith('\t') && inMeta && trimmed !== 'meta:') {
          // Save last property if exists
          if (currentProperty) {
            properties.push(currentProperty);
            currentProperty = null;
          }
          inMeta = false;
          inMcp = false;
        }
      }

      // Don't forget the last property if we ended while in MCP section
      if (currentProperty && inMcp) {
        properties.push(currentProperty);
      }

      // Only add tool if we found MCP metadata
      if (inMcp || description || properties.length > 0) {
        mcpTools.push({
          name: toolName,
          description: description || `${toolName} tool`,
          parameters: properties.map((property) => ({
            name: property.name,
            type: property.type,
            description: property.description,
            required: property.required || false,
          })),
        });
      }
    } catch (error) {
      console.warn(`Failed to parse MCP config for tool ${toolName}:`, error);
      // Fallback: create a basic tool entry
      mcpTools.push({
        name: toolName,
        description: `${toolName} tool`,
        parameters: [],
      });
    }
  }

  return mcpTools;
};

export const fetchMCPServerTools = async (serverUrl: string): Promise<MCPToolsListResponse> => {
  const response = await fetch(`${serverUrl}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch tools: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`MCP Error: ${data.error.message || 'Unknown error'}`);
  }

  return {
    tools: (data.result?.tools || []).map((tool: Record<string, unknown>) => ({
      name: String(tool.name || ''),
      description: String(tool.description || ''),
      parameters: Object.entries((tool.inputSchema as Record<string, unknown>)?.properties || {}).map(
        ([name, schema]: [string, Record<string, unknown>]) => ({
          name,
          type: String(schema.type || 'string'),
          description: String(schema.description || ''),
          required: (((tool.inputSchema as Record<string, unknown>)?.required as string[]) || []).includes(name),
        }),
      ),
    })),
  };
};

export interface CallMCPToolParams {
  serverUrl: string;
  toolName: string;
  parameters: Record<string, unknown>;
}

export const useCallMCPServerToolMutation = () => {
  return useTanstackMutation({
    mutationFn: async ({ serverUrl, toolName, parameters }: CallMCPToolParams): Promise<unknown> => {
      const token = config.jwt;
      const response = await fetch(`${serverUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: parameters,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to call tool: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`MCP Error: ${data.error.message || 'Unknown error'}`);
      }

      return data.result;
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
