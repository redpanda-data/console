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
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { LLMConfigSection } from 'components/ui/ai-agent/llm-config-section';
import { RESOURCE_TIERS, ResourceTierSelect } from 'components/ui/connect/resource-tier-select';
import { MCPEmpty } from 'components/ui/mcp/mcp-empty';
import { MCPServerCardList } from 'components/ui/mcp/mcp-server-card';
import {
  ServiceAccountSelector,
  type ServiceAccountSelectorRef,
} from 'components/ui/service-account/service-account-selector';
import { TagsFieldList } from 'components/ui/tag/tags-field-list';
import { Loader2 } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import {
  AIAgent_MCPServerSchema,
  type AIAgent_Provider,
  AIAgent_Provider_AnthropicSchema,
  AIAgent_Provider_GoogleSchema,
  AIAgent_Provider_OpenAICompatibleSchema,
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
import {
  addServiceAccountTags,
  generateServiceAccountName,
  getServiceAccountNamePrefix,
} from 'utils/service-account.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { FormSchema, type FormValues, initialValues } from './schemas';

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
      const generatedName = generateServiceAccountName(displayName, 'agent');
      const currentValue = form.getValues('serviceAccountName');
      const prefix = getServiceAccountNamePrefix('agent');

      // Only update if the field is empty or matches the previous auto-generated pattern
      if (!currentValue || currentValue.startsWith(prefix)) {
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

  // Auto-detect and prefill API key secret based on provider
  const selectedProvider = form.watch('provider');
  useEffect(() => {
    // Only auto-select if the field is currently empty
    if (form.getValues('apiKeySecret')) {
      return;
    }

    // Find the first secret matching the selected provider
    const providerKeyword = selectedProvider.toUpperCase();
    const providerSecret = availableSecrets.find((secret) => secret.id.toUpperCase().includes(providerKeyword));

    // If found, set it as the default value
    if (providerSecret) {
      form.setValue('apiKeySecret', providerSecret.id);
    }
  }, [availableSecrets, selectedProvider, form]);

  // Get available MCP servers (all servers, regardless of state)
  const availableMcpServers = useMemo(() => {
    if (!mcpServersData?.mcpServers) {
      return [];
    }
    return mcpServersData.mcpServers;
  }, [mcpServersData]);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
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
          } else if (
            field === 'ai_agent.provider.openai.api_key' ||
            field === 'ai_agent.provider.anthropic.api_key' ||
            field === 'ai_agent.provider.google.api_key' ||
            field === 'ai_agent.provider.openai_compatible.api_key'
          ) {
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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
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

    // Add system-generated service account tags
    addServiceAccountTags(tagsMap, serviceAccountId, secretName);

    const serviceAccountConfig = create(AIAgent_ServiceAccountSchema, {
      clientId: `\${secrets.${secretName}.client_id}`,
      clientSecret: `\${secrets.${secretName}.client_secret}`,
    });

    // Build provider configuration based on selected provider
    const apiKeyRef = `\${secrets.${values.apiKeySecret}}`;
    let providerConfig: AIAgent_Provider;

    switch (values.provider) {
      case 'anthropic':
        providerConfig = create(AIAgent_ProviderSchema, {
          provider: {
            case: 'anthropic',
            value: create(AIAgent_Provider_AnthropicSchema, {
              apiKey: apiKeyRef,
              baseUrl: values.baseUrl || undefined,
            }),
          },
        });
        break;
      case 'google':
        providerConfig = create(AIAgent_ProviderSchema, {
          provider: {
            case: 'google',
            value: create(AIAgent_Provider_GoogleSchema, {
              apiKey: apiKeyRef,
              baseUrl: values.baseUrl || undefined,
            }),
          },
        });
        break;
      case 'openaiCompatible':
        providerConfig = create(AIAgent_ProviderSchema, {
          provider: {
            case: 'openaiCompatible',
            value: create(AIAgent_Provider_OpenAICompatibleSchema, {
              apiKey: apiKeyRef,
              baseUrl: values.baseUrl,
            }),
          },
        });
        break;
      default: // openai
        providerConfig = create(AIAgent_ProviderSchema, {
          provider: {
            case: 'openai',
            value: create(AIAgent_Provider_OpenAISchema, {
              apiKey: apiKeyRef,
              baseUrl: values.baseUrl || undefined,
            }),
          },
        });
    }

    await createAgent(
      create(CreateAIAgentRequestSchema, {
        aiAgent: create(AIAgentCreateSchema, {
          displayName: values.displayName.trim(),
          description: values.description?.trim() ?? '',
          systemPrompt: values.systemPrompt.trim(),
          model: values.model.trim(),
          provider: providerConfig,
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
                            <Input {...field} />
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

              {/* LLM Provider Configuration */}
              <Card size="full">
                <CardHeader>
                  <CardTitle>LLM Provider Configuration</CardTitle>
                  <Text variant="muted">Configure the AI model and authentication</Text>
                </CardHeader>
                <CardContent>
                  <LLMConfigSection
                    availableSecrets={availableSecrets}
                    fieldNames={{
                      provider: 'provider',
                      model: 'model',
                      apiKeySecret: 'apiKeySecret',
                      baseUrl: 'baseUrl',
                      maxIterations: 'maxIterations',
                    }}
                    form={form}
                    mode="create"
                    scopes={[Scope.MCP_SERVER, Scope.AI_AGENT]}
                    showBaseUrl={form.watch('provider') === 'openaiCompatible'}
                    showMaxIterations={true}
                  />
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
