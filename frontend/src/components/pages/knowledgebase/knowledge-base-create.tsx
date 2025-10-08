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
import { useQuery } from '@connectrpc/connect-query';
import {
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  createStandaloneToast,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Heading,
  HStack,
  Icon,
  Input,
  isMultiValue,
  Link,
  RadioGroup,
  Select,
  Text,
  Textarea,
  VStack,
} from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { useMemo, useState } from 'react';
import { AiOutlineDelete, AiOutlinePlus } from 'react-icons/ai';
import { Link as RouterLink } from 'react-router-dom';

import { config as appConfig } from '../../../config';
import { CreateSecretRequestSchema, Scope } from '../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { ListTopicsRequestSchema } from '../../../protogen/redpanda/api/dataplane/v1/topic_pb';
import { listTopics } from '../../../protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import {
  CreateUserRequest_UserSchema,
  CreateUserRequestSchema,
  SASLMechanism,
} from '../../../protogen/redpanda/api/dataplane/v1/user_pb';
import type { KnowledgeBaseCreate as KnowledgeBaseCreateType } from '../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import {
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
} from '../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useListUsersQuery } from '../../../react-query/api/user';
import { appGlobal } from '../../../state/app-global';
import { knowledgebaseApi, rpcnSecretManagerApi } from '../../../state/backend-api';
import { base64ToUInt8Array, encodeBase64 } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import { SingleSelect } from '../../misc/select';
import { PageComponent, type PageInitHelper } from '../page';
import { SecretsQuickAdd } from '../rp-connect/secrets/secrets-quick-add';

const { ToastContainer, toast } = createStandaloneToast();

const CREATE_NEW_OPTION_VALUE = 'CREATE_NEW_OPTION_VALUE';
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/;

const SecretDropdownField = ({
  label,
  value,
  onChange,
  placeholder,
  onCreateNew,
  isRequired = false,
  errorMessage,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onCreateNew: () => void;
  isRequired?: boolean;
  errorMessage?: string;
  helperText?: string;
}) => {
  // Get available secrets from the secrets API
  const availableSecrets = rpcnSecretManagerApi.secrets || [];

  // Create options for the dropdown
  const secretOptions = availableSecrets.map((secret) => ({
    value: `\${secrets.${secret.id}}`,
    label: secret.id,
  }));

  // Add the "Create new" option
  const CREATE_NEW_OPTION = {
    value: CREATE_NEW_OPTION_VALUE,
    label: (
      <HStack spacing={1}>
        <Icon as={AiOutlinePlus} />
        <Text fontWeight="semibold">Create New</Text>
      </HStack>
    ),
  };

  const allOptions = [...secretOptions, CREATE_NEW_OPTION];

  const handleChange = (selectedValue: string) => {
    if (selectedValue === CREATE_NEW_OPTION_VALUE) {
      onCreateNew();
    } else {
      onChange(selectedValue);
    }
  };

  return (
    <FormControl isInvalid={!!errorMessage} isRequired={isRequired}>
      <FormLabel fontWeight="medium">{label}</FormLabel>
      {helperText && (
        <Text color="gray.500" fontSize="sm" mb={2}>
          {helperText}
        </Text>
      )}
      <SingleSelect
        onChange={handleChange}
        options={allOptions}
        placeholder={placeholder || 'Select a secret...'}
        value={value}
      />
      {errorMessage && <FormErrorMessage>{errorMessage}</FormErrorMessage>}
    </FormControl>
  );
};

const UserDropdown = ({
  label,
  value,
  onChange,
  isRequired = false,
  errorMessage,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isRequired?: boolean;
  errorMessage?: string;
  helperText?: string;
}) => {
  const { data: usersData, isLoading } = useListUsersQuery();

  const userOptions =
    usersData?.users?.map((user) => ({
      value: user.name,
      label: user.name,
    })) || [];

  return (
    <FormControl isInvalid={!!errorMessage} isRequired={isRequired}>
      <FormLabel fontWeight="medium">{label}</FormLabel>
      {helperText && (
        <Text color="gray.500" fontSize="sm" mb={2}>
          {helperText}
        </Text>
      )}
      <SingleSelect
        isLoading={isLoading}
        onChange={onChange}
        options={userOptions}
        placeholder={isLoading ? 'Loading users...' : 'Select a user...'}
        value={value}
      />
      {errorMessage && <FormErrorMessage>{errorMessage}</FormErrorMessage>}
    </FormControl>
  );
};

