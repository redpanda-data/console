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
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { Label } from 'components/redpanda-ui/components/label';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Text } from 'components/redpanda-ui/components/typography';
import { Clock, Hammer, Send } from 'lucide-react';
import { MCPServer_State, MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useState } from 'react';
import { useCallMCPServerToolMutation, useGetMCPServerQuery, useListMCPServerTools } from 'react-query/api/remote-mcp';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { DynamicJSONForm } from '../../dynamic-json-form';
import type { JsonSchemaType, JsonValue } from '../../json-utils';
import JsonView from '../../json-view';
import { RemoteMCPToolTypeBadge } from '../../remote-mcp-tool-type-badge';

const getComponentTypeFromToolName = (toolName: string): MCPServer_Tool_ComponentType => {
  // Convert to lowercase for case-insensitive matching
  const lowerName = toolName.toLowerCase();

  const cachePatterns = ['cache', 'memory', 'storage', 'store', 'persist'];
  const processorPatterns = ['processor', 'process', 'transform', 'convert'];
  const inputPatterns = ['input', 'read', 'fetch', 'get', 'retrieve'];
  const outputPatterns = ['output', 'write', 'send', 'publish', 'post'];

  // Check for cache patterns
  if (cachePatterns.some((pattern) => lowerName.includes(pattern))) {
    return MCPServer_Tool_ComponentType.CACHE;
  }
  // Check for processor patterns
  if (processorPatterns.some((pattern) => lowerName.includes(pattern))) {
    return MCPServer_Tool_ComponentType.PROCESSOR;
  }
  // Check for input patterns
  if (inputPatterns.some((pattern) => lowerName.includes(pattern))) {
    return MCPServer_Tool_ComponentType.INPUT;
  }
  // Check for output patterns
  if (outputPatterns.some((pattern) => lowerName.includes(pattern))) {
    return MCPServer_Tool_ComponentType.OUTPUT;
  }
  // Default to unspecified if no patterns match
  return MCPServer_Tool_ComponentType.UNSPECIFIED;
};

