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
import { CLOUD_MANAGED_TAG_KEYS, isCloudManagedTagKey } from 'components/constants';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from 'components/redpanda-ui/components/accordion';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { MCPIcon } from 'components/redpanda-ui/components/icons';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Slider } from 'components/redpanda-ui/components/slider';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Text } from 'components/redpanda-ui/components/typography';
import { RESOURCE_TIERS, ResourceTierSelect } from 'components/ui/connect/resource-tier-select';
import { MCPEmpty } from 'components/ui/mcp/mcp-empty';
import { MCPServerCardList } from 'components/ui/mcp/mcp-server-card';
import { AI_AGENT_SECRET_TEXT, SecretSelector } from 'components/ui/secret/secret-selector';
import { ServiceAccountSection } from 'components/ui/service-account/service-account-section';
import { Edit, Plus, Save, Settings, ShieldCheck, Trash2 } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import {
  AIAgent_MCPServerSchema,
  type AIAgent_Provider,
  AIAgent_Provider_AnthropicSchema,
  AIAgent_Provider_GoogleSchema,
  AIAgent_Provider_OpenAICompatibleSchema,
  AIAgent_Provider_OpenAISchema,
  AIAgent_ProviderSchema,
  AIAgent_SubagentSchema,
  AIAgentUpdateSchema,
  UpdateAIAgentRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { useCallback, useMemo, useState } from 'react';
import { useGetAIAgentQuery, useUpdateAIAgentMutation } from 'react-query/api/ai-agent';
import { type MCPServer, useListMCPServersQuery } from 'react-query/api/remote-mcp';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { AIAgentModel, detectProvider, MODEL_OPTIONS_BY_PROVIDER } from '../ai-agent-model';

type LocalAIAgent = {
  displayName: string;
  description: string;
  model: string;
  maxIterations: number;
  systemPrompt: string;
  provider: AIAgent_Provider;
  apiKeySecret: string;
  baseUrl: string;
  resources: {
    tier: string;
  };
  selectedMcpServers: string[];
  tags: Array<{ key: string; value: string }>;
  subagents: Array<{
    name: string;
    description: string;
    systemPrompt: string;
    selectedMcpServers: string[];
  }>;
};

/**
 * Regex pattern to extract secret name from template string: ${secrets.SECRET_NAME}
 */
const SECRET_TEMPLATE_REGEX = /^\$\{secrets\.([^}]+)\}$/;

/**
 * Extracts the secret name from the template string format: ${secrets.SECRET_NAME} -> SECRET_NAME
 */
const extractSecretName = (apiKeyTemplate: string): string => {
  const match = apiKeyTemplate.match(SECRET_TEMPLATE_REGEX);
  return match ? match[1] : '';
};

/**
 * Extracts provider info from AI Agent provider config
 */
const extractProviderInfo = (provider: AIAgent_Provider): { apiKeyTemplate: string; baseUrl: string } => {
  let apiKeyTemplate = '';
  let baseUrl = '';

  switch (provider.provider.case) {
    case 'openai':
      apiKeyTemplate = provider.provider.value.apiKey;
      baseUrl = provider.provider.value.baseUrl || '';
      break;
    case 'anthropic':
      apiKeyTemplate = provider.provider.value.apiKey;
      baseUrl = provider.provider.value.baseUrl || '';
      break;
    case 'google':
      apiKeyTemplate = provider.provider.value.apiKey;
      baseUrl = provider.provider.value.baseUrl || '';
      break;
    case 'openaiCompatible':
      apiKeyTemplate = provider.provider.value.apiKey;
      baseUrl = provider.provider.value.baseUrl;
      break;
    default:
      break;
  }

  return { apiKeyTemplate, baseUrl };
};

/**
 * Creates updated provider with new API key reference
 */
