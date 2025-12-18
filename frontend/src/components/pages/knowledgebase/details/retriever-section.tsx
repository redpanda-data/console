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
import { Shuffle } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import { Scope } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import {
  type KnowledgeBase,
  type KnowledgeBaseUpdate,
  KnowledgeBaseUpdate_Retriever_Reranker_Provider_CohereSchema,
  KnowledgeBaseUpdate_Retriever_Reranker_ProviderSchema,
  KnowledgeBaseUpdate_Retriever_RerankerSchema,
  KnowledgeBaseUpdate_RetrieverSchema,
} from '../../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useListSecretsQuery } from '../../../../react-query/api/secret';
import { Card, CardContent, CardHeader, CardTitle } from '../../../redpanda-ui/components/card';
import { Checkbox } from '../../../redpanda-ui/components/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../../redpanda-ui/components/field';
import { FormItem, FormLabel } from '../../../redpanda-ui/components/form';
import { Input } from '../../../redpanda-ui/components/input';
import { Text } from '../../../redpanda-ui/components/typography';
import { COHERE_RERANKER_MODELS } from '../../../ui/ai/ai-constants';
import { RerankerModelSelect } from '../../../ui/ai/reranker-model-select';
import { SecretSelector } from '../../../ui/secret/secret-selector';
import { extractSecretName, formatSecretTemplate } from '../../../ui/secret/secret-utils';

type KnowledgeBaseUpdateForm = KnowledgeBaseUpdate & {
  indexer?: KnowledgeBaseUpdate['indexer'] & {
    exactTopics?: string[];
    regexPatterns?: string[];
  };
};

type RetrieverSectionProps = {
  knowledgeBase: KnowledgeBase;
  isEditMode: boolean;
};

