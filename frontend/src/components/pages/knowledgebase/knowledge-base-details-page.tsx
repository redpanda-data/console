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
import { FieldMaskSchema } from '@bufbuild/protobuf/wkt';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { ArrowLeft, Search, Settings } from 'lucide-react';
import { runInAction } from 'mobx';
import {
  type KnowledgeBase,
  type KnowledgeBaseUpdate,
  KnowledgeBaseUpdate_EmbeddingGenerator_Provider_CohereSchema,
  KnowledgeBaseUpdate_EmbeddingGenerator_Provider_OpenAISchema,
  KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema,
  KnowledgeBaseUpdate_EmbeddingGeneratorSchema,
  KnowledgeBaseUpdate_Generation_Provider_OpenAISchema,
  KnowledgeBaseUpdate_Generation_ProviderSchema,
  KnowledgeBaseUpdate_GenerationSchema,
  KnowledgeBaseUpdate_IndexerSchema,
  KnowledgeBaseUpdate_Retriever_Reranker_Provider_CohereSchema,
  KnowledgeBaseUpdate_Retriever_Reranker_ProviderSchema,
  KnowledgeBaseUpdate_Retriever_RerankerSchema,
  KnowledgeBaseUpdate_RetrieverSchema,
  KnowledgeBaseUpdate_VectorDatabase_PostgresSchema,
  KnowledgeBaseUpdate_VectorDatabaseSchema,
  KnowledgeBaseUpdateSchema,
  UpdateKnowledgeBaseRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useLegacyConsumerGroupDetailsQuery } from 'react-query/api/consumer-group';
import { useGetKnowledgeBaseQuery, useUpdateKnowledgeBaseMutation } from 'react-query/api/knowledge-base';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

import { IndexerStatus } from './components/indexer-status';
import { KnowledgeBaseConfigurationTab } from './knowledge-base-configuration-tab';
import { PlaygroundTab } from './knowledge-base-playground-tab';
import { ShortNum } from '../../misc/short-num';

export const updatePageTitle = (knowledgebaseId?: string) => {
  runInAction(() => {
    uiState.pageTitle = knowledgebaseId ? `Knowledge Base - ${knowledgebaseId}` : 'Knowledge Base Details';
    uiState.pageBreadcrumbs = [
      { title: 'Knowledge Bases', linkTo: '/knowledgebases' },
      { title: knowledgebaseId || 'Details', linkTo: '', heading: knowledgebaseId || 'Knowledge Base Details' },
    ];
  });
};

export type KnowledgeBaseEditTabsRef = {
  handleSave: () => Promise<void>;
};

function initializeFormData(kb: KnowledgeBase): KnowledgeBaseUpdate {
  if (!kb) {
    return create(KnowledgeBaseUpdateSchema, {
      displayName: '',
      description: '',
      tags: {},
    });
  }

  const updateData = create(KnowledgeBaseUpdateSchema, {
    displayName: kb.displayName || '',
    description: kb.description || '',
    tags: { ...(kb.tags || {}) },
  });

  if (kb.vectorDatabase?.vectorDatabase.case === 'postgres') {
    updateData.vectorDatabase = create(KnowledgeBaseUpdate_VectorDatabaseSchema, {
      vectorDatabase: {
        case: 'postgres',
        value: create(KnowledgeBaseUpdate_VectorDatabase_PostgresSchema, {
          dsn: kb.vectorDatabase.vectorDatabase.value.dsn,
        }),
      },
    });
  }

  if (kb.embeddingGenerator) {
    const embGen = kb.embeddingGenerator;
    updateData.embeddingGenerator = create(KnowledgeBaseUpdate_EmbeddingGeneratorSchema, {});

    if (embGen.provider?.provider.case === 'openai') {
      updateData.embeddingGenerator.provider = create(KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema, {
        provider: {
          case: 'openai',
          value: create(KnowledgeBaseUpdate_EmbeddingGenerator_Provider_OpenAISchema, {
            apiKey: embGen.provider.provider.value.apiKey,
          }),
        },
      });
    } else if (embGen.provider?.provider.case === 'cohere') {
      updateData.embeddingGenerator.provider = create(KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema, {
        provider: {
          case: 'cohere',
          value: create(KnowledgeBaseUpdate_EmbeddingGenerator_Provider_CohereSchema, {
            baseUrl: embGen.provider.provider.value.baseUrl,
            apiKey: embGen.provider.provider.value.apiKey,
          }),
        },
      });
    }
  }

  if (kb.indexer) {
    updateData.indexer = create(KnowledgeBaseUpdate_IndexerSchema, {
      chunkSize: kb.indexer.chunkSize,
      chunkOverlap: kb.indexer.chunkOverlap,
      redpandaUsername: kb.indexer.redpandaUsername,
      redpandaPassword: kb.indexer.redpandaPassword,
      redpandaSaslMechanism: kb.indexer.redpandaSaslMechanism,
      inputTopics: kb.indexer.inputTopics ? [...kb.indexer.inputTopics] : [],
    });
  }

  if (kb.retriever) {
    updateData.retriever = create(KnowledgeBaseUpdate_RetrieverSchema, {});

    if (kb.retriever.reranker) {
      const reranker = kb.retriever.reranker;
      updateData.retriever.reranker = create(KnowledgeBaseUpdate_Retriever_RerankerSchema, {
        enabled: reranker.enabled,
      });

      if (reranker.provider?.provider.case === 'cohere') {
        updateData.retriever.reranker.provider = create(KnowledgeBaseUpdate_Retriever_Reranker_ProviderSchema, {
          provider: {
            case: 'cohere',
            value: create(KnowledgeBaseUpdate_Retriever_Reranker_Provider_CohereSchema, {
              apiKey: reranker.provider.provider.value.apiKey,
              model: reranker.provider.provider.value.model,
            }),
          },
        });
      }
    }
  }

  if (kb.generation) {
    updateData.generation = create(KnowledgeBaseUpdate_GenerationSchema, {});

    if (kb.generation.provider?.provider.case === 'openai') {
      updateData.generation.provider = create(KnowledgeBaseUpdate_Generation_ProviderSchema, {
        provider: {
          case: 'openai',
          value: create(KnowledgeBaseUpdate_Generation_Provider_OpenAISchema, {
            apiKey: kb.generation.provider.provider.value.apiKey,
          }),
        },
      });
    }
  }

  return updateData;
}