const createUpdatedProvider = (
  providerCase: 'openai' | 'anthropic' | 'google' | 'openaiCompatible' | undefined,
  apiKeyRef: string,
  baseUrl: string
): AIAgent_Provider => {
  switch (providerCase) {
    case 'anthropic':
      return create(AIAgent_ProviderSchema, {
        provider: {
          case: 'anthropic',
          value: create(AIAgent_Provider_AnthropicSchema, {
            apiKey: apiKeyRef,
            baseUrl: baseUrl || undefined,
          }),
        },
      });
    case 'google':
      return create(AIAgent_ProviderSchema, {
        provider: {
          case: 'google',
          value: create(AIAgent_Provider_GoogleSchema, {
            apiKey: apiKeyRef,
            baseUrl: baseUrl || undefined,
          }),
        },
      });
    case 'openaiCompatible':
      return create(AIAgent_ProviderSchema, {
        provider: {
          case: 'openaiCompatible',
          value: create(AIAgent_Provider_OpenAICompatibleSchema, {
            apiKey: apiKeyRef,
            baseUrl,
          }),
        },
      });
    default: // openai
      return create(AIAgent_ProviderSchema, {
        provider: {
          case: 'openai',
          value: create(AIAgent_Provider_OpenAISchema, {
            apiKey: apiKeyRef,
            baseUrl: baseUrl || undefined,
          }),
        },
      });
  }
};

/**
 * Builds tags map preserving internal tags from original agent
 */
const buildTagsMap = (
  originalTags: { [key: string]: string },
  userTags: Array<{ key: string; value: string }>
): { [key: string]: string } => {
  const tagsMap: { [key: string]: string } = {};

  // Preserve system-generated tags
  if (originalTags[CLOUD_MANAGED_TAG_KEYS.SERVICE_ACCOUNT_ID]) {
    tagsMap[CLOUD_MANAGED_TAG_KEYS.SERVICE_ACCOUNT_ID] = originalTags[CLOUD_MANAGED_TAG_KEYS.SERVICE_ACCOUNT_ID];
  }
  if (originalTags[CLOUD_MANAGED_TAG_KEYS.SECRET_ID]) {
    tagsMap[CLOUD_MANAGED_TAG_KEYS.SECRET_ID] = originalTags[CLOUD_MANAGED_TAG_KEYS.SECRET_ID];
  }

  // Add user-defined tags
  for (const tag of userTags) {
    if (tag.key.trim() && tag.value.trim()) {
      tagsMap[tag.key.trim()] = tag.value.trim();
    }
  }

  return tagsMap;
};

/**
 * MCP Servers section component
 */
