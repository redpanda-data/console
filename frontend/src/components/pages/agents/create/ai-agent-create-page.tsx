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
import {
  ServiceAccountSelector,
  type ServiceAccountSelectorRef,
} from 'components/ui/service-account/service-account-selector';
import { TagsFieldList } from 'components/ui/tag/tags-field-list';
import { config } from 'config';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import {
  AIAgent_MCPServerSchema,
  AIAgent_Provider_OpenAISchema,
  AIAgent_ProviderSchema,
  AIAgent_ServiceAccountSchema,
  AIAgentCreateSchema,
  CreateAIAgentRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useCreateAIAgentMutation } from 'react-query/api/ai-agent';
import { useListMCPServersQuery } from 'react-query/api/remote-mcp';
import { useCreateSecretMutation, useListSecretsQuery } from 'react-query/api/secret';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { FormSchema, type FormValues, initialValues } from './schemas';
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
  const { mutateAsync: createSecret, isPending: isCreateSecretPending } = useCreateSecretMutation({
    skipInvalidation: true,
  });

  // Ref to ServiceAccountSelector to call createServiceAccount
  const serviceAccountSelectorRef = useRef<ServiceAccountSelectorRef>(null);

  // Track the created service account info and pending state
  const [serviceAccountInfo, setServiceAccountInfo] = useState<{
    secretName: string;
    serviceAccountId: string;
  } | null>(null);
  const [isCreateServiceAccountPending, setIsCreateServiceAccountPending] = useState(false);

  // Form setup - always start with fresh values
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  // Track the display name to auto-generate service account name
  const displayName = form.watch('displayName');
  const serviceAccountName = form.watch('serviceAccountName');

  // Auto-generate service account name when agent name changes
  useEffect(() => {
    if (displayName) {
      const clusterType = config.isServerless ? 'serverless' : 'cluster';
      const sanitizedAgentName = displayName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const generatedName = `${clusterType}-${config.clusterId}-agent-${sanitizedAgentName}-sa`;

      // Only update if the field is empty or matches the previous auto-generated pattern
      const currentValue = form.getValues('serviceAccountName');
      if (!currentValue || currentValue.startsWith(`${clusterType}-${config.clusterId}-agent-`)) {
        form.setValue('serviceAccountName', generatedName, { shouldValidate: false });
      }
    }
  }, [displayName, form]);

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

  // Get available MCP servers (all servers, regardless of state)
  const availableMcpServers = useMemo(() => {
    if (!mcpServersData?.mcpServers) {
      return [];
    }
    return mcpServersData.mcpServers;
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

  const createServiceAccountIfNeeded = async (
    agentName: string
  ): Promise<{ secretName: string; serviceAccountId: string } | null> => {
    // If we already created one in this session, use it
    if (serviceAccountInfo) {
      return serviceAccountInfo;
    }

    // Call the ServiceAccountSelector to create the service account
    if (!serviceAccountSelectorRef.current) {
      toast.error('Service account selector not initialized');
      return null;
    }

    // The pending state is automatically tracked via onPendingChange callback
    const result = await serviceAccountSelectorRef.current.createServiceAccount(agentName);

    if (result) {
      setServiceAccountInfo(result);
    }

    return result;
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

    // Create service account if needed
    const serviceAccountResult = await createServiceAccountIfNeeded(values.displayName);
    if (!serviceAccountResult) {
      return; // Error already shown by createServiceAccountIfNeeded
    }

    const { secretName, serviceAccountId } = serviceAccountResult;

    // Add service_account_id and secret_id to tags for easy deletion
    tagsMap.service_account_id = serviceAccountId;
    tagsMap.secret_id = secretName;

    const serviceAccountConfig = create(AIAgent_ServiceAccountSchema, {
      clientId: `\${secrets.${secretName}.client_id}`,
      clientSecret: `\${secrets.${secretName}.client_secret}`,
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
        <Heading level={1}>Create New Agent</Heading>
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

            {/* Prompt */}
            <Card size="full">
              <CardHeader>
                <CardTitle>Prompt</CardTitle>
                <Text variant="muted">Define the agent's behavior and instructions</Text>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="systemPrompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>System Prompt</FormLabel>
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
                <div className="space-y-2">
                  <label className="font-medium text-sm" htmlFor="serviceAccountName">
                    Service Account Name
                  </label>
                  <Input
                    id="serviceAccountName"
                    onChange={(e) => form.setValue('serviceAccountName', e.target.value, { shouldValidate: true })}
                    placeholder="e.g., cluster-abc123-agent-my-agent-sa"
                    value={serviceAccountName}
                  />
                  <Text className="text-sm" variant="muted">
                    This service account will be created automatically when you create the AI agent.
                  </Text>
                </div>
              </CardContent>
            </Card>
            <ServiceAccountSelector
              createSecret={createSecret}
              onPendingChange={setIsCreateServiceAccountPending}
              ref={serviceAccountSelectorRef}
              resourceType="AI agent"
              serviceAccountName={serviceAccountName}
            />

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  navigate('/agents');
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={
                  !form.formState.isValid ||
                  isCreateAgentPending ||
                  isCreateServiceAccountPending ||
                  isCreateSecretPending
                }
                type="submit"
              >
                {isCreateAgentPending || isCreateServiceAccountPending || isCreateSecretPending ? (
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