export const RemoteMCPInspectorTab = () => {
  const { id } = useParams<{ id: string }>();
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [toolParameters, setToolParameters] = useState<JsonValue>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });
  const {
    data: serverToolResponse,
    mutate: callMCPServerTool,
    isPending: isServerToolPending,
    error: toolError,
    reset: resetMCPServerToolCall,
  } = useCallMCPServerToolMutation();

  const {
    data: mcpServerTools,
    isLoading: isLoadingTools,
    error: toolsError,
  } = useListMCPServerTools({
    mcpServer: mcpServerData?.mcpServer,
  });

  const { data: topicsData } = useLegacyListTopicsQuery(undefined, { hideInternalTopics: true });

  const executeToolRequest = async () => {
    if (!selectedTool || !mcpServerData?.mcpServer?.url) return;

    const parameters = (toolParameters as Record<string, unknown>) || {};

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

  const validateRequiredFields = (
    schema: JsonSchemaType | undefined,
    values: JsonValue,
  ): { isValid: boolean; errors: Record<string, string> } => {
    const errors: Record<string, string> = {};

    if (!schema || !schema.properties || !schema.required) {
      return { isValid: true, errors }; // No validation needed if no required fields
    }

    const parameters = values as Record<string, unknown>;

    // Check each required field
    for (const requiredField of schema.required) {
      const value = parameters[requiredField];

      // Check if field is missing or truly empty
      if (value === undefined || value === null) {
        errors[requiredField] = 'This field is required';
        continue;
      }

      // For strings, allow non-empty values (including placeholder values)
      if (typeof value === 'string' && value === '') {
        errors[requiredField] = 'This field is required';
        continue;
      }

      // Special validation for topic_name in output components
      if (requiredField === 'topic_name' && typeof value === 'string' && selectedTool) {
        const componentType =
          mcpServerData?.mcpServer?.tools?.[selectedTool]?.componentType || getComponentTypeFromToolName(selectedTool);

        if (componentType === MCPServer_Tool_ComponentType.OUTPUT) {
          // Validate that the topic_name exists in the available topics
          if (topicsData?.topics && Array.isArray(topicsData.topics)) {
            const topicExists = topicsData.topics.some((topic: { topicName: string }) => topic.topicName === value);
            if (!topicExists) {
              errors[requiredField] = `Topic '${value}' does not exist. Please select a valid topic name.`;
              continue;
            }
          }
        }
      }

      // For arrays, check if they have at least one item when required
      if (Array.isArray(value) && value.length === 0) {
        const fieldSchema = schema.properties[requiredField] as JsonSchemaType;
        if (fieldSchema?.type === 'array') {
          errors[requiredField] = 'This field is required';
        }
      }
    }

    return { isValid: Object.keys(errors).length === 0, errors };
  };

  const generateDefaultValue = (fieldSchema: JsonSchemaType): JsonValue => {
    if ('default' in fieldSchema && fieldSchema.default !== undefined) {
      return fieldSchema.default;
    }

    switch (fieldSchema.type) {
      case 'string':
        return (fieldSchema as any).examples?.[0] || '';
      case 'number':
      case 'integer':
        return (fieldSchema as any).examples?.[0] || 42;
      case 'boolean':
        return (fieldSchema as any).examples?.[0] || true;
      case 'array':
        if (fieldSchema.items) {
          return [generateDefaultValue(fieldSchema.items as JsonSchemaType)];
        }
        return [];
      case 'object':
        if (fieldSchema.properties) {
          const result: Record<string, JsonValue> = {};
          Object.entries(fieldSchema.properties).forEach(([propKey, propSchema]) => {
            // Generate defaults for object properties, especially if they're required
            if (fieldSchema.required?.includes(propKey)) {
              result[propKey] = generateDefaultValue(propSchema as JsonSchemaType);
            } else {
              // Use specific example values for common property names
              if (propKey === 'key') {
                result[propKey] = 'key';
              } else if (propKey === 'value') {
                result[propKey] = 'value';
              } else {
                result[propKey] = generateDefaultValue(propSchema as JsonSchemaType);
              }
            }
          });
          return result;
        }
        return {};
      case 'null':
        return null;
      default:
        return null;
    }
  };

  const initializeFormData = (schema: JsonSchemaType | undefined): JsonValue => {
    if (!schema || !schema.properties) {
      return {};
    }

    const initialData: Record<string, unknown> = {};

    // Initialize all fields with appropriate default values, prioritizing required fields
    Object.entries(schema.properties).forEach(([key, propSchema]) => {
      const fieldSchema = propSchema as JsonSchemaType;
      const isRequired = schema.required?.includes(key) ?? false;

      if (isRequired) {
        // Always initialize required fields with meaningful defaults
        initialData[key] = generateDefaultValue(fieldSchema);
      } else if (fieldSchema.type === 'array') {
        // Still initialize arrays even if not required, for better UX
        initialData[key] = generateDefaultValue(fieldSchema);
      }
    });

    return initialData as JsonValue;
  };

  const getToolResponseData = () => {
    if (!serverToolResponse) return null;

    // Process content array if it exists and show only the first content item
    if (
      serverToolResponse.content &&
      Array.isArray(serverToolResponse.content) &&
      serverToolResponse.content.length > 0
    ) {
      const firstContentItem = serverToolResponse.content[0];
      if (firstContentItem.type === 'text' && firstContentItem.text) {
        // Try to parse text content as JSON for JsonView
        try {
          return JSON.parse(firstContentItem.text);
        } catch {
          // If not JSON, return as plain text
          return firstContentItem.text;
        }
      }
    }

    return null;
  };

  const toolResponseData = getToolResponseData();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left Panel - Tools */}
      <div className="bg-card border border-border rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 dark:border-border">
          <h3 className="font-semibold dark:text-white flex items-center gap-2">
            <Hammer className="h-4 w-4" />
            Tools
          </h3>
        </div>
        <div className="p-4">
          {/* Loading State */}
          {mcpServerData?.mcpServer?.state === MCPServer_State.STARTING && (
            <div className="space-y-2">
              <div className="flex items-center justify-center py-4">
                <Badge variant="outline" className="text-xs">
                  <Clock className="h-3 w-3 mr-1 animate-spin" />
                  Server starting...
                </Badge>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-[60px] rounded w-full" />
                <Skeleton className="h-[60px] rounded w-full" />
                <Skeleton className="h-[60px] rounded w-full" />
              </div>
            </div>
          )}

          {/* Tools List */}
          {mcpServerData?.mcpServer?.state === MCPServer_State.RUNNING && (
            <div className="space-y-2 overflow-y-auto max-h-96">
              {isLoadingTools && (
                <div className="flex items-center justify-center py-4">
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1 animate-spin" />
                    Loading tools...
                  </Badge>
                </div>
              )}
              {toolsError && (
                <div className="flex items-center justify-center py-4">
                  <Badge variant="destructive" className="text-xs">
                    Failed to fetch tools
                  </Badge>
                </div>
              )}
              {mcpServerTools?.tools?.length && mcpServerTools?.tools?.length > 0
                ? mcpServerTools.tools.map((tool) => (
                    <div
                      key={tool.name}
                      className={`flex items-center py-2 px-4 rounded hover:bg-gray-50 dark:hover:bg-secondary cursor-pointer ${
                        selectedTool === tool.name ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                      }`}
                      onClick={() => {
                        setSelectedTool(tool.name);
                        const initialData = initializeFormData(tool.inputSchema as JsonSchemaType);
                        setToolParameters(initialData);
                        resetMCPServerToolCall();
                        // Clear validation errors when switching tools
                        setValidationErrors({});
                      }}
                    >
                      <div className="flex flex-col items-start w-full">
                        <div className="flex items-center gap-2 mb-1">
                          <RemoteMCPToolTypeBadge
                            componentType={
                              mcpServerData?.mcpServer?.tools?.[tool.name]?.componentType ||
                              getComponentTypeFromToolName(tool.name)
                            }
                          />
                          <span className="flex-1">{tool.name}</span>
                        </div>
                        <span className="text-sm text-gray-500 text-left">{tool.description}</span>
                      </div>
                    </div>
                  ))
                : !isLoadingTools &&
                  !toolsError && (
                    <Text variant="small" className="text-muted-foreground py-8 text-center">
                      No tools available on this MCP server.
                    </Text>
                  )}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Selected Tool */}
      <div className="bg-card border border-border rounded-lg shadow flex flex-col">
        {selectedTool && mcpServerData?.mcpServer?.state === MCPServer_State.RUNNING ? (
          <>
            <div className="p-4 border-b border-gray-200 dark:border-border">
              <div className="flex items-center gap-2">
                <RemoteMCPToolTypeBadge
                  componentType={
                    mcpServerData?.mcpServer?.tools?.[selectedTool]?.componentType ||
                    getComponentTypeFromToolName(selectedTool)
                  }
                />
                <h3 className="font-semibold">{selectedTool}</h3>
              </div>
            </div>
            <div className="flex flex-col flex-1 relative">
              {(() => {
                const selectedToolData = mcpServerTools?.tools?.find((t) => t.name === selectedTool);
                return (
                  <>
                    <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-20">
                      <DynamicJSONForm
                        schema={(selectedToolData?.inputSchema as JsonSchemaType) || { type: 'object' }}
                        value={toolParameters}
                        onChange={(newValue: JsonValue) => {
                          setToolParameters(newValue);
                          // Update validation errors when parameters change
                          const validation = validateRequiredFields(
                            selectedToolData?.inputSchema as JsonSchemaType,
                            newValue,
                          );
                          setValidationErrors(validation.errors);
                        }}
                        showPlaceholder={true}
                        customFields={
                          (mcpServerData?.mcpServer?.tools?.[selectedTool]?.componentType ||
                            getComponentTypeFromToolName(selectedTool)) === MCPServer_Tool_ComponentType.OUTPUT &&
                          topicsData?.topics
                            ? [
                                {
                                  fieldName: 'topic_name',
                                  options: topicsData.topics.map((topic) => ({
                                    value: topic.topicName,
                                    label: topic.topicName,
                                  })),
                                  placeholder: 'Select a topic...',
                                },
                              ]
                            : []
                        }
                      />

                      {/* Display validation errors */}
                      {Object.keys(validationErrors).length > 0 && (
                        <div className="space-y-2">
                          {Object.entries(validationErrors).map(([field, error]) => (
                            <div
                              key={field}
                              className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md"
                            >
                              <div className="flex items-start">
                                <div className="text-sm text-red-700 dark:text-red-400">
                                  <span className="font-medium">{field}:</span> {error}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Response Section */}
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

                      {!isServerToolPending && (toolError || toolResponseData) && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Response</Label>
                          <JsonView
                            data={toolError ? toolError?.message : toolResponseData}
                            isError={!!toolError}
                            initialExpandDepth={3}
                            className="border-gray-200 dark:border-gray-800"
                          />
                        </div>
                      )}
                    </div>

                    {/* Buttons positioned at bottom left within card */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-card border-t border-gray-200 dark:border-border rounded-b-lg">
                      <div className="flex gap-2">
                        <Button
                          onClick={executeToolRequest}
                          disabled={
                            isServerToolPending ||
                            !validateRequiredFields(selectedToolData?.inputSchema as JsonSchemaType, toolParameters)
                              .isValid
                          }
                          variant="secondary"
                        >
                          {isServerToolPending ? (
                            <>
                              <Clock className="w-4 h-4 mr-2 animate-spin" />
                              Run Tool
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4 mr-2" />
                              Run Tool
                            </>
                          )}
                        </Button>
                        <CopyButton
                          variant="outline"
                          content={JSON.stringify(toolParameters, null, 2)}
                          onCopy={() => toast.success('Input copied to clipboard')}
                        >
                          Copy Input
                        </CopyButton>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </>
        ) : (
          <div className="p-4">
            <div className="flex items-center justify-center h-96 text-center">
              <div className="space-y-2">
                <Text className="text-muted-foreground">
                  {mcpServerData?.mcpServer?.state === MCPServer_State.STARTING
                    ? 'Server is starting...'
                    : 'Select a tool from the left panel to test it'}
                </Text>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