const TopicSelector = ({
  selectedTopics,
  onTopicsChange,
}: {
  selectedTopics: string[];
  onTopicsChange: (topics: string[]) => void;
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all topics
  const { data: topicsData, isLoading } = useQuery(
    listTopics,
    create(ListTopicsRequestSchema, {
      pageSize: 1000,
      pageToken: '',
      filter: {
        nameContains: '', // Get all topics for regex matching
      },
    })
  );

  const allTopics = (topicsData?.topics || [])
    .filter((topic) => !topic.internal)
    .map((topic) => topic.name)
    .filter(
      (name) =>
        !(name.startsWith('__redpanda') || name.startsWith('_internal') || name.startsWith('_redpanda')) &&
        name !== '_schemas'
    );

  // Check if a string is a regex pattern (contains regex special characters)
  const isRegexPattern = (str: string) => REGEX_SPECIAL_CHARS.test(str);

  // Get matching topics for a pattern - always treat as regex if possible, fallback to substring
  const getMatchingTopics = useMemo(
    () => (pattern: string) => {
      if (!pattern) {
        return [];
      }

      try {
        const regex = new RegExp(pattern);
        const matches = allTopics.filter((topic) => regex.test(topic));
        return matches;
      } catch (_error) {
        // If regex is invalid, fall back to substring match
        return allTopics.filter((topic) => topic.toLowerCase().includes(pattern.toLowerCase()));
      }
    },
    [allTopics]
  );

  // Create options for the select dropdown - always show all topics
  const topicOptions = allTopics.map((name) => ({
    value: name,
    label: name,
  }));

  // Filter options based on search term - always treat as regex first
  const filteredOptions = searchTerm
    ? topicOptions.filter((option) => {
        const matchingTopics = getMatchingTopics(searchTerm);
        return matchingTopics.includes(option.value);
      })
    : topicOptions;

  // Custom option component - show if filtered by regex
  const formatOptionLabel = (option: { value: string; label?: React.ReactNode }): React.ReactNode => {
    // Show if this option is being shown because it matches a regex search
    if (searchTerm && isRegexPattern(searchTerm)) {
      return (
        <Box>
          <Text fontWeight="medium">
            {option.value}{' '}
            <Text as="span" color="blue.600" fontSize="xs">
              (matches: {searchTerm})
            </Text>
          </Text>
        </Box>
      );
    }
    return option.label;
  };

  // Allow custom input (for regex patterns)
  const handleInputChange = (inputValue: string, { action }: { action: string }) => {
    if (action === 'input-change') {
      setSearchTerm(inputValue);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && searchTerm && !topicOptions.find((opt) => opt.value === searchTerm)) {
      // Add the search term as a new option (likely a regex pattern)
      const newTopics = [...selectedTopics, searchTerm];
      onTopicsChange(newTopics);
      setSearchTerm('');
      event.preventDefault();
    }
  };

  // Format the selected values
  const selectedValues = selectedTopics.map((topic) => {
    const matchingCount = isRegexPattern(topic) ? getMatchingTopics(topic).length : 1;
    return {
      value: topic,
      label: isRegexPattern(topic) ? `${topic} (${matchingCount} matches)` : topic,
    };
  });

  return (
    <FormControl isRequired>
      <FormLabel>Input Topics</FormLabel>
      <Text color="gray.500" fontSize="sm" mb={2}>
        Select topics or enter regex patterns (e.g., my-topics-prefix-.*) to index for this knowledge base.
      </Text>

      <Select
        filterOption={() => true}
        formatOptionLabel={formatOptionLabel}
        inputValue={searchTerm}
        isLoading={isLoading}
        isMulti
        isSearchable
        noOptionsMessage={() => (searchTerm ? `Press Enter to add pattern: ${searchTerm}` : 'No topics found')}
        onChange={(selected) => {
          if (isMultiValue(selected)) {
            onTopicsChange(selected.map((item) => item.value));
          } else {
            onTopicsChange([]);
          }
          // Clear search term when selection changes
          setSearchTerm('');
        }}
        onInputChange={handleInputChange}
        onKeyDown={handleKeyDown}
        options={filteredOptions}
        placeholder="Search topics or enter regex patterns..."
        value={selectedValues}
      />

      {/* Show preview of what each selected item matches */}
      {selectedTopics.length > 0 && (
        <Box mt={2}>
          <Text fontSize="sm" fontWeight="medium" mb={2}>
            Preview of selected topics:
          </Text>

          {/* Show exact topics first */}
          {selectedTopics.filter((topic) => !isRegexPattern(topic)).length > 0 && (
            <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="md" mb={2} p={2}>
              <Text fontSize="sm" fontWeight="medium" mb={1}>
                Exact topics ({selectedTopics.filter((topic) => !isRegexPattern(topic)).length}):
              </Text>
              <Box maxH="100px" overflowY="auto">
                {selectedTopics
                  .filter((topic) => !isRegexPattern(topic))
                  .map((topic, idx) => (
                    <Text color="gray.700" fontSize="xs" key={idx} pl={2}>
                      • {topic}
                    </Text>
                  ))}
              </Box>
            </Box>
          )}

          {/* Show regex patterns with their matches */}
          {selectedTopics
            .filter((topic) => isRegexPattern(topic))
            .map((topic, index) => {
              const matchingTopics = getMatchingTopics(topic);

              return (
                <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="md" key={index} mb={2} p={2}>
                  <Text color="blue.600" fontSize="sm" fontWeight="medium">
                    {topic}{' '}
                    <Text as="span" color="gray.500" fontSize="xs">
                      (regex pattern)
                    </Text>
                  </Text>
                  {matchingTopics.length > 0 ? (
                    <Box mt={1}>
                      <Text color="gray.600" fontSize="xs" mb={1}>
                        Matches {matchingTopics.length} topics:
                      </Text>
                      <Box maxH="100px" overflowY="auto">
                        {matchingTopics.map((matchedTopic, idx) => (
                          <Text color="gray.700" fontSize="xs" key={idx} pl={2}>
                            • {matchedTopic}
                          </Text>
                        ))}
                      </Box>
                    </Box>
                  ) : (
                    <Text color="red.500" fontSize="xs" mt={1}>
                      No topics match this pattern
                    </Text>
                  )}
                </Box>
              );
            })}
        </Box>
      )}
    </FormControl>
  );
};

type FormData = {
  displayName: string;
  description: string;
  tags: Array<{ key: string; value: string }>;

  // Vector Database
  vectorDatabaseType: 'postgres';

  // Postgres specific
  postgresDsn: string;
  postgresTable: string;

  // Embedding Generator
  embeddingProvider: 'openai' | 'cohere';
  embeddingModel: string;
  embeddingDimensions: number;

  // OpenAI specific
  openaiApiKey: string;

  // Cohere specific
  cohereApiKey: string;

  // Indexer
  chunkSize: number;
  chunkOverlap: number;
  inputTopics: string[];
  credentialChoice: 'auto' | 'manual';
  redpandaUsername: string;
  redpandaPassword: string;
  redpandaSaslMechanism: SASLMechanism;

  // Reranker
  rerankerEnabled: boolean;
  rerankerModel: string;
  rerankerApiKey: string;

  // Generation (mandatory)
  generationProvider: 'openai';
  generationModel: string;
  generationApiKey: string;
};

@observer
class KnowledgeBaseCreate extends PageComponent {
  @observable formData: FormData = {
    displayName: '',
    description: '',
    tags: [],
    vectorDatabaseType: 'postgres',
    postgresDsn: '',
    postgresTable: '',
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 768,
    openaiApiKey: '',
    cohereApiKey: '',
    chunkSize: 512,
    chunkOverlap: 100,
    inputTopics: [],
    credentialChoice: 'manual',
    redpandaUsername: '',
    redpandaPassword: '',
    redpandaSaslMechanism: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
    rerankerEnabled: true,
    rerankerModel: 'rerank-v3.5',
    rerankerApiKey: '',
    generationProvider: 'openai',
    generationModel: 'gpt-4.1',
    generationApiKey: '',
  };

  @observable loading = false;
  @observable isAddSecretOpen = false;
  @observable currentSecretField: string | null = null;
  @observable validationErrors: { [key: string]: string } = {};

  constructor(p: Readonly<{ matchedPath: string }>) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    p.addBreadcrumb('Knowledge Bases', '/knowledgebases');
    p.addBreadcrumb('Create', '/knowledgebases/create');

    // Load secrets for the secret picker and auto-populate fields
    rpcnSecretManagerApi
      .refreshSecrets(true)
      .then(() => {
        this.autoPopulateSecretsFields();
      })
      .catch((err) => {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.warn('KnowledgeBase.Create: Failed to load secrets:', err);
      });
  }

  autoPopulateSecretsFields = () => {
    const secrets = rpcnSecretManagerApi.secrets;
    if (!secrets || secrets.length === 0) {
      return;
    }

    // Create a map of secret IDs for quick lookup
    const secretIds = new Set(secrets.map((secret) => secret.id));

    // Define the mapping of form fields to default secret names
    const fieldSecretMappings = {
      postgresDsn: 'POSTGRES_DSN',
      openaiApiKey: 'OPENAI_API_KEY',
      cohereApiKey: 'COHERE_API_KEY',
      rerankerApiKey: 'COHERE_API_KEY', // Reranker typically uses same Cohere API key
      generationApiKey: 'OPENAI_API_KEY', // Generation typically uses OpenAI API key
    };

    // Auto-populate fields with default secrets if they exist and field is empty
    for (const [fieldName, secretName] of Object.entries(fieldSecretMappings)) {
      const typedFieldName = fieldName as keyof FormData;
      const currentValue = this.formData[typedFieldName] as string;

      // Only auto-populate if the field is currently empty
      if (!currentValue.trim() && secretIds.has(secretName)) {
        this.updateFormData(typedFieldName, `\${secrets.${secretName}}`);
      }
    }
  };

  updateFormData = (field: keyof FormData, value: unknown) => {
    (this.formData as Record<string, unknown>)[field] = value;

    // Clear validation error for this field when user makes changes
    if (this.validationErrors[field as string]) {
      delete this.validationErrors[field as string];
    }

    // Update model and dimensions when provider changes
    if (field === 'embeddingProvider') {
      if (value === 'openai') {
        this.formData.embeddingModel = 'text-embedding-3-small';
        this.formData.embeddingDimensions = 768;
      } else if (value === 'cohere') {
        this.formData.embeddingModel = 'embed-v4.0';
        this.formData.embeddingDimensions = 1536;
      }
    }

    // Special handling for credential choice changes
    // Clear username/password errors when switching to auto mode
    if (field === 'credentialChoice' && value === 'auto') {
      // biome-ignore lint/performance/noDelete: TypeScript requires string type, can't use undefined assignment
      delete this.validationErrors.redpandaUsername;
      // biome-ignore lint/performance/noDelete: TypeScript requires string type, can't use undefined assignment
      delete this.validationErrors.redpandaPassword;
    }
  };

  updateTags = (tags: Array<{ key: string; value: string }>) => {
    this.formData.tags = tags;
  };

  addTag = () => {
    this.formData.tags.push({ key: '', value: '' });
  };

  removeTag = (index: number) => {
    this.formData.tags.splice(index, 1);
  };

  updateTag = (index: number, field: 'key' | 'value', value: string) => {
    this.formData.tags[index][field] = value;
  };

  updateInputTopics = (topics: string[]) => {
    this.formData.inputTopics = topics;

    // Clear validation error for input topics when user makes changes
    if (this.validationErrors.inputTopics) {
      // biome-ignore lint/performance/noDelete: TypeScript requires string type, can't use undefined assignment
      delete this.validationErrors.inputTopics;
    }
  };

  openAddSecret = (fieldName: string) => {
    this.currentSecretField = fieldName;
    this.isAddSecretOpen = true;
  };

  closeAddSecret = () => {
    this.isAddSecretOpen = false;
    this.currentSecretField = null;
  };

  onAddSecret = (secretNotation: string) => {
    if (this.currentSecretField) {
      this.updateFormData(this.currentSecretField as keyof FormData, secretNotation);
    }
    this.closeAddSecret();
  };

  validateForm = () => {
    const errors: { [key: string]: string } = {};

    // Required fields
    if (!this.formData.displayName.trim()) {
      errors.displayName = 'Display name is required';
    }

    if (!this.formData.postgresDsn.trim()) {
      errors.postgresDsn = 'PostgreSQL DSN is required';
    }

    if (!this.formData.postgresTable.trim()) {
      errors.postgresTable = 'PostgreSQL table name is required';
    }

    if (!this.formData.embeddingModel.trim()) {
      errors.embeddingModel = 'Embedding model is required';
    }

    if (this.formData.embeddingDimensions <= 0) {
      errors.embeddingDimensions = 'Embedding dimensions must be greater than 0';
    }

    if (this.formData.embeddingProvider === 'openai' && !this.formData.openaiApiKey.trim()) {
      errors.openaiApiKey = 'OpenAI API Key is required';
    }

    if (this.formData.embeddingProvider === 'cohere' && !this.formData.cohereApiKey.trim()) {
      errors.cohereApiKey = 'Cohere API Key is required';
    }

    if (this.formData.chunkSize <= 0) {
      errors.chunkSize = 'Chunk size must be greater than 0';
    }

    if (this.formData.chunkOverlap < 0) {
      errors.chunkOverlap = 'Chunk overlap cannot be negative';
    }

    if (this.formData.chunkOverlap >= this.formData.chunkSize) {
      errors.chunkOverlap = 'Chunk overlap must be less than chunk size';
    }

    if (this.formData.inputTopics.length === 0) {
      errors.inputTopics = 'At least one input topic is required';
    }

    if (this.formData.credentialChoice === 'manual') {
      if (!this.formData.redpandaUsername.trim()) {
        errors.redpandaUsername = 'Redpanda username is required';
      }

      if (!this.formData.redpandaPassword.trim()) {
        errors.redpandaPassword = 'Redpanda password is required';
      }
    }

    // Reranker validation
    if (this.formData.rerankerEnabled) {
      if (!this.formData.rerankerModel.trim()) {
        errors.rerankerModel = 'Reranker model is required';
      }

      if (!this.formData.rerankerApiKey.trim()) {
        errors.rerankerApiKey = 'Reranker API Key is required';
      }
    }

    // Generation validation (mandatory)
    if (!this.formData.generationModel.trim()) {
      errors.generationModel = 'Generation model is required';
    }

    if (!this.formData.generationApiKey.trim()) {
      errors.generationApiKey = 'Generation API Key is required';
    }

    this.validationErrors = errors;
    return Object.keys(errors).length === 0;
  };

  get isFormValid() {
    return Object.keys(this.validationErrors).length === 0;
  }

  // Helper methods for auto-generating credentials
  generateKnowledgeBaseId = (): string => {
    // Generate a unique 20-character ID for the knowledge base
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 20; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  generateUsername = (kbId: string): string => `KB_USER_${kbId}`;

  generatePassword = (): string => {
    // Generate a secure 32-character password
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  createAutoCredentials = async (kbId: string): Promise<{ username: string; passwordSecret: string }> => {
    const username = this.generateUsername(kbId);
    const password = this.generatePassword();
    const passwordSecretId = `KB_PASSWORD_${kbId}`;

    try {
      // Create the user
      const userRequest = create(CreateUserRequestSchema, {
        user: create(CreateUserRequest_UserSchema, {
          name: username,
          password,
          mechanism: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
        }),
      });

      // Create the secret for the password
      const secretRequest = create(CreateSecretRequestSchema, {
        id: passwordSecretId,
        secretData: base64ToUInt8Array(encodeBase64(password)),
        scopes: [Scope.REDPANDA_CONNECT],
      });

      // Create the secret using rpcnSecretManagerApi
      await rpcnSecretManagerApi.create(secretRequest);

      // Create the user using the userClient
      const userClient = appConfig.userClient;
      if (!userClient) {
        throw new Error('user client is not initialized');
      }
      await userClient.createUser(userRequest);

      // Refresh secrets list
      await rpcnSecretManagerApi.refreshSecrets(true);

      return {
        username,
        passwordSecret: `\${secrets.${passwordSecretId}}`,
      };
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('Failed to create auto credentials:', error);
      throw new Error('Failed to create auto-generated credentials. Please try manual credentials instead.');
    }
  };

  buildKnowledgeBaseCreate = (): KnowledgeBaseCreateType => {
    // Convert tags array to object format
    const tagsMap: { [key: string]: string } = {};
    for (const tag of this.formData.tags) {
      if (tag.key && tag.value) {
        tagsMap[tag.key] = tag.value;
      }
    }

    // Create vector database configuration
    const vectorDatabase = create(KnowledgeBaseCreate_VectorDatabaseSchema, {
      vectorDatabase: {
        case: 'postgres',
        value: create(KnowledgeBaseCreate_VectorDatabase_PostgresSchema, {
          dsn: this.formData.postgresDsn,
          table: this.formData.postgresTable,
        }),
      },
    });

    // Create embedding generator provider
    let embeddingProvider: ReturnType<typeof create<typeof KnowledgeBaseCreate_EmbeddingGenerator_ProviderSchema>>;
    switch (this.formData.embeddingProvider) {
      case 'openai':
        embeddingProvider = create(KnowledgeBaseCreate_EmbeddingGenerator_ProviderSchema, {
          provider: {
            case: 'openai',
            value: create(KnowledgeBaseCreate_EmbeddingGenerator_Provider_OpenAISchema, {
              apiKey: this.formData.openaiApiKey,
            }),
          },
        });
        break;
      case 'cohere':
        embeddingProvider = create(KnowledgeBaseCreate_EmbeddingGenerator_ProviderSchema, {
          provider: {
            case: 'cohere',
            value: create(KnowledgeBaseCreate_EmbeddingGenerator_Provider_CohereSchema, {
              apiKey: this.formData.cohereApiKey,
            }),
          },
        });
        break;
      default:
        throw new Error(`Unknown embedding provider: ${this.formData.embeddingProvider}`);
    }

    // Create embedding generator configuration
    const embeddingGenerator = create(KnowledgeBaseCreate_EmbeddingGeneratorSchema, {
      provider: embeddingProvider,
      dimensions: this.formData.embeddingDimensions,
      model: this.formData.embeddingModel,
    });

    // Create indexer configuration
    const indexerConfig: Record<string, unknown> = {
      chunkSize: this.formData.chunkSize,
      chunkOverlap: this.formData.chunkOverlap,
      inputTopics: this.formData.inputTopics,
    };

    // Include credentials for both manual and auto modes
    indexerConfig.redpandaUsername = this.formData.redpandaUsername;
    indexerConfig.redpandaPassword = this.formData.redpandaPassword;
    indexerConfig.redpandaSaslMechanism = this.formData.redpandaSaslMechanism;

    const indexer = create(KnowledgeBaseCreate_IndexerSchema, indexerConfig);

    // Create retriever configuration (optional)
    let retriever: ReturnType<typeof create<typeof KnowledgeBaseCreate_RetrieverSchema>> | undefined;
    if (this.formData.rerankerEnabled) {
      const rerankerProvider = create(KnowledgeBaseCreate_Retriever_Reranker_ProviderSchema, {
        provider: {
          case: 'cohere',
          value: create(KnowledgeBaseCreate_Retriever_Reranker_Provider_CohereSchema, {
            apiKey: this.formData.rerankerApiKey,
            model: this.formData.rerankerModel,
          }),
        },
      });

      const reranker = create(KnowledgeBaseCreate_Retriever_RerankerSchema, {
        enabled: this.formData.rerankerEnabled,
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
          apiKey: this.formData.generationApiKey,
        }),
      },
    });

    const generation = create(KnowledgeBaseCreate_GenerationSchema, {
      provider: generationProvider,
      model: this.formData.generationModel,
    });

    // Create the main knowledge base object
    const kb = create(KnowledgeBaseCreateSchema, {
      displayName: this.formData.displayName,
      description: this.formData.description,
      tags: tagsMap,
      vectorDatabase,
      embeddingGenerator,
      indexer,
      generation,
      ...(retriever ? { retriever } : {}),
    });

    return kb;
  };

  handleSubmit = async () => {
    if (!this.validateForm()) {
      const errorCount = Object.keys(this.validationErrors).length;
      const firstError = Object.values(this.validationErrors)[0];
      toast({
        status: 'error',
        duration: 5000,
        isClosable: true,
        title: 'Validation Error',
        description: errorCount === 1 ? firstError : `${errorCount} validation errors found. Please check the form.`,
      });
      return;
    }

    this.loading = true;
    try {
      // If auto-generating credentials, create user and secret first
      if (this.formData.credentialChoice === 'auto') {
        const kbId = this.generateKnowledgeBaseId();
        const { username, passwordSecret } = await this.createAutoCredentials(kbId);

        // Update form data with generated credentials
        this.formData.redpandaUsername = username;
        this.formData.redpandaPassword = passwordSecret;

        toast({
          status: 'info',
          duration: 3000,
          isClosable: true,
          title: 'Auto-generated credentials',
          description: `Created user "${username}" and stored password in secret store`,
        });
      }

      const knowledgeBase = this.buildKnowledgeBaseCreate();
      await knowledgebaseApi.createKnowledgeBase(knowledgeBase);

      toast({
        status: 'success',
        duration: 4000,
        isClosable: false,
        title: 'Knowledge base created successfully',
      });

      // Navigate back to the list
      appGlobal.historyPush('/knowledgebases');
    } catch (err) {
      toast({
        status: 'error',
        duration: null,
        isClosable: true,
        title: 'Failed to create knowledge base',
        description: String(err),
      });
    } finally {
      this.loading = false;
    }
  };

  renderBasicInfo = () => (
    <Box mb={6}>
      <Heading mb={4} size="md">
        Basic Information
      </Heading>
      <VStack align="stretch" spacing={4}>
        <FormControl isInvalid={!!this.validationErrors.displayName} isRequired>
          <FormLabel>Display Name</FormLabel>
          <Input
            onChange={(e) => this.updateFormData('displayName', e.target.value)}
            placeholder="Enter display name"
            value={this.formData.displayName}
          />
          <FormErrorMessage>{this.validationErrors.displayName}</FormErrorMessage>
        </FormControl>

        <FormControl>
          <FormLabel>Description</FormLabel>
          <Textarea
            onChange={(e) => this.updateFormData('description', e.target.value)}
            placeholder="Enter description"
            rows={3}
            value={this.formData.description}
          />
        </FormControl>

        <FormControl>
          <FormLabel>Tags</FormLabel>
          <Text color="gray.500" fontSize="sm" mb={2}>
            Labels can help you organize your knowledge bases.
          </Text>
          {this.formData.tags.map((tag, index) => (
            <Flex gap={2} key={index} mb={2}>
              <Input
                flex={1}
                onChange={(e) => this.updateTag(index, 'key', e.target.value)}
                placeholder="Key"
                value={tag.key}
              />
              <Input
                flex={1}
                onChange={(e) => this.updateTag(index, 'value', e.target.value)}
                placeholder="Value"
                value={tag.value}
              />
              <Button onClick={() => this.removeTag(index)} size="sm" variant="outline">
                <Icon as={AiOutlineDelete} />
              </Button>
            </Flex>
          ))}
          <ButtonGroup>
            <Button leftIcon={<span>+</span>} mt={2} onClick={this.addTag} size="sm" variant="outline">
              Add Tag
            </Button>
          </ButtonGroup>
        </FormControl>
      </VStack>
    </Box>
  );

  renderVectorDatabase = () => (
    <Box mb={6}>
      <Heading mb={4} size="md">
        Vector Database
      </Heading>
      <VStack align="stretch" spacing={4}>
        <FormControl>
          <FormLabel>Database Type</FormLabel>
          <Text>PostgreSQL</Text>
          <Text color="gray.500" fontSize="sm">
            Only PostgreSQL is currently supported as a vector database.
          </Text>
        </FormControl>

        <SecretDropdownField
          errorMessage={this.validationErrors.postgresDsn}
          helperText="All credentials are securely stored in your Secrets Store"
          isRequired
          label="PostgreSQL DSN"
          onChange={(value) => this.updateFormData('postgresDsn', value)}
          onCreateNew={() => this.openAddSecret('postgresDsn')}
          placeholder="postgresql://user:password@host:port/database"
          value={this.formData.postgresDsn}
        />
        <FormControl isInvalid={!!this.validationErrors.postgresTable} isRequired>
          <FormLabel>Table Name</FormLabel>
          <Input
            onChange={(e) => this.updateFormData('postgresTable', e.target.value)}
            value={this.formData.postgresTable}
          />
          <FormErrorMessage>{this.validationErrors.postgresTable}</FormErrorMessage>
        </FormControl>
      </VStack>
    </Box>
  );

  renderEmbeddingGenerator = () => (
    <Box mb={6}>
      <Heading mb={4} size="md">
        Embedding Generator
      </Heading>
      <VStack align="stretch" spacing={4}>
        <FormControl>
          <FormLabel>Provider</FormLabel>
          <SingleSelect
            onChange={(value) => this.updateFormData('embeddingProvider', value)}
            options={[
              { value: 'openai', label: 'OpenAI' },
              { value: 'cohere', label: 'Cohere' },
            ]}
            value={this.formData.embeddingProvider}
          />
        </FormControl>

        <FormControl isInvalid={!!this.validationErrors.embeddingModel} isRequired>
          <FormLabel>Model</FormLabel>
          <Input
            onChange={(e) => this.updateFormData('embeddingModel', e.target.value)}
            placeholder="text-embedding-ada-002"
            value={this.formData.embeddingModel}
          />
          {this.formData.embeddingProvider === 'openai' && (
            <Text color="gray.500" fontSize="sm" mt={1}>
              See{' '}
              <Link
                color="blue.500"
                href="https://platform.openai.com/docs/guides/embeddings/embedding-models#embedding-models"
                isExternal
              >
                OpenAI embedding models
              </Link>{' '}
              for available models and dimensions.
            </Text>
          )}
          {this.formData.embeddingProvider === 'cohere' && (
            <Text color="gray.500" fontSize="sm" mt={1}>
              See{' '}
              <Link color="blue.500" href="https://docs.cohere.com/docs/cohere-embed" isExternal>
                Cohere embedding models
              </Link>{' '}
              for available models and dimensions.
            </Text>
          )}
          <FormErrorMessage>{this.validationErrors.embeddingModel}</FormErrorMessage>
        </FormControl>

        <FormControl isInvalid={!!this.validationErrors.embeddingDimensions} isRequired>
          <FormLabel>Dimensions</FormLabel>
          <Input
            onChange={(e) => this.updateFormData('embeddingDimensions', Number.parseInt(e.target.value, 10) || 1536)}
            placeholder="1536"
            type="number"
            value={this.formData.embeddingDimensions}
          />
          <FormErrorMessage>{this.validationErrors.embeddingDimensions}</FormErrorMessage>
        </FormControl>

        {this.formData.embeddingProvider === 'openai' && (
          <SecretDropdownField
            errorMessage={this.validationErrors.openaiApiKey}
            helperText="All credentials are securely stored in your Secrets Store"
            isRequired
            label="OpenAI API Key"
            onChange={(value) => this.updateFormData('openaiApiKey', value)}
            onCreateNew={() => this.openAddSecret('openaiApiKey')}
            placeholder="Select OpenAI API key from secrets"
            value={this.formData.openaiApiKey}
          />
        )}

        {this.formData.embeddingProvider === 'cohere' && (
          <SecretDropdownField
            errorMessage={this.validationErrors.cohereApiKey}
            helperText="All credentials are securely stored in your Secrets Store"
            isRequired
            label="Cohere API Key"
            onChange={(value) => this.updateFormData('cohereApiKey', value)}
            onCreateNew={() => this.openAddSecret('cohereApiKey')}
            placeholder="Select Cohere API key from secrets"
            value={this.formData.cohereApiKey}
          />
        )}
      </VStack>
    </Box>
  );

  renderIndexer = () => (
    <Box mb={6}>
      <Heading mb={4} size="md">
        Indexer
      </Heading>
      <VStack align="stretch" spacing={4}>
        <Flex gap={4}>
          <FormControl isInvalid={!!this.validationErrors.chunkSize} isRequired>
            <FormLabel>Chunk Size</FormLabel>
            <Input
              onChange={(e) => this.updateFormData('chunkSize', Number.parseInt(e.target.value, 10) || 512)}
              placeholder="512"
              type="number"
              value={this.formData.chunkSize}
            />
            <FormErrorMessage>{this.validationErrors.chunkSize}</FormErrorMessage>
          </FormControl>
          <FormControl isInvalid={!!this.validationErrors.chunkOverlap} isRequired>
            <FormLabel>Chunk Overlap</FormLabel>
            <Input
              onChange={(e) => this.updateFormData('chunkOverlap', Number.parseInt(e.target.value, 10) || 100)}
              placeholder="100"
              type="number"
              value={this.formData.chunkOverlap}
            />
            <FormErrorMessage>{this.validationErrors.chunkOverlap}</FormErrorMessage>
          </FormControl>
        </Flex>

        <TopicSelector onTopicsChange={this.updateInputTopics} selectedTopics={this.formData.inputTopics} />
        {this.validationErrors.inputTopics && (
          <Text color="red.500" fontSize="sm" mt={1}>
            {this.validationErrors.inputTopics}
          </Text>
        )}

        <FormControl>
          <FormLabel>Redpanda Credentials</FormLabel>
          <RadioGroup
            direction="column"
            isAttached={false}
            name="credentialChoice"
            onChange={(value) => this.updateFormData('credentialChoice', value)}
            options={[
              {
                value: 'auto',
                label: (
                  <VStack align="start" spacing={1}>
                    <Text fontWeight="medium">Auto-generate credentials (Coming Soon)</Text>
                    <Text color="gray.600" fontSize="sm">
                      We'll create a unique user and password for this knowledge base automatically
                    </Text>
                  </VStack>
                ),
                disabled: true,
              },
              {
                value: 'manual',
                label: (
                  <VStack align="start" spacing={1}>
                    <Text fontWeight="medium">Provide your own credentials</Text>
                    <Text color="gray.600" fontSize="sm">
                      Use existing Redpanda username and password
                    </Text>
                  </VStack>
                ),
              },
            ]}
            value={this.formData.credentialChoice}
          />
        </FormControl>

        {this.formData.credentialChoice === 'manual' && (
          <Flex gap={4}>
            <UserDropdown
              errorMessage={this.validationErrors.redpandaUsername}
              helperText="Select from existing Redpanda users"
              isRequired
              label="Redpanda Username"
              onChange={(value) => this.updateFormData('redpandaUsername', value)}
              value={this.formData.redpandaUsername}
            />
            <SecretDropdownField
              errorMessage={this.validationErrors.redpandaPassword}
              helperText="All credentials are securely stored in your Secrets Store"
              isRequired
              label="Redpanda Password"
              onChange={(value) => this.updateFormData('redpandaPassword', value)}
              onCreateNew={() => this.openAddSecret('redpandaPassword')}
              placeholder="Enter password or select from secrets"
              value={this.formData.redpandaPassword}
            />
          </Flex>
        )}

        {this.formData.credentialChoice === 'manual' && (
          <FormControl isInvalid={!!this.validationErrors.redpandaSaslMechanism} isRequired>
            <FormLabel>SASL Mechanism</FormLabel>
            <SingleSelect
              onChange={(value) => this.updateFormData('redpandaSaslMechanism', value)}
              options={[
                { value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256, label: 'SCRAM-SHA-256' },
                { value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512, label: 'SCRAM-SHA-512' },
              ]}
              value={this.formData.redpandaSaslMechanism}
            />
            <FormErrorMessage>{this.validationErrors.redpandaSaslMechanism}</FormErrorMessage>
          </FormControl>
        )}
      </VStack>
    </Box>
  );

  renderReranker = () => (
    <Box mb={6}>
      <Heading mb={4} size="md">
        Retrieval
      </Heading>
      <VStack align="stretch" spacing={4}>
        <FormControl>
          <Flex alignItems="center" gap={2}>
            <Checkbox
              isChecked={this.formData.rerankerEnabled}
              onChange={(e) => this.updateFormData('rerankerEnabled', e.target.checked)}
            />
            <FormLabel fontWeight="medium" mb={0}>
              Enable Reranker (Recommended)
            </FormLabel>
          </Flex>
          <Text color="gray.500" fontSize="sm" mt={1}>
            Reranker improves search quality by reordering retrieved documents based on relevance.
          </Text>
        </FormControl>

        {this.formData.rerankerEnabled && (
          <>
            <FormControl isInvalid={!!this.validationErrors.rerankerModel} isRequired>
              <FormLabel>Model</FormLabel>
              <Input
                onChange={(e) => this.updateFormData('rerankerModel', e.target.value)}
                placeholder="e.g., rerank-v3.5"
                value={this.formData.rerankerModel}
              />
              <FormErrorMessage>{this.validationErrors.rerankerModel}</FormErrorMessage>
            </FormControl>

            <SecretDropdownField
              errorMessage={this.validationErrors.rerankerApiKey}
              helperText="All credentials are securely stored in your Secrets Store"
              isRequired
              label="API Key"
              onChange={(value) => this.updateFormData('rerankerApiKey', value)}
              onCreateNew={() => this.openAddSecret('rerankerApiKey')}
              placeholder="Select Cohere API key from secrets"
              value={this.formData.rerankerApiKey}
            />
          </>
        )}
      </VStack>
    </Box>
  );

  renderGeneration = () => (
    <Box mb={6}>
      <Heading mb={4} size="md">
        Generation
      </Heading>
      <VStack align="stretch" spacing={4}>
        <FormControl>
          <FormLabel>Provider</FormLabel>
          <Text>OpenAI</Text>
          <Text color="gray.500" fontSize="sm">
            Only OpenAI is currently supported as a generation provider.
          </Text>
        </FormControl>

        <FormControl isInvalid={!!this.validationErrors.generationModel} isRequired>
          <FormLabel>Model</FormLabel>
          <Input
            onChange={(e) => this.updateFormData('generationModel', e.target.value)}
            placeholder="Generation Model"
            value={this.formData.generationModel}
          />
          <Text color="gray.500" fontSize="sm" mt={1}>
            See{' '}
            <Link color="blue.500" href="https://platform.openai.com/docs/models/overview" isExternal>
              OpenAI models
            </Link>{' '}
            for available models.
          </Text>
          <FormErrorMessage>{this.validationErrors.generationModel}</FormErrorMessage>
        </FormControl>

        <SecretDropdownField
          errorMessage={this.validationErrors.generationApiKey}
          helperText="All credentials are securely stored in your Secrets Store"
          isRequired
          label="API Key"
          onChange={(value) => this.updateFormData('generationApiKey', value)}
          onCreateNew={() => this.openAddSecret('generationApiKey')}
          placeholder="Select OpenAI API key from secrets"
          value={this.formData.generationApiKey}
        />
      </VStack>
    </Box>
  );

  render(): JSX.Element {
    return (
      <PageContent>
        <ToastContainer />

        <Box mb={4}>
          <RouterLink to="/knowledgebases">
            <Button size="sm" variant="ghost">
              ← Back to Knowledge Bases
            </Button>
          </RouterLink>
        </Box>

        <Heading mb={6} size="lg">
          Create Knowledge Base
        </Heading>

        {this.renderBasicInfo()}
        {this.renderVectorDatabase()}
        {this.renderEmbeddingGenerator()}
        {this.renderIndexer()}
        {this.renderReranker()}
        {this.renderGeneration()}

        <Flex gap={3} justifyContent="flex-end">
          <RouterLink to="/knowledgebases">
            <Button variant="outline">Cancel</Button>
          </RouterLink>
          <Button
            colorScheme="darkblue"
            isDisabled={!this.isFormValid && Object.keys(this.validationErrors).length > 0}
            isLoading={this.loading}
            loadingText="Creating..."
            onClick={this.handleSubmit}
          >
            Create
          </Button>
        </Flex>

        <SecretsQuickAdd
          isOpen={this.isAddSecretOpen}
          onAdd={this.onAddSecret}
          onCloseAddSecret={this.closeAddSecret}
        />
      </PageContent>
    );
  }
}

export default KnowledgeBaseCreate;
