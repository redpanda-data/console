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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
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
import { FileText, Plus, Save, Trash2 } from 'lucide-react';
import {
  MCPServer_Tool_ComponentType,
  UpdateMCPServerRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useState } from 'react';
import { useGetMCPServerQuery, useUpdateMCPServerMutation } from 'react-query/api/remote-mcp';
import { useParams } from 'react-router-dom';
import { getResourceTierByName, getResourceTierFullSpec, RESOURCE_TIERS } from 'utils/resource-tiers';
import { parse, stringify } from 'yaml';
import { RemoteMCPComponentTypeDescription } from '../remote-mcp-component-type-description';
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
  state: any;
  status: string;
  url: string;
}

export const RemoteMCPConfigurationTab = () => {
  const { id } = useParams<{ id: string }>();
  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });
  const { mutateAsync: updateMCPServer, isPending: isUpdating } = useUpdateMCPServerMutation();

  // Local state for configuration editing
  const [isEditing, setIsEditing] = useState(false);
  const [editedServerData, setEditedServerData] = useState<LocalMCPServer | null>(null);

  const applyTemplate = (toolId: string, template: Template) => {
    if (!mcpServerData?.mcpServer) return;

    const currentData = editedServerData || {
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

    const currentData = editedServerData;
    if (!currentData) return;

    try {
      // Convert tools from local format to API format
      const toolsMap: { [key: string]: { componentType: number; configYaml: string } } = {};
      currentData.tools.forEach((tool) => {
        toolsMap[tool.name] = {
          componentType: tool.componentType,
          configYaml: tool.config,
        };
      });

      // Convert tags from array to map format, filtering out empty tags
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
              memoryShares: getResourceTierByName(currentData.resources.tier)?.memory || '512MiB',
              cpuShares: getResourceTierByName(currentData.resources.tier)?.cpu || '200m',
            },
          },
          updateMask: create(FieldMaskSchema, {
            paths: ['display_name', 'description', 'tools', 'tags', 'resources'],
          }),
        }),
      );
      setIsEditing(false);
      setEditedServerData(null);
    } catch (error) {
      console.error('Failed to update MCP server:', error);
    }
  };

  const handleAddTool = () => {
    if (!mcpServerData?.mcpServer) return;

    const currentData = editedServerData || {
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

    const newToolId = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const newTool = {
      id: newToolId,
      name: '',
      componentType: MCPServer_Tool_ComponentType.PROCESSOR,
      config: `name: 
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
  };

  const handleRemoveTool = (toolId: string) => {
    if (!mcpServerData?.mcpServer) return;

    const currentData = editedServerData || {
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

    const updatedTools = currentData.tools.filter((tool) => tool.id !== toolId);
    setEditedServerData({
      ...currentData,
      tools: updatedTools,
    });
  };

  const handleUpdateTool = (toolId: string, updates: Partial<LocalTool>) => {
    if (!mcpServerData?.mcpServer) return;

    const currentData = editedServerData || {
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

    const updatedTools = [...currentData.tools];
    const toolIndex = updatedTools.findIndex((tool) => tool.id === toolId);
    if (toolIndex !== -1) {
      const updatedTool = { ...updatedTools[toolIndex], ...updates };

      // Clear selected template if user manually edits config YAML
      if (updates.config && updates.config !== updatedTools[toolIndex].config) {
        updatedTool.selectedTemplate = undefined;

        // Try to extract label from YAML and update tool name
        try {
          const parsedYaml = parse(updates.config);
          if (parsedYaml?.label && !updates.name) {
            updatedTool.name = parsedYaml.label;
          }
        } catch (_error) {
          // Ignore YAML parsing errors, keep existing name
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
    if (!mcpServerData?.mcpServer) return;

    const currentData = editedServerData || {
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

    setEditedServerData({
      ...currentData,
      tags: [...currentData.tags, { key: '', value: '' }],
    });
  };

  const handleRemoveTag = (index: number) => {
    if (!mcpServerData?.mcpServer) return;

    const currentData = editedServerData || {
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

    const updatedTags = currentData.tags.filter((_, i) => i !== index);
    setEditedServerData({
      ...currentData,
      tags: updatedTags,
    });
  };

  const handleUpdateTag = (index: number, field: 'key' | 'value', value: string) => {
    if (!mcpServerData?.mcpServer) return;

    const currentData = editedServerData || {
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

  // Convert server resource data to tier name
  const getResourceTierFromServer = (resources?: any) => {
    if (!resources) return 'Small';

    // Find matching tier based on CPU and memory values
    const matchingTier = RESOURCE_TIERS.find((tier) => {
      const serverCpu = resources.cpuShares || '';
      const serverMemory = resources.memoryShares || '';
      return tier.cpu === serverCpu && tier.memory === serverMemory;
    });

    return matchingTier?.name || 'Small';
  };

  const displayData =
    editedServerData ||
    (mcpServerData?.mcpServer
      ? {
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
        }
      : null);

  if (!displayData) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        {isEditing ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleSave} disabled={isUpdating}>
              <Save className="h-4 w-4 mr-2" />
              {isUpdating ? 'Saving...' : 'Save Changes'}
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
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setIsEditing(true)}>
            Edit Configuration
          </Button>
        )}
      </div>

      <div className="space-y-6 w-full">
        <Card className="w-full max-w-none px-8 py-6">
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Core server configuration and metadata</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  if (!mcpServerData?.mcpServer) return;
                  const currentData = editedServerData || {
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
                    })),
                    state: mcpServerData.mcpServer.state,
                    status: mcpServerData.mcpServer.status?.error || '',
                    url: mcpServerData.mcpServer.url,
                  };
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
                  if (!mcpServerData?.mcpServer) return;
                  const currentData = editedServerData || {
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
                    })),
                    state: mcpServerData.mcpServer.state,
                    status: mcpServerData.mcpServer.status?.error || '',
                    url: mcpServerData.mcpServer.url,
                  };
                  setEditedServerData({ ...currentData, description: e.target.value });
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="w-full max-w-none px-8 py-6">
          <CardHeader>
            <CardTitle>Tags</CardTitle>
            <CardDescription>Key-value pairs for organizing and categorizing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isEditing && hasDuplicateKeys(displayData.tags) && (
              <Text variant="small" className="text-destructive">
                Tags must have unique keys
              </Text>
            )}
            {displayData.tags.map((tag, index) => {
              const duplicateKeys = isEditing ? getDuplicateKeys(displayData.tags) : new Set();
              const isDuplicateKey = tag.key.trim() !== '' && duplicateKeys.has(tag.key.trim());
              return (
                <div key={index} className="flex items-center gap-2">
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
                <Plus className="h-4 w-4 mr-2" />
                Add Tag
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="w-full max-w-none px-8 py-6">
          <CardHeader>
            <CardTitle>Pipeline Resources</CardTitle>
            <CardDescription>Resource tier allocation for the server</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="tier">Resource Tier</Label>
            {isEditing ? (
              <Select
                value={displayData.resources.tier}
                onValueChange={(value) => {
                  if (!mcpServerData?.mcpServer) return;
                  const currentData = editedServerData || {
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
                    })),
                    state: mcpServerData.mcpServer.state,
                    status: mcpServerData.mcpServer.status?.error || '',
                    url: mcpServerData.mcpServer.url,
                  };
                  setEditedServerData({ ...currentData, resources: { tier: value } });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tier" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TIERS.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.fullSpec}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="h-10 px-3 py-2 border border-gray-200 rounded-md bg-gray-50 flex items-center">
                <code className="text-sm font-mono">{getResourceTierFullSpec(displayData.resources.tier)}</code>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="w-full max-w-none px-8 py-6">
          <CardHeader>
            <CardTitle>Tools Configuration</CardTitle>
            <CardDescription>Configure the tools available in this MCP server</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {displayData.tools.map((tool) => (
              <div key={tool.id} className="space-y-4 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-start gap-4">
                  {isEditing ? (
                    <>
                      <div className="flex-1 space-y-1">
                        <Label className="text-sm font-medium">Tool Name</Label>
                        <Input
                          value={tool.name}
                          placeholder="e.g., search-posts (must be filename-compatible)"
                          onChange={(e) => handleUpdateTool(tool.id, { name: e.target.value })}
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-sm font-medium">Component Type</Label>
                        <Select
                          value={tool.componentType.toString()}
                          onValueChange={(value) => {
                            const componentType = Number.parseInt(value) as MCPServer_Tool_ComponentType;
                            handleUpdateTool(tool.id, { componentType });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select component type">
                              <RemoteMCPToolTypeBadge componentType={tool.componentType} />
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
                        <RemoteMCPComponentTypeDescription componentType={tool.componentType} />
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-sm font-medium">Template</Label>
                        <Select
                          value={tool.selectedTemplate || ''}
                          onValueChange={(templateName) => {
                            const template = templates.find((t) => t.name === templateName);
                            if (template) {
                              applyTemplate(tool.id, template);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose template (optional)">
                              {tool.selectedTemplate ? (
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4" />
                                  {tool.selectedTemplate}
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
                        <Text variant="small" className="text-gray-500">
                          Select a template to prefill configuration
                        </Text>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleRemoveTool(tool.id)} className="mt-6">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <div className="flex-1 space-y-1">
                      <Label className="text-sm font-medium">Tool Name</Label>
                      <div className="h-10 px-3 py-2 border border-gray-200 rounded-md bg-gray-50 flex items-center gap-3">
                        <RemoteMCPToolTypeBadge componentType={tool.componentType} />
                        <code className="text-sm font-mono">{tool.name}</code>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2 flex-1 flex flex-col">
                  <Label>Tool Configuration (YAML)</Label>
                  <div className="overflow-hidden" style={{ height: '400px' }}>
                    <YamlEditor
                      value={tool.config}
                      onChange={(value) => handleUpdateTool(tool.id, { config: value || '' })}
                      options={{
                        readOnly: !isEditing,
                        theme: 'vs',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {isEditing && (
              <div className="space-y-4">
                <Button variant="outline" onClick={handleAddTool} className="bg-transparent">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Tool
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
