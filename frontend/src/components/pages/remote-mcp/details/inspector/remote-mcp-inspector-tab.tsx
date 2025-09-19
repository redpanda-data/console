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
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Heading, InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { Clock, Copy, Play } from 'lucide-react';
import { MCPServer_State, MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useState } from 'react';
import { useCallMCPServerToolMutation, useGetMCPServerQuery, useListMCPServerTools } from 'react-query/api/remote-mcp';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { RemoteMCPToolTypeBadge } from '../../remote-mcp-tool-type-badge';
import { RemoteMCPInspectorParameters } from './remote-mcp-inspector-parameters';

const getComponentTypeFromToolName = (toolName: string): MCPServer_Tool_ComponentType => {
  // Convert to lowercase for case-insensitive matching
  const lowerName = toolName.toLowerCase();

  const cachePatterns = ['cache', 'memory', 'storage', 'store', 'persist'];

  // Check for cache patterns
  if (cachePatterns.some((pattern) => lowerName.includes(pattern))) {
    return MCPServer_Tool_ComponentType.CACHE;
  }
  // Default to unspecified if no patterns match
  return MCPServer_Tool_ComponentType.UNSPECIFIED;
};

type ParameterMode = 'form' | 'json';

export const RemoteMCPInspectorTab = () => {
  const { id } = useParams<{ id: string }>();
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [toolParameters, setToolParameters] = useState<Record<string, unknown>>({});
  const [arrayIndexes, setArrayIndexes] = useState<Record<string, number>>({});
  const [parameterMode, setParameterMode] = useState<ParameterMode>('form');
  const [jsonParameters, setJsonParameters] = useState<string>('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);

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

  // Transform flat parameter structure back into nested structure for arrays
  const transformParametersForPayload = (params: Record<string, unknown>) => {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      // Check if this is an array parameter (contains [0], [1], etc.)
      const arrayMatch = key.match(/^(.+)\[(\d+)\]\.(.+)$/);
      if (arrayMatch) {
        const [, arrayName, indexStr, propertyName] = arrayMatch;
        const index = Number.parseInt(indexStr, 10);

        if (!result[arrayName]) {
          result[arrayName] = [];
        }

        const array = result[arrayName] as unknown[];
        if (!array[index]) {
          array[index] = {};
        }

        (array[index] as Record<string, unknown>)[propertyName] = value;
      } else {
        result[key] = value;
      }
    }

    return result;
  };

  // Convert form parameters to JSON string
  const convertFormToJson = () => {
    const transformedParams = transformParametersForPayload(toolParameters);
    return JSON.stringify(transformedParams, null, 2);
  };

  // Convert JSON string to form parameters
  const convertJsonToForm = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      const flattened: Record<string, unknown> = {};
      const newArrayIndexes: Record<string, number> = {};

      const flattenObject = (obj: unknown, prefix = '') => {
        if (Array.isArray(obj)) {
          if (prefix) {
            newArrayIndexes[prefix] = obj.length;
          }
          obj.forEach((item, index) => {
            flattenObject(item, `${prefix}[${index}]`);
          });
        } else if (obj && typeof obj === 'object') {
          Object.entries(obj).forEach(([key, value]) => {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (Array.isArray(value) || (value && typeof value === 'object' && !Array.isArray(value))) {
              flattenObject(value, fullKey);
            } else {
              flattened[fullKey] = value;
            }
          });
        } else if (prefix) {
          flattened[prefix] = obj;
        }
      };

      flattenObject(parsed);
      setToolParameters(flattened);
      setArrayIndexes(newArrayIndexes);
      setJsonError(null);
      return true;
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Invalid JSON');
      return false;
    }
  };

  // Generate placeholder JSON structure from schema
  const generatePlaceholderJson = (toolName: string, toolData?: any) => {
    const selectedToolData = toolData || mcpServerTools?.tools?.find((t) => t.name === toolName);
    if (!selectedToolData?.inputSchema?.properties) {
      return '{}';
    }

    const generateValue = (schema: any, fieldName?: string): any => {
      if (schema.type === 'string') {
        // Provide contextual hints based on field names
        if (fieldName?.toLowerCase().includes('message')) {
          return '';
        }
        if (fieldName?.toLowerCase().includes('topic')) {
          return '';
        }
        if (fieldName?.toLowerCase().includes('name')) {
          return '';
        }
        return '';
      }
      if (schema.type === 'number') {
        return 0;
      }
      if (schema.type === 'boolean') {
        return false;
      }
      if (schema.type === 'array' && schema.items) {
        if (schema.items.properties) {
          // Array of objects
          const exampleItem: any = {};
          Object.entries(schema.items.properties).forEach(([key, itemSchema]) => {
            exampleItem[key] = generateValue(itemSchema, key);
          });
          return [exampleItem];
        }
        return [generateValue(schema.items, fieldName)];
      }
      if (schema.type === 'object' && schema.properties) {
        const obj: any = {};
        Object.entries(schema.properties).forEach(([key, propSchema]) => {
          obj[key] = generateValue(propSchema, key);
        });
        return obj;
      }
      return null;
    };

    const placeholder: any = {};
    Object.entries(selectedToolData.inputSchema.properties).forEach(([key, schema]) => {
      placeholder[key] = generateValue(schema, key);
    });

    return JSON.stringify(placeholder, null, 2);
  };

  // Handle mode switch
  const handleModeSwitch = (newMode: ParameterMode) => {
    if (newMode === 'json' && parameterMode === 'form') {
      // Convert form to JSON, or use placeholder if form is empty
      const hasFormData = Object.keys(toolParameters).length > 0;
      const jsonString = hasFormData ? convertFormToJson() : generatePlaceholderJson(selectedTool);
      setJsonParameters(jsonString);
    } else if (newMode === 'form' && parameterMode === 'json') {
      // Convert JSON to form
      convertJsonToForm(jsonParameters);
    }
    setParameterMode(newMode);
  };

  const executeToolRequest = async () => {
    if (!selectedTool || !mcpServerData?.mcpServer?.url) return;

    let parameters: Record<string, unknown>;

    if (parameterMode === 'json') {
      // Use JSON parameters
      try {
        parameters = JSON.parse(jsonParameters);
      } catch {
        toast.error('Invalid JSON parameters');
        return;
      }
    } else {
      // Use form parameters
      parameters = transformParametersForPayload(toolParameters);
    }

    callMCPServerTool(
      {
        serverUrl: mcpServerData.mcpServer.url,
        toolName: selectedTool,
        parameters,
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

  const handleArrayAdd = (arrayName: string) => {
    setArrayIndexes((prev) => ({
      ...prev,
      [arrayName]: (prev[arrayName] || 1) + 1,
    }));
  };

  const handleArrayRemove = (arrayName: string, removeIndex: number) => {
    const currentCount = arrayIndexes[arrayName] || 1;
    if (currentCount <= 1) return;

    // Remove parameters for the specific index
    setToolParameters((prev) => {
      const newParams = { ...prev };
      Object.keys(newParams).forEach((key) => {
        if (key.startsWith(`${arrayName}[${removeIndex}].`)) {
          delete newParams[key];
        }
      });

      // Reindex remaining parameters
      for (let i = removeIndex + 1; i < currentCount; i++) {
        Object.keys(newParams).forEach((key) => {
          if (key.startsWith(`${arrayName}[${i}].`)) {
            const newKey = key.replace(`${arrayName}[${i}].`, `${arrayName}[${i - 1}].`);
            newParams[newKey] = newParams[key];
            delete newParams[key];
          }
        });
      }

      return newParams;
    });

    // Update array count
    setArrayIndexes((prev) => ({
      ...prev,
      [arrayName]: currentCount - 1,
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

        {mcpServerData?.mcpServer?.state === MCPServer_State.STARTING && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Available Tools</Label>
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1 animate-spin" />
                Server starting...
              </Badge>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-[80px] rounded-lg w-full" />
              <Skeleton className="h-[80px] rounded-lg w-full" />
              <Skeleton className="h-[80px] rounded-lg w-full" />
            </div>
          </div>
        )}

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
                      // Initialize all parameters as empty strings
                      setToolParameters({});
                      // Initialize array indexes - start with 1 for all arrays
                      const initialArrayIndexes: Record<string, number> = {};
                      const properties = tool.inputSchema?.properties ?? {};
                      Object.entries(properties).forEach(([key, schema]) => {
                        const s = schema as { type?: string; items?: { properties?: Record<string, unknown> } };
                        if (s.type === 'array' && s.items?.properties) {
                          initialArrayIndexes[key] = 1;
                        }
                      });
                      setArrayIndexes(initialArrayIndexes);
                      // Reset JSON mode state with placeholder
                      const placeholder = generatePlaceholderJson(tool.name, tool);
                      setJsonParameters(placeholder);
                      setJsonError(null);
                      setParameterMode('form');
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <RemoteMCPToolTypeBadge
                            componentType={
                              mcpServerData?.mcpServer?.tools?.[tool.name]?.componentType ||
                              getComponentTypeFromToolName(tool.name)
                            }
                          />
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
                <Button
                  variant="outline"
                  onClick={() => handleModeSwitch(parameterMode === 'form' ? 'json' : 'form')}
                  size="sm"
                >
                  Switch to {parameterMode === 'form' ? 'JSON' : 'Form'}
                </Button>
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

            {parameterMode === 'form' ? (
              <RemoteMCPInspectorParameters
                selectedTool={selectedTool}
                availableTools={mcpServerTools?.tools ?? []}
                toolParameters={toolParameters}
                onParameterChange={handleParameterChange}
                arrayIndexes={arrayIndexes}
                onArrayAdd={handleArrayAdd}
                onArrayRemove={handleArrayRemove}
              />
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Parameters (JSON)</Label>
                  <Textarea
                    value={jsonParameters}
                    onChange={(e) => {
                      setJsonParameters(e.target.value);
                      setJsonError(null);
                    }}
                    onBlur={() => {
                      // Validate JSON on blur
                      try {
                        JSON.parse(jsonParameters);
                        setJsonError(null);
                      } catch (error) {
                        setJsonError(error instanceof Error ? error.message : 'Invalid JSON');
                      }
                    }}
                    placeholder='{"key": "value"}'
                    className="min-h-[200px] font-mono text-sm"
                    style={{ resize: 'vertical' }}
                  />
                  {jsonError && (
                    <Text variant="small" className="text-destructive">
                      {jsonError}
                    </Text>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(jsonParameters);
                        const formatted = JSON.stringify(parsed, null, 2);
                        setJsonParameters(formatted);
                        setJsonError(null);
                        toast.success('JSON formatted');
                      } catch {
                        toast.error('Invalid JSON cannot be formatted');
                      }
                    }}
                  >
                    Format JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(jsonParameters);
                      toast.success('JSON copied to clipboard');
                    }}
                  >
                    Copy JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const inputParams =
                        parameterMode === 'json'
                          ? jsonParameters
                          : JSON.stringify(transformParametersForPayload(toolParameters), null, 2);
                      navigator.clipboard.writeText(inputParams);
                      toast.success('Input copied to clipboard');
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Input
                  </Button>
                </div>
              </div>
            )}

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
