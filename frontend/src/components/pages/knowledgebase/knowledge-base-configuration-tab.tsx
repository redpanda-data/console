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
import { useFormContext } from 'react-hook-form';

import { BasicInfoSection } from './sections/basic-info-section';
import { EmbeddingGeneratorSection } from './sections/embedding-generator-section';
import { IndexerSection } from './sections/indexer-section';
import { RetrieverSection } from './sections/retriever-section';
import { VectorDatabaseSection } from './sections/vector-database-section';
import type {
  KnowledgeBase,
  KnowledgeBaseUpdate,
} from '../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import {
  KnowledgeBaseUpdate_EmbeddingGenerator_Provider_CohereSchema,
  KnowledgeBaseUpdate_EmbeddingGenerator_Provider_OpenAISchema,
  KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema,
  KnowledgeBaseUpdate_Retriever_Reranker_Provider_CohereSchema,
  KnowledgeBaseUpdate_Retriever_Reranker_ProviderSchema,
  KnowledgeBaseUpdate_Retriever_RerankerSchema,
  KnowledgeBaseUpdate_RetrieverSchema,
  KnowledgeBaseUpdate_VectorDatabase_PostgresSchema,
  KnowledgeBaseUpdate_VectorDatabaseSchema,
} from '../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useListSecretsQuery } from '../../../react-query/api/secret';

// Extended type for edit form that includes split topic fields
type KnowledgeBaseUpdateForm = KnowledgeBaseUpdate & {
  indexer?: KnowledgeBaseUpdate['indexer'] & {
    exactTopics?: string[];
    regexPatterns?: string[];
  };
};

type KnowledgeBaseConfigurationTabProps = {
  knowledgeBase: KnowledgeBase;
  isEditMode: boolean;
  getCurrentData: () => KnowledgeBaseUpdateForm | null;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => Promise<void>;
  formHasChanges: boolean;
  isUpdating: boolean;
};

/**
 * Regex pattern to extract secret name from template string: ${secrets.SECRET_NAME}
 */
const SECRET_TEMPLATE_REGEX = /^\$\{secrets\.([^}]+)\}$/;

/**
 * Extracts the secret name from the template string format: ${secrets.SECRET_NAME} -> SECRET_NAME
 */
const extractSecretName = (secretTemplate: string): string => {
  if (!secretTemplate) {
    return '';
  }
  const match = secretTemplate.match(SECRET_TEMPLATE_REGEX);
  return match ? match[1] : secretTemplate; // Return original if no match (in case it's already just the ID)
};