export const RetrieverSection = ({ knowledgeBase, isEditMode }: RetrieverSectionProps) => {
  const { control, watch, setValue, getValues } = useFormContext<KnowledgeBaseUpdateForm>();
  const formData = watch();
  const { data: secretsData } = useListSecretsQuery();

  const availableSecrets =
    secretsData?.secrets
      ?.filter((secret) => secret !== undefined)
      .map((secret) => ({
        id: secret.id,
        name: secret.id,
      })) || [];

  const retriever = knowledgeBase.retriever;
  const reranker = retriever?.reranker;

  // Initialize reranker with default values when enabled
  // biome-ignore lint/correctness/useExhaustiveDependencies: We only want to run this when reranker is enabled/disabled or provider changes, not when entire retriever object changes
  useEffect(() => {
    const rerankerEnabled = formData.retriever?.reranker?.enabled;
    const hasRerankerProvider = formData.retriever?.reranker?.provider?.provider.case;

    // If reranker is enabled but not initialized, set default values
    if (isEditMode && rerankerEnabled && !hasRerankerProvider) {
      // Initialize retriever if needed
      if (!formData.retriever) {
        setValue('retriever', create(KnowledgeBaseUpdate_RetrieverSchema, {}), { shouldDirty: true });
      }

      // Initialize reranker structure with default Cohere provider and model
      setValue(
        'retriever.reranker',
        create(KnowledgeBaseUpdate_Retriever_RerankerSchema, {
          enabled: true,
          provider: create(KnowledgeBaseUpdate_Retriever_Reranker_ProviderSchema, {
            provider: {
              case: 'cohere',
              value: create(KnowledgeBaseUpdate_Retriever_Reranker_Provider_CohereSchema, {
                model: COHERE_RERANKER_MODELS[0].name, // Default to first model (rerank-v3.5)
                apiKey: '',
              }),
            },
          }),
        }),
        { shouldDirty: true }
      );
    }
  }, [formData.retriever?.reranker?.enabled, formData.retriever?.reranker?.provider, isEditMode, setValue]);

  // Ensure reranker provider is properly initialized when entering edit mode with existing reranker
  // This should only run once when entering edit mode to avoid overwriting user changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: We only want to run this once when entering edit mode
  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    const hasRerankerProvider = formData.retriever?.reranker?.provider?.provider.case;
    const rerankerEnabled = formData.retriever?.reranker?.enabled;

    // If reranker is enabled and exists in server data but provider structure is missing in form, re-initialize
    if (rerankerEnabled && !hasRerankerProvider && reranker?.provider?.provider.case === 'cohere') {
      const apiKey = reranker.provider.provider.value.apiKey || '';
      const model = reranker.provider.provider.value.model || COHERE_RERANKER_MODELS[0].name;

      // Use shouldDirty: false because this is just initialization, not a user change
      // Need to set the entire retriever.reranker structure to ensure proper tracking
      setValue(
        'retriever.reranker',
        create(KnowledgeBaseUpdate_Retriever_RerankerSchema, {
          enabled: true,
          provider: create(KnowledgeBaseUpdate_Retriever_Reranker_ProviderSchema, {
            provider: {
              case: 'cohere',
              value: create(KnowledgeBaseUpdate_Retriever_Reranker_Provider_CohereSchema, {
                model,
                apiKey,
              }),
            },
          }),
        }),
        { shouldDirty: false }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]);

  return (
    <Card className="px-0 py-0" size="full">
      <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2">
          <Shuffle className="h-4 w-4" />
          <Text className="font-semibold">Retriever</Text>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-col gap-4">
          {isEditMode ? (
            <>
              <Controller
                control={control}
                name="retriever.reranker.enabled"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    <div className="space-y-1">
                      <FieldLabel className="mb-0 font-medium">Enable Reranker (Recommended)</FieldLabel>
                      <FieldDescription>
                        Reranker improves search quality by reordering retrieved documents based on relevance.
                      </FieldDescription>
                    </div>
                  </div>
                )}
              />

              {Boolean(formData.retriever?.reranker?.enabled) && (
                <>
                  <Field>
                    <FieldLabel required>Model</FieldLabel>
                    <RerankerModelSelect
                      models={COHERE_RERANKER_MODELS}
                      onValueChange={(value) => {
                        // Get current form state synchronously to avoid stale closure
                        const currentFormState = getValues();

                        // Extract current API key to preserve it when updating model
                        const currentApiKey =
                          currentFormState.retriever?.reranker?.provider?.provider.case === 'cohere'
                            ? currentFormState.retriever.reranker.provider.provider.value.apiKey
                            : '';

                        // Rebuild entire retriever structure with new model and preserved API key
                        // Update at 'retriever' level to ensure updateMask path is correct for backend
                        setValue(
                          'retriever',
                          create(KnowledgeBaseUpdate_RetrieverSchema, {
                            reranker: create(KnowledgeBaseUpdate_Retriever_RerankerSchema, {
                              enabled: true,
                              provider: create(KnowledgeBaseUpdate_Retriever_Reranker_ProviderSchema, {
                                provider: {
                                  case: 'cohere',
                                  value: create(KnowledgeBaseUpdate_Retriever_Reranker_Provider_CohereSchema, {
                                    model: value,
                                    apiKey: currentApiKey || '',
                                  }),
                                },
                              }),
                            }),
                          }),
                          {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: true,
                          }
                        );
                      }}
                      placeholder="Select reranker model"
                      value={
                        formData.retriever?.reranker?.provider?.provider.case === 'cohere'
                          ? formData.retriever.reranker.provider.provider.value.model || ''
                          : ''
                      }
                    />
                  </Field>

                  <Controller
                    control={control}
                    name="retriever"
                    render={({ field, fieldState }) => {
                      const currentApiKey =
                        field.value?.reranker?.provider?.provider.case === 'cohere'
                          ? field.value.reranker.provider.provider.value.apiKey
                          : '';
                      const currentModel =
                        field.value?.reranker?.provider?.provider.case === 'cohere'
                          ? field.value.reranker.provider.provider.value.model
                          : '';

                      return (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel required>API Key</FieldLabel>
                          <FieldDescription>All credentials are securely stored in your Secrets Store</FieldDescription>
                          <SecretSelector
                            availableSecrets={availableSecrets}
                            customText={{
                              dialogDescription: 'Create a new secret for your Cohere API key',
                              secretNamePlaceholder: 'e.g., COHERE_API_KEY',
                              secretValuePlaceholder: 'Enter API key',
                              secretValueDescription: 'Your Cohere API key',
                              emptyStateDescription: 'Create a secret to securely store your Cohere API key',
                            }}
                            onChange={(secretId) => {
                              // Rebuild retriever structure with new API key
                              field.onChange(
                                create(KnowledgeBaseUpdate_RetrieverSchema, {
                                  reranker: create(KnowledgeBaseUpdate_Retriever_RerankerSchema, {
                                    enabled: true,
                                    provider: create(KnowledgeBaseUpdate_Retriever_Reranker_ProviderSchema, {
                                      provider: {
                                        case: 'cohere',
                                        value: create(KnowledgeBaseUpdate_Retriever_Reranker_Provider_CohereSchema, {
                                          model: currentModel || '',
                                          apiKey: formatSecretTemplate(secretId),
                                        }),
                                      },
                                    }),
                                  }),
                                })
                              );
                            }}
                            placeholder="Select Cohere API key from secrets"
                            scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                            value={extractSecretName(currentApiKey || '')}
                          />
                          {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      );
                    }}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <FormItem>
                <div className="flex items-center gap-2">
                  <Checkbox checked={reranker?.enabled} disabled={true} />
                  <FormLabel className="mb-0 font-medium">Enable Reranker (Recommended)</FormLabel>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">
                  Reranker improves search quality by reordering retrieved documents based on relevance.
                </p>
              </FormItem>

              {reranker?.enabled && reranker.provider && reranker.provider.provider.case === 'cohere' && (
                <>
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <RerankerModelSelect
                      disabled={true}
                      models={COHERE_RERANKER_MODELS}
                      onValueChange={() => {
                        // Read-only field, no action needed
                      }}
                      placeholder="Select reranker model"
                      value={reranker.provider.provider.value.model}
                    />
                  </FormItem>
                  <div className="space-y-2">
                    <FormLabel>API Key</FormLabel>
                    <Input
                      disabled
                      value={extractSecretName(reranker.provider.provider.value.apiKey || '') || 'Not configured'}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
