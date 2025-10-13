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
/** biome-ignore-all lint/correctness/useUniqueElementIds: this is intentional for form usage */

import { create } from '@bufbuild/protobuf';
import { FieldMaskSchema } from '@bufbuild/protobuf/wkt';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
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
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { RedpandaConnectComponentTypeBadge } from 'components/ui/connect/redpanda-connect-component-type-badge';
import { RESOURCE_TIERS, ResourceTierSelect } from 'components/ui/connect/resource-tier-select';
import { QuickAddSecrets } from 'components/ui/secret/quick-add-secrets';
import { extractSecretReferences, getUniqueSecretNames } from 'components/ui/secret/secret-detection';
import { YamlEditorCard } from 'components/ui/yaml/yaml-editor-card';
import { Edit, FileText, Hammer, Plus, Save, Settings, Trash2 } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import {
  type MCPServer_State,
  MCPServer_Tool_ComponentType,
  UpdateMCPServerRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import React, { useCallback, useEffect, useState } from 'react';
import { useGetMCPServerQuery, useListMCPServerTools, useUpdateMCPServerMutation } from 'react-query/api/remote-mcp';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { parse, stringify } from 'yaml';

import { RemoteMCPToolButton } from './remote-mcp-tool-button';
import { type Template, templates } from '../templates/remote-mcp-templates';

type LocalTool = {
  id: string;
  name: string;
  componentType: MCPServer_Tool_ComponentType;
  config: string;
  selectedTemplate?: string;
};

type LocalMCPServer = {
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
};

export const RemoteMCPConfigurationTab = () => {
  const { id } = useParams<{ id: string }>();
  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });
  const { mutateAsync: updateMCPServer, isPending: isUpdateMCPServerPending } = useUpdateMCPServerMutation();
  const { data: serverToolsData } = useListMCPServerTools({ mcpServer: mcpServerData?.mcpServer });
  const { data: secretsData } = useListSecretsQuery();

  const [isEditing, setIsEditing] = useState(false);
  const [editedServerData, setEditedServerData] = useState<LocalMCPServer | null>(null);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [detectedSecrets, setDetectedSecrets] = useState<string[]>([]);

  const getResourceTierFromServer = useCallback((resources?: { cpuShares?: string; memoryShares?: string }) => {
    if (!resources) {
      return 'Small';
    }

    // Try to find exact string match with predefined tiers
    const matchingTier = RESOURCE_TIERS.find((tier) => {
      const serverCpu = resources.cpuShares || '';
      const serverMemory = resources.memoryShares || '';
      return tier.cpu === serverCpu && tier.memory === serverMemory;
    });

    return matchingTier?.id || 'Small';
  }, []);

  const getCurrentData = useCallback((): LocalMCPServer | null => {
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
  }, [editedServerData, mcpServerData, getResourceTierFromServer]);

  const applyTemplate = (toolId: string, template: Template) => {
    const currentData = getCurrentData();
    if (!currentData) {
      return;
    }

    const updatedTools = currentData.tools.map((tool) => {
      if (tool.id === toolId) {
        const yamlLabel = template.yaml.label as string | undefined;
        return {
          ...tool,
          name: yamlLabel || tool.name,
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
    if (!(mcpServerData?.mcpServer && id)) {
      return;
    }

    const currentData = getCurrentData();
    if (!currentData) {
      return;
    }

    try {
      const toolsMap: { [key: string]: { componentType: number; configYaml: string } } = {};
      for (const tool of currentData.tools) {
        toolsMap[tool.name] = {
          componentType: tool.componentType,
          configYaml: tool.config,
        };
      }

      const tagsMap: { [key: string]: string } = {};
      for (const tag of currentData.tags) {
        if (tag.key.trim() && tag.value.trim()) {
          tagsMap[tag.key.trim()] = tag.value.trim();
        }
      }

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
                getResourceTierByName(currentData.resources.tier)?.memory || '512M'
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
        }
      );
      setIsEditing(false);
      setEditedServerData(null);
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('Failed to update MCP server:', error);
    }
  };

  const handleAddTool = () => {
    const currentData = getCurrentData();
    if (!currentData) {
      return;
    }

    const newToolId = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const newTool = {
      id: newToolId,
      name: '',
      componentType: MCPServer_Tool_ComponentType.PROCESSOR,
      config: '',
    };

    setEditedServerData({
      ...currentData,
      tools: [...currentData.tools, newTool],
    });

    setSelectedToolId(newToolId);
  };

  const handleRemoveTool = (toolId: string) => {
    const currentData = getCurrentData();
    if (!currentData) {
      return;
    }

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
    if (!currentData) {
      return;
    }

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
    if (!currentData) {
      return;
    }

    setEditedServerData({
      ...currentData,
      tags: [...currentData.tags, { key: '', value: '' }],
    });
  };

  const handleRemoveTag = (index: number) => {
    const currentData = getCurrentData();
    if (!currentData) {
      return;
    }

    const updatedTags = currentData.tags.filter((_, i) => i !== index);
    setEditedServerData({
      ...currentData,
      tags: updatedTags,
    });
  };

  const handleUpdateTag = (index: number, field: 'key' | 'value', value: string) => {
    const currentData = getCurrentData();
    if (!currentData) {
      return;
    }

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

  const getResourceTierByName = (name: string) => RESOURCE_TIERS.find((tier) => tier.name === name || tier.id === name);

  const getResourceDisplayString = (resources: { cpuShares?: string; memoryShares?: string }): string => {
    const cpu = resources.cpuShares || '0';
    const memory = resources.memoryShares || '0';
    return `${cpu} CPU, ${memory} RAM`;
  };

  const convertToApiMemoryFormat = (memory: string): string => {
    // Memory is already in the correct format (M, G)
    return memory;
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
      return parsed?.spec?.description || parsed?.meta?.mcp?.description || 'No description available';
    } catch {
      return 'Invalid YAML configuration';
    }
  };

  const displayData = getCurrentData();

  const selectedTool = React.useMemo(() => {
    if (!(selectedToolId && displayData?.tools)) {
      return null;
    }
    return displayData.tools.find((tool) => tool.id === selectedToolId) || null;
  }, [selectedToolId, displayData?.tools?.length, displayData?.tools]);

  // Detect secrets in YAML configurations
  useEffect(() => {
    const currentData = getCurrentData();
    if (!currentData?.tools) {
      setDetectedSecrets([]);
      return;
    }

    const allSecretReferences: string[] = [];

    for (const tool of currentData.tools) {
      if (tool.config) {
        try {
          const secretRefs = extractSecretReferences(tool.config);
          const secretNames = getUniqueSecretNames(secretRefs);
          allSecretReferences.push(...secretNames);
        } catch {
          // Ignore YAML parsing errors
        }
      }
    }

    // Get unique secret names
    const uniqueSecrets = Array.from(new Set(allSecretReferences)).sort();
    setDetectedSecrets(uniqueSecrets);
  }, [getCurrentData]);

  React.useEffect(() => {
    if (!selectedToolId && displayData?.tools.length) {
      setSelectedToolId(displayData.tools[0].id);
    }
  }, [selectedToolId, displayData?.tools]);

  // Get existing secret names
  const existingSecrets = React.useMemo(() => {
    if (!secretsData?.secrets) {
      return [];
    }
    return secretsData.secrets.map((secret) => secret?.id).filter(Boolean);
  }, [secretsData]);

  // Check if any detected secrets are missing
  const hasSecretWarnings = React.useMemo(() => {
    if (detectedSecrets.length === 0) {
      return false;
    }
    return detectedSecrets.some((secretName) => !existingSecrets.includes(secretName));
  }, [detectedSecrets, existingSecrets]);

  if (!displayData) {
    return null;
  }

  return (
    <div>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Server Configuration Card - takes 3/4 width on large screens */}
          <div className="lg:col-span-3">
            <Card className="px-0 py-0" size="full">
              <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    <Text className="font-semibold">Server Configuration</Text>
                  </CardTitle>
                  <div className="flex gap-2">
                    {isEditing ? (
                      <>
                        <Button disabled={isUpdateMCPServerPending} onClick={handleSave} variant="secondary">
                          <Save className="h-4 w-4" />
                          {isUpdateMCPServerPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Button
                          onClick={() => {
                            setIsEditing(false);
                            setEditedServerData(null);
                          }}
                          variant="outline"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button onClick={() => setIsEditing(true)} variant="secondary">
                        <Edit className="h-4 w-4" />
                        Edit Configuration
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="id">Server ID</Label>
                        <div className="w-full">
                          <DynamicCodeBlock code={displayData.id} lang="text" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="serverUrl">Server URL</Label>
                        <div className="w-full">
                          <DynamicCodeBlock code={displayData.url} lang="text" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="displayName">Display Name</Label>
                        <Input
                          disabled={!isEditing}
                          id="displayName"
                          onChange={(e) => {
                            const currentData = getCurrentData();
                            if (!currentData) {
                              return;
                            }
                            setEditedServerData({
                              ...currentData,
                              displayName: e.target.value,
                            });
                          }}
                          value={displayData.displayName}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          disabled={!isEditing}
                          id="description"
                          onChange={(e) => {
                            const currentData = getCurrentData();
                            if (!currentData) {
                              return;
                            }
                            setEditedServerData({
                              ...currentData,
                              description: e.target.value,
                            });
                          }}
                          value={displayData.description}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resources Card */}
          <div className="lg:col-span-1">
            <Card className="h-full px-0 py-0" size="full">
              <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <Text className="font-semibold">Resources</Text>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="resources">Resources</Label>
                      {isEditing ? (
                        <ResourceTierSelect
                          onValueChange={(value) => {
                            const currentData = getCurrentData();
                            if (!currentData) {
                              return;
                            }
                            setEditedServerData({
                              ...currentData,
                              resources: { tier: value },
                            });
                          }}
                          value={displayData.resources.tier}
                        />
                      ) : (
                        <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                          <code className="font-mono text-sm">
                            {getResourceDisplayString(mcpServerData?.mcpServer?.resources || {})}
                          </code>
                        </div>
                      )}
                    </div>
                  </div>

                  {(displayData.tags.length > 0 || isEditing) && (
                    <div className="flex flex-col gap-2 space-y-4">
                      <Heading className="font-medium text-sm" level={4}>
                        Tags
                      </Heading>
                      <div className="space-y-2">
                        {isEditing && hasDuplicateKeys(displayData.tags) && (
                          <Text className="text-destructive" variant="small">
                            Tags must have unique keys
                          </Text>
                        )}
                        {displayData.tags.map((tag, index) => {
                          const duplicateKeys = isEditing ? getDuplicateKeys(displayData.tags) : new Set();
                          const isDuplicateKey = tag.key.trim() !== '' && duplicateKeys.has(tag.key.trim());
                          return (
                            <div className="flex items-center gap-2" key={`tag-${index}`}>
                              <div className="flex-1">
                                <Input
                                  className={isDuplicateKey ? 'border-destructive focus:border-destructive' : ''}
                                  disabled={!isEditing}
                                  onChange={(e) => handleUpdateTag(index, 'key', e.target.value)}
                                  placeholder="Key"
                                  value={tag.key}
                                />
                              </div>
                              <div className="flex-1">
                                <Input
                                  disabled={!isEditing}
                                  onChange={(e) => handleUpdateTag(index, 'value', e.target.value)}
                                  placeholder="Value"
                                  value={tag.value}
                                />
                              </div>
                              {isEditing && (
                                <div className="flex h-9 items-end">
                                  <Button onClick={() => handleRemoveTag(index)} size="sm" variant="outline">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {isEditing && (
                          <Button className="w-full" onClick={handleAddTag} variant="dashed">
                            <Plus className="h-4 w-4" />
                            Add Tag
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className={`grid grid-cols-1 gap-6 ${hasSecretWarnings && isEditing ? 'xl:grid-cols-3' : ''}`}>
          {/* Main tools configuration - takes 2 columns on xl screens when secrets panel is shown, full width otherwise */}
          <div className={hasSecretWarnings && isEditing ? 'xl:col-span-2' : ''}>
            <Card className="px-0 py-0" size="full">
              <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Hammer className="h-4 w-4" />
                  <Text className="font-semibold">Tools Configuration</Text>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between" />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {displayData.tools.map((tool) => (
                        <RemoteMCPToolButton
                          componentType={tool.componentType}
                          description={getToolDescription(tool)}
                          id={tool.id}
                          isEditing={isEditing}
                          isSelected={selectedToolId === tool.id}
                          key={tool.id}
                          name={tool.name}
                          onClick={() => setSelectedToolId(tool.id)}
                          onRemove={() => handleRemoveTool(tool.id)}
                        />
                      ))}
                    </div>
                  </div>

                  {selectedTool && (
                    <div className="space-y-4">
                      {isEditing && (
                        <div className="grid grid-cols-1 gap-4 rounded-lg bg-muted/30 p-4 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label className="font-medium text-sm">Component Type</Label>
                            <Select
                              onValueChange={(value) => {
                                const componentType = Number.parseInt(value, 10) as MCPServer_Tool_ComponentType;
                                handleUpdateTool(selectedTool.id, { componentType });
                              }}
                              value={selectedTool.componentType.toString()}
                            >
                              <SelectTrigger>
                                <SelectValue>
                                  <RedpandaConnectComponentTypeBadge componentType={selectedTool.componentType} />
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {Object.values(MCPServer_Tool_ComponentType)
                                  .filter(
                                    (value) =>
                                      typeof value === 'number' && value !== MCPServer_Tool_ComponentType.UNSPECIFIED
                                  )
                                  .map((componentType) => (
                                    <SelectItem key={componentType} value={componentType.toString()}>
                                      <RedpandaConnectComponentTypeBadge
                                        componentType={componentType as MCPServer_Tool_ComponentType}
                                      />
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="font-medium text-sm">Tool Name</Label>
                            <Input
                              onChange={(e) =>
                                handleUpdateTool(selectedTool.id, {
                                  name: e.target.value,
                                })
                              }
                              placeholder="e.g., search-posts (must be filename-compatible)"
                              value={selectedTool.name}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="font-medium text-sm">Template</Label>
                            <Select
                              onValueChange={(templateName) => {
                                const template = templates.find((t) => t.name === templateName);
                                if (template) {
                                  applyTemplate(selectedTool.id, template);
                                }
                              }}
                              value={selectedTool.selectedTemplate || ''}
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
                                      <RedpandaConnectComponentTypeBadge componentType={template.componentType} />
                                      <div>
                                        <Text className="font-medium" variant="default">
                                          {template.name}
                                        </Text>
                                        <Text className="text-xs" variant="muted">
                                          {template.description}
                                        </Text>
                                      </div>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                      <YamlEditorCard
                        height="500px"
                        key={selectedTool.id}
                        onChange={(value) => handleUpdateTool(selectedTool.id, { config: value })}
                        options={{
                          readOnly: !isEditing,
                          theme: 'vs',
                        }}
                        value={selectedTool.config}
                      />
                    </div>
                  )}

                  {!selectedTool && displayData.tools.length > 0 && (
                    <div className="flex items-center justify-center rounded-lg border-2 border-muted border-dashed py-12 text-center">
                      <div className="space-y-2">
                        <FileText className="mx-auto h-8 w-8 opacity-50" />
                        <Text className="text-muted-foreground" variant="small">
                          Select a tool to view and edit its configuration
                        </Text>
                      </div>
                    </div>
                  )}

                  {isEditing && (
                    <Button className="w-full" onClick={handleAddTool} variant="dashed">
                      <Plus className="h-4 w-4" />
                      Add Tool
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Secrets panel - takes 1 column on xl screens, only shown when editing and there are missing secrets */}
          {hasSecretWarnings && isEditing && (
            <div className="xl:col-span-1">
              <div className="sticky top-4">
                <QuickAddSecrets
                  existingSecrets={existingSecrets.filter((secretId): secretId is string => Boolean(secretId))}
                  requiredSecrets={detectedSecrets}
                  scopes={[Scope.MCP_SERVER]}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
