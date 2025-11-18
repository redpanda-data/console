/**
 * Copyright 2024 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import React, { useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { toast } from 'sonner';

import { EmbeddingGeneratorTab } from './components/edit-tabs/embedding-generator-tab';
import { GeneralTab } from './components/edit-tabs/general-tab';
import { GenerationTab } from './components/edit-tabs/generation-tab';
import { IndexerTab } from './components/edit-tabs/indexer-tab';
import { PlaygroundTab } from './components/edit-tabs/playground-tab';
import { RetrieverTab } from './components/edit-tabs/retriever-tab';
import { VectorDatabaseTab } from './components/edit-tabs/vector-database-tab';
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
} from '../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { getMessageFieldMetadata } from '../../../utils/protobuf-reflection';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../redpanda-ui/components/tabs';
import { SecretsQuickAdd } from '../rp-connect/secrets/secrets-quick-add';

type KnowledgeBaseEditTabsProps = {
  knowledgeBase: KnowledgeBase;
  isEditMode?: boolean;
  onSave?: (updatedKnowledgeBase: KnowledgeBaseUpdate, updateMask?: string[]) => Promise<void>;
  onCancel?: () => void;
  onFormChange?: (hasChanges: boolean) => void;
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

const protobufFieldToCamelCase = (fieldName: string): string =>
  fieldName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

export const KnowledgeBaseEditTabs = React.forwardRef<KnowledgeBaseEditTabsRef, KnowledgeBaseEditTabsProps>(
  ({ knowledgeBase, isEditMode = false, onSave, onFormChange }, ref) => {
    const [formData, setFormData] = useState<KnowledgeBaseUpdate>(() => initializeFormData(knowledgeBase));
    const [isAddSecretOpen, setIsAddSecretOpen] = useState(false);
    const [currentSecretField, setCurrentSecretField] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [changedFields, setChangedFields] = useState<Set<string>>(new Set());
    const [tagsArray, setTagsArray] = useState<Array<{ key: string; value: string }>>([]);

    const refreshFormData = useCallback(() => {
      setFormData(initializeFormData(knowledgeBase));
      setChangedFields(new Set());
      setTagsArray(Object.entries(knowledgeBase?.tags || {}).map(([key, value]) => ({ key, value })));

      if (onFormChange) {
        onFormChange(false);
      }
    }, [knowledgeBase, onFormChange]);

    useEffect(() => {
      setTagsArray(Object.entries(knowledgeBase?.tags || {}).map(([key, value]) => ({ key, value })));
    }, [knowledgeBase]);

    useEffect(() => {
      if (isEditMode) {
        refreshFormData();
      }
    }, [isEditMode, refreshFormData]);

    const updateFormData = useCallback(
      (path: string, value: unknown) => {
        setFormData((prev) => {
          const newData = { ...prev };
          const keys = path.split('.');
          let current: Record<string, unknown> = newData as Record<string, unknown>;

          for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
              current[keys[i]] = {};
            }
            current = current[keys[i]] as Record<string, unknown>;
          }

          const lastKey = keys.at(-1);
          if (lastKey !== undefined) {
            current[lastKey] = value;
          }

          if (path === 'retriever.reranker.enabled' && value === true && !prev.retriever?.reranker?.provider) {
            if (!newData.retriever) {
              newData.retriever = create(KnowledgeBaseUpdate_RetrieverSchema, {});
            }
            if (!newData.retriever.reranker) {
              newData.retriever.reranker = create(KnowledgeBaseUpdate_Retriever_RerankerSchema, {});
            }
            newData.retriever.reranker.provider = create(KnowledgeBaseUpdate_Retriever_Reranker_ProviderSchema, {
              provider: {
                case: 'cohere',
                value: create(KnowledgeBaseUpdate_Retriever_Reranker_Provider_CohereSchema, {
                  model: 'rerank-v3.5',
                  apiKey: '',
                }),
              },
            });
          }

          return newData;
        });

        setChangedFields((prev) => new Set(prev).add(path));

        if (onFormChange) {
          onFormChange(true);
        }
      },
      [onFormChange]
    );

    const updateTags = useCallback(() => {
      const tagsMap: Record<string, string> = {};
      for (const tag of tagsArray) {
        if (tag.key && tag.value) {
          tagsMap[tag.key] = tag.value;
        }
      }
      setFormData((prev) => ({ ...prev, tags: tagsMap }));
      setChangedFields((prev) => new Set(prev).add('tags'));

      if (onFormChange) {
        onFormChange(true);
      }
    }, [tagsArray, onFormChange]);

    const addTag = useCallback(() => {
      setTagsArray((prev) => [...prev, { key: '', value: '' }]);
    }, []);

    const removeTag = useCallback((index: number) => {
      setTagsArray((prev) => {
        const newArray = [...prev];
        newArray.splice(index, 1);
        return newArray;
      });
    }, []);

    const updateTag = useCallback((index: number, field: 'key' | 'value', value: string) => {
      setTagsArray((prev) => {
        const newArray = [...prev];
        if (newArray[index]) {
          newArray[index][field] = value;
        }
        return newArray;
      });
    }, []);

    useEffect(() => {
      updateTags();
    }, [updateTags]);

    const openAddSecret = useCallback((fieldName: string) => {
      setCurrentSecretField(fieldName);
      setIsAddSecretOpen(true);
    }, []);

    const closeAddSecret = useCallback(() => {
      setIsAddSecretOpen(false);
      setCurrentSecretField(null);
    }, []);

    const onAddSecret = useCallback(
      (secretNotation: string) => {
        if (currentSecretField) {
          updateFormData(currentSecretField, secretNotation);
        }
        closeAddSecret();
      },
      [currentSecretField, updateFormData, closeAddSecret]
    );

    const validateForm = useCallback(() => {
      const errors: Record<string, string> = {};
      const metadata = getMessageFieldMetadata(KnowledgeBaseUpdateSchema);

      if (metadata) {
        for (const [protoFieldName, meta] of Object.entries(metadata)) {
          if (meta.isRequired) {
            const camelCaseFieldName = protobufFieldToCamelCase(protoFieldName);
            const value = (formData as Record<string, unknown>)[camelCaseFieldName];

            if (!value || (typeof value === 'string' && !value.trim())) {
              errors[camelCaseFieldName] = `${meta.name.replace(/_/g, ' ')} is required`;
            }
          }
        }
      }

      setValidationErrors(errors);
      return Object.keys(errors).length === 0;
    }, [formData]);

    const generateUpdateMask = useCallback((): string[] => {
      const updateMask: string[] = [];

      for (const fieldPath of changedFields) {
        const protobufPath = fieldPath
          .split('.')
          .map((segment) => segment.replace(/([A-Z])/g, '_$1').toLowerCase())
          .join('.');
        updateMask.push(protobufPath);
      }

      return updateMask;
    }, [changedFields]);

    const handleSave = useCallback(async () => {
      if (!validateForm()) {
        const errorCount = Object.keys(validationErrors).length;
        toast.error('Validation Error', {
          description: `${errorCount} validation errors found. Please check the form.`,
        });
        return;
      }

      if (onSave) {
        try {
          const updateMask = generateUpdateMask();
          await onSave(formData, updateMask);
          setChangedFields(new Set());
          if (onFormChange) {
            onFormChange(false);
          }
        } catch (_error) {
          // Error is handled by parent
        }
      }
    }, [validateForm, validationErrors, onSave, generateUpdateMask, formData, onFormChange]);

    // Expose handleSave to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        handleSave,
      }),
      [handleSave]
    );

    return (
      <div>
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="vector-database">Vector Database</TabsTrigger>
            <TabsTrigger value="embedding-generator">Embedding Generator</TabsTrigger>
            <TabsTrigger value="indexer">Indexing</TabsTrigger>
            <TabsTrigger value="retriever">Retrieval</TabsTrigger>
            <TabsTrigger value="generation">Generation</TabsTrigger>
            <TabsTrigger value="playground">Playground</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <GeneralTab
              formData={formData}
              isEditMode={isEditMode}
              knowledgeBase={knowledgeBase}
              onAddTag={addTag}
              onRemoveTag={removeTag}
              onUpdateFormData={updateFormData}
              onUpdateTag={updateTag}
              tagsArray={tagsArray}
              validationErrors={validationErrors}
            />
          </TabsContent>

          <TabsContent value="vector-database">
            <VectorDatabaseTab
              formData={formData}
              isEditMode={isEditMode}
              knowledgeBase={knowledgeBase}
              onOpenAddSecret={openAddSecret}
              onUpdateFormData={updateFormData}
            />
          </TabsContent>

          <TabsContent value="embedding-generator">
            <EmbeddingGeneratorTab
              formData={formData}
              isEditMode={isEditMode}
              knowledgeBase={knowledgeBase}
              onOpenAddSecret={openAddSecret}
              onUpdateFormData={updateFormData}
            />
          </TabsContent>

          <TabsContent value="indexer">
            <IndexerTab
              formData={formData}
              isEditMode={isEditMode}
              knowledgeBase={knowledgeBase}
              onOpenAddSecret={openAddSecret}
              onUpdateFormData={updateFormData}
            />
          </TabsContent>

          <TabsContent value="retriever">
            <RetrieverTab
              formData={formData}
              isEditMode={isEditMode}
              knowledgeBase={knowledgeBase}
              onOpenAddSecret={openAddSecret}
              onUpdateFormData={updateFormData}
            />
          </TabsContent>

          <TabsContent value="generation">
            <GenerationTab
              formData={formData}
              isEditMode={isEditMode}
              knowledgeBase={knowledgeBase}
              onOpenAddSecret={openAddSecret}
              onUpdateFormData={updateFormData}
            />
          </TabsContent>

          <TabsContent value="playground">
            <PlaygroundTab knowledgeBase={knowledgeBase} />
          </TabsContent>
        </Tabs>

        <SecretsQuickAdd isOpen={isAddSecretOpen} onAdd={onAddSecret} onCloseAddSecret={closeAddSecret} />
      </div>
    );
  }
);

KnowledgeBaseEditTabs.displayName = 'KnowledgeBaseEditTabs';
