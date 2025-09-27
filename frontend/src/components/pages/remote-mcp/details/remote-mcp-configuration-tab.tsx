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

import { create } from '@bufbuild/protobuf';
import { FieldMaskSchema } from '@bufbuild/protobuf/wkt';
import { YamlEditor } from 'components/misc/yaml-editor';
import { Button } from 'components/redpanda-ui/components/button';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Text } from 'components/redpanda-ui/components/typography';
import { Edit, FileText, Hammer, Plus, Save, Settings, Trash2 } from 'lucide-react';
import {
  type MCPServer_State,
  MCPServer_Tool_ComponentType,
  UpdateMCPServerRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import React, { useState } from 'react';
import { useGetMCPServerQuery, useListMCPServerTools, useUpdateMCPServerMutation } from 'react-query/api/remote-mcp';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { parse, stringify } from 'yaml';
import { RESOURCE_TIERS } from '../remote-mcp-constants';
import { type Template, templates } from '../remote-mcp-templates';
import { RemoteMCPToolTypeBadge } from '../remote-mcp-tool-type-badge';

interface LocalTool {
  id: string;
  name: string;
  componentType: MCPServer_Tool_ComponentType;
  config: string;
  selectedTemplate?: string;
}

interface LocalMCPServer {
  id: string;
  displayName: string;
  description: string;
  tags: Array<{ key: string; value: string }>;
  resources: {
    tier: string;
  };
  tools: LocalTool[];
  state: MCPServer_State;
  status: string;
  url: string;
}

export const RemoteMCPConfigurationTab = () => {
  const { id } = useParams<{ id: string }>();
  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });
  const { mutateAsync: updateMCPServer, isPending: isUpdateMCPServerPending } = useUpdateMCPServerMutation();
  const { data: serverToolsData } = useListMCPServerTools({ mcpServer: mcpServerData?.mcpServer });

  const [isEditing, setIsEditing] = useState(false);
  const [editedServerData, setEditedServerData] = useState<LocalMCPServer | null>(null);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);

  const getCurrentData = (): LocalMCPServer | null => {
    if (editedServerData) {
      return editedServerData;
    }

    if (mcpServerData?.mcpServer) {
      return {
        id: mcpServerData.mcpServer.id,
        displayName: mcpServerData.mcpServer.displayName,
        description: mcpServerData.mcpServer.description,
        tags: Object.entries(mcpServerData.mcpServer.tags).map(([key, value]) => ({ key, value })),
        resources: { tier: getResourceTierFromServer(mcpServerData.mcpServer.resources) },
        tools: Object.entries(mcpServerData.mcpServer.tools).map(([name, tool]) => ({
          id: name,
          name,
          componentType: tool.componentType,
          config: tool.configYaml,
          selectedTemplate: undefined,
        })),
        state: mcpServerData.mcpServer.state,
        status: mcpServerData.mcpServer.status?.error || '',
        url: mcpServerData.mcpServer.url,
      };
    }

    return null;
  };

  const applyTemplate = (toolId: string, template: Template) => {
    const currentData = getCurrentData();
    if (!currentData) return;

    const updatedTools = currentData.tools.map((tool) => {
      if (tool.id === toolId) {
        return {
          ...tool,
          name: template.yaml.label || tool.name,
          componentType: template.componentType,
          config: stringify(template.yaml),
          selectedTemplate: template.name,
        };
      }
      return tool;
    });

    setEditedServerData({
      ...currentData,
      tools: updatedTools,
    });
  };

  const handleSave = async () => {
    if (!mcpServerData?.mcpServer || !id) return;

    const currentData = getCurrentData();
    if (!currentData) return;

    try {
      const toolsMap: { [key: string]: { componentType: number; configYaml: string } } = {};
      currentData.tools.forEach((tool) => {
        toolsMap[tool.name] = {
          componentType: tool.componentType,
          configYaml: tool.config,
        };
      });

      const tagsMap: { [key: string]: string } = {};
      currentData.tags.forEach((tag) => {
        if (tag.key.trim() && tag.value.trim()) {
          tagsMap[tag.key.trim()] = tag.value.trim();
        }
      });

      await updateMCPServer(
        create(UpdateMCPServerRequestSchema, {
          id,
          mcpServer: {
            displayName: currentData.displayName,
            description: currentData.description,
            tools: toolsMap,
            tags: tagsMap,
            resources: {
              memoryShares: convertToApiMemoryFormat(
                getResourceTierByName(currentData.resources.tier)?.memory || '512M',
              ),
              cpuShares: getResourceTierByName(currentData.resources.tier)?.cpu || '200m',
            },
          },
          updateMask: create(FieldMaskSchema, {
            paths: ['display_name', 'description', 'tools', 'tags', 'resources'],
          }),
        }),
        {
          onError: (error) => {
            toast.error(formatToastErrorMessageGRPC({ error, action: 'update', entity: 'MCP server' }));
          },
        },
      );
      setIsEditing(false);
      setEditedServerData(null);
    } catch (error) {
      console.error('Failed to update MCP server:', error);
    }
  };

  const handleAddTool = () => {
    const currentData = getCurrentData();
    if (!currentData) return;

    const newToolId = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const newTool = {
      id: newToolId,
      name: '',
      componentType: MCPServer_Tool_ComponentType.PROCESSOR,
      config: `label: 
meta:
  mcp:
    enabled: true
spec:
  description: ""
  parameters: {}`,
    };

    setEditedServerData({
      ...currentData,
      tools: [...currentData.tools, newTool],
    });

    setSelectedToolId(newToolId);
  };

  const handleRemoveTool = (toolId: string) => {
    const currentData = getCurrentData();
    if (!currentData) return;

    const updatedTools = currentData.tools.filter((tool) => tool.id !== toolId);
    setEditedServerData({
      ...currentData,
      tools: updatedTools,
    });

    if (selectedToolId === toolId) {
      if (updatedTools.length > 0) {
        setSelectedToolId(updatedTools[0].id);
      } else {
        setSelectedToolId(null);
      }
    }
  };

  const handleUpdateTool = (toolId: string, updates: Partial<LocalTool>) => {
    const currentData = getCurrentData();
    if (!currentData) return;

    const updatedTools = [...currentData.tools];
    const toolIndex = updatedTools.findIndex((tool) => tool.id === toolId);
    if (toolIndex !== -1) {
      const updatedTool = { ...updatedTools[toolIndex], ...updates };

      if (updates.config && updates.config !== updatedTools[toolIndex].config) {
        updatedTool.selectedTemplate = undefined;

        // Sync tool name from YAML label when config changes
        try {
          const parsed = parse(updates.config);
          if (parsed?.label && typeof parsed.label === 'string') {
            updatedTool.name = parsed.label;
          }
        } catch {
          // If YAML is invalid, keep the current tool name
        }
      }

      // Sync YAML label when tool name changes
      if (updates.name && updates.name !== updatedTools[toolIndex].name) {
        try {
          const parsed = parse(updatedTool.config);
          if (parsed) {
            parsed.label = updates.name;
            updatedTool.config = stringify(parsed);
          }
        } catch {
          // If YAML is invalid, just update the name field
        }
      }

      updatedTools[toolIndex] = updatedTool;
    }
    setEditedServerData({
      ...currentData,
      tools: updatedTools,
    });
  };

  const handleAddTag = () => {
    const currentData = getCurrentData();
    if (!currentData) return;

    setEditedServerData({
      ...currentData,
      tags: [...currentData.tags, { key: '', value: '' }],
    });
  };

  const handleRemoveTag = (index: number) => {
    const currentData = getCurrentData();
    if (!currentData) return;

    const updatedTags = currentData.tags.filter((_, i) => i !== index);
    setEditedServerData({
      ...currentData,
      tags: updatedTags,
    });
  };

  const handleUpdateTag = (index: number, field: 'key' | 'value', value: string) => {
    const currentData = getCurrentData();
    if (!currentData) return;

    const updatedTags = [...currentData.tags];
    updatedTags[index] = { ...updatedTags[index], [field]: value };
    setEditedServerData({
      ...currentData,
      tags: updatedTags,
    });
  };

  const hasDuplicateKeys = (tags: Array<{ key: string; value: string }>) => {
    const keys = tags.map((tag) => tag.key.trim()).filter((key) => key !== '');
    return keys.length !== new Set(keys).size;
  };

  const getDuplicateKeys = (tags: Array<{ key: string; value: string }>) => {
    const keys = tags.map((tag) => tag.key.trim()).filter((key) => key !== '');
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    return new Set(duplicates);
  };

  const getResourceTierByName = (name: string) => {
    return RESOURCE_TIERS.find((tier) => tier.name === name || tier.id === name);
  };

  const getResourceDisplayString = (resources: { cpuShares?: string; memoryShares?: string }): string => {
    const cpu = resources.cpuShares || '0';
    const memory = resources.memoryShares || '0';
    return `${cpu} CPU, ${memory} RAM`;
  };

  const convertToApiMemoryFormat = (memory: string): string => {
    // Memory is already in the correct format (M, G)
    return memory;
  };

  const getResourceTierFromServer = (resources?: { cpuShares?: string; memoryShares?: string }) => {
    if (!resources) return 'Small';

    // Try to find exact string match with predefined tiers
    const matchingTier = RESOURCE_TIERS.find((tier) => {
      const serverCpu = resources.cpuShares || '';
      const serverMemory = resources.memoryShares || '';
      return tier.cpu === serverCpu && tier.memory === serverMemory;
    });

    return matchingTier?.id || 'Small';
  };

  const getToolDescription = (tool: LocalTool) => {
    if (serverToolsData?.tools) {
      const mcpTool = serverToolsData.tools.find((t) => t.name === tool.name);
      if (mcpTool?.description) {
        return mcpTool.description;
      }
    }

    try {
      const parsed = parse(tool.config);
      return parsed?.spec?.description || 'No description available';
    } catch {
      return 'Invalid YAML configuration';
    }
  };

  const displayData = getCurrentData();

  const selectedTool = React.useMemo(() => {
    if (!selectedToolId || !displayData?.tools) return null;
    return displayData.tools.find((tool) => tool.id === selectedToolId) || null;
  }, [selectedToolId, displayData?.tools?.length, displayData?.tools]);

  React.useEffect(() => {
    if (!selectedToolId && displayData?.tools.length) {
      setSelectedToolId(displayData.tools[0].id);
    }
  }, [selectedToolId, displayData?.tools]);

  if (!displayData) {
    return null;
  }

  return (
    <div>
      <div className="space-y-6">
        <div>
          <div className="bg-card border border-border rounded-lg shadow">
            <div className="p-4 border-b border-gray-200 dark:border-border">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold dark:text-white flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Server Configuration
                </h3>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button variant="secondary" onClick={handleSave} disabled={isUpdateMCPServerPending}>
                        <Save className="h-4 w-4" />
                        {isUpdateMCPServerPending ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsEditing(false);
                          setEditedServerData(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button variant="secondary" onClick={() => setIsEditing(true)}>
                      <Edit className="h-4 w-4" />
                      Edit Configuration
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4">
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="id">Server ID</Label>
                      <div className="w-full">
                        <DynamicCodeBlock lang="text" code={displayData.id} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="serverUrl">Server URL</Label>
                      <div className="w-full">
                        <DynamicCodeBlock lang="text" code={displayData.url} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="displayName">Display Name</Label>
                      <Input
                        id="displayName"
                        value={displayData.displayName}
                        disabled={!isEditing}
                        onChange={(e) => {
                          const currentData = getCurrentData();
                          if (!currentData) return;
                          setEditedServerData({ ...currentData, displayName: e.target.value });
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={displayData.description}
                        disabled={!isEditing}
                        onChange={(e) => {
                          const currentData = getCurrentData();
                          if (!currentData) return;
                          setEditedServerData({ ...currentData, description: e.target.value });
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="resources">Resources</Label>
                    {isEditing ? (
                      <Select
                        value={displayData.resources.tier}
                        onValueChange={(value) => {
                          const currentData = getCurrentData();
                          if (!currentData) return;
                          setEditedServerData({ ...currentData, resources: { tier: value } });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select resource tier" />
                        </SelectTrigger>
                        <SelectContent>
                          {RESOURCE_TIERS.map((tier) => (
                            <SelectItem key={tier.id} value={tier.id}>
                              {tier.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="h-10 px-3 py-2 border border-gray-200 rounded-md bg-gray-50 flex items-center">
                        <code className="text-sm font-mono">
                          {getResourceDisplayString(mcpServerData?.mcpServer?.resources || {})}
                        </code>
                      </div>
                    )}
                  </div>
                </div>

                {(displayData.tags.length > 0 || isEditing) && (
                  <div className="space-y-4 flex flex-col gap-2">
                    <h4 className="text-sm font-medium text-foreground">Tags</h4>
                    <div className="space-y-2">
                      {isEditing && hasDuplicateKeys(displayData.tags) && (
                        <Text variant="small" className="text-destructive">
                          Tags must have unique keys
                        </Text>
                      )}
                      {displayData.tags.map((tag, index) => {
                        const duplicateKeys = isEditing ? getDuplicateKeys(displayData.tags) : new Set();
                        const isDuplicateKey = tag.key.trim() !== '' && duplicateKeys.has(tag.key.trim());
                        return (
                          <div
                            key={`tag-${tag.key || 'empty'}-${tag.value || 'empty'}-${index}`}
                            className="flex items-center gap-2"
                          >
                            <div className="flex-1">
                              <Input
                                placeholder="Key"
                                value={tag.key}
                                disabled={!isEditing}
                                className={isDuplicateKey ? 'border-destructive focus:border-destructive' : ''}
                                onChange={(e) => handleUpdateTag(index, 'key', e.target.value)}
                              />
                            </div>
                            <div className="flex-1">
                              <Input
                                placeholder="Value"
                                value={tag.value}
                                disabled={!isEditing}
                                onChange={(e) => handleUpdateTag(index, 'value', e.target.value)}
                              />
                            </div>
                            {isEditing && (
                              <div className="flex items-end h-9">
                                <Button variant="outline" size="sm" onClick={() => handleRemoveTag(index)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {isEditing && (
                        <Button variant="outline" size="sm" onClick={handleAddTag}>
                          <Plus className="h-4 w-4" />
                          Add Tag
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 dark:border-border">
            <h3 className="font-semibold dark:text-white flex items-center gap-2">
              <Hammer className="h-4 w-4" />
              Tools Configuration
            </h3>
          </div>
          <div className="p-4">
            <Text variant="small" className="text-muted-foreground mb-4">
              Configure the tools available in this MCP server
            </Text>

            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between" />

                {displayData.tools.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto max-h-96">
                    {displayData.tools.map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        className={`flex flex-col p-4 rounded-lg border transition-all hover:shadow-md cursor-pointer text-left w-full ${
                          selectedToolId === tool.id
                            ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
                            : 'bg-card hover:bg-gray-50 dark:hover:bg-secondary border-border'
                        }`}
                        onClick={() => setSelectedToolId(tool.id)}
                        aria-pressed={selectedToolId === tool.id}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <RemoteMCPToolTypeBadge componentType={tool.componentType} />
                          {isEditing && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveTool(tool.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="flex-1">
                          <h5 className="font-medium text-sm mb-1 truncate" title={tool.name || 'Unnamed Tool'}>
                            {tool.name || 'Unnamed Tool'}
                          </h5>
                          <p className="text-xs text-muted-foreground line-clamp-2" title={getToolDescription(tool)}>
                            {getToolDescription(tool)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-muted rounded-lg">
                    <div className="space-y-2">
                      <Hammer className="h-8 w-8 mx-auto opacity-50" />
                      <div className="text-sm">No tools configured</div>
                      {isEditing && (
                        <Button variant="outline" size="sm" onClick={handleAddTool} className="mt-2">
                          <Plus className="h-4 w-4" />
                          Add Your First Tool
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {selectedTool && (
                <div className="space-y-4">
                  {isEditing && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Tool Name</Label>
                        <Input
                          value={selectedTool.name}
                          placeholder="e.g., search-posts (must be filename-compatible)"
                          onChange={(e) => handleUpdateTool(selectedTool.id, { name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Component Type</Label>
                        <Select
                          value={selectedTool.componentType.toString()}
                          onValueChange={(value) => {
                            const componentType = Number.parseInt(value) as MCPServer_Tool_ComponentType;
                            handleUpdateTool(selectedTool.id, { componentType });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue>
                              <RemoteMCPToolTypeBadge componentType={selectedTool.componentType} />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(MCPServer_Tool_ComponentType)
                              .filter(
                                (value) =>
                                  typeof value === 'number' && value !== MCPServer_Tool_ComponentType.UNSPECIFIED,
                              )
                              .map((componentType) => (
                                <SelectItem key={componentType} value={componentType.toString()}>
                                  <RemoteMCPToolTypeBadge
                                    componentType={componentType as MCPServer_Tool_ComponentType}
                                  />
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Template</Label>
                        <Select
                          value={selectedTool.selectedTemplate || ''}
                          onValueChange={(templateName) => {
                            const template = templates.find((t) => t.name === templateName);
                            if (template) {
                              applyTemplate(selectedTool.id, template);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose template (optional)">
                              {selectedTool.selectedTemplate ? (
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4" />
                                  {selectedTool.selectedTemplate}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4" />
                                  Choose template
                                </div>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map((template) => (
                              <SelectItem key={template.name} value={template.name}>
                                <div className="flex items-center gap-2">
                                  <RemoteMCPToolTypeBadge componentType={template.componentType} />
                                  <div>
                                    <div className="font-medium">{template.name}</div>
                                    <div className="text-xs text-gray-500">{template.description}</div>
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">YAML Configuration</Label>
                    <div className="overflow-hidden" style={{ height: '500px' }}>
                      <YamlEditor
                        key={`${selectedTool.id}-${selectedTool.config.length}`}
                        value={selectedTool.config}
                        onChange={(value) => handleUpdateTool(selectedTool.id, { config: value || '' })}
                        options={{
                          readOnly: !isEditing,
                          theme: 'vs',
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {!selectedTool && displayData.tools.length > 0 && (
                <div className="flex items-center justify-center py-12 text-center border-2 border-dashed border-muted rounded-lg">
                  <div className="space-y-2">
                    <FileText className="h-8 w-8 mx-auto opacity-50" />
                    <div className="text-sm text-muted-foreground">
                      Select a tool to view and edit its configuration
                    </div>
                  </div>
                </div>
              )}

              {isEditing && (
                <Button variant="dashed" className="w-full" onClick={handleAddTool}>
                  <Plus className="h-4 w-4" />
                  Add Tool
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
