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

'use client';

import { create } from '@bufbuild/protobuf';
import type { ConnectError } from '@connectrpc/connect';
import { Code as ConnectCode } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import {
  Form,
  FormContainer,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
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
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { RESOURCE_TIERS, ResourceTierSelect } from 'components/ui/connect/resource-tier-select';
import { MCPEmpty } from 'components/ui/mcp/mcp-empty';
import { MCPServerCardList } from 'components/ui/mcp/mcp-server-card';
import { SecretSelector } from 'components/ui/secret/secret-selector';
import { ServiceAccountSelector } from 'components/ui/service-account/service-account-selector';
import { TagsFieldList } from 'components/ui/tag/tags-field-list';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Scope, type Secret } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import {
  AIAgent_MCPServerSchema,
  AIAgent_Provider_OpenAISchema,
  AIAgent_ProviderSchema,
  AIAgent_ServiceAccountSchema,
  AIAgentCreateSchema,
  CreateAIAgentRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { MCPServer_State } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useCreateAIAgentMutation } from 'react-query/api/ai-agent';
import { useListMCPServersQuery } from 'react-query/api/remote-mcp';
import { useCreateSecretMutation, useListSecretsQuery } from 'react-query/api/secret';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { FormSchema, type FormValues, initialValues } from './schemas';
import { AIAgentBackButton } from '../ai-agent-back-button';
import { MODEL_OPTIONS_BY_PROVIDER, PROVIDER_INFO } from '../ai-agent-model';

/**
 * Detects the provider for a given model name using pattern matching
 * Allows handling any model from supported providers (e.g., gpt-4, gpt-4-turbo, o1-preview, claude-3-opus, etc.)
 */
const detectProvider = (modelName: string): (typeof PROVIDER_INFO)[keyof typeof PROVIDER_INFO] | null => {
  for (const provider of Object.values(PROVIDER_INFO)) {
    if (provider.modelPattern.test(modelName)) {
      return provider;
    }
  }
  return null;
};

