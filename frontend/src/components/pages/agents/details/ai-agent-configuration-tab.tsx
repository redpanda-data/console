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
import { getRouteApi, Link } from '@tanstack/react-router';

const routeApi = getRouteApi('/agents/$id/');

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
import {
  MarkdownEditor,
  type MarkdownEditorMode,
  MarkdownEditorTabs,
  MarkdownPreview,
} from 'components/ui/markdown-editor';
import { MCPEmpty } from 'components/ui/mcp/mcp-empty';
import { MCPServerCardList } from 'components/ui/mcp/mcp-server-card';
import { AI_AGENT_SECRET_TEXT, SecretSelector } from 'components/ui/secret/secret-selector';
import { ServiceAccountSection } from 'components/ui/service-account/service-account-section';
import { config } from 'config';
import { Edit, ExternalLink, Plus, Save, Settings, ShieldCheck, Trash2 } from 'lucide-react';
import { LLMProviderType } from 'protogen/redpanda/api/adp/v1alpha1/llm_provider_pb';
import { type MCPServer, MCPServerSchema, MCPServerType } from 'protogen/redpanda/api/adp/v1alpha1/mcp_server_pb';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import {
  AIAgent_AgentCard_ProviderSchema,
  AIAgent_AgentCard_SkillSchema,
  AIAgent_AgentCardSchema,
  AIAgent_GatewayConfigSchema,
  AIAgent_MCPServerSchema,
  type AIAgent_Provider,
  AIAgent_Provider_AnthropicSchema,
  AIAgent_Provider_BedrockSchema,
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
import { useListLLMProvidersQuery } from 'react-query/api/aigw/llm-providers';
import { useListAigwMCPServersQuery } from 'react-query/api/aigw/mcp-servers';
import { useListSecretsQuery } from 'react-query/api/secret';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { AIAgentModel, detectProvider, MODEL_OPTIONS_BY_PROVIDER, PROVIDER_INFO } from '../ai-agent-model';

/**
 * Maps LLMProviderType enum values to the form's provider type strings.
 */
const LLM_PROVIDER_TYPE_TO_FORM_ID: Record<LLMProviderType, string | undefined> = {
  [LLMProviderType.LLM_PROVIDER_TYPE_OPENAI]: 'openai',
  [LLMProviderType.LLM_PROVIDER_TYPE_ANTHROPIC]: 'anthropic',
  [LLMProviderType.LLM_PROVIDER_TYPE_GOOGLE]: 'google',
  [LLMProviderType.LLM_PROVIDER_TYPE_BEDROCK]: 'bedrock',
  [LLMProviderType.LLM_PROVIDER_TYPE_OPENAI_COMPATIBLE]: 'openaiCompatible',
  [LLMProviderType.LLM_PROVIDER_TYPE_UNSPECIFIED]: undefined,
};

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
  llmProvider?: string;
  agentCard?: {
    iconUrl: string;
    documentationUrl: string;
    provider?: {
      organization: string;
      url: string;
    };
    skills: Array<{
      id: string;
      name: string;
      description: string;
      tags: string[];
      examples: string[];
    }>;
  };
};

/**
 * Regex pattern to extract secret name from template string: ${secrets.SECRET_NAME}
 */
const SECRET_TEMPLATE_REGEX = /^\$\{secrets\.([^}]+)\}$/;
const SUBAGENT_NAME_REGEX = /^[A-Za-z0-9_-]+$/;

type SkillInput = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
};

/**
 * Sanitizes a skill object by trimming all string fields and filtering empty array entries
 */
