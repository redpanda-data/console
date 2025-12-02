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
import { SecretSelector } from 'components/ui/secret/secret-selector';
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

import { AIAgentModel, MODEL_OPTIONS_BY_PROVIDER, PROVIDER_INFO } from '../ai-agent-model';

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
};

/**
 * Regex pattern to extract secret name from template string: ${secrets.SECRET_NAME}
 */
const SECRET_TEMPLATE_REGEX = /^\$\{secrets\.([^}]+)\}$/;

/**
 * Detects the provider for a given model name using pattern matching
 */
const detectProvider = (modelName: string): (typeof PROVIDER_INFO)[keyof typeof PROVIDER_INFO] | null => {
  for (const provider of Object.values(PROVIDER_INFO)) {
    if (provider.modelPattern.test(modelName)) {
      return provider;
    }
  }
  return null;
};

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
            baseUrl: baseUrl || undefined,
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

  // Preserve internal tags
  if (originalTags.service_account_id) {
    tagsMap.service_account_id = originalTags.service_account_id;
  }
  if (originalTags.secret_id) {
    tagsMap.secret_id = originalTags.secret_id;
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
          {isEditing && <Text variant="muted">Select MCP servers to enable tools for this agent</Text>}
          {hasNoServers ? (
            <MCPEmpty>
              <Text className="mb-4 text-center" variant="muted">
                Create MCP servers first to enable additional tools for your AI agent
              </Text>
            </MCPEmpty>
          ) : (
            <MCPServerCardList
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
          .filter(([key]) => key !== 'secret_id' && key !== 'service_account_id')
          .map(([key, value]) => ({ key, value })),
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

  const handleSave = async () => {
    if (!(aiAgentData?.aiAgent && id)) {
      return;
    }

    const currentData = getCurrentData();
    if (!currentData) {
      return;
    }

    try {
      const selectedTier = RESOURCE_TIERS.find((tier) => tier.id === currentData.resources.tier);

      // Build MCP servers map
      const mcpServersMap: Record<string, { id: string }> = {};
      for (const serverId of currentData.selectedMcpServers) {
        mcpServersMap[serverId] = create(AIAgent_MCPServerSchema, { id: serverId });
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
          {/* Agent Configuration Card */}
          <Card className="px-0 py-0" size="full">
            <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <Text className="font-semibold">Agent Configuration</Text>
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
                {agent.url && (
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
              </div>
            </CardContent>
          </Card>

          {/* MCP Servers - Always visible */}
          {(connectedMcpServers.length > 0 || isEditing) && (
            <MCPServersSection
              availableMcpServers={availableMcpServers}
              connectedMcpServers={connectedMcpServers}
              isEditing={isEditing}
              onServerSelectionChange={(newServers) => updateField({ selectedMcpServers: newServers })}
              selectedMcpServers={displayData.selectedMcpServers}
            />
          )}

          {/* Service Account - Always visible */}
          {agent.tags.service_account_id && (
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

        {/* Resources Card */}
        <div className="xl:col-span-1">
          <Card className="px-0 py-0" size="full">
            <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <Text className="font-semibold">Resources</Text>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-6">
                {/* Resources */}
                <div className="space-y-4">
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
                </div>

                {/* Provider Configuration */}
                <div className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="model">Model</Label>
                      {isEditing ? (
                        <Select onValueChange={(value) => updateField({ model: value })} value={displayData.model}>
                          <SelectTrigger>
                            <SelectValue>
                              {displayData.model && detectProvider(displayData.model) ? (
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
                            {Object.entries(MODEL_OPTIONS_BY_PROVIDER).map(([providerId, provider]) => {
                              const logoSrc = provider.icon;
                              return (
                                <SelectGroup key={providerId}>
                                  <SelectLabel>
                                    <div className="flex items-center gap-2">
                                      <img alt={provider.label} className="h-4 w-4" src={logoSrc} />
                                      <span>{provider.label}</span>
                                    </div>
                                  </SelectLabel>
                                  {provider.models.map((model) => (
                                    <SelectItem key={model.value} value={model.value}>
                                      <div className="flex flex-col gap-0.5">
                                        <Text className="font-medium">{model.name}</Text>
                                        <Text className="text-xs" variant="muted">
                                          {model.description}
                                        </Text>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                          <AIAgentModel model={displayData.model} />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxIterations">Max Iterations</Label>
                      {isEditing ? (
                        <>
                          <div className="flex items-center justify-between pb-2">
                            <Text className="font-medium text-sm">{displayData.maxIterations}</Text>
                          </div>
                          <Slider
                            max={100}
                            min={10}
                            onValueChange={(values) => updateField({ maxIterations: values[0] })}
                            value={[displayData.maxIterations]}
                          />
                        </>
                      ) : (
                        <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                          <Text variant="default">{displayData.maxIterations}</Text>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiKeySecret">OpenAI API Token</Label>
                      {isEditing ? (
                        <div className="[&>div]:flex-col [&>div]:items-stretch [&>div]:gap-2">
                          <SecretSelector
                            availableSecrets={availableSecrets}
                            onChange={(value) => updateField({ apiKeySecret: value })}
                            placeholder="Select from secrets store or create new"
                            scopes={[Scope.MCP_SERVER, Scope.AI_AGENT]}
                            value={displayData.apiKeySecret}
                          />
                        </div>
                      ) : (
                        <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                          <Text variant="default">{displayData.apiKeySecret || 'No secret configured'}</Text>
                        </div>
                      )}
                    </div>
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
                  </div>
                </div>

                {/* Tags */}
                {(displayData.tags.length > 0 || isEditing) && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Tags</Label>
                      <div className="space-y-2">
                        {displayData.tags.map((tag, index) => (
                          <div className="flex items-center gap-2" key={`tag-${index}`}>
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
                            {isEditing && (
                              <div className="flex h-9 items-end">
                                <Button onClick={() => handleRemoveTag(index)} size="sm" variant="outline">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                        {isEditing && (
                          <Button className="w-full" onClick={handleAddTag} variant="dashed">
                            <Plus className="h-4 w-4" />
                            Add Tag
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
