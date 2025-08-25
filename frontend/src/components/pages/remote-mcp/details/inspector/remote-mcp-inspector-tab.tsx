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

import { AlertCircle, CheckCircle, Clock, Loader2, Play, RefreshCcw } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { MCPServer_State } from '../../../../../protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import {
  type MCPTool,
  parseMCPToolsFromConfig,
  useCallMCPServerToolMutation,
  useGetMCPServerQuery,
} from '../../../../../react-query/api/remote-mcp';
import { Badge } from '../../../../redpanda-ui/components/badge';
import { Button } from '../../../../redpanda-ui/components/button';
import { DynamicCodeBlock } from '../../../../redpanda-ui/components/code-block-dynamic';
import { Label } from '../../../../redpanda-ui/components/label';
import { TabsContent, type TabsContentProps } from '../../../../redpanda-ui/components/tabs';
import { RemoteMCPToolTypeBadge } from '../../remote-mcp-tool-type-badge';
import { RemoteMCPInspectorParameters } from './remote-mcp-inspector-parameters';

const getToolsWithParameters = (tools: Record<string, any> | undefined): MCPTool[] => {
  if (!tools) return [];

  try {
    return parseMCPToolsFromConfig(tools);
  } catch (error) {
    console.warn('Failed to parse MCP tools:', error);
    // Fallback: create basic tools from the object keys
    return Object.entries(tools).map(([toolName, toolConfig]) => ({
      name: toolName,
      description: toolConfig?.description || `${toolName} tool`,
      parameters: [],
    }));
  }
};

export const RemoteMCPInspectorTab = (props: TabsContentProps) => {
  const { id } = useParams<{ id: string }>();
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [toolParameters, setToolParameters] = useState<Record<string, unknown>>({});
  const [toolResponse, setToolResponse] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);

  const {
    data: mcpServerData,
    refetch: refetchMCPServer,
    isRefetching: isRefetchingMCPServer,
  } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });
  const { mutate: callMCPServerTool } = useCallMCPServerToolMutation();

  const availableTools = getToolsWithParameters(mcpServerData?.mcpServer?.tools);

  const executeToolRequest = async () => {
    if (!selectedTool || !mcpServerData?.mcpServer?.url) return;

    setIsExecuting(true);
    setToolResponse('');

    callMCPServerTool(
      {
        serverUrl: mcpServerData.mcpServer.url,
        toolName: selectedTool,
        parameters: toolParameters,
      },
      {
        onSuccess: (response) => {
          setToolResponse(JSON.stringify(response, null, 4));
          setIsExecuting(false);
        },
        onError: (error) => {
          setToolResponse(
            JSON.stringify(
              {
                error: error instanceof Error ? error.message : 'Failed to execute tool request',
              },
              null,
              4,
            ),
          );
          setIsExecuting(false);
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

  return (
    <TabsContent {...props} className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">MCP Inspector</h3>
          <p className="text-sm text-muted-foreground mb-4">Test and interact with the deployed MCP server tools</p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Connection Status</Label>
            <Button variant="outline" size="sm" onClick={() => refetchMCPServer()}>
              {isRefetchingMCPServer ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Refreshing
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4" /> Refresh
                </div>
              )}
            </Button>
          </div>

          <div className="p-4 border rounded-lg">
            {mcpServerData?.mcpServer?.state === MCPServer_State.RUNNING ? (
              <div className="flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-800">MCP server is running</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm text-red-800">MCP server is not running</span>
              </div>
            )}
          </div>
        </div>

        {mcpServerData?.mcpServer?.state === MCPServer_State.RUNNING && availableTools.length > 0 && (
          <div className="space-y-4">
            <Label className="text-sm font-medium">Available Tools</Label>
            <div className="grid gap-3">
              {availableTools.map((tool) => (
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
                    setToolResponse('');
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
                        <h4 className="font-medium text-sm">{tool.name}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">{tool.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {tool.parameters.length} params
                      </Badge>
                      {selectedTool === tool.name && (
                        <Badge variant="default" className="text-xs bg-blue-600">
                          Testing
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedTool && mcpServerData?.mcpServer?.state === MCPServer_State.RUNNING && (
          <div className="space-y-4 border-t pt-6">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Test Tool: <code>{selectedTool}</code>
              </Label>
              <Button variant="secondary" onClick={executeToolRequest} disabled={isExecuting} size="sm">
                {isExecuting ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Execute Tool
                  </>
                )}
              </Button>
            </div>

            <RemoteMCPInspectorParameters
              selectedTool={selectedTool}
              availableTools={availableTools}
              toolParameters={toolParameters}
              onParameterChange={handleParameterChange}
            />

            {toolResponse && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Response</Label>
                <div className="w-full">
                  <DynamicCodeBlock lang="json" code={toolResponse} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </TabsContent>
  );
};
