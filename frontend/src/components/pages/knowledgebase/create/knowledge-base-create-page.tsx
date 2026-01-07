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
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from 'components/redpanda-ui/components/button';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { Loader2 } from 'lucide-react';
import { runInAction } from 'mobx';
import {
  CreateKnowledgeBaseRequestSchema,
  KnowledgeBaseCreate_EmbeddingGenerator_Provider_CohereSchema,
  KnowledgeBaseCreate_EmbeddingGenerator_Provider_OpenAISchema,
  KnowledgeBaseCreate_EmbeddingGenerator_ProviderSchema,
  KnowledgeBaseCreate_EmbeddingGeneratorSchema,
  KnowledgeBaseCreate_Generation_Provider_OpenAISchema,
  KnowledgeBaseCreate_Generation_ProviderSchema,
  KnowledgeBaseCreate_GenerationSchema,
  KnowledgeBaseCreate_IndexerSchema,
  KnowledgeBaseCreate_Retriever_Reranker_Provider_CohereSchema,
  KnowledgeBaseCreate_Retriever_Reranker_ProviderSchema,
  KnowledgeBaseCreate_Retriever_RerankerSchema,
  KnowledgeBaseCreate_RetrieverSchema,
  KnowledgeBaseCreate_VectorDatabase_PostgresSchema,
  KnowledgeBaseCreate_VectorDatabaseSchema,
  KnowledgeBaseCreateSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useCreateKnowledgeBaseMutation } from 'react-query/api/knowledge-base';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { BasicInformationSection } from './basic-information-section';
import { EmbeddingGeneratorSection } from './embedding-generator-section';
import { IndexerSection } from './indexer-section';
import { RetrievalSection } from './retrieval-section';
import {
  initialValues,
  KnowledgeBaseCreateFormSchema,
  type KnowledgeBaseCreateFormValues,
  markAsRegexPattern,
} from './schemas';
import { VectorDatabaseSection } from './vector-database-section';