export const AIAgentCreatePage = () => {
  const navigate = useNavigate();
  const { mutateAsync: createAgent, isPending: isCreateAgentPending } = useCreateAIAgentMutation();
  const { data: secretsData } = useListSecretsQuery();
  const { data: mcpServersData } = useListMCPServersQuery();
  const { mutateAsync: createSecret, isPending: isCreateSecretPending } = useCreateSecretMutation();

  // Form setup
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  const {
    fields: tagFields,
    append: appendTag,
    remove: removeTag,
  } = useFieldArray({
    control: form.control,
    name: 'tags',
  });

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

  // Auto-detect and prefill OpenAI secret
  useEffect(() => {
    // Only auto-select if the field is currently empty
    if (form.getValues('apiKeySecret')) {
      return;
    }

    // Find the first secret with "OPENAI" in its name (case-insensitive)
    const openAISecret = availableSecrets.find((secret) => secret.id.toUpperCase().includes('OPENAI'));

    // If found, set it as the default value
    if (openAISecret) {
      form.setValue('apiKeySecret', openAISecret.id);
    }
  }, [availableSecrets, form]);

  // Get available MCP servers (only running servers)
  const availableMcpServers = useMemo(() => {
    if (!mcpServersData?.mcpServers) {
      return [];
    }
    return mcpServersData.mcpServers.filter((server) => server.state === MCPServer_State.RUNNING);
  }, [mcpServersData]);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 36, refactor later
  const handleValidationError = (error: ConnectError) => {
    if (error.code === ConnectCode.InvalidArgument && error.details) {
      // Find BadRequest details
      const badRequest = error.details.find(
        (detail) => (detail as { type?: string }).type === 'google.rpc.BadRequest'
      ) as { debug?: { fieldViolations?: Array<{ field: string; description: string }> } } | undefined;
      if (badRequest?.debug?.fieldViolations) {
        // Set form errors for specific fields
        for (const violation of badRequest.debug.fieldViolations) {
          const { field, description } = violation;

          // Map server field names to form field names
          if (field === 'ai_agent.display_name') {
            form.setError('displayName', {
              type: 'server',
              message: description,
            });
            toast.error(`Agent Name: ${description}`);
          } else if (field === 'ai_agent.description') {
            form.setError('description', {
              type: 'server',
              message: description,
            });
            toast.error(`Description: ${description}`);
          } else if (field === 'ai_agent.system_prompt') {
            form.setError('systemPrompt', {
              type: 'server',
              message: description,
            });
            toast.error(`System Prompt: ${description}`);
          } else if (field === 'ai_agent.model') {
            form.setError('model', {
              type: 'server',
              message: description,
            });
            toast.error(`Model: ${description}`);
          } else if (field === 'ai_agent.provider.openai.api_key') {
            form.setError('apiKeySecret', {
              type: 'server',
              message: description,
            });
            toast.error(`API Key: ${description}`);
          } else {
            // Generic field error
            toast.error(`${field}: ${description}`);
          }
        }
        return;
      }
    }

    // Fallback to generic error message
    toast.error(formatToastErrorMessageGRPC({ error, action: 'create', entity: 'AI agent' }));
  };

  const onSubmit = async (values: FormValues) => {
    // Build tags map from labels
    const tagsMap: Record<string, string> = {};
    for (const label of values.tags) {
      const key = label.key?.trim();
      if (key) {
        tagsMap[key] = (label.value ?? '').trim();
      }
    }

    // Build MCP servers map
    const mcpServersMap: Record<string, { id: string }> = {};
    for (const serverId of values.selectedMcpServers) {
      mcpServersMap[serverId] = create(AIAgent_MCPServerSchema, { id: serverId });
    }

    // Get selected resource tier
    const selectedTier = RESOURCE_TIERS.find((tier) => tier.id === values.resourcesTier);

    // Check if service account secrets exist (required)
    const hasServiceAccountSecrets =
      secretsData?.secrets?.some((s) => s?.id === 'SERVICE_ACCOUNT_CLIENT_ID') &&
      secretsData?.secrets?.some((s) => s?.id === 'SERVICE_ACCOUNT_CLIENT_SECRET');

    if (!hasServiceAccountSecrets) {
      toast.error('Service account is required. Please create a service account first.');
      return;
    }

    const serviceAccountConfig = create(AIAgent_ServiceAccountSchema, {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Secret reference syntax for API
      clientId: '${secrets.SERVICE_ACCOUNT_CLIENT_ID}',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Secret reference syntax for API
      clientSecret: '${secrets.SERVICE_ACCOUNT_CLIENT_SECRET}',
    });

    await createAgent(
      create(CreateAIAgentRequestSchema, {
        aiAgent: create(AIAgentCreateSchema, {
          displayName: values.displayName.trim(),
          description: values.description?.trim() ?? '',
          systemPrompt: values.systemPrompt.trim(),
          model: values.model.trim(),
          provider: create(AIAgent_ProviderSchema, {
            provider: {
              case: 'openai',
              value: create(AIAgent_Provider_OpenAISchema, {
                apiKey: `\${secrets.${values.apiKeySecret}}`,
              }),
            },
          }),
          maxIterations: values.maxIterations,
          mcpServers: mcpServersMap,
          tags: tagsMap,
          resources: {
            cpuShares: selectedTier?.cpu || '200m',
            memoryShares: selectedTier?.memory || '800M',
          },
          serviceAccount: serviceAccountConfig,
        }),
      }),
      {
        onError: handleValidationError,
        onSuccess: (data) => {
          if (data?.aiAgent?.id) {
            toast.success('AI agent created successfully');
            navigate(`/agents/${data.aiAgent.id}`);
          }
        },
      }
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="space-y-4">
        <AIAgentBackButton />
        <div className="space-y-2">
          <Heading level={1}>Create New Agent</Heading>
          <Text variant="muted">Set up a new AI agent from scratch</Text>
        </div>
      </div>

      <Form {...form}>
        <FormContainer className="w-full" layout="default" onSubmit={form.handleSubmit(onSubmit)} width="full">
          <div className="space-y-4">
            {/* Basic Information and OpenAI Configuration - Side by Side */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Basic Information */}
              <Card size="full">
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                  <Text variant="muted">Configure the basic details of your agent</Text>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Agent Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Customer Support Bot" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Describe what this agent does and its purpose..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="resourcesTier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Resources</FormLabel>
                          <FormControl>
                            <ResourceTierSelect onValueChange={field.onChange} value={field.value} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <TagsFieldList
                      appendTag={appendTag}
                      fieldName="tags"
                      form={form}
                      removeTag={removeTag}
                      tagFields={tagFields}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* OpenAI Configuration */}
              <Card size="full">
                <CardHeader>
                  <CardTitle>OpenAI Configuration</CardTitle>
                  <Text variant="muted">Configure the AI model and authentication</Text>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="apiKeySecret"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>OpenAI API Token</FormLabel>
                          <FormControl>
                            <SecretSelector
                              availableSecrets={availableSecrets}
                              onChange={field.onChange}
                              placeholder="Select from secrets store or create new"
                              scopes={[Scope.MCP_SERVER, Scope.AI_AGENT]}
                              value={field.value}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="model"
                      render={({ field }) => {
                        // Use pattern matching to detect provider (works for ANY model from that provider)
                        const detectedProvider = field.value ? detectProvider(field.value) : null;

                        return (
                          <FormItem>
                            <FormLabel required>Model</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select AI model">
                                    {field.value && detectedProvider ? (
                                      <div className="flex items-center gap-2">
                                        <img
                                          alt={detectedProvider.label}
                                          className="h-4 w-4"
                                          src={detectedProvider.icon}
                                        />
                                        <span>{field.value}</span>
                                      </div>
                                    ) : (
                                      'Select AI model'
                                    )}
                                  </SelectValue>
                                </SelectTrigger>
                              </FormControl>
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
                            <Text variant="muted">
                              See{' '}
                              <a
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                                href="https://platform.openai.com/docs/models/overview"
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                OpenAI models <ExternalLink className="h-3 w-3" />
                              </a>{' '}
                              for available models.
                            </Text>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />

                    <FormField
                      control={form.control}
                      name="maxIterations"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>Max Iterations</FormLabel>
                            <Text className="font-medium text-sm">{field.value}</Text>
                          </div>
                          <FormControl>
                            <Slider
                              max={100}
                              min={10}
                              onValueChange={(values) => field.onChange(values[0])}
                              value={[field.value]}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* System Prompt */}
            <Card size="full">
              <CardHeader>
                <CardTitle>System Prompt</CardTitle>
                <Text variant="muted">Define the agent's behavior and instructions</Text>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="systemPrompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea placeholder="You are a helpful AI agent that..." rows={8} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* MCP Tools */}
            <Card size="full">
              <CardHeader>
                <CardTitle>MCP Tools</CardTitle>
                <Text variant="muted">Select MCP servers to enable tools for this agent</Text>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* MCP Servers */}
                  <FormField
                    control={form.control}
                    name="selectedMcpServers"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          {availableMcpServers.length > 0 ? (
                            <MCPServerCardList
                              onValueChange={field.onChange}
                              servers={availableMcpServers}
                              value={field.value || []}
                            />
                          ) : (
                            <MCPEmpty>
                              <Text className="mb-4 text-center" variant="muted">
                                Create MCP servers first to enable additional tools for your AI agent
                              </Text>
                            </MCPEmpty>
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Service Account */}
            <Card size="full">
              <CardHeader>
                <CardTitle>Service Account</CardTitle>
                <Text variant="muted">Create a service account for agent authentication</Text>
              </CardHeader>
              <CardContent>
                <ServiceAccountSelector
                  createSecret={createSecret}
                  existingSecrets={(secretsData?.secrets ?? []) as Secret[]}
                  isCreateSecretPending={isCreateSecretPending}
                  placeholder="Select service account or create new"
                  value=""
                />
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button onClick={() => navigate('/agents')} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={isCreateAgentPending} type="submit">
                {isCreateAgentPending ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <Text as="span">Creating...</Text>
                  </div>
                ) : (
                  'Create Agent'
                )}
              </Button>
            </div>
          </div>
        </FormContainer>
      </Form>
    </div>
  );
};
