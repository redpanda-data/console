/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: leave for now */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: leave for now */

import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { Label } from 'components/redpanda-ui/components/label';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Heading, InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { Clock, Play } from 'lucide-react';
import { MCPServer_State } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useState } from 'react';
import { useCallMCPServerToolMutation, useGetMCPServerQuery, useListMCPServerTools } from 'react-query/api/remote-mcp';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { RemoteMCPToolTypeBadge } from '../../remote-mcp-tool-type-badge';
import { RemoteMCPInspectorParameters } from './remote-mcp-inspector-parameters';

export const RemoteMCPInspectorTab = () => {
  const { id } = useParams<{ id: string }>();
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [toolParameters, setToolParameters] = useState<Record<string, unknown>>({});

  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });
  const {
    data: serverToolResponse,
    mutate: callMCPServerTool,
    isPending: isServerToolPending,
    error: toolError,
  } = useCallMCPServerToolMutation();

  const {
    data: mcpServerTools,
    isLoading: isLoadingTools,
    error: toolsError,
  } = useListMCPServerTools({
    mcpServer: mcpServerData?.mcpServer,
  });

  const executeToolRequest = async () => {
    if (!selectedTool || !mcpServerData?.mcpServer?.url) return;

    callMCPServerTool(
      {
        serverUrl: mcpServerData.mcpServer.url,
        toolName: selectedTool,
        parameters: toolParameters,
      },
      {
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  };

  const handleParameterChange = (paramName: string, value: unknown) => {
    setToolParameters((prev) => ({
      ...prev,
      [paramName]: value,
    }));
  };

  const getFormattedToolResponse = () => {
    if (!serverToolResponse) return null;

    // Process content array if it exists and show only the first content item
    if (
      serverToolResponse.content &&
      Array.isArray(serverToolResponse.content) &&
      serverToolResponse.content.length > 0
    ) {
      const firstContentItem = serverToolResponse.content[0];
      if (firstContentItem.type === 'text' && firstContentItem.text) {
        // Try to parse text content as JSON for pretty formatting
        try {
          const parsed = JSON.parse(firstContentItem.text);
          return JSON.stringify(parsed, null, 2);
        } catch {
          // If not JSON, return as plain text
          return firstContentItem.text;
        }
      }
    }

    return null;
  };

  const formattedToolResponse = getFormattedToolResponse();

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <Heading level={3} className="mb-2">
            MCP Inspector
          </Heading>
          <Text variant="small" className="text-muted-foreground mb-4">
            Test and interact with the deployed MCP server tools
          </Text>
        </div>

        {mcpServerData?.mcpServer?.state === MCPServer_State.RUNNING && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Available Tools</Label>
              {isLoadingTools && (
                <Badge variant="outline" className="text-xs">
                  <Clock className="h-3 w-3 mr-1 animate-spin" />
                  Loading tools...
                </Badge>
              )}
              {toolsError && (
                <Badge variant="destructive" className="text-xs">
                  Failed to fetch tools
                </Badge>
              )}
            </div>
            {mcpServerTools?.tools?.length && mcpServerTools?.tools?.length > 0 ? (
              <div className="grid gap-3">
                {mcpServerTools?.tools?.map((tool) => (
                  <div
                    key={tool.name}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedTool === tool.name
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                        : 'hover:border-gray-300'
                    }`}
                    onClick={() => {
                      setSelectedTool(tool.name);
                      setToolParameters({});
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {mcpServerData?.mcpServer?.tools?.[tool.name]?.componentType && (
                            <RemoteMCPToolTypeBadge
                              componentType={mcpServerData.mcpServer.tools[tool.name].componentType}
                            />
                          )}
                          <Heading level={4} className="text-sm">
                            {tool.name}
                          </Heading>
                        </div>
                        <Text variant="small" className="text-muted-foreground">
                          {tool.description}
                        </Text>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {Object.keys(tool.inputSchema?.properties ?? {}).length ?? 0} params
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !isLoadingTools && (
                <Text variant="small" className="text-muted-foreground py-8 text-center">
                  {toolsError
                    ? 'Failed to fetch tools from MCP server. Check server connection and try again.'
                    : 'No tools available on this MCP server.'}
                </Text>
              )
            )}
          </div>
        )}

        {selectedTool && mcpServerData?.mcpServer?.state === MCPServer_State.RUNNING && (
          <div className="space-y-4 border-t pt-6">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Test Tool: <InlineCode>{selectedTool}</InlineCode>
              </Label>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={executeToolRequest} disabled={isServerToolPending} size="sm">
                  {isServerToolPending ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Run Tool
                    </>
                  )}
                </Button>
              </div>
            </div>

            <RemoteMCPInspectorParameters
              selectedTool={selectedTool}
              availableTools={mcpServerTools?.tools ?? []}
              toolParameters={toolParameters}
              onParameterChange={handleParameterChange}
            />

            {isServerToolPending && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Response</Label>
                <div className="flex flex-col space-y-3">
                  <Skeleton className="h-[250px] rounded-xl w-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              </div>
            )}

            {!isServerToolPending && (toolError || formattedToolResponse) && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Response</Label>
                <DynamicCodeBlock code={toolError ? toolError?.message : formattedToolResponse} lang="json" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