export const KnowledgeBaseCreatePage = () => {
  const navigate = useNavigate();
  const { mutateAsync: createKnowledgeBase, isPending: isCreating } = useCreateKnowledgeBaseMutation();
  const { data: secretsData } = useListSecretsQuery();

  // Form setup
  const form = useForm<KnowledgeBaseCreateFormValues>({
    resolver: zodResolver(KnowledgeBaseCreateFormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  // Watch form values for dynamic updates
  const embeddingProvider = form.watch('embeddingProvider');
  const rerankerEnabled = form.watch('rerankerEnabled');

  // Tags field array
  const {
    fields: tagFields,
    append: appendTag,
    remove: removeTag,
  } = useFieldArray({
    control: form.control,
    name: 'tags',
  });

  // Update page title and breadcrumbs
  useEffect(() => {
    runInAction(() => {
      uiState.pageTitle = 'Create Knowledge Base';
      uiState.pageBreadcrumbs.pop();
      uiState.pageBreadcrumbs.push({
        title: 'Knowledge Bases',
        linkTo: '/knowledgebases',
      });
      uiState.pageBreadcrumbs.push({
        title: 'Create',
        linkTo: '/knowledgebases/create',
      });
    });
  }, []);

  // Get available secrets
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

  // Auto-populate secrets fields based on name patterns
  useEffect(() => {
    if (availableSecrets.length === 0) {
      return;
    }

    // Helper function to find a secret by pattern (case-insensitive)
    const findSecretByPattern = (pattern: string): string | undefined => {
      const upperPattern = pattern.toUpperCase();

      // First try to find an exact match
      const exactMatch = availableSecrets.find((s) => s.id.toUpperCase() === upperPattern);
      if (exactMatch) {
        return exactMatch.id;
      }

      // Then try to find a secret containing the pattern
      const patternMatch = availableSecrets.find((s) => s.id.toUpperCase().includes(upperPattern));
      if (patternMatch) {
        return patternMatch.id;
      }

      return;
    };

    // Map fields to their pattern keywords
    const fieldPatternMappings: Record<string, string> = {
      postgresDsn: 'POSTGRES',
      openaiApiKey: 'OPENAI',
      cohereApiKey: 'COHERE',
      rerankerApiKey: 'COHERE', // TODO: Update once we have more reranker providers
      redpandaPassword: 'PASSWORD',
    };

    for (const [fieldName, pattern] of Object.entries(fieldPatternMappings)) {
      const currentValue = form.getValues(fieldName as keyof KnowledgeBaseCreateFormValues) as string;

      // Only auto-populate if field is empty
      if (!currentValue || currentValue.trim() === '') {
        const matchingSecret = findSecretByPattern(pattern);
        if (matchingSecret) {
          form.setValue(fieldName as keyof KnowledgeBaseCreateFormValues, matchingSecret as never);
        }
      }
    }
  }, [availableSecrets, form]);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
  const buildKnowledgeBaseCreate = (values: KnowledgeBaseCreateFormValues) => {
    // Convert tags array to object format
    const tagsMap: Record<string, string> = {};
    for (const tag of values.tags) {
      if (tag.key && tag.value) {
        tagsMap[tag.key] = tag.value;
      }
    }

    // Create vector database configuration
    const vectorDatabase = create(KnowledgeBaseCreate_VectorDatabaseSchema, {
      vectorDatabase: {
        case: 'postgres',
        value: create(KnowledgeBaseCreate_VectorDatabase_PostgresSchema, {
          dsn: values.postgresDsn,
          table: values.postgresTable,
        }),
      },
    });

    // Create embedding generator provider
    let generatorProvider: ReturnType<typeof create<typeof KnowledgeBaseCreate_EmbeddingGenerator_ProviderSchema>>;
    if (values.embeddingProvider === 'openai') {
      generatorProvider = create(KnowledgeBaseCreate_EmbeddingGenerator_ProviderSchema, {
        provider: {
          case: 'openai',
          value: create(KnowledgeBaseCreate_EmbeddingGenerator_Provider_OpenAISchema, {
            apiKey: values.openaiApiKey || '',
          }),
        },
      });
    } else {
      generatorProvider = create(KnowledgeBaseCreate_EmbeddingGenerator_ProviderSchema, {
        provider: {
          case: 'cohere',
          value: create(KnowledgeBaseCreate_EmbeddingGenerator_Provider_CohereSchema, {
            apiKey: values.cohereApiKey || '',
          }),
        },
      });
    }

    // Create embedding generator configuration
    const embeddingGenerator = create(KnowledgeBaseCreate_EmbeddingGeneratorSchema, {
      provider: generatorProvider,
      dimensions: values.embeddingDimensions,
      model: values.embeddingModel,
    });

    // Create indexer configuration
    // Combine exactTopics and regexPatterns, filtering out empty strings
    // Add 'regex:' prefix to regex patterns so backend can differentiate them
    const inputTopics = [
      ...values.exactTopics.filter((topic) => topic && topic.trim() !== ''),
      ...values.regexPatterns
        .filter((pattern) => pattern && pattern.trim() !== '')
        .map((pattern) => markAsRegexPattern(pattern)),
    ];

    const indexer = create(KnowledgeBaseCreate_IndexerSchema, {
      chunkSize: values.chunkSize,
      chunkOverlap: values.chunkOverlap,
      inputTopics,
      redpandaUsername: values.redpandaUsername || '',
      redpandaPassword: values.redpandaPassword || '',
      redpandaSaslMechanism: values.redpandaSaslMechanism,
    });

    // Create retriever configuration (optional)
    let retriever: ReturnType<typeof create<typeof KnowledgeBaseCreate_RetrieverSchema>> | undefined;
    if (values.rerankerEnabled && values.rerankerApiKey && values.rerankerModel) {
      const rerankerProvider = create(KnowledgeBaseCreate_Retriever_Reranker_ProviderSchema, {
        provider: {
          case: 'cohere',
          value: create(KnowledgeBaseCreate_Retriever_Reranker_Provider_CohereSchema, {
            apiKey: values.rerankerApiKey,
            model: values.rerankerModel,
          }),
        },
      });

      const reranker = create(KnowledgeBaseCreate_Retriever_RerankerSchema, {
        enabled: values.rerankerEnabled,
        provider: rerankerProvider,
      });

      retriever = create(KnowledgeBaseCreate_RetrieverSchema, {
        reranker,
      });
    }

    // Create generation configuration (mandatory)
    const generationProvider = create(KnowledgeBaseCreate_Generation_ProviderSchema, {
      provider: {
        case: 'openai',
        value: create(KnowledgeBaseCreate_Generation_Provider_OpenAISchema, {
          apiKey: values.openaiApiKey || '',
        }),
      },
    });

    const generation = create(KnowledgeBaseCreate_GenerationSchema, {
      provider: generationProvider,
      model: values.generationModel,
    });

    // Create the main knowledge base object
    return create(KnowledgeBaseCreateSchema, {
      displayName: values.displayName,
      description: values.description || '',
      tags: tagsMap,
      vectorDatabase,
      embeddingGenerator,
      indexer,
      generation,
      ...(retriever ? { retriever } : {}),
    });
  };

  const onSubmit = async (values: KnowledgeBaseCreateFormValues) => {
    try {
      const knowledgeBase = buildKnowledgeBaseCreate(values);
      await createKnowledgeBase(create(CreateKnowledgeBaseRequestSchema, { knowledgeBase }));

      toast.success('Knowledge base created successfully');
      navigate('/knowledgebases');
    } catch (err) {
      const connectError = err as ConnectError;
      toast.error(
        formatToastErrorMessageGRPC({
          error: connectError,
          action: 'create',
          entity: 'knowledge base',
        })
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <Heading level={1}>Create Knowledge Base</Heading>
        <Text variant="muted">Set up a new knowledge base from scratch</Text>
      </header>

      <form className="w-full space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-4">
          <BasicInformationSection appendTag={appendTag} form={form} removeTag={removeTag} tagFields={tagFields} />

          <VectorDatabaseSection availableSecrets={availableSecrets} form={form} />

          <EmbeddingGeneratorSection
            availableSecrets={availableSecrets}
            embeddingProvider={embeddingProvider}
            form={form}
          />

          <IndexerSection availableSecrets={availableSecrets} form={form} />

          <RetrievalSection availableSecrets={availableSecrets} form={form} rerankerEnabled={rerankerEnabled} />

          {/* Generation Section hidden - deprecated, defaults to gpt-5 with OpenAI */}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button onClick={() => navigate('/knowledgebases')} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={!form.formState.isValid || isCreating} type="submit">
              {isCreating ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <Text as="span">Creating...</Text>
                </div>
              ) : (
                'Create'
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