const MCPServersSection = ({
  isEditing,
  availableMcpServers,
  connectedMcpServers,
  selectedMcpServers,
  onServerSelectionChange,
}: {
  isEditing: boolean;
  availableMcpServers: MCPServer[];
  connectedMcpServers: MCPServer[];
  selectedMcpServers: string[];
  onServerSelectionChange?: (newServers: string[]) => void;
}) => {
  const serversToDisplay = isEditing ? availableMcpServers : connectedMcpServers;
  const hasNoServers = isEditing && availableMcpServers.length === 0;

  return (
    <Card className="px-0 py-0" size="full">
      <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2">
          <MCPIcon className="h-4 w-4" />
          <Text className="font-semibold">MCP Servers</Text>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-4">
          {Boolean(isEditing) && <Text variant="muted">Select MCP servers to enable tools for this agent</Text>}
          {hasNoServers ? (
            <MCPEmpty>
              <Text className="mb-4 text-center" variant="muted">
                Create MCP servers first to enable additional tools for your AI agent
              </Text>
            </MCPEmpty>
          ) : (
            <MCPServerCardList
              idPrefix="root"
              onValueChange={isEditing ? onServerSelectionChange : undefined}
              servers={serversToDisplay}
              showCheckbox={isEditing}
              value={selectedMcpServers}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Large configuration form with many conditionals - already refactored with helper functions
export const AIAgentConfigurationTab = () => {
  const { id } = useParams<{ id: string }>();
  const { data: aiAgentData } = useGetAIAgentQuery({ id: id || '' }, { enabled: !!id });
  const { mutateAsync: updateAIAgent, isPending: isUpdateAIAgentPending } = useUpdateAIAgentMutation();
  const { data: mcpServersData } = useListMCPServersQuery();
  const { data: secretsData } = useListSecretsQuery();

  const [isEditing, setIsEditing] = useState(false);
  const [editedAgentData, setEditedAgentData] = useState<LocalAIAgent | null>(null);
  const [expandedSubagent, setExpandedSubagent] = useState<string | undefined>(undefined);

  // Get available MCP servers
  const availableMcpServers = useMemo(() => {
    if (!mcpServersData?.mcpServers || mcpServersData.mcpServers.length === 0) {
      return [];
    }
    return mcpServersData.mcpServers;
  }, [mcpServersData]);

  // Get available secrets for API key dropdown
  const availableSecrets = useMemo(() => {
    if (!secretsData?.secrets) {
      return [];
    }
    return secretsData.secrets
      .filter((secret): secret is NonNullable<typeof secret> & { id: string } => !!secret?.id)
      .map((secret) => ({
        id: secret.id,
        name: secret.id,
      }));
  }, [secretsData]);

  const getResourceTierFromAgent = useCallback((resources?: { cpuShares?: string; memoryShares?: string }) => {
    if (!resources) {
      return 'Small';
    }

    const matchingTier = RESOURCE_TIERS.find((tier) => {
      const agentCpu = resources.cpuShares || '';
      const agentMemory = resources.memoryShares || '';
      return tier.cpu === agentCpu && tier.memory === agentMemory;
    });

    return matchingTier?.id || 'Small';
  }, []);

  const getCurrentData = useCallback((): LocalAIAgent | null => {
    if (editedAgentData) {
      return editedAgentData;
    }

    if (aiAgentData?.aiAgent?.provider) {
      const provider = aiAgentData.aiAgent.provider;
      const { apiKeyTemplate, baseUrl } = extractProviderInfo(provider);
      const apiKeySecret = extractSecretName(apiKeyTemplate);

      return {
        displayName: aiAgentData.aiAgent.displayName,
        description: aiAgentData.aiAgent.description,
        model: aiAgentData.aiAgent.model,
        maxIterations: aiAgentData.aiAgent.maxIterations,
        systemPrompt: aiAgentData.aiAgent.systemPrompt,
        provider: aiAgentData.aiAgent.provider,
        apiKeySecret,
        baseUrl,
        resources: { tier: getResourceTierFromAgent(aiAgentData.aiAgent.resources) },
        selectedMcpServers: Object.values(aiAgentData.aiAgent.mcpServers).map((server) => server.id),
        tags: Object.entries(aiAgentData.aiAgent.tags)
          .filter(([key]) => !isCloudManagedTagKey(key))
          .map(([key, value]) => ({ key, value })),
        subagents: Object.entries(aiAgentData.aiAgent.subagents || {}).map(([name, subagent]) => ({
          name,
          description: subagent.description || '',
          systemPrompt: subagent.systemPrompt,
          selectedMcpServers: Object.values(subagent.mcpServers || {}).map((server) => server.id),
        })),
      };
    }

    return null;
  }, [editedAgentData, aiAgentData, getResourceTierFromAgent]);

  const updateField = useCallback(
    (updates: Partial<LocalAIAgent>) => {
      const currentData = getCurrentData();
      if (!currentData) {
        return;
      }
      setEditedAgentData({ ...currentData, ...updates });
    },
    [getCurrentData]
  );

  const handleAddTag = () => {
    const currentData = getCurrentData();
    if (!currentData) {
      return;
    }

    setEditedAgentData({
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
    setEditedAgentData({
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
    setEditedAgentData({
      ...currentData,
      tags: updatedTags,
    });
  };

  const handleAddSubagent = () => {
    const currentData = getCurrentData();
    if (!currentData) {
      return;
    }

    const newIndex = currentData.subagents.length;
    setEditedAgentData({
      ...currentData,
      subagents: [...currentData.subagents, { name: '', description: '', systemPrompt: '', selectedMcpServers: [] }],
    });
    // Auto-expand the newly added subagent
    setExpandedSubagent(`subagent-${newIndex}`);
  };

  const handleRemoveSubagent = (index: number) => {
    const currentData = getCurrentData();
    if (!currentData) {
      return;
    }

    const updatedSubagents = currentData.subagents.filter((_, i) => i !== index);
    setEditedAgentData({
      ...currentData,
      subagents: updatedSubagents,
    });
  };

  const handleUpdateSubagent = (
    index: number,
    field: 'name' | 'description' | 'systemPrompt' | 'selectedMcpServers',
    value: string | string[]
  ) => {
    const currentData = getCurrentData();
    if (!currentData) {
      return;
    }

    const updatedSubagents = [...currentData.subagents];
    updatedSubagents[index] = { ...updatedSubagents[index], [field]: value };
    setEditedAgentData({
      ...currentData,
      subagents: updatedSubagents,
    });
  };

  const handleSave = async () => {
    if (!(aiAgentData?.aiAgent && id)) {
      return;
    }

    const currentData = getCurrentData();
    if (!currentData) {
      return;
    }

    // Validate that user tags don't use reserved keys
    for (const tag of currentData.tags) {
      if (isCloudManagedTagKey(tag.key.trim())) {
        toast.error(`Tag key "${tag.key.trim()}" is reserved for system use`);
        return;
      }
    }

    try {
      const selectedTier = RESOURCE_TIERS.find((tier) => tier.id === currentData.resources.tier);

      // Build MCP servers map
      const mcpServersMap: Record<string, { id: string }> = {};
      for (const serverId of currentData.selectedMcpServers) {
        mcpServersMap[serverId] = create(AIAgent_MCPServerSchema, { id: serverId });
      }

      // Build subagents map
      const subagentsMap: Record<string, ReturnType<typeof create<typeof AIAgent_SubagentSchema>>> = {};
      for (const subagent of currentData.subagents) {
        const trimmedName = subagent.name.trim();
        if (trimmedName) {
          const subagentMcpMap: Record<string, { id: string }> = {};
          for (const serverId of subagent.selectedMcpServers) {
            subagentMcpMap[serverId] = create(AIAgent_MCPServerSchema, { id: serverId });
          }

          subagentsMap[trimmedName] = create(AIAgent_SubagentSchema, {
            description: subagent.description?.trim() ?? '',
            systemPrompt: subagent.systemPrompt.trim(),
            mcpServers: subagentMcpMap,
          });
        }
      }

      const tagsMap = buildTagsMap(aiAgentData.aiAgent.tags, currentData.tags);
      const apiKeyRef = `\${secrets.${currentData.apiKeySecret}}`;
      const updatedProvider = createUpdatedProvider(currentData.provider.provider.case, apiKeyRef, currentData.baseUrl);

      await updateAIAgent(
        create(UpdateAIAgentRequestSchema, {
          id,
          aiAgent: create(AIAgentUpdateSchema, {
            displayName: currentData.displayName,
            description: currentData.description,
            model: currentData.model,
            maxIterations: currentData.maxIterations,
            provider: updatedProvider,
            systemPrompt: currentData.systemPrompt,
            serviceAccount: aiAgentData.aiAgent.serviceAccount,
            resources: {
              cpuShares: selectedTier?.cpu || '100m',
              memoryShares: selectedTier?.memory || '400M',
            },
            mcpServers: mcpServersMap,
            subagents: subagentsMap,
            tags: tagsMap,
          }),
          updateMask: create(FieldMaskSchema, {
            paths: [
              'display_name',
              'description',
              'model',
              'max_iterations',
              'provider',
              'system_prompt',
              'service_account',
              'resources',
              'mcp_servers',
              'subagents',
              'tags',
            ],
          }),
        }),
        {
          onSuccess: () => {
            toast.success('AI agent updated successfully');
            setIsEditing(false);
            setEditedAgentData(null);
          },
          onError: (error) => {
            toast.error(formatToastErrorMessageGRPC({ error, action: 'update', entity: 'AI agent' }));
          },
        }
      );
    } catch (_error) {
      // Error already handled by mutation
    }
  };

  // Get connected MCP servers (full server objects from mcpServersData)
  const connectedMcpServers = useMemo(() => {
    if (!(aiAgentData?.aiAgent?.mcpServers && mcpServersData?.mcpServers)) {
      return [];
    }
    const connectedServerIds = Object.values(aiAgentData.aiAgent.mcpServers).map((server) => server.id);
    return mcpServersData.mcpServers.filter((server) => connectedServerIds.includes(server.id));
  }, [aiAgentData, mcpServersData]);

  if (!aiAgentData?.aiAgent) {
    return null;
  }

  const agent = aiAgentData.aiAgent;
  const displayData = getCurrentData();

  if (!displayData) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        {/* Main Configuration - takes 3/4 width on large screens */}
        <div className="space-y-6 xl:col-span-3">
          {/* Basic Information Card */}
          <Card className="px-0 py-0" size="full">
            <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <Text className="font-semibold">Basic Information</Text>
                </CardTitle>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button disabled={isUpdateAIAgentPending} onClick={handleSave} variant="secondary">
                        <Save className="h-4 w-4" />
                        {isUpdateAIAgentPending ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button
                        onClick={() => {
                          setIsEditing(false);
                          setEditedAgentData(null);
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
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>ID</Label>
                  <div className="w-full">
                    <DynamicCodeBlock code={agent.id} lang="text" />
                  </div>
                </div>
                {Boolean(agent.url) && (
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <div className="flex-1">
                      <DynamicCodeBlock code={agent.url} lang="text" />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  {isEditing ? (
                    <Input
                      id="displayName"
                      onChange={(e) => updateField({ displayName: e.target.value })}
                      value={displayData.displayName}
                    />
                  ) : (
                    <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <Text variant="default">{displayData.displayName}</Text>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  {isEditing ? (
                    <Textarea
                      id="description"
                      onChange={(e) => updateField({ description: e.target.value })}
                      value={displayData.description}
                    />
                  ) : (
                    <div className="flex items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <Text variant="default">{displayData.description || 'No description'}</Text>
                    </div>
                  )}
                </div>

                {/* Tags - moved from sidebar */}
                {displayData.tags.length > 0 && (
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <div className="space-y-2">
                      {displayData.tags.map((tag, index) => (
                        <div className="flex items-center gap-2" key={`tag-${tag.key}-${tag.value}`}>
                          <div className="flex-1">
                            <Input
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
                          {Boolean(isEditing) && (
                            <div className="flex h-9 items-end">
                              <Button onClick={() => handleRemoveTag(index)} size="sm" variant="outline">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {isEditing && displayData.tags.length === 0 && (
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <Button className="w-full" onClick={handleAddTag} variant="dashed">
                      <Plus className="h-4 w-4" />
                      Add Tag
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* System Prompt Card */}
          <Card className="px-0 py-0" size="full">
            <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <Text className="font-semibold">System Prompt</Text>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                <Label htmlFor="systemPrompt">System Prompt</Label>
                {isEditing ? (
                  <Textarea
                    id="systemPrompt"
                    onChange={(e) => updateField({ systemPrompt: e.target.value })}
                    rows={8}
                    value={displayData.systemPrompt}
                  />
                ) : (
                  <DynamicCodeBlock code={displayData.systemPrompt} lang="text" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* MCP Servers - Always visible */}
          <MCPServersSection
            availableMcpServers={availableMcpServers}
            connectedMcpServers={connectedMcpServers}
            isEditing={isEditing}
            onServerSelectionChange={(newServers) => updateField({ selectedMcpServers: newServers })}
            selectedMcpServers={displayData.selectedMcpServers}
          />

          {/* Subagents */}
          <Card className="px-0 py-0" size="full">
            <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <Text className="font-semibold">Subagents (Optional)</Text>
              </CardTitle>
              <Text variant="muted">
                Specialized subagents that inherit the provider and model from the parent agent. Each subagent has its
                own system prompt and can access a subset of MCP servers.
              </Text>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-4">
                {displayData.subagents.length === 0 ? (
                  <Text variant="muted">No subagents configured</Text>
                ) : (
                  <Accordion collapsible onValueChange={setExpandedSubagent} type="single" value={expandedSubagent}>
                    {displayData.subagents.map((subagent, index) => (
                      <AccordionItem key={`subagent-${index}`} value={`subagent-${index}`}>
                        <AccordionTrigger>
                          <Text className="font-medium">{subagent.name || `Subagent ${index + 1}`}</Text>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4 pt-4">
                            {/* Name */}
                            <div className="space-y-2">
                              <Label htmlFor={`subagent-name-${index}`}>Subagent Name</Label>
                              {isEditing ? (
                                <Input
                                  id={`subagent-name-${index}`}
                                  onChange={(e) => handleUpdateSubagent(index, 'name', e.target.value)}
                                  placeholder="e.g., code-reviewer"
                                  value={subagent.name}
                                />
                              ) : (
                                <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                                  <Text variant="default">{subagent.name}</Text>
                                </div>
                              )}
                            </div>

                            {/* Description */}
                            <div className="space-y-2">
                              <Label htmlFor={`subagent-desc-${index}`}>Description</Label>
                              {isEditing ? (
                                <>
                                  <Textarea
                                    id={`subagent-desc-${index}`}
                                    onChange={(e) => handleUpdateSubagent(index, 'description', e.target.value)}
                                    placeholder="Brief description of this subagent's purpose..."
                                    rows={2}
                                    value={subagent.description}
                                  />
                                  <Text className="text-muted-foreground text-sm" variant="muted">
                                    Used by the parent agent to decide when to invoke this subagent. Also used for context
                                    management - the parent provides context when starting the subagent, which maintains its
                                    own context.
                                  </Text>
                                </>
                              ) : subagent.description ? (
                                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                                  <Text variant="default">{subagent.description}</Text>
                                </div>
                              ) : (
                                <Text variant="muted">No description</Text>
                              )}
                            </div>

                            {/* System Prompt */}
                            <div className="space-y-2">
                              <Label htmlFor={`subagent-prompt-${index}`}>System Prompt</Label>
                              {isEditing ? (
                                <Textarea
                                  id={`subagent-prompt-${index}`}
                                  onChange={(e) => handleUpdateSubagent(index, 'systemPrompt', e.target.value)}
                                  placeholder="Define the specialized behavior for this subagent..."
                                  rows={6}
                                  value={subagent.systemPrompt}
                                />
                              ) : (
                                <DynamicCodeBlock code={subagent.systemPrompt} lang="text" />
                              )}
                            </div>

                            {/* MCP Servers */}
                            <div className="space-y-2">
                              <Label>MCP Servers</Label>
                              {isEditing ? (
                                availableMcpServers.length > 0 ? (
                                  <MCPServerCardList
                                    idPrefix={`subagent-${index}`}
                                    onValueChange={(newServers) =>
                                      handleUpdateSubagent(index, 'selectedMcpServers', newServers)
                                    }
                                    servers={availableMcpServers}
                                    value={subagent.selectedMcpServers}
                                  />
                                ) : (
                                  <Text variant="muted">No MCP servers available</Text>
                                )
                              ) : subagent.selectedMcpServers.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {subagent.selectedMcpServers.map((serverId) => (
                                    <span
                                      className="inline-flex items-center rounded-md bg-secondary/5 px-2 py-1 text-xs"
                                      key={serverId}
                                    >
                                      {serverId}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <Text variant="muted">No MCP servers selected</Text>
                              )}
                            </div>

                            {/* Delete button */}
                            {isEditing && (
                              <div className="flex justify-end pt-2">
                                <Button onClick={() => handleRemoveSubagent(index)} size="sm" variant="destructive">
                                  <Trash2 className="h-4 w-4" />
                                  Remove Subagent
                                </Button>
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}

                {/* Add subagent button */}
                {isEditing && (
                  <Button className="w-full" onClick={handleAddSubagent} type="button" variant="dashed">
                    <Plus className="h-4 w-4" />
                    Add Subagent
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Service Account - Always visible */}
          {Boolean(agent.tags.service_account_id) && (
            <Card className="px-0 py-0" size="full">
              <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  <Text className="font-semibold">Service Account</Text>
                </CardTitle>
                <Text variant="muted">
                  The service account is used by the agent to authenticate to other systems within the Redpanda Cloud
                  Platform (e.g. MCP servers, Redpanda broker).
                </Text>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ServiceAccountSection serviceAccountId={agent.tags.service_account_id} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6 xl:col-span-1">
          {/* Resources Card */}
          <Card className="px-0 py-0" size="full">
            <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <Text className="font-semibold">Resources</Text>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                <Label htmlFor="resources">Resource Tier</Label>
                {isEditing ? (
                  <ResourceTierSelect
                    onValueChange={(value) => updateField({ resources: { tier: value } })}
                    value={displayData.resources.tier}
                  />
                ) : (
                  <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                    <code className="font-mono text-sm">
                      {agent.resources?.cpuShares || '200m'} CPU, {agent.resources?.memoryShares || '800M'} RAM
                    </code>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* LLM Configuration Card */}
          <Card className="px-0 py-0" size="full">
            <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <Text className="font-semibold">LLM Configuration</Text>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {isEditing ? (
                <div className="space-y-4">
                  {/* Provider - now editable */}
                  <div className="space-y-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Select
                      onValueChange={(value: 'openai' | 'anthropic' | 'google' | 'openaiCompatible') => {
                        const newProviderData = MODEL_OPTIONS_BY_PROVIDER[value];
                        const firstModel =
                          newProviderData.models.length > 0 && newProviderData.models[0]
                            ? newProviderData.models[0].value
                            : displayData.model;

                        updateField({
                          provider: createUpdatedProvider(value, '', displayData.baseUrl || ''),
                          model: firstModel,
                          apiKeySecret: '',
                        });
                      }}
                      value={displayData.provider?.provider.case}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider">
                          {Boolean(displayData.provider?.provider.case) && (
                            <div className="flex items-center gap-2">
                              <img
                                alt={
                                  MODEL_OPTIONS_BY_PROVIDER[
                                    displayData.provider.provider.case as keyof typeof MODEL_OPTIONS_BY_PROVIDER
                                  ]?.label
                                }
                                className="h-4 w-4"
                                src={
                                  MODEL_OPTIONS_BY_PROVIDER[
                                    displayData.provider.provider.case as keyof typeof MODEL_OPTIONS_BY_PROVIDER
                                  ]?.icon
                                }
                              />
                              <span>
                                {displayData.provider.provider.case === 'openai' && 'OpenAI'}
                                {displayData.provider.provider.case === 'anthropic' && 'Anthropic'}
                                {displayData.provider.provider.case === 'google' && 'Google'}
                                {displayData.provider.provider.case === 'openaiCompatible' && 'OpenAI Compatible'}
                              </span>
                            </div>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(MODEL_OPTIONS_BY_PROVIDER).map(([providerId, provider]) => (
                          <SelectItem key={providerId} value={providerId}>
                            <div className="flex items-center gap-2">
                              <img alt={provider.label} className="h-4 w-4" src={provider.icon} />
                              <span>{provider.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Model - filtered by provider */}
                  <div className="space-y-2">
                    <Label htmlFor="model">Model</Label>
                    {displayData.provider?.provider.case === 'openaiCompatible' ? (
                      <Input
                        onChange={(e) => updateField({ model: e.target.value })}
                        placeholder="Enter model name (e.g., llama-3.1-70b)"
                        value={displayData.model}
                      />
                    ) : (
                      <Select onValueChange={(value) => updateField({ model: value })} value={displayData.model}>
                        <SelectTrigger>
                          <SelectValue>
                            {Boolean(displayData.model) && detectProvider(displayData.model) ? (
                              <div className="flex items-center gap-2">
                                <img
                                  alt={detectProvider(displayData.model)?.label}
                                  className="h-4 w-4"
                                  src={detectProvider(displayData.model)?.icon}
                                />
                                <span>{displayData.model}</span>
                              </div>
                            ) : (
                              displayData.model
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            const providerCase = displayData.provider?.provider.case;

                            const providerData = providerCase
                              ? MODEL_OPTIONS_BY_PROVIDER[providerCase as keyof typeof MODEL_OPTIONS_BY_PROVIDER]
                              : null;

                            if (!providerData) {
                              return (
                                <div className="p-2">
                                  <Text variant="muted">No models available for this provider</Text>
                                </div>
                              );
                            }

                            return (
                              <SelectGroup>
                                <SelectLabel>
                                  <div className="flex items-center gap-2">
                                    <img alt={providerData.label} className="h-4 w-4" src={providerData.icon} />
                                    <span>{providerData.label}</span>
                                  </div>
                                </SelectLabel>
                                {providerData.models.map(
                                  (model: { value: string; name: string; description: string }) => (
                                    <SelectItem key={model.value} value={model.value}>
                                      <div className="flex flex-col gap-0.5">
                                        <Text className="font-medium">{model.name}</Text>
                                        <Text className="text-xs" variant="muted">
                                          {model.description}
                                        </Text>
                                      </div>
                                    </SelectItem>
                                  )
                                )}
                              </SelectGroup>
                            );
                          })()}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* API Token */}
                  <div className="space-y-2">
                    <Label htmlFor="apiKeySecret">API Token</Label>
                    <div className="[&>div]:flex-col [&>div]:items-stretch [&>div]:gap-2">
                      <SecretSelector
                        availableSecrets={availableSecrets}
                        customText={AI_AGENT_SECRET_TEXT}
                        onChange={(value) => updateField({ apiKeySecret: value })}
                        placeholder="Select from secrets store or create new"
                        scopes={[Scope.MCP_SERVER, Scope.AI_AGENT]}
                        value={displayData.apiKeySecret}
                      />
                    </div>
                  </div>

                  {/* Base URL - only show for openaiCompatible */}
                  {displayData.provider?.provider.case === 'openaiCompatible' && (
                    <div className="space-y-2">
                      <Label htmlFor="baseUrl">Base URL (required)</Label>
                      <Input
                        onChange={(e) => updateField({ baseUrl: e.target.value })}
                        placeholder="https://api.example.com/v1"
                        value={displayData.baseUrl}
                      />
                      <Text variant="muted">API endpoint URL for your OpenAI-compatible service</Text>
                    </div>
                  )}

                  {/* Max Iterations */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="maxIterations">Max Iterations</Label>
                      <Text className="font-medium text-sm">{displayData.maxIterations}</Text>
                    </div>
                    <Slider
                      max={100}
                      min={10}
                      onValueChange={(values) => updateField({ maxIterations: values[0] })}
                      value={[displayData.maxIterations]}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <Text variant="default">
                        {agent.provider?.provider.case === 'openai' && 'OpenAI'}
                        {agent.provider?.provider.case === 'anthropic' && 'Anthropic'}
                        {agent.provider?.provider.case === 'google' && 'Google'}
                        {agent.provider?.provider.case === 'openaiCompatible' && 'OpenAI Compatible'}
                      </Text>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <AIAgentModel model={displayData.model} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>API Token</Label>
                    <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <Text variant="default">{displayData.apiKeySecret || 'No secret configured'}</Text>
                    </div>
                  </div>
                  {agent.provider?.provider.case === 'openaiCompatible' && displayData.baseUrl && (
                    <div className="space-y-2">
                      <Label>Base URL</Label>
                      <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <Text variant="default">{displayData.baseUrl}</Text>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Max Iterations</Label>
                    <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <Text variant="default">{displayData.maxIterations}</Text>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