export const KnowledgeBaseDetailsPage = () => {
  const { knowledgebaseId } = useParams<{ knowledgebaseId: string }>();
  const navigate = useNavigate();

  // Local state
  const [isEditMode, setIsEditMode] = useState(false);
  const [formHasChanges, setFormHasChanges] = useState(false);

  // Fetch knowledge base data
  const {
    data: knowledgeBaseResponse,
    isLoading: isLoadingKnowledgeBase,
    error: knowledgeBaseError,
    refetch: refetchKnowledgeBase,
  } = useGetKnowledgeBaseQuery({ id: knowledgebaseId || '' });

  const knowledgeBase = knowledgeBaseResponse?.knowledgeBase;

  // Compute consumer group ID
  const consumerGroupId = useMemo(() => (knowledgeBase ? `${knowledgeBase.id}-indexer` : ''), [knowledgeBase]);

  // Fetch consumer group data
  const {
    data: consumerGroup,
    isLoading: isLoadingConsumerGroup,
    error: consumerGroupError,
    refetch: refetchConsumerGroup,
  } = useLegacyConsumerGroupDetailsQuery(consumerGroupId, {
    enabled: !!consumerGroupId,
  });

  // Mutations
  const { mutate: updateKnowledgeBase, isPending: isUpdating } = useUpdateKnowledgeBaseMutation();

  // Preload secrets for knowledge base configuration
  useListSecretsQuery(undefined, { enabled: !!knowledgebaseId });

  // Form setup
  const form = useForm<KnowledgeBaseUpdate>({
    defaultValues: knowledgeBase ? initializeFormData(knowledgeBase) : undefined,
    mode: 'onChange',
  });

  const refreshFormData = useCallback(() => {
    if (knowledgeBase) {
      form.reset(initializeFormData(knowledgeBase));
      setFormHasChanges(false);
    }
  }, [knowledgeBase, form]);

  /**
   * Get current knowledge base data initialized from server data.
   * This ensures secrets are always available for display by reading directly from the knowledge base prop.
   */
  const getCurrentData = useCallback((): KnowledgeBaseUpdate | null => {
    if (knowledgeBase) {
      return initializeFormData(knowledgeBase);
    }

    return null;
  }, [knowledgeBase]);

  useEffect(() => {
    if (knowledgebaseId) {
      updatePageTitle(knowledgebaseId);
    }
  }, [knowledgebaseId]);

  useEffect(() => {
    if (isEditMode && knowledgeBase) {
      refreshFormData();
    }
  }, [isEditMode, knowledgeBase, refreshFormData]);

  // Watch for form changes
  useEffect(() => {
    const subscription = form.watch(() => {
      setFormHasChanges(form.formState.isDirty);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const generateUpdateMask = useCallback((): string[] => {
    const updateMask: string[] = [];
    const dirtyFields = form.formState.dirtyFields;

    const walkDirtyFields = (obj: Record<string, unknown>, path: string[] = []) => {
      for (const key in obj) {
        if (Object.hasOwn(obj, key)) {
          const currentPath = [...path, key];
          const value = obj[key];
          if (value !== true && typeof value === 'object' && value !== null) {
            walkDirtyFields(value as Record<string, unknown>, currentPath);
          } else {
            const protobufPath = currentPath
              .map((segment) => segment.replace(/([A-Z])/g, '_$1').toLowerCase())
              .join('.');
            updateMask.push(protobufPath);
          }
        }
      }
    };

    walkDirtyFields(dirtyFields);
    return updateMask;
  }, [form.formState.dirtyFields]);

  // Handlers
  const handleStartEdit = () => {
    setIsEditMode(true);
    setFormHasChanges(false);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setFormHasChanges(false);
    refreshFormData();
  };

  const handleSave = async () => {
    const formData = form.getValues();
    const updateMask = generateUpdateMask();
    await handleUpdate(formData, updateMask);
  };

  const handleUpdate = (updatedKnowledgeBase: KnowledgeBaseUpdate, updateMask?: string[]) => {
    if (!knowledgeBase) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const request = create(UpdateKnowledgeBaseRequestSchema, {
        id: knowledgeBase.id,
        knowledgeBase: updatedKnowledgeBase,
        updateMask: updateMask ? create(FieldMaskSchema, { paths: updateMask }) : undefined,
      });

      updateKnowledgeBase(request, {
        onSuccess: () => {
          toast.success('Knowledge base updated successfully');
          refetchKnowledgeBase();
          refetchConsumerGroup();
          setIsEditMode(false);
          setFormHasChanges(false);
          form.reset(updatedKnowledgeBase, { keepValues: true });
          resolve();
        },
        onError: (err: unknown) => {
          toast.error('Failed to update knowledge base', {
            description: String(err),
          });
          reject(err);
        },
      });
    });
  };

  // Loading state
  if (isLoadingKnowledgeBase) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="mt-4 h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Error state
  if (knowledgeBaseError || !knowledgeBase) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md text-center">
          <Text className="text-red-600">
            {knowledgeBaseError
              ? `Failed to load knowledge base: ${String(knowledgeBaseError)}`
              : 'Knowledge base not found'}
          </Text>
          <Button className="mt-4" onClick={() => navigate('/knowledgebases')} variant="outline">
            Back to Knowledge Bases
          </Button>
        </div>
      </div>
    );
  }

  const consumerGroupLoadFailed = !!consumerGroupError;

  // Helper function to render consumer group lag
  const renderConsumerGroupLag = () => {
    if (consumerGroup) {
      const lagValue = consumerGroup.lagSum ?? 0;
      return (
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-xl">
            <ShortNum tooltip={false} value={lagValue} />
          </span>
          <Text className="text-sm" variant="muted">
            messages
          </Text>
        </div>
      );
    }

    if (isLoadingConsumerGroup) {
      return <Skeleton className="h-7 w-32" />;
    }

    return (
      <Text className="text-xl" variant="muted">
        -
      </Text>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Back button */}
      <div>
        <Button onClick={() => navigate('/knowledgebases')} size="sm" variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Knowledge Bases
        </Button>
      </div>

      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <Heading level={1}>{knowledgeBase.displayName}</Heading>
          {knowledgeBase.description && (
            <Text className="mt-2" variant="muted">
              {knowledgeBase.description}
            </Text>
          )}
        </div>
        <div className="flex gap-2">
          {isEditMode ? (
            <>
              <Button disabled={!formHasChanges || isUpdating} onClick={handleSave} variant="secondary">
                Save Changes
              </Button>
              <Button onClick={handleCancelEdit} variant="outline">
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={handleStartEdit} variant="secondary">
              Edit Configuration
            </Button>
          )}
        </div>
      </div>

      {/* Consumer Group Status Card */}
      <Card>
        <CardContent>
          <div className="flex gap-8">
            <div>
              <Text className="mb-1 font-medium text-sm" variant="muted">
                Indexer Status
              </Text>
              <IndexerStatus
                configured={!!knowledgeBase.indexer}
                hasError={consumerGroupLoadFailed}
                isLoading={isLoadingConsumerGroup}
                memberCount={consumerGroup?.members?.length}
                state={consumerGroup?.state}
                topicCount={knowledgeBase.indexer?.inputTopics?.length ?? 0}
              />
            </div>

            <div>
              <Text className="mb-1 font-medium text-sm" variant="muted">
                Consumer Lag
              </Text>
              {renderConsumerGroupLag()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration and Playground Tabs */}
      <FormProvider {...form}>
        <Tabs defaultValue="configuration">
          <TabsList>
            <TabsTrigger value="configuration">
              <Settings className="mr-2 h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="playground">
              <Search className="mr-2 h-4 w-4" />
              Playground
            </TabsTrigger>
          </TabsList>

          <TabsContent value="configuration">
            <KnowledgeBaseConfigurationTab
              getCurrentData={getCurrentData}
              isEditMode={isEditMode}
              knowledgeBase={knowledgeBase}
            />
          </TabsContent>

          <TabsContent value="playground">
            <PlaygroundTab knowledgeBase={knowledgeBase} />
          </TabsContent>
        </Tabs>
      </FormProvider>
    </div>
  );
};