const sanitizeSkill = (skill: SkillInput) =>
  create(AIAgent_AgentCard_SkillSchema, {
    id: skill.id.trim(),
    name: skill.name.trim(),
    description: skill.description.trim(),
    tags: skill.tags.map((t) => t.trim()).filter(Boolean),
    examples: skill.examples.map((e) => e.trim()).filter(Boolean),
  });

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
  providerCase: 'openai' | 'anthropic' | 'google' | 'openaiCompatible' | 'bedrock' | undefined,
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
    case 'bedrock':
      return create(AIAgent_ProviderSchema, {
        provider: {
          case: 'bedrock',
          value: create(AIAgent_Provider_BedrockSchema, {
            region: baseUrl || undefined, // region is passed via baseUrl field for now
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
          <Link className="font-semibold hover:underline" to="/mcp-servers">
            MCP Servers
          </Link>
        </CardTitle>
        <Text variant="muted">MCP Servers provide tools to the agent.</Text>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-4">
          {Boolean(isEditing) && <Text variant="muted">Select MCP servers to enable tools for this agent.</Text>}
          {hasNoServers ? (
            <MCPEmpty>
              <Text className="mb-4 text-center" variant="muted">
                Create MCP servers first to enable additional tools for your AI agent.
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
  const { id } = routeApi.useParams();
  const { data: aiAgentData } = useGetAIAgentQuery({ id: id || '' }, { enabled: !!id });
  const { mutateAsync: updateAIAgent, isPending: isUpdateAIAgentPending } = useUpdateAIAgentMutation();
  const { data: mcpServersData } = useListAigwMCPServersQuery(undefined, { enabled: !!config.aigwUrl });
  const { data: secretsData } = useListSecretsQuery();
  const [isEditing, setIsEditing] = useState(false);
  const [editedAgentData, setEditedAgentData] = useState<LocalAIAgent | null>(null);
  const [expandedSubagent, setExpandedSubagent] = useState<string | undefined>(undefined);
  const [systemPromptMode, setSystemPromptMode] = useState<MarkdownEditorMode>('editor');
  const [subagentPromptModes, setSubagentPromptModes] = useState<Record<number, MarkdownEditorMode>>({});

  // Check if agent is using gateway (has an llmProvider configured)
  const isUsingGateway = !!aiAgentData?.aiAgent?.gateway?.llmProvider;

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

  // Get current provider for filtering models
  const displayData = useMemo(() => {
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
        llmProvider: aiAgentData.aiAgent.gateway?.llmProvider,
        agentCard: aiAgentData.aiAgent.agentCard
          ? {
              iconUrl: aiAgentData.aiAgent.agentCard.iconUrl || '',
              documentationUrl: aiAgentData.aiAgent.agentCard.documentationUrl || '',
              provider: aiAgentData.aiAgent.agentCard.provider
                ? {
                    organization: aiAgentData.aiAgent.agentCard.provider.organization || '',
                    url: aiAgentData.aiAgent.agentCard.provider.url || '',
                  }
                : undefined,
              skills: aiAgentData.aiAgent.agentCard.skills.map((skill) => ({
                id: skill.id,
                name: skill.name,
                description: skill.description,
                tags: skill.tags || [],
                examples: skill.examples || [],
              })),
            }
          : undefined,
      };
    }
    return null;
  }, [editedAgentData, aiAgentData, getResourceTierFromAgent]);

  const selectedProvider = displayData?.provider?.provider.case;

  // Fetch LLM providers from AI Gateway v2 when using gateway
  const { data: providersData, isLoading: isLoadingProviders } = useListLLMProvidersQuery(
    {},
    { enabled: isUsingGateway }
  );

  // Get available providers - from aigw v2 API or hardcoded
  const availableProviders = useMemo(() => {
    if (isUsingGateway && providersData?.llmProviders) {
      return providersData.llmProviders
        .filter((provider) => provider.enabled && LLM_PROVIDER_TYPE_TO_FORM_ID[provider.type] !== undefined)
        .map((provider) => {
          const formTypeId = LLM_PROVIDER_TYPE_TO_FORM_ID[provider.type]!;
          return {
            id: provider.name,
            label: provider.displayName || provider.name,
            icon: PROVIDER_INFO[formTypeId as keyof typeof PROVIDER_INFO]?.icon || '',
            type: provider.type,
          };
        });
    }
    // Fallback to hardcoded providers
    return Object.entries(MODEL_OPTIONS_BY_PROVIDER).map(([id, provider]) => ({
      id,
      label: provider.label,
      icon: provider.icon,
      type: undefined as LLMProviderType | undefined,
    }));
  }, [isUsingGateway, providersData]);

  // Get available models - from aigw provider's models or hardcoded
  const filteredModels = useMemo(() => {
    if (isUsingGateway && providersData?.llmProviders && displayData?.llmProvider) {
      const provider = providersData.llmProviders.find((p) => p.name === displayData.llmProvider);
      if (provider) {
        return provider.models.map((modelName) => ({
          value: modelName,
          name: modelName,
          description: '',
        }));
      }
      return [];
    }
    // Fallback to hardcoded models
    if (!selectedProvider) return [];
    const providerData = MODEL_OPTIONS_BY_PROVIDER[selectedProvider as keyof typeof MODEL_OPTIONS_BY_PROVIDER];
    return providerData?.models || [];
  }, [isUsingGateway, providersData, displayData?.llmProvider, selectedProvider]);

  // Get available MCP servers (includes placeholders for missing servers that agent references)
  const availableMcpServers = useMemo(() => {
    const existingServers = mcpServersData?.mcpServers ?? [];
    const existingNames = new Set(existingServers.map((s) => s.name));

    // Find missing server names referenced by the agent
    const connectedServerNames = Object.values(aiAgentData?.aiAgent?.mcpServers ?? {}).map((s) => s.id);
    const missingServerNames = connectedServerNames.filter((name) => !existingNames.has(name));

    // Create placeholders for missing servers (disabled + unspecified type)
    const missingServers = missingServerNames.map((name) =>
      create(MCPServerSchema, {
        name,
        description: 'This MCP server no longer exists',
        tools: [],
        enabled: false,
        type: MCPServerType.MCP_SERVER_TYPE_UNSPECIFIED,
        url: '',
      })
    );

    return [...existingServers, ...missingServers];
  }, [mcpServersData, aiAgentData]);

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

  const updateField = useCallback(
    (updates: Partial<LocalAIAgent>) => {
      if (!displayData) {
        return;
      }
      setEditedAgentData({ ...displayData, ...updates });
    },
    [displayData]
  );

  const handleAddTag = () => {
    if (!displayData) {
      return;
    }

    setEditedAgentData({
      ...displayData,
      tags: [...displayData.tags, { key: '', value: '' }],
    });
  };

  const handleRemoveTag = (index: number) => {
    if (!displayData) {
      return;
    }

    const updatedTags = displayData.tags.filter((_, i) => i !== index);
    setEditedAgentData({
      ...displayData,
      tags: updatedTags,
    });
  };

  const handleUpdateTag = (index: number, field: 'key' | 'value', value: string) => {
    if (!displayData) {
      return;
    }

    const updatedTags = [...displayData.tags];
    updatedTags[index] = { ...updatedTags[index], [field]: value };
    setEditedAgentData({
      ...displayData,
      tags: updatedTags,
    });
  };

  const handleAddSubagent = () => {
    if (!displayData) {
      return;
    }

    const newIndex = displayData.subagents.length;
    setEditedAgentData({
      ...displayData,
      subagents: [...displayData.subagents, { name: '', description: '', systemPrompt: '', selectedMcpServers: [] }],
    });
    // Auto-expand the newly added subagent
    setExpandedSubagent(`subagent-${newIndex}`);
  };

  const handleRemoveSubagent = (index: number) => {
    if (!displayData) {
      return;
    }

    const updatedSubagents = displayData.subagents.filter((_, i) => i !== index);
    setEditedAgentData({
      ...displayData,
      subagents: updatedSubagents,
    });
  };

  const handleUpdateSubagent = (
    index: number,
    field: 'name' | 'description' | 'systemPrompt' | 'selectedMcpServers',
    value: string | string[]
  ) => {
    if (!displayData) {
      return;
    }

    const updatedSubagents = [...displayData.subagents];
    updatedSubagents[index] = { ...updatedSubagents[index], [field]: value };
    setEditedAgentData({
      ...displayData,
      subagents: updatedSubagents,
    });
  };

  const renderSubagentDescription = (
    subagent: LocalAIAgent['subagents'][number],
    index: number,
    editing: boolean
  ): JSX.Element => {
    if (editing) {
      return (
        <>
          <Textarea
            id={`subagent-desc-${index}`}
            onChange={(e) => handleUpdateSubagent(index, 'description', e.target.value)}
            placeholder="Brief description of this subagent's purpose..."
            rows={2}
            value={subagent.description}
          />
          <Text className="text-muted-foreground text-sm" variant="muted">
            Used by the parent agent to decide when to invoke this subagent. Also used for context management - the
            parent provides context when starting the subagent, which maintains its own context.
          </Text>
        </>
      );
    }
    if (subagent.description) {
      return (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <Text>{subagent.description}</Text>
        </div>
      );
    }
    return <Text variant="muted">No description</Text>;
  };

  const renderSubagentMcpServers = (
    subagent: LocalAIAgent['subagents'][number],
    index: number,
    editing: boolean,
    servers: MCPServer[]
  ): JSX.Element => {
    if (editing) {
      if (servers.length > 0) {
        return (
          <MCPServerCardList
            idPrefix={`subagent-${index}`}
            onValueChange={(newServers) => handleUpdateSubagent(index, 'selectedMcpServers', newServers)}
            servers={servers}
            value={subagent.selectedMcpServers}
          />
        );
      }
      return <Text variant="muted">No MCP servers available</Text>;
    }
    if (subagent.selectedMcpServers.length > 0) {
      return (
        <div className="flex flex-wrap gap-2">
          {subagent.selectedMcpServers.map((serverId) => (
            <span className="inline-flex items-center rounded-md bg-secondary/5 px-2 py-1 text-xs" key={serverId}>
              {serverId}
            </span>
          ))}
        </div>
      );
    }
    return <Text variant="muted">No MCP servers selected</Text>;
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex form with many conditionals - already refactored with helper functions
  const handleSave = async () => {
    if (!(aiAgentData?.aiAgent && id && displayData)) {
      return;
    }

    // Validate that user tags don't use reserved keys
    for (const tag of displayData.tags) {
      if (isCloudManagedTagKey(tag.key.trim())) {
        toast.error(`Tag key "${tag.key.trim()}" is reserved for system use`);
        return;
      }
    }

    // Validate subagents
    const subagentNames = new Set<string>();
    for (const [index, subagent] of displayData.subagents.entries()) {
      const trimmedName = subagent.name.trim();

      // Validate name is not empty
      if (!trimmedName) {
        toast.error(`Subagent ${index + 1}: Name is required`);
        return;
      }

      // Validate name format
      if (!SUBAGENT_NAME_REGEX.test(trimmedName)) {
        toast.error(`Subagent "${trimmedName}": Name can only contain letters, numbers, hyphens, and underscores`);
        return;
      }

      // Validate name length
      if (trimmedName.length > 64) {
        toast.error(`Subagent "${trimmedName}": Name must be at most 64 characters`);
        return;
      }

      // Check for duplicate names
      if (subagentNames.has(trimmedName)) {
        toast.error(`Subagent "${trimmedName}": Duplicate name found. Names must be unique`);
        return;
      }
      subagentNames.add(trimmedName);

      // Validate system prompt
      if (subagent.systemPrompt.trim().length < 10) {
        toast.error(`Subagent "${trimmedName}": System prompt must be at least 10 characters`);
        return;
      }

      // Validate description length if provided
      if (subagent.description && subagent.description.trim().length > 256) {
        toast.error(`Subagent "${trimmedName}": Description must be at most 256 characters`);
        return;
      }
    }

    try {
      const selectedTier = RESOURCE_TIERS.find((tier) => tier.id === displayData.resources.tier);

      // Build MCP servers map
      const mcpServersMap: Record<string, { id: string }> = {};
      for (const serverId of displayData.selectedMcpServers) {
        mcpServersMap[serverId] = create(AIAgent_MCPServerSchema, { id: serverId });
      }

      // Build subagents map
      const subagentsMap: Record<string, ReturnType<typeof create<typeof AIAgent_SubagentSchema>>> = {};
      for (const subagent of displayData.subagents) {
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

      const tagsMap = buildTagsMap(aiAgentData.aiAgent!.tags, displayData.tags);
      // When using gateway, keep the existing API key reference; otherwise use the selected secret
      const currentProvider = aiAgentData.aiAgent!.provider;
      const apiKeyRef =
        isUsingGateway && currentProvider
          ? extractProviderInfo(currentProvider).apiKeyTemplate
          : `\${secrets.${displayData.apiKeySecret}}`;
      const updatedProvider = createUpdatedProvider(displayData.provider.provider.case, apiKeyRef, displayData.baseUrl);

      const gatewayConfig =
        displayData.llmProvider && displayData.llmProvider.trim() !== ''
          ? create(AIAgent_GatewayConfigSchema, {
              llmProvider: displayData.llmProvider,
            })
          : undefined;

      const hasAgentCardData = (card?: LocalAIAgent['agentCard']): boolean => {
        if (!card) {
          return false;
        }
        return !!(
          card.iconUrl ||
          card.documentationUrl ||
          card.skills?.length > 0 ||
          card.provider?.organization ||
          card.provider?.url
        );
      };

      const hasProviderData = (provider?: { organization?: string; url?: string }): boolean =>
        !!(provider?.organization || provider?.url);

      const agentCard =
        displayData.agentCard && hasAgentCardData(displayData.agentCard)
          ? create(AIAgent_AgentCardSchema, {
              iconUrl: displayData.agentCard.iconUrl || undefined,
              documentationUrl: displayData.agentCard.documentationUrl || undefined,
              provider:
                displayData.agentCard.provider && hasProviderData(displayData.agentCard.provider)
                  ? create(AIAgent_AgentCard_ProviderSchema, {
                      organization: displayData.agentCard.provider.organization || undefined,
                      url: displayData.agentCard.provider.url || undefined,
                    })
                  : undefined,
              skills: displayData.agentCard.skills.map(sanitizeSkill),
            })
          : undefined;

      await updateAIAgent(
        create(UpdateAIAgentRequestSchema, {
          id,
          aiAgent: create(AIAgentUpdateSchema, {
            displayName: displayData.displayName,
            description: displayData.description,
            model: displayData.model,
            maxIterations: displayData.maxIterations,
            provider: updatedProvider,
            systemPrompt: displayData.systemPrompt,
            serviceAccount: aiAgentData.aiAgent.serviceAccount,
            resources: {
              cpuShares: selectedTier?.cpu || '100m',
              memoryShares: selectedTier?.memory || '400M',
            },
            mcpServers: mcpServersMap,
            subagents: subagentsMap,
            tags: tagsMap,
            gateway: gatewayConfig,
            agentCard,
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
              'gateway',
              'mcp_servers',
              'subagents',
              'tags',
              'agent_card.icon_url',
              'agent_card.documentation_url',
              'agent_card.provider.organization',
              'agent_card.provider.url',
              'agent_card.skills',
            ],
          }),
        }),
        {
          onSuccess: () => {
            toast.success('AI agent updated');
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
  // Includes placeholder objects for servers that no longer exist (deleted)
  const connectedMcpServers = useMemo(() => {
    if (!aiAgentData?.aiAgent?.mcpServers) {
      return [];
    }
    const connectedServerNames = Object.values(aiAgentData.aiAgent.mcpServers).map((server) => server.id);
    const existingServersMap = new Map((mcpServersData?.mcpServers ?? []).map((s) => [s.name, s]));

    return connectedServerNames.map((name) => {
      const existing = existingServersMap.get(name);
      if (existing) {
        return existing;
      }
      // Create placeholder for missing/deleted server
      return create(MCPServerSchema, {
        name,
        description: 'This MCP server no longer exists',
        tools: [],
        enabled: false,
        type: MCPServerType.MCP_SERVER_TYPE_UNSPECIFIED,
        url: '',
      });
    });
  }, [aiAgentData, mcpServersData]);

  if (!(aiAgentData?.aiAgent && displayData)) {
    return null;
  }

  const agent = aiAgentData.aiAgent;

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
                      <Button disabled={isUpdateAIAgentPending} onClick={handleSave} variant="primary">
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
                    <Button onClick={() => setIsEditing(true)} variant="primary">
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
                      <Text>{displayData.displayName}</Text>
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
                      <Text>{displayData.description || 'No description'}</Text>
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
              <CardTitle className="flex w-full items-center gap-2">
                <Settings className="h-4 w-4" />
                <Text className="font-semibold">System Prompt</Text>
                {isEditing && (
                  <MarkdownEditorTabs className="ml-auto" mode={systemPromptMode} onModeChange={setSystemPromptMode} />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {isEditing ? (
                  <MarkdownEditor
                    mode={systemPromptMode}
                    onChange={(value) => updateField({ systemPrompt: value })}
                    value={displayData.systemPrompt}
                  />
                ) : (
                  <MarkdownPreview disabled source={displayData.systemPrompt} />
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
                    {displayData.subagents.map((subagent, index) => {
                      // Compute conditional rendering values using helper functions
                      const descriptionContent = renderSubagentDescription(subagent, index, isEditing);
                      const mcpServersContent = renderSubagentMcpServers(
                        subagent,
                        index,
                        isEditing,
                        availableMcpServers
                      );

                      return (
                        // biome-ignore lint/suspicious/noArrayIndexKey: Using index as key for subagent items
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
                                    <Text>{subagent.name}</Text>
                                  </div>
                                )}
                              </div>

                              {/* Description */}
                              <div className="space-y-2">
                                <Label htmlFor={`subagent-desc-${index}`}>Description</Label>
                                {descriptionContent}
                              </div>

                              {/* System Prompt */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label htmlFor={`subagent-prompt-${index}`}>System Prompt</Label>
                                  {isEditing && (
                                    <MarkdownEditorTabs
                                      mode={subagentPromptModes[index] || 'editor'}
                                      onModeChange={(mode) =>
                                        setSubagentPromptModes((prev) => ({ ...prev, [index]: mode }))
                                      }
                                    />
                                  )}
                                </div>
                                {isEditing ? (
                                  <MarkdownEditor
                                    mode={subagentPromptModes[index] || 'editor'}
                                    onChange={(value) => handleUpdateSubagent(index, 'systemPrompt', value)}
                                    value={subagent.systemPrompt}
                                  />
                                ) : (
                                  <MarkdownPreview disabled source={subagent.systemPrompt} />
                                )}
                              </div>

                              {/* MCP Servers */}
                              <div className="space-y-2">
                                <Label>MCP Servers</Label>
                                {mcpServersContent}
                              </div>

                              {/* Delete button */}
                              {Boolean(isEditing) && (
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
                      );
                    })}
                  </Accordion>
                )}

                {/* Add subagent button */}
                {Boolean(isEditing) && (
                  <Button className="w-full" onClick={handleAddSubagent} type="button" variant="dashed">
                    <Plus className="h-4 w-4" />
                    Add Subagent
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Service Account - Always visible */}
          {Boolean(agent.tags[CLOUD_MANAGED_TAG_KEYS.SERVICE_ACCOUNT_ID]) && (
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
                <ServiceAccountSection serviceAccountId={agent.tags[CLOUD_MANAGED_TAG_KEYS.SERVICE_ACCOUNT_ID]} />
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
                  {/* Provider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="provider">Provider</Label>
                      {isUsingGateway && displayData?.llmProvider && (
                        <a
                          className="flex items-center gap-1 text-primary text-xs hover:underline"
                          href={`/clusters/${config.clusterId}/adp/llm-providers/${displayData.llmProvider}?tab=overview`}
                        >
                          View provider
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {isUsingGateway ? (
                      <Select
                        disabled={isLoadingProviders || availableProviders.length === 0}
                        onValueChange={(value) => {
                          // Find the selected aigw provider to infer the provider type
                          const selectedGwProvider = availableProviders.find((p) => p.id === value);
                          const formTypeId = (
                            selectedGwProvider?.type != null
                              ? (LLM_PROVIDER_TYPE_TO_FORM_ID[selectedGwProvider.type] ?? 'openaiCompatible')
                              : displayData.provider?.provider.case || 'openai'
                          ) as 'openai' | 'anthropic' | 'google' | 'openaiCompatible' | 'bedrock';

                          updateField({
                            llmProvider: value,
                            provider: createUpdatedProvider(formTypeId, '', displayData.baseUrl || ''),
                            model: '',
                          });
                        }}
                        value={displayData?.llmProvider}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingProviders ? 'Loading providers...' : 'Select provider'}>
                            {displayData?.llmProvider &&
                              (() => {
                                const matched = availableProviders.find((p) => p.id === displayData.llmProvider);
                                return (
                                  <div className="flex items-center gap-2">
                                    {matched?.icon && (
                                      <img alt={matched.label} className="h-4 w-4" src={matched.icon} />
                                    )}
                                    <span>{matched?.label || displayData.llmProvider}</span>
                                  </div>
                                );
                              })()}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availableProviders.map((provider) => (
                            <SelectItem key={provider.id} value={provider.id}>
                              <div className="flex items-center gap-2">
                                {provider.icon && <img alt={provider.label} className="h-4 w-4" src={provider.icon} />}
                                <span>{provider.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        disabled={isLoadingProviders}
                        onValueChange={(value: 'openai' | 'anthropic' | 'google' | 'openaiCompatible' | 'bedrock') => {
                          const providerModels = MODEL_OPTIONS_BY_PROVIDER[value]?.models || [];
                          const firstModel =
                            providerModels.length > 0 && providerModels[0]
                              ? providerModels[0].value
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
                          <SelectValue placeholder={isLoadingProviders ? 'Loading providers...' : 'Select provider'}>
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
                          {availableProviders.map((provider) => (
                            <SelectItem key={provider.id} value={provider.id}>
                              <div className="flex items-center gap-2">
                                {provider.icon && <img alt={provider.label} className="h-4 w-4" src={provider.icon} />}
                                <span>{provider.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Model - filtered by provider */}
                  <div className="space-y-2">
                    <Label htmlFor="model">Model</Label>
                    {(!isUsingGateway && displayData.provider?.provider.case === 'openaiCompatible') ||
                    (isUsingGateway && filteredModels.length === 0 && !isLoadingProviders) ? (
                      <Input
                        onChange={(e) => updateField({ model: e.target.value })}
                        placeholder="Enter model name (e.g., llama-3.1-70b)"
                        value={displayData.model}
                      />
                    ) : (
                      <Select
                        disabled={isLoadingProviders}
                        onValueChange={(value) => updateField({ model: value })}
                        value={displayData.model}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingProviders ? 'Loading models...' : 'Select model'}>
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
                          {isLoadingProviders ? (
                            <div className="p-2">
                              <Text variant="muted">Loading models...</Text>
                            </div>
                          ) : filteredModels.length > 0 ? (
                            <SelectGroup>
                              {!isUsingGateway && displayData.provider?.provider.case && (
                                <SelectLabel>
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
                                      {
                                        MODEL_OPTIONS_BY_PROVIDER[
                                          displayData.provider.provider.case as keyof typeof MODEL_OPTIONS_BY_PROVIDER
                                        ]?.label
                                      }
                                    </span>
                                  </div>
                                </SelectLabel>
                              )}
                              {filteredModels.map((model: { value: string; name: string; description: string }) => (
                                <SelectItem key={model.value} value={model.value}>
                                  {model.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ) : (
                            <div className="p-2">
                              <Text variant="muted">No models available</Text>
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* API Token - hide when using gateway */}
                  {!isUsingGateway && (
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
                  )}

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
                      {isUsingGateway && displayData?.llmProvider ? (
                        <a
                          className="flex items-center gap-1.5 text-primary text-sm hover:underline"
                          href={`/clusters/${config.clusterId}/adp/llm-providers/${displayData.llmProvider}?tab=overview`}
                        >
                          {displayData.llmProvider}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <Text>
                          {agent.provider?.provider.case === 'openai' && 'OpenAI'}
                          {agent.provider?.provider.case === 'anthropic' && 'Anthropic'}
                          {agent.provider?.provider.case === 'google' && 'Google'}
                          {agent.provider?.provider.case === 'openaiCompatible' && 'OpenAI Compatible'}
                        </Text>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <AIAgentModel model={displayData.model} />
                    </div>
                  </div>
                  {/* API Token - hide when using gateway */}
                  {!isUsingGateway && (
                    <div className="space-y-2">
                      <Label>API Token</Label>
                      <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <Text>{displayData.apiKeySecret || 'No secret configured'}</Text>
                      </div>
                    </div>
                  )}
                  {agent.provider?.provider.case === 'openaiCompatible' && displayData.baseUrl && (
                    <div className="space-y-2">
                      <Label>Base URL</Label>
                      <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <Text>{displayData.baseUrl}</Text>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Max Iterations</Label>
                    <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <Text>{displayData.maxIterations}</Text>
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