export const KnowledgeBaseConfigurationTab = ({
  knowledgeBase,
  isEditMode,
  getCurrentData,
  onStartEdit,
  onCancelEdit,
  onSave,
  formHasChanges,
  isUpdating,
}: KnowledgeBaseConfigurationTabProps) => {
  const { watch, setValue } = useFormContext<KnowledgeBaseUpdateForm>();
  const formData = watch();
  const { data: secretsData } = useListSecretsQuery();

  // Watch the separate fields directly
  const exactTopics = watch('indexer.exactTopics') || [];
  const regexPatterns = watch('indexer.regexPatterns') || [];

  // Handlers for updating split fields
  const handleExactTopicsChange = (topics: string[]) => {
    setValue('indexer.exactTopics', topics, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleRegexPatternsChange = (patterns: string[]) => {
    setValue('indexer.regexPatterns', patterns, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  // Handlers for secret changes - explicitly mark fields as dirty
  // For discriminated unions, we need to rebuild the entire structure
  const handlePostgresDsnChange = (secretId: string) => {
    setValue(
      'vectorDatabase',
      create(KnowledgeBaseUpdate_VectorDatabaseSchema, {
        vectorDatabase: {
          case: 'postgres',
          value: create(KnowledgeBaseUpdate_VectorDatabase_PostgresSchema, {
            dsn: `\${secrets.${secretId}}`,
          }),
        },
      }),
      {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      }
    );
  };

  const handleEmbeddingApiKeyChange = (secretId: string) => {
    // Get current form state to determine provider type
    const currentFormState = formData.embeddingGenerator;
    const currentProvider = currentFormState?.provider?.provider.case;

    if (currentProvider === 'openai') {
      setValue(
        'embeddingGenerator.provider',
        create(KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema, {
          provider: {
            case: 'openai',
            value: create(KnowledgeBaseUpdate_EmbeddingGenerator_Provider_OpenAISchema, {
              apiKey: `\${secrets.${secretId}}`,
            }),
          },
        }),
        {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        }
      );
    } else if (currentProvider === 'cohere') {
      // Preserve baseUrl if it exists
      const baseUrl =
        currentFormState?.provider?.provider.case === 'cohere' ? currentFormState.provider.provider.value.baseUrl : '';

      setValue(
        'embeddingGenerator.provider',
        create(KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema, {
          provider: {
            case: 'cohere',
            value: create(KnowledgeBaseUpdate_EmbeddingGenerator_Provider_CohereSchema, {
              baseUrl: baseUrl || '',
              apiKey: `\${secrets.${secretId}}`,
            }),
          },
        }),
        {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        }
      );
    }
  };

  const handleRedpandaPasswordChange = (secretId: string) => {
    setValue('indexer.redpandaPassword', `\${secrets.${secretId}}`, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  const handleRerankerApiKeyChange = (secretId: string) => {
    // Get current form state to preserve model selection
    const currentFormState = formData.retriever?.reranker;
    const currentModel =
      currentFormState?.provider?.provider.case === 'cohere' ? currentFormState.provider.provider.value.model : '';

    setValue(
      'retriever',
      create(KnowledgeBaseUpdate_RetrieverSchema, {
        reranker: create(KnowledgeBaseUpdate_Retriever_RerankerSchema, {
          enabled: true,
          provider: create(KnowledgeBaseUpdate_Retriever_Reranker_ProviderSchema, {
            provider: {
              case: 'cohere',
              value: create(KnowledgeBaseUpdate_Retriever_Reranker_Provider_CohereSchema, {
                model: currentModel || '',
                apiKey: `\${secrets.${secretId}}`,
              }),
            },
          }),
        }),
      }),
      {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      }
    );
  };

  // Get current data (prioritizes edited state over server data)
  const currentData = getCurrentData();

  // Extract secret IDs from template format (${secrets.SECRET_ID} -> SECRET_ID)
  // In edit mode, use formData (live form state) to show immediate updates
  // In view mode, use currentData (server data) for initial display
  const getPostgresDsn = () => {
    if (isEditMode) {
      return formData.vectorDatabase?.vectorDatabase.case === 'postgres'
        ? formData.vectorDatabase.vectorDatabase.value.dsn
        : '';
    }
    return currentData?.vectorDatabase?.vectorDatabase.case === 'postgres'
      ? currentData.vectorDatabase.vectorDatabase.value.dsn
      : '';
  };
  const postgresDsn = extractSecretName(getPostgresDsn());

  const getEmbeddingApiKey = () => {
    if (isEditMode) {
      return (
        (formData.embeddingGenerator?.provider?.provider.case === 'openai' &&
          formData.embeddingGenerator.provider.provider.value.apiKey) ||
        (formData.embeddingGenerator?.provider?.provider.case === 'cohere' &&
          formData.embeddingGenerator.provider.provider.value.apiKey) ||
        ''
      );
    }
    return (
      (currentData?.embeddingGenerator?.provider?.provider.case === 'openai' &&
        currentData.embeddingGenerator.provider.provider.value.apiKey) ||
      (currentData?.embeddingGenerator?.provider?.provider.case === 'cohere' &&
        currentData.embeddingGenerator.provider.provider.value.apiKey) ||
      ''
    );
  };
  const embeddingApiKey = extractSecretName(getEmbeddingApiKey());

  const redpandaPassword = extractSecretName(
    isEditMode ? formData.indexer?.redpandaPassword || '' : currentData?.indexer?.redpandaPassword || ''
  );

  const getRerankerApiKey = () => {
    if (isEditMode) {
      return formData.retriever?.reranker?.provider?.provider.case === 'cohere'
        ? formData.retriever.reranker.provider.provider.value.apiKey
        : '';
    }
    return currentData?.retriever?.reranker?.provider?.provider.case === 'cohere'
      ? currentData.retriever.reranker.provider.provider.value.apiKey
      : '';
  };
  const rerankerApiKey = extractSecretName(getRerankerApiKey());

  const availableSecrets =
    secretsData?.secrets
      ?.filter((secret) => secret !== undefined)
      .map((secret) => ({
        id: secret.id,
        name: secret.id,
      })) || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Basic Info Section */}
      <BasicInfoSection
        formHasChanges={formHasChanges}
        isEditMode={isEditMode}
        isUpdating={isUpdating}
        knowledgeBase={knowledgeBase}
        onCancelEdit={onCancelEdit}
        onSave={onSave}
        onStartEdit={onStartEdit}
      />

      {/* Vector Database Section */}
      <VectorDatabaseSection
        availableSecrets={availableSecrets}
        isEditMode={isEditMode}
        knowledgeBase={knowledgeBase}
        onPostgresDsnChange={handlePostgresDsnChange}
        postgresDsn={postgresDsn}
      />

      {/* Embedding Generator Section */}
      <EmbeddingGeneratorSection
        availableSecrets={availableSecrets}
        embeddingApiKey={embeddingApiKey}
        isEditMode={isEditMode}
        knowledgeBase={knowledgeBase}
        onEmbeddingApiKeyChange={handleEmbeddingApiKeyChange}
      />

      {/* Indexer Section */}
      <IndexerSection
        availableSecrets={availableSecrets}
        exactTopics={exactTopics}
        isEditMode={isEditMode}
        knowledgeBase={knowledgeBase}
        onExactTopicsChange={handleExactTopicsChange}
        onRedpandaPasswordChange={handleRedpandaPasswordChange}
        onRegexPatternsChange={handleRegexPatternsChange}
        redpandaPassword={redpandaPassword}
        regexPatterns={regexPatterns}
      />

      {/* Retriever Section */}
      <RetrieverSection
        availableSecrets={availableSecrets}
        isEditMode={isEditMode}
        knowledgeBase={knowledgeBase}
        onRerankerApiKeyChange={handleRerankerApiKeyChange}
        rerankerApiKey={rerankerApiKey}
      />
    </div>
  );
};
