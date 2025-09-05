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
import { Plus, Save, Trash2 } from 'lucide-react';
import {
  MCPServer_Tool_ComponentType,
  UpdateMCPServerRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useState } from 'react';
import { useGetMCPServerQuery, useUpdateMCPServerMutation } from 'react-query/api/remote-mcp';
import { useParams } from 'react-router-dom';
import { getResourceTierByName, getResourceTierFullSpec, RESOURCE_TIERS } from 'utils/resource-tiers';
import { RemoteMCPToolTypeBadge } from '../remote-mcp-tool-type-badge';

interface LocalTool {
  id: string;
  name: string;
  componentType: string;
  config: string;
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

const toolTemplates = {
  search: {
    name: 'search-content',
    config: `name: search-content
meta:
  mcp:
    enabled: true
spec:
  description: "Search through content and documents"
  parameters: {
    query:
      type: string
      required: true
    limit:
      type: integer
      default: 10`,
  },
  get: {
    name: 'get-item',
    config: `name: get-item
meta:
  mcp:
    enabled: true
spec:
  description: "Retrieve item by ID"
  parameters: {
    id:
      type: string
      required: true`,
  },
  create: {
    name: 'create-item',
    config: `name: create-item
meta:
  mcp:
    enabled: true
spec:
  description: "Create a new item"
  parameters: {
    data:
      type: object
      required: true`,
  },
  update: {
    name: 'update-item',
    config: `name: update-item
meta:
  mcp:
    enabled: true
spec:
  description: "Update an existing item"
  parameters: {
    id:
      type: string
      required: true
    data:
      type: object
      required: true`,
  },
};

export const RemoteMCPConfigurationTab = () => {
  const { id } = useParams<{ id: string }>();
  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });
  const { mutateAsync: updateMCPServer, isPending: isUpdating } = useUpdateMCPServerMutation();

  // Local state for configuration editing
  const [isEditing, setIsEditing] = useState(false);
  const [editedServerData, setEditedServerData] = useState<LocalMCPServer | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const handleSave = async () => {
    if (!mcpServerData?.mcpServer || !id) return;

    const currentData = editedServerData;
    if (!currentData) return;

    try {
      // Convert tools from local format to API format
      const toolsMap: { [key: string]: { componentType: number; configYaml: string } } = {};
      currentData.tools.forEach((tool) => {
        toolsMap[tool.name] = {
          componentType: tool.componentType === 'Processor' ? 1 : 2, // PROCESSOR = 1, CACHE = 2
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
        componentType: tool.componentType === 1 ? 'Processor' : 'Cache',
        config: tool.configYaml,
      })),
      state: mcpServerData.mcpServer.state,
      status: mcpServerData.mcpServer.status?.error || '',
      url: mcpServerData.mcpServer.url,
    };

    const template = selectedTemplate ? toolTemplates[selectedTemplate as keyof typeof toolTemplates] : null;
    const newToolId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newTool = template
      ? {
          id: newToolId,
          name: template.name,
          componentType: 'Processor' as const,
          config: template.config,
        }
      : {
          id: newToolId,
          name: '',
          componentType: 'Processor' as const,
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
    setSelectedTemplate('');
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
        componentType: tool.componentType === 1 ? 'Processor' : 'Cache',
        config: tool.configYaml,
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

  const handleUpdateTool = (toolId: string, field: string, value: string) => {
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
        componentType: tool.componentType === 1 ? 'Processor' : 'Cache',
        config: tool.configYaml,
      })),
      state: mcpServerData.mcpServer.state,
      status: mcpServerData.mcpServer.status?.error || '',
      url: mcpServerData.mcpServer.url,
    };

    const updatedTools = [...currentData.tools];
    const toolIndex = updatedTools.findIndex((tool) => tool.id === toolId);
    if (toolIndex !== -1) {
      updatedTools[toolIndex] = { ...updatedTools[toolIndex], [field]: value };
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
        componentType: tool.componentType === 1 ? 'Processor' : 'Cache',
        config: tool.configYaml,
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
        componentType: tool.componentType === 1 ? 'Processor' : 'Cache',
        config: tool.configYaml,
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
        componentType: tool.componentType === 1 ? 'Processor' : 'Cache',
        config: tool.configYaml,
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
            componentType: tool.componentType === 1 ? 'Processor' : 'Cache',
            config: tool.configYaml,
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
            <Button variant="outline" onClick={() => setIsEditing(false)}>
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
                      componentType: tool.componentType === 1 ? 'Processor' : 'Cache',
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
                      componentType: tool.componentType === 1 ? 'Processor' : 'Cache',
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
                      componentType: tool.componentType === 1 ? 'Processor' : 'Cache',
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
                          onChange={(e) => handleUpdateTool(tool.id, 'name', e.target.value)}
                        />
                        <Text variant="small" className="text-muted-foreground">
                          Lowercase letters, numbers, and dashes. Used in the file name and API.
                        </Text>
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-sm font-medium">Component Type</Label>
                        <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50 h-10">
                          <button
                            type="button"
                            onClick={() => handleUpdateTool(tool.id, 'componentType', 'Processor')}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              tool.componentType === 'Processor'
                                ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            Processor
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateTool(tool.id, 'componentType', 'Cache')}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              tool.componentType === 'Cache'
                                ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            Cache
                          </button>
                        </div>
                        <Text variant="small" className="text-muted-foreground">
                          {tool.componentType === 'Processor'
                            ? 'Transform and manipulate content, make API calls, process data.'
                            : 'Store and retrieve data, manage cached content and state.'}{' '}
                          {/* TODO: Add a link to the MCP documentation */}
                          {/* <a href="#" className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                              Learn more <ExternalLink className="h-3 w-3" />
                            </a> */}
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
                        <RemoteMCPToolTypeBadge
                          componentType={
                            tool.componentType === 'Processor'
                              ? MCPServer_Tool_ComponentType.PROCESSOR
                              : MCPServer_Tool_ComponentType.CACHE
                          }
                        />
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
                      onChange={(value) => handleUpdateTool(tool.id, 'config', value || '')}
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
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-2">
                    <Label className="text-sm font-medium">Start from template (optional)</Label>
                    <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a template or start blank" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="search">Search Tool</SelectItem>
                        <SelectItem value="get">Get Item Tool</SelectItem>
                        <SelectItem value="create">Create Item Tool</SelectItem>
                        <SelectItem value="update">Update Item Tool</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" onClick={handleAddTool} className="mb-1 bg-transparent">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Tool
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
