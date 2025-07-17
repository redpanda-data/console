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
import { SASLMechanism } from '../../../protogen/redpanda/api/dataplane/v1/user_pb';
import { useListUsersQuery } from '../../../react-query/api/user';
import {
  Badge,
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
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  RadioGroup,
  Select,
  Table,
  Tabs,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  VStack,
} from '@redpanda-data/ui';
import type { TabsItemProps } from '@redpanda-data/ui/dist/components/Tabs/Tabs';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import React, { useState } from 'react';
import { AiOutlineDelete, AiOutlinePlus } from 'react-icons/ai';
import { config } from '../../../config';
import {
  type KnowledgeBase,
  KnowledgeBase_VectorDatabase_PostgresSchema,
  KnowledgeBaseSchema,
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
import { ListTopicsRequestSchema } from '../../../protogen/redpanda/api/dataplane/v1alpha1/topic_pb';
import { listTopics } from '../../../protogen/redpanda/api/dataplane/v1alpha1/topic-TopicService_connectquery';
import { rpcnSecretManagerApi } from '../../../state/backendApi';
import { getMessageFieldMetadata } from '../../../utils/protobuf-reflection';
import { ProtoDisplayField, ProtoInputField, ProtoTextareaField } from '../../misc/ProtoFormField';
import { SingleSelect } from '../../misc/Select';
import { ChatMarkdown } from '../agents/details/chat/chat-markdown';
import { SecretsQuickAdd } from '../rp-connect/secrets/Secrets.QuickAdd';

const { ToastContainer, toast } = createStandaloneToast();

const CREATE_NEW_OPTION_VALUE = 'CREATE_NEW_OPTION_VALUE';

const UserDropdown = ({
  label,
  value,
  onChange,
  isRequired = false,
  errorMessage,
  helperText,
  isDisabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isRequired?: boolean;
  errorMessage?: string;
  helperText?: string;
  isDisabled?: boolean;
}) => {
  const { data: usersData, isLoading } = useListUsersQuery();

  const userOptions = usersData?.users?.map((user) => ({
    value: user.name,
    label: user.name,
  })) || [];

  return (
    <FormControl isRequired={isRequired} isInvalid={!!errorMessage}>
      <FormLabel fontWeight="medium">{label}</FormLabel>
      {helperText && (
        <Text fontSize="sm" color="gray.500" mb={2}>
          {helperText}
        </Text>
      )}
      <SingleSelect
        value={value}
        onChange={onChange}
        options={userOptions}
        placeholder={isLoading ? 'Loading users...' : 'Select a user...'}
        isLoading={isLoading}
        isDisabled={isDisabled}
      />
      {errorMessage && <FormErrorMessage>{errorMessage}</FormErrorMessage>}
    </FormControl>
  );
};

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
    <FormControl isRequired={isRequired} isInvalid={!!errorMessage}>
      <FormLabel fontWeight="medium">{label}</FormLabel>
      {helperText && (
        <Text fontSize="sm" color="gray.500" mb={2}>
          {helperText}
        </Text>
      )}
      <SingleSelect
        value={value}
        onChange={handleChange}
        options={allOptions}
        placeholder={placeholder || 'Select a secret...'}
      />
      {errorMessage && <FormErrorMessage>{errorMessage}</FormErrorMessage>}
    </FormControl>
  );
};

interface TopicSelectorProps {
  selectedTopics: string[];
  onTopicsChange: (topics: string[]) => void;
  isReadOnly?: boolean;
}

const TopicSelector = ({ selectedTopics, onTopicsChange, isReadOnly = false }: TopicSelectorProps) => {
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
    }),
  );

  const allTopics = (topicsData?.topics || [])
    .filter((topic) => !topic.internal)
    .map((topic) => topic.name)
    .filter(
      (name) =>
        !name.startsWith('__redpanda') &&
        !name.startsWith('_internal') &&
        !name.startsWith('_redpanda') &&
        name !== '_schemas',
    );

  // Check if a string is a regex pattern (contains regex special characters)
  const isRegexPattern = (str: string) => {
    const regexChars = /[.*+?^${}()|[\]\\]/;
    return regexChars.test(str);
  };

  // Test if a topic matches a regex pattern
  const topicMatchesPattern = (topic: string, pattern: string) => {
    try {
      const regex = new RegExp(pattern);
      return regex.test(topic);
    } catch {
      return false; // Invalid regex
    }
  };

  // Get topics that match a pattern
  const getMatchingTopics = (pattern: string) => {
    if (!isRegexPattern(pattern)) return [];
    return allTopics.filter((topic) => topicMatchesPattern(topic, pattern));
  };

  // Create options for the select
  const topicOptions = allTopics
    .filter((topic) => !selectedTopics.includes(topic)) // Exclude already selected
    .filter((topic) => topic.toLowerCase().includes(searchTerm.toLowerCase()))
    .map((topic) => ({
      value: topic,
      label: topic,
    }));

  // Filter options based on search term
  const filteredOptions = topicOptions.slice(0, 50); // Limit to 50 for performance

  const formatOptionLabel = (option: any) => (
    <div>
      <div>{option.label}</div>
    </div>
  );

  const handleInputChange = (inputValue: string, { action }: any) => {
    if (action === 'input-change') {
      setSearchTerm(inputValue);
    }
  };

  const handleKeyDown = (event: any) => {
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

  if (isReadOnly) {
    return (
      <Box>
        <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={1}>
          Input Topics
        </Text>
        <Text fontSize="sm" color="gray.500" mb={2}>
          Select topics or enter regex patterns (e.g., my-topics-prefix-.*) to index for this knowledge base.
        </Text>

        <Select
          isMulti
          isSearchable={false}
          placeholder="Topics configured"
          options={[]}
          value={selectedValues}
          onChange={() => {}} // No-op for read-only
          isDisabled
        />

        {/* Show preview of what each selected item matches */}
        {selectedTopics.length > 0 && (
          <Box mt={2}>
            <Text fontSize="sm" fontWeight="medium" mb={2}>
              Preview of selected topics:
            </Text>

            {/* Show exact topics first */}
            {selectedTopics.filter((topic) => !isRegexPattern(topic)).length > 0 && (
              <Box mb={2} p={2} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" fontWeight="medium" mb={1}>
                  Exact topics ({selectedTopics.filter((topic) => !isRegexPattern(topic)).length}):
                </Text>
                <Box maxH="100px" overflowY="auto">
                  {selectedTopics
                    .filter((topic) => !isRegexPattern(topic))
                    .map((topic, idx) => (
                      <Text key={idx} fontSize="xs" color="gray.700" pl={2}>
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
                  <Box key={index} mb={2} p={2} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                    <Text fontSize="sm" fontWeight="medium" color="blue.600">
                      {topic}{' '}
                      <Text as="span" fontSize="xs" color="gray.500">
                        (regex pattern)
                      </Text>
                    </Text>
                    {matchingTopics.length > 0 ? (
                      <Box mt={1}>
                        <Text fontSize="xs" color="gray.600" mb={1}>
                          Matches {matchingTopics.length} topics:
                        </Text>
                        <Box maxH="100px" overflowY="auto">
                          {matchingTopics.map((matchedTopic, idx) => (
                            <Text key={idx} fontSize="xs" color="gray.700" pl={2}>
                              • {matchedTopic}
                            </Text>
                          ))}
                        </Box>
                      </Box>
                    ) : (
                      <Text fontSize="xs" color="red.500" mt={1}>
                        No topics match this pattern
                      </Text>
                    )}
                  </Box>
                );
              })}
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={1}>
        Input Topics
      </Text>
      <Text fontSize="sm" color="gray.500" mb={2}>
        Select topics or enter regex patterns (e.g., my-topics-prefix-.*) to index for this knowledge base.
      </Text>

      <Select
        isMulti
        isSearchable
        isLoading={isLoading}
        placeholder="Search topics or enter regex patterns..."
        options={filteredOptions}
        value={selectedValues}
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
        formatOptionLabel={formatOptionLabel}
        inputValue={searchTerm}
        filterOption={() => true}
        noOptionsMessage={() => (searchTerm ? `Press Enter to add pattern: ${searchTerm}` : 'No topics found')}
      />

      {/* Show preview of what each selected item matches */}
      {selectedTopics.length > 0 && (
        <Box mt={2}>
          <Text fontSize="sm" fontWeight="medium" mb={2}>
            Preview of selected topics:
          </Text>

          {/* Show exact topics first */}
          {selectedTopics.filter((topic) => !isRegexPattern(topic)).length > 0 && (
            <Box mb={2} p={2} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
              <Text fontSize="sm" fontWeight="medium" mb={1}>
                Exact topics ({selectedTopics.filter((topic) => !isRegexPattern(topic)).length}):
              </Text>
              <Box maxH="100px" overflowY="auto">
                {selectedTopics
                  .filter((topic) => !isRegexPattern(topic))
                  .map((topic, idx) => (
                    <Text key={idx} fontSize="xs" color="gray.700" pl={2}>
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
                <Box key={index} mb={2} p={2} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                  <Text fontSize="sm" fontWeight="medium" color="blue.600">
                    {topic}{' '}
                    <Text as="span" fontSize="xs" color="gray.500">
                      (regex pattern)
                    </Text>
                  </Text>
                  {matchingTopics.length > 0 ? (
                    <Box mt={1}>
                      <Text fontSize="xs" color="gray.600" mb={1}>
                        Matches {matchingTopics.length} topics:
                      </Text>
                      <Box maxH="100px" overflowY="auto">
                        {matchingTopics.map((matchedTopic, idx) => (
                          <Text key={idx} fontSize="xs" color="gray.700" pl={2}>
                            • {matchedTopic}
                          </Text>
                        ))}
                      </Box>
                    </Box>
                  ) : (
                    <Text fontSize="xs" color="red.500" mt={1}>
                      No topics match this pattern
                    </Text>
                  )}
                </Box>
              );
            })}
        </Box>
      )}
    </Box>
  );
};

interface KnowledgeBaseEditTabsProps {
  knowledgeBase: KnowledgeBase;
  isEditMode?: boolean;
  onSave?: (updatedKnowledgeBase: KnowledgeBaseUpdate, updateMask?: string[]) => Promise<void>;
  onCancel?: () => void;
  onFormChange?: (hasChanges: boolean) => void;
}

@observer
export class KnowledgeBaseEditTabs extends React.Component<KnowledgeBaseEditTabsProps> {
  @observable formData: KnowledgeBaseUpdate = this.initializeFormData();
  @observable loading = false;
  @observable isAddSecretOpen = false;
  @observable currentSecretField: string | null = null;
  @observable validationErrors: { [key: string]: string } = {};
  @observable hasChanges = false;
  @observable changedFields: Set<string> = new Set();
  @observable tagsArray: Array<{ key: string; value: string }> = [];

  // Playground state
  @observable playgroundMode: 'retrieve' | 'chat' = 'retrieve';
  @observable query = '';
  @observable topN = 10;
  @observable isQueryLoading = false;
  @observable retrievalResults: any[] = [];
  @observable chatResponse = '';
  @observable chatLoadingPhase: 'retrieving' | 'thinking' = 'retrieving';

  // Text preview modal state
  @observable isTextModalOpen = false;
  @observable selectedChunkText = '';
  @observable selectedChunkInfo: { document: string; chunkId: string; topic: string } | null = null;

  constructor(props: KnowledgeBaseEditTabsProps) {
    super(props);
    makeObservable(this);
  }

  componentDidUpdate(prevProps: KnowledgeBaseEditTabsProps): void {
    // Refresh form data when entering edit mode or when knowledge base data changes
    if ((this.props.isEditMode && !prevProps.isEditMode) || this.props.knowledgeBase !== prevProps.knowledgeBase) {
      this.refreshFormData();
    }
  }

  componentDidMount(): void {
    // Initialize tags array on mount
    this.tagsArray = Object.entries(this.props.knowledgeBase?.tags || {}).map(([key, value]) => ({ key, value }));
  }

  initializeFormData(): KnowledgeBaseUpdate {
    const { knowledgeBase } = this.props;

    if (!knowledgeBase) {
      // Return empty form data if knowledge base is not loaded yet
      return create(KnowledgeBaseUpdateSchema, {
        displayName: '',
        description: '',
        tags: {},
      });
    }

    // Copy all fields from the knowledge base to the update form
    const updateData = create(KnowledgeBaseUpdateSchema, {
      displayName: knowledgeBase.displayName || '',
      description: knowledgeBase.description || '',
      tags: { ...(knowledgeBase.tags || {}) },
    });

    // Copy vector database configuration using proper conversion
    if (knowledgeBase.vectorDatabase?.vectorDatabase.case === 'postgres') {
      updateData.vectorDatabase = create(KnowledgeBaseUpdate_VectorDatabaseSchema, {
        vectorDatabase: {
          case: 'postgres',
          value: create(KnowledgeBaseUpdate_VectorDatabase_PostgresSchema, {
            dsn: knowledgeBase.vectorDatabase.vectorDatabase.value.dsn,
          }),
        },
      });
    }

    // Copy embedding generator configuration using proper conversion
    if (knowledgeBase.embeddingGenerator) {
      const embGen = knowledgeBase.embeddingGenerator;
      updateData.embeddingGenerator = create(KnowledgeBaseUpdate_EmbeddingGeneratorSchema, {
        // dimensions and model are immutable, removed from update schema
      });

      // Copy provider configuration
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

    // Copy indexer configuration using proper conversion
    if (knowledgeBase.indexer) {
      updateData.indexer = create(KnowledgeBaseUpdate_IndexerSchema, {
        chunkSize: knowledgeBase.indexer.chunkSize,
        chunkOverlap: knowledgeBase.indexer.chunkOverlap,
        redpandaUsername: knowledgeBase.indexer.redpandaUsername,
        redpandaPassword: knowledgeBase.indexer.redpandaPassword,
        redpandaSaslMechanism: knowledgeBase.indexer.redpandaSaslMechanism,
        inputTopics: knowledgeBase.indexer.inputTopics ? [...knowledgeBase.indexer.inputTopics] : [],
      });
    }

    // Copy retriever configuration using proper conversion
    if (knowledgeBase.retriever) {
      updateData.retriever = create(KnowledgeBaseUpdate_RetrieverSchema, {});

      if (knowledgeBase.retriever.reranker) {
        const reranker = knowledgeBase.retriever.reranker;
        updateData.retriever.reranker = create(KnowledgeBaseUpdate_Retriever_RerankerSchema, {
          enabled: reranker.enabled,
        });

        // Copy reranker provider configuration
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

    // Copy generation configuration using proper conversion
    if (knowledgeBase.generation) {
      updateData.generation = create(KnowledgeBaseUpdate_GenerationSchema, {});

      // Copy provider configuration
      if (knowledgeBase.generation.provider?.provider.case === 'openai') {
        updateData.generation.provider = create(KnowledgeBaseUpdate_Generation_ProviderSchema, {
          provider: {
            case: 'openai',
            value: create(KnowledgeBaseUpdate_Generation_Provider_OpenAISchema, {
              apiKey: knowledgeBase.generation.provider.provider.value.apiKey,
            }),
          },
        });
      }
    }

    return updateData;
  }

  refreshFormData(): void {
    // Re-initialize form data with current knowledge base values
    this.formData = this.initializeFormData();
    this.hasChanges = false;
    this.changedFields.clear();

    // Initialize tags array from the knowledge base
    this.tagsArray = Object.entries(this.props.knowledgeBase?.tags || {}).map(([key, value]) => ({ key, value }));

    // Notify parent that changes have been reset
    if (this.props.onFormChange) {
      this.props.onFormChange(false);
    }
  }

  updateFormData = (path: string, value: any) => {
    // Simple path-based updates - we can make this more sophisticated later
    const keys = path.split('.');
    let current: any = this.formData;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;

    // Special handling for reranker enabled - initialize provider structure
    if (path === 'retriever.reranker.enabled' && value === true) {
      if (!this.formData.retriever?.reranker?.provider) {
        // Ensure the path exists before assignment
        if (!this.formData.retriever) {
          this.formData.retriever = create(KnowledgeBaseUpdate_RetrieverSchema, {});
        }
        if (!this.formData.retriever.reranker) {
          this.formData.retriever.reranker = create(KnowledgeBaseUpdate_Retriever_RerankerSchema, {});
        }
        this.formData.retriever.reranker.provider = create(KnowledgeBaseUpdate_Retriever_Reranker_ProviderSchema, {
          provider: {
            case: 'cohere',
            value: create(KnowledgeBaseUpdate_Retriever_Reranker_Provider_CohereSchema, {
              model: 'rerank-v3.5',
              apiKey: '',
            }),
          },
        });
      }
    }

    this.hasChanges = true;

    // Track the full path of the field that changed (for updateMask)
    // This allows for granular field masks instead of broad top-level ones
    this.changedFields.add(path);

    // Notify parent about changes
    if (this.props.onFormChange) {
      this.props.onFormChange(this.hasChanges);
    }
  };

  updateTags = () => {
    // Convert tagsArray to object and update formData
    const tagsMap: { [key: string]: string } = {};
    for (const tag of this.tagsArray) {
      if (tag.key && tag.value) {
        tagsMap[tag.key] = tag.value;
      }
    }
    this.formData.tags = tagsMap;
    this.hasChanges = true;
    this.changedFields.add('tags');

    // Notify parent about changes
    if (this.props.onFormChange) {
      this.props.onFormChange(this.hasChanges);
    }
  };

  addTag = () => {
    this.tagsArray.push({ key: '', value: '' });
    this.updateTags();
  };

  removeTag = (index: number) => {
    this.tagsArray.splice(index, 1);
    this.updateTags();
  };

  updateTag = (index: number, field: 'key' | 'value', value: string) => {
    if (this.tagsArray[index]) {
      this.tagsArray[index][field] = value;
      this.updateTags();
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
      this.updateFormData(this.currentSecretField, secretNotation);
    }
    this.closeAddSecret();
  };

  // Convert snake_case to camelCase (protobuf field names to TypeScript property names)
  protobufFieldToCamelCase = (fieldName: string): string => {
    return fieldName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  };

  validateForm = () => {
    const errors: { [key: string]: string } = {};

    // Use protobuf reflection for validation
    const metadata = getMessageFieldMetadata(KnowledgeBaseUpdateSchema);

    // Check required fields
    if (metadata) {
      for (const [protoFieldName, meta] of Object.entries(metadata)) {
        if (meta.isRequired) {
          // Convert protobuf field name (display_name) to TypeScript property name (displayName)
          const camelCaseFieldName = this.protobufFieldToCamelCase(protoFieldName);
          const value = (this.formData as any)[camelCaseFieldName];

          if (!value || (typeof value === 'string' && !value.trim())) {
            errors[camelCaseFieldName] = `${meta.name.replace(/_/g, ' ')} is required`;
          }
        }
      }
    }

    this.validationErrors = errors;
    return Object.keys(errors).length === 0;
  };

  generateUpdateMask(): string[] {
    // Convert dot-notation paths to protobuf field paths
    const updateMask: string[] = [];

    for (const fieldPath of this.changedFields) {
      // Convert dot-notation path to protobuf field path
      // e.g., "generation.provider.apiKey" -> "generation.provider.api_key"
      const protobufPath = fieldPath
        .split('.')
        .map((segment) => segment.replace(/([A-Z])/g, '_$1').toLowerCase())
        .join('.');
      updateMask.push(protobufPath);
    }

    return updateMask;
  }

  handleSave = async () => {
    if (!this.validateForm()) {
      const errorCount = Object.keys(this.validationErrors).length;
      toast({
        status: 'error',
        duration: 5000,
        isClosable: true,
        title: 'Validation Error',
        description: `${errorCount} validation errors found. Please check the form.`,
      });
      return;
    }

    if (this.props.onSave) {
      this.loading = true;
      try {
        // Generate update mask from changed fields
        const updateMask = this.generateUpdateMask();

        // Call onSave with form data and update mask
        await this.props.onSave(this.formData, updateMask);
        this.hasChanges = false;
        this.changedFields.clear();
      } catch (_error) {
        // Error handling is done by the parent component
      } finally {
        this.loading = false;
      }
    }
  };

  renderGeneralTab = () => {
    const { knowledgeBase, isEditMode } = this.props;

    return (
      <VStack spacing={4} align="stretch">
        <Heading size="md">General</Heading>
        {/* ID field - always visible for layout stability */}
        <ProtoDisplayField messageSchema={KnowledgeBaseSchema} fieldName="id" label="ID" value={knowledgeBase.id} />

        {/* Display Name field */}
        {isEditMode ? (
          <ProtoInputField
            messageSchema={KnowledgeBaseUpdateSchema}
            fieldName="display_name"
            label="Display Name"
            value={this.formData.displayName}
            onChange={(value) => this.updateFormData('displayName', value)}
            error={this.validationErrors.displayName}
          />
        ) : (
          <ProtoDisplayField
            messageSchema={KnowledgeBaseSchema}
            fieldName="display_name"
            label="Display Name"
            value={knowledgeBase.displayName}
          />
        )}

        {/* Description field */}
        {isEditMode ? (
          <ProtoTextareaField
            messageSchema={KnowledgeBaseUpdateSchema}
            fieldName="description"
            label="Description"
            value={this.formData.description}
            onChange={(value) => this.updateFormData('description', value)}
            error={this.validationErrors.description}
            textareaProps={{ rows: 3 }}
          />
        ) : (
          <Box>
            <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={1}>
              Description
            </Text>
            <Box
              p={3}
              bg="gray.50"
              borderRadius="md"
              border="1px solid"
              borderColor="gray.200"
              minH="78px" // Match textarea with 3 rows
            >
              <Text fontSize="sm" color="gray.900">
                {knowledgeBase.description || (
                  <Text as="span" color="gray.400" fontStyle="italic">
                    Not set
                  </Text>
                )}
              </Text>
            </Box>
          </Box>
        )}

        {/* Retrieval API URL - always visible for layout stability */}
        <ProtoDisplayField
          messageSchema={KnowledgeBaseSchema}
          fieldName="retrieval_api_url"
          label="Retrieval API URL"
          value={knowledgeBase.retrievalApiUrl}
          description="This URL is automatically generated by the system for accessing the knowledge base."
        />

        {/* Tags section */}
        <Box>
          <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={1}>
            Tags
          </Text>
          <Text fontSize="sm" color="gray.500" mb={2}>
            Labels can help you organize your knowledge bases.
          </Text>
          {isEditMode ? (
            <FormControl>
              {this.tagsArray.map((tag, index) => (
                <Flex key={index} gap={2} mb={2}>
                  <Input
                    placeholder="Key"
                    value={tag.key}
                    onChange={(e) => this.updateTag(index, 'key', e.target.value)}
                    flex={1}
                  />
                  <Input
                    placeholder="Value"
                    value={tag.value}
                    onChange={(e) => this.updateTag(index, 'value', e.target.value)}
                    flex={1}
                  />
                  <Button variant="outline" size="sm" onClick={() => this.removeTag(index)}>
                    <Icon as={AiOutlineDelete} />
                  </Button>
                </Flex>
              ))}
              <ButtonGroup>
                <Button variant="outline" size="sm" onClick={this.addTag} leftIcon={<span>+</span>} mt={2}>
                  Add Tag
                </Button>
              </ButtonGroup>
            </FormControl>
          ) : (
            <Box p={3} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
              {knowledgeBase.tags && Object.keys(knowledgeBase.tags).length > 0 ? (
                <Flex gap={2} flexWrap="wrap">
                  {Object.entries(knowledgeBase.tags).map(([key, value]) => (
                    <Badge key={key} variant="outline" size="sm">
                      {key}: {value}
                    </Badge>
                  ))}
                </Flex>
              ) : (
                <Text fontSize="sm" color="gray.400" fontStyle="italic">
                  No tags configured
                </Text>
              )}
            </Box>
          )}
        </Box>
      </VStack>
    );
  };

  renderVectorDatabaseTab = () => {
    const { knowledgeBase, isEditMode } = this.props;
    const postgres =
      knowledgeBase.vectorDatabase?.vectorDatabase.case === 'postgres'
        ? knowledgeBase.vectorDatabase.vectorDatabase.value
        : null;

    return (
      <VStack spacing={4} align="stretch">
        <Heading size="md">Vector Database</Heading>

        {isEditMode ? (
          <SecretDropdownField
            label="PostgreSQL DSN"
            value={
              this.formData.vectorDatabase?.vectorDatabase.case === 'postgres'
                ? this.formData.vectorDatabase.vectorDatabase.value.dsn
                : ''
            }
            onChange={(value) => this.updateFormData('vectorDatabase.vectorDatabase.value.dsn', value)}
            placeholder="postgresql://user:password@host:port/database"
            onCreateNew={() => this.openAddSecret('vectorDatabase.vectorDatabase.value.dsn')}
            isRequired
            helperText="All credentials are securely stored in your Secrets Store"
          />
        ) : (
          <Box>
            <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={1}>
              PostgreSQL DSN
            </Text>
            <Text fontSize="sm" color="gray.500" mb={2}>
              All credentials are securely stored in your Secrets Store
            </Text>
            <Box p={3} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
              <Text fontSize="sm" color="gray.900">
                {postgres?.dsn || 'Not configured'}
              </Text>
            </Box>
          </Box>
        )}

        {postgres && (
          <ProtoDisplayField
            messageSchema={KnowledgeBase_VectorDatabase_PostgresSchema}
            fieldName="table"
            label="Table Name"
            value={postgres.table}
            description="Table name cannot be changed after creation."
          />
        )}
      </VStack>
    );
  };

  renderEmbeddingGeneratorTab = () => {
    const { knowledgeBase, isEditMode } = this.props;
    const embeddingGen = knowledgeBase.embeddingGenerator;

    return (
      <VStack spacing={4} align="stretch">
        <Heading size="md">Embedding Generator</Heading>
        {isEditMode ? (
          <>
            {/* Provider type is immutable, show as heading */}
            <Heading size="sm">
              {embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} Configuration
            </Heading>

            {/* Model and Dimensions are immutable, show as read-only */}
            <ProtoDisplayField label="Model" value={embeddingGen?.model || ''} />

            {embeddingGen?.provider?.provider.case === 'openai' && (
              <Text fontSize="sm" color="gray.500" mt={-2} mb={2}>
                See{' '}
                <Link
                  href="https://platform.openai.com/docs/guides/embeddings/embedding-models#embedding-models"
                  isExternal
                  color="blue.500"
                >
                  OpenAI embedding models
                </Link>{' '}
                for available models and dimensions.
              </Text>
            )}

            {embeddingGen?.provider?.provider.case === 'cohere' && (
              <Text fontSize="sm" color="gray.500" mt={-2} mb={2}>
                See{' '}
                <Link href="https://docs.cohere.com/docs/cohere-embed" isExternal color="blue.500">
                  Cohere embedding models
                </Link>{' '}
                for available models and dimensions.
              </Text>
            )}

            <ProtoDisplayField label="Dimensions" value={embeddingGen?.dimensions?.toString() || ''} />

            {/* API Key based on provider */}
            <SecretDropdownField
              label="API Key"
              value={
                embeddingGen?.provider?.provider.case === 'openai'
                  ? embeddingGen.provider.provider.value.apiKey
                  : embeddingGen?.provider?.provider.case === 'cohere'
                    ? embeddingGen.provider.provider.value.apiKey
                    : ''
              }
              onChange={(value) => {
                const path =
                  embeddingGen?.provider?.provider.case === 'openai'
                    ? 'embeddingGenerator.provider.provider.value.apiKey'
                    : 'embeddingGenerator.provider.provider.value.apiKey';
                this.updateFormData(path, value);
              }}
              placeholder={`Select ${embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} API key from secrets`}
              onCreateNew={() => this.openAddSecret('embeddingGenerator.provider.provider.value.apiKey')}
              isRequired
              helperText="All credentials are securely stored in your Secrets Store"
            />
          </>
        ) : (
          <>
            <Heading size="sm">
              {embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} Configuration
            </Heading>
            <ProtoDisplayField
              messageSchema={KnowledgeBaseSchema}
              fieldName="embedding_generator"
              label="Model"
              value={embeddingGen?.model || 'Not configured'}
            />

            {embeddingGen?.provider?.provider.case === 'openai' && (
              <Text fontSize="sm" color="gray.500" mt={-2} mb={2}>
                See{' '}
                <Link
                  href="https://platform.openai.com/docs/guides/embeddings/embedding-models#embedding-models"
                  isExternal
                  color="blue.500"
                >
                  OpenAI embedding models
                </Link>{' '}
                for available models and dimensions.
              </Text>
            )}

            {embeddingGen?.provider?.provider.case === 'cohere' && (
              <Text fontSize="sm" color="gray.500" mt={-2} mb={2}>
                See{' '}
                <Link href="https://docs.cohere.com/docs/cohere-embed" isExternal color="blue.500">
                  Cohere embedding models
                </Link>{' '}
                for available models and dimensions.
              </Text>
            )}

            <ProtoDisplayField
              messageSchema={KnowledgeBaseSchema}
              fieldName="embedding_generator"
              label="Dimensions"
              value={embeddingGen?.dimensions || 'Not configured'}
            />
            <Box>
              <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={1}>
                API Key
              </Text>
              <Text fontSize="sm" color="gray.500" mb={2}>
                All credentials are securely stored in your Secrets Store
              </Text>
              <Box p={3} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.900">
                  {embeddingGen?.provider?.provider.value?.apiKey || 'Not configured'}
                </Text>
              </Box>
            </Box>
          </>
        )}
      </VStack>
    );
  };

  renderIndexerTab = () => {
    const { knowledgeBase, isEditMode } = this.props;
    const indexer = knowledgeBase.indexer;

    return (
      <VStack spacing={4} align="stretch">
        <Heading size="md">Indexer</Heading>
        {isEditMode ? (
          <>
            <Flex gap={4}>
              <FormControl>
                <FormLabel>Chunk Size</FormLabel>
                <Input
                  type="number"
                  value={this.formData.indexer?.chunkSize || 512}
                  onChange={(e) => this.updateFormData('indexer.chunkSize', Number(e.target.value))}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Chunk Overlap</FormLabel>
                <Input
                  type="number"
                  value={this.formData.indexer?.chunkOverlap || 100}
                  onChange={(e) => this.updateFormData('indexer.chunkOverlap', Number(e.target.value))}
                />
              </FormControl>
            </Flex>

            <TopicSelector
              selectedTopics={this.formData.indexer?.inputTopics || []}
              onTopicsChange={(topics) => this.updateFormData('indexer.inputTopics', topics)}
            />

            <Flex gap={4}>
              <UserDropdown
                label="Redpanda Username"
                value={this.formData.indexer?.redpandaUsername || ''}
                onChange={(value) => this.updateFormData('indexer.redpandaUsername', value)}
                isRequired
                helperText="Select from existing Redpanda users"
              />
              <SecretDropdownField
                label="Redpanda Password"
                value={this.formData.indexer?.redpandaPassword || ''}
                onChange={(value) => this.updateFormData('indexer.redpandaPassword', value)}
                placeholder="Enter password or select from secrets"
                onCreateNew={() => this.openAddSecret('indexer.redpandaPassword')}
                helperText="All credentials are securely stored in your Secrets Store"
              />
            </Flex>

            <FormControl isRequired>
              <FormLabel>SASL Mechanism</FormLabel>
              <SingleSelect
                value={this.formData.indexer?.redpandaSaslMechanism || SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256}
                onChange={(value) => this.updateFormData('indexer.redpandaSaslMechanism', value)}
                options={[
                  { value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256, label: 'SCRAM-SHA-256' },
                  { value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512, label: 'SCRAM-SHA-512' },
                ]}
              />
            </FormControl>
          </>
        ) : (
          <>
            <Flex gap={4}>
              <FormControl>
                <FormLabel>Chunk Size</FormLabel>
                <Input
                  type="number"
                  value={indexer?.chunkSize || 512}
                  isDisabled
                />
              </FormControl>
              <FormControl>
                <FormLabel>Chunk Overlap</FormLabel>
                <Input
                  type="number"
                  value={indexer?.chunkOverlap || 100}
                  isDisabled
                />
              </FormControl>
            </Flex>

            <TopicSelector
              selectedTopics={indexer?.inputTopics || []}
              onTopicsChange={() => {}} // No-op for read-only
              isReadOnly={true}
            />

            <Flex gap={4}>
              <UserDropdown
                label="Redpanda Username"
                value={indexer?.redpandaUsername || ''}
                onChange={() => {}} // No-op for read-only
                isRequired
                helperText="Select from existing Redpanda users"
                isDisabled
              />
              <FormControl isRequired>
                <FormLabel fontWeight="medium">Redpanda Password</FormLabel>
                <Text fontSize="sm" color="gray.500" mb={2}>
                  All credentials are securely stored in your Secrets Store
                </Text>
                <SingleSelect
                  value={indexer?.redpandaPassword || ''}
                  onChange={() => {}} // No-op for read-only
                  options={[]}
                  placeholder="Password configured"
                  isDisabled
                />
              </FormControl>
            </Flex>

            <FormControl isRequired>
              <FormLabel>SASL Mechanism</FormLabel>
              <SingleSelect
                value={indexer?.redpandaSaslMechanism || SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256}
                onChange={() => {}} // No-op for read-only
                options={[
                  { value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256, label: 'SCRAM-SHA-256' },
                  { value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512, label: 'SCRAM-SHA-512' },
                ]}
                isDisabled
              />
            </FormControl>
          </>
        )}
      </VStack>
    );
  };

  renderRetrieverTab = () => {
    const { knowledgeBase, isEditMode } = this.props;
    const retriever = knowledgeBase.retriever;
    const reranker = retriever?.reranker;

    return (
      <VStack spacing={4} align="stretch">
        <Heading size="md">Retriever</Heading>

        {isEditMode ? (
          <>
            <FormControl>
              <Flex alignItems="center" gap={2}>
                <Checkbox
                  isChecked={this.formData.retriever?.reranker?.enabled || false}
                  onChange={(e) => this.updateFormData('retriever.reranker.enabled', e.target.checked)}
                />
                <FormLabel fontWeight="medium" mb={0}>
                  Enable Reranker (Recommended)
                </FormLabel>
              </Flex>
              <Text fontSize="sm" color="gray.500" mt={1}>
                Reranker improves search quality by reordering retrieved documents based on relevance.
              </Text>
            </FormControl>

            {this.formData.retriever?.reranker?.enabled && (
              <>
                <FormControl>
                  <FormLabel>Provider</FormLabel>
                  <SingleSelect
                    value={this.formData.retriever?.reranker?.provider?.provider.case || 'cohere'}
                    onChange={(value) => this.updateFormData('retriever.reranker.provider.provider.case', value)}
                    options={[{ value: 'cohere', label: 'Cohere' }]}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Model</FormLabel>
                  <Input
                    value={this.formData.retriever?.reranker?.provider?.provider.value?.model || 'rerank-v3.5'}
                    onChange={(e) =>
                      this.updateFormData('retriever.reranker.provider.provider.value.model', e.target.value)
                    }
                  />
                </FormControl>

                <SecretDropdownField
                  label="API Key"
                  value={this.formData.retriever?.reranker?.provider?.provider.value?.apiKey || ''}
                  onChange={(value) => this.updateFormData('retriever.reranker.provider.provider.value.apiKey', value)}
                  placeholder="Select Cohere API key from secrets"
                  onCreateNew={() => this.openAddSecret('retriever.reranker.provider.provider.value.apiKey')}
                  isRequired
                  helperText="All credentials are securely stored in your Secrets Store"
                />
              </>
            )}
          </>
        ) : (
          <>
            <FormControl>
              <Flex alignItems="center" gap={2}>
                <Checkbox
                  isChecked={reranker?.enabled || false}
                  isDisabled={true}
                />
                <FormLabel fontWeight="medium" mb={0}>
                  Enable Reranker (Recommended)
                </FormLabel>
              </Flex>
              <Text fontSize="sm" color="gray.500" mt={1}>
                Reranker improves search quality by reordering retrieved documents based on relevance.
              </Text>
            </FormControl>

            {reranker?.enabled && reranker.provider && (
              <>
                <ProtoDisplayField
                  messageSchema={KnowledgeBaseSchema}
                  fieldName="retriever"
                  label="Provider"
                  value={reranker.provider.provider.case || 'Not configured'}
                />

                {reranker.provider.provider.case === 'cohere' && (
                  <>
                    <ProtoDisplayField
                      messageSchema={KnowledgeBaseSchema}
                      fieldName="retriever"
                      label="Model"
                      value={reranker.provider.provider.value.model}
                    />
                    <ProtoDisplayField
                      messageSchema={KnowledgeBaseSchema}
                      fieldName="retriever"
                      label="API Key"
                      value={reranker.provider.provider.value.apiKey || 'Not configured'}
                    />
                  </>
                )}
              </>
            )}
          </>
        )}
      </VStack>
    );
  };

  // Method to call the retrieval API
  callRetrievalAPI = async () => {
    if (!this.query.trim()) {
      toast({
        status: 'error',
        duration: 3000,
        isClosable: true,
        title: 'Query Required',
        description: 'Please enter a query to retrieve results.',
      });
      return;
    }

    const { knowledgeBase } = this.props;
    if (!knowledgeBase.retrievalApiUrl) {
      toast({
        status: 'error',
        duration: 3000,
        isClosable: true,
        title: 'No Retrieval API',
        description: 'This knowledge base does not have a retrieval API URL configured.',
      });
      return;
    }

    this.isQueryLoading = true;
    try {
      const token = config.jwt;

      if (!token) {
        toast({
          status: 'error',
          isClosable: true,
          title: 'Authentication Required',
          description: 'JWT token is not available. Please ensure you are properly authenticated.',
        });
        return;
      }

      const response = await fetch(`${knowledgeBase.retrievalApiUrl}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: this.query,
          top_n: this.topN,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const results = await response.json();
      this.retrievalResults = results;

      toast({
        status: 'success',
        duration: 3000,
        isClosable: true,
        title: 'Query Completed',
        description: `Retrieved ${results.length} results`,
      });
    } catch (error) {
      console.error('Retrieval API error:', error);
      toast({
        status: 'error',
        duration: 5000,
        isClosable: true,
        title: 'Query Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      this.isQueryLoading = false;
    }
  };

  // Method to call the chat API
  callChatAPI = async () => {
    if (!this.query.trim()) {
      toast({
        status: 'error',
        duration: 3000,
        isClosable: true,
        title: 'Query Required',
        description: 'Please enter a query to chat.',
      });
      return;
    }

    const { knowledgeBase } = this.props;
    if (!knowledgeBase.retrievalApiUrl) {
      toast({
        status: 'error',
        duration: 3000,
        isClosable: true,
        title: 'No Chat API',
        description: 'This knowledge base does not have a chat API URL configured.',
      });
      return;
    }

    this.isQueryLoading = true;
    this.chatLoadingPhase = 'retrieving';

    // Set a timer to switch to "thinking" phase after 1 second
    const thinkingTimer = setTimeout(() => {
      this.chatLoadingPhase = 'thinking';
    }, 1000);

    try {
      const token = config.jwt;

      if (!token) {
        clearTimeout(thinkingTimer);
        this.isQueryLoading = false;
        toast({
          status: 'error',
          isClosable: true,
          title: 'Authentication Required',
          description: 'JWT token is not available. Please ensure you are properly authenticated.',
        });
        return;
      }

      const response = await fetch(`${knowledgeBase.retrievalApiUrl}/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: this.query,
          top_n: this.topN,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      this.chatResponse = result.response || 'No response received';

      toast({
        status: 'success',
        duration: 3000,
        isClosable: true,
        title: 'Chat Completed',
        description: 'Received chat response',
      });
    } catch (error) {
      console.error('Chat API error:', error);
      toast({
        status: 'error',
        duration: 5000,
        isClosable: true,
        title: 'Chat Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      clearTimeout(thinkingTimer);
      this.isQueryLoading = false;
    }
  };

  // Methods for text preview modal
  openTextModal = (text: string, document: string, chunkId: string, topic: string) => {
    this.selectedChunkText = text;
    this.selectedChunkInfo = { document, chunkId, topic };
    this.isTextModalOpen = true;
  };

  closeTextModal = () => {
    this.isTextModalOpen = false;
    this.selectedChunkText = '';
    this.selectedChunkInfo = null;
  };

  renderGenerationTab = () => {
    const { knowledgeBase, isEditMode } = this.props;
    const generation = knowledgeBase.generation;

    return (
      <VStack spacing={4} align="stretch">
        <Heading size="md">Generation</Heading>
        <Text fontSize="sm" color="gray.600">
          The Generation provider is used to generate the final response in the chat endpoint.
        </Text>

        {isEditMode ? (
          <>
            {/* Provider type is immutable, show as heading */}
            <Heading size="sm">
              {generation?.provider?.provider.case === 'openai' ? 'OpenAI' : 'OpenAI'} Configuration
            </Heading>

            <ProtoDisplayField label="Model" value={generation?.model || ''} />

            {/* API Key */}
            <SecretDropdownField
              label="API Key"
              value={generation?.provider?.provider.case === 'openai' ? generation.provider.provider.value.apiKey : ''}
              onChange={(value) => {
                this.updateFormData('generation.provider.provider.value.apiKey', value);
              }}
              onCreateNew={() => this.openAddSecret('generation.provider.provider.value.apiKey')}
              isRequired
              helperText="OpenAI API key for authentication"
            />
          </>
        ) : (
          <>
            {/* Display fields for view mode */}
            <Heading size="sm">
              {generation?.provider?.provider.case === 'openai' ? 'OpenAI' : 'OpenAI'} Configuration
            </Heading>

            <ProtoDisplayField label="Model" value={generation?.model || ''} />

            <ProtoDisplayField
              label="API Key"
              value={generation?.provider?.provider.case === 'openai' ? generation.provider.provider.value.apiKey : ''}
            />
          </>
        )}
      </VStack>
    );
  };

  renderPlaygroundTab = () => {
    const { knowledgeBase } = this.props;

    return (
      <VStack spacing={4} align="stretch">
        <Heading size="md">Playground</Heading>

        {/* Mode Selection */}
        <FormControl>
          <FormLabel>Mode</FormLabel>
          <RadioGroup
            name="playgroundMode"
            direction="row"
            isAttached={false}
            value={this.playgroundMode}
            onChange={(value) => (this.playgroundMode = value as 'retrieve' | 'chat')}
            options={[
              {
                value: 'retrieve',
                label: 'Retrieve',
              },
              {
                value: 'chat',
                label: 'Chat',
              },
            ]}
          />
        </FormControl>

        {this.playgroundMode === 'retrieve' && (
          <VStack spacing={4} align="stretch">
            {/* Query Input */}
            <FormControl>
              <FormLabel>Query</FormLabel>
              <Textarea
                placeholder="Enter your query here... (e.g., 'which redpanda tiers exist? Show a table')"
                value={this.query}
                onChange={(e) => (this.query = e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    this.callRetrievalAPI();
                  }
                }}
                rows={3}
                resize="vertical"
              />
            </FormControl>

            {/* Top N Field */}
            <FormControl>
              <FormLabel>Number of Results</FormLabel>
              <Input
                type="number"
                min={1}
                max={100}
                value={this.topN}
                onChange={(e) => (this.topN = Number(e.target.value))}
                width="120px"
              />
            </FormControl>

            {/* Submit Button */}
            <Button
              colorScheme="darkblue"
              onClick={this.callRetrievalAPI}
              isLoading={this.isQueryLoading}
              loadingText="Retrieving..."
              disabled={!knowledgeBase.retrievalApiUrl}
              width="fit-content"
            >
              Submit Query
            </Button>

            {/* API URL Info */}
            {knowledgeBase.retrievalApiUrl && (
              <Text fontSize="sm" color="gray.600">
                Using retrieval API: {knowledgeBase.retrievalApiUrl}
              </Text>
            )}

            {/* Results Table */}
            {this.retrievalResults.length > 0 && (
              <Box>
                <Heading size="sm" mb={3}>
                  Results ({this.retrievalResults.length})
                </Heading>
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Score</Th>
                      <Th>Document</Th>
                      <Th>Chunk ID</Th>
                      <Th>Topic</Th>
                      <Th>Text Preview</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {this.retrievalResults.map((result, index) => (
                      <Tr key={index}>
                        <Td>{result.score?.toFixed(3)}</Td>
                        <Td>{result.document_name}</Td>
                        <Td>{result.chunk_id}</Td>
                        <Td>
                          <Badge size="sm" variant="outline">
                            {result.topic}
                          </Badge>
                        </Td>
                        <Td maxW="300px">
                          <Text
                            fontSize="sm"
                            noOfLines={2}
                            cursor="pointer"
                            color="blue.500"
                            _hover={{ color: 'blue.600', textDecoration: 'underline' }}
                            onClick={() =>
                              this.openTextModal(result.text, result.document_name, result.chunk_id, result.topic)
                            }
                            title="Click to view full text"
                          >
                            {result.text}
                          </Text>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </VStack>
        )}

        {this.playgroundMode === 'chat' && (
          <VStack spacing={4} align="stretch">
            {/* Query Input */}
            <FormControl>
              <FormLabel>Chat Message</FormLabel>
              <Textarea
                placeholder="Ask a question about your knowledge base... (e.g., 'What are the different redpanda tiers and their features?')"
                value={this.query}
                onChange={(e) => (this.query = e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    this.callChatAPI();
                  }
                }}
                rows={3}
                resize="vertical"
              />
            </FormControl>

            {/* Top N Field */}
            <FormControl>
              <FormLabel>Number of Context Documents</FormLabel>
              <Input
                type="number"
                min={1}
                max={100}
                value={this.topN}
                onChange={(e) => (this.topN = Number(e.target.value))}
                width="120px"
              />
            </FormControl>

            {/* Submit Button */}
            <Button
              colorScheme="darkblue"
              onClick={this.callChatAPI}
              isLoading={this.isQueryLoading}
              loadingText={this.chatLoadingPhase === 'retrieving' ? 'Retrieving documents...' : 'Thinking...'}
              disabled={!knowledgeBase.retrievalApiUrl}
              width="fit-content"
            >
              Send Message
            </Button>

            {/* API URL Info */}
            {knowledgeBase.retrievalApiUrl && (
              <Text fontSize="sm" color="gray.600">
                Using chat API: {knowledgeBase.retrievalApiUrl}
              </Text>
            )}

            {/* Chat Response */}
            {this.chatResponse && (
              <Box>
                <Heading size="sm" mb={3}>
                  Response
                </Heading>
                <Box p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                  <ChatMarkdown
                    message={{
                      content: this.chatResponse,
                      sender: 'system' as const,
                      timestamp: new Date(),
                      id: 'chat-response',
                      agentId: 'knowledgebase',
                      failure: false,
                    }}
                  />
                </Box>
              </Box>
            )}
          </VStack>
        )}
      </VStack>
    );
  };

  render() {
    const tabs: TabsItemProps[] = [
      {
        key: 'general',
        name: 'General',
        component: this.renderGeneralTab(),
      },
      {
        key: 'vector-database',
        name: 'Vector Database',
        component: this.renderVectorDatabaseTab(),
      },
      {
        key: 'embedding-generator',
        name: 'Embedding Generator',
        component: this.renderEmbeddingGeneratorTab(),
      },
      {
        key: 'indexer',
        name: 'Indexing',
        component: this.renderIndexerTab(),
      },
      {
        key: 'retriever',
        name: 'Retrieval',
        component: this.renderRetrieverTab(),
      },
      {
        key: 'generation',
        name: 'Generation',
        component: this.renderGenerationTab(),
      },
      {
        key: 'playground',
        name: 'Playground',
        component: this.renderPlaygroundTab(),
      },
    ];

    return (
      <Box>
        <ToastContainer />

        <Tabs items={tabs} />

        <SecretsQuickAdd
          isOpen={this.isAddSecretOpen}
          onCloseAddSecret={this.closeAddSecret}
          onAdd={this.onAddSecret}
        />

        <Modal isOpen={this.isTextModalOpen} onClose={this.closeTextModal} size="4xl">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>
              <VStack align="start" spacing={1}>
                <Text fontSize="lg" fontWeight="bold">
                  Chunk Text Preview
                </Text>
                {this.selectedChunkInfo && (
                  <Flex gap={4} fontSize="sm" color="gray.600">
                    <Text>
                      <strong>Document:</strong> {this.selectedChunkInfo.document}
                    </Text>
                    <Text>
                      <strong>Chunk ID:</strong> {this.selectedChunkInfo.chunkId}
                    </Text>
                    <Badge size="sm" variant="outline">
                      {this.selectedChunkInfo.topic}
                    </Badge>
                  </Flex>
                )}
              </VStack>
            </ModalHeader>
            <ModalBody pb={6}>
              <Box
                p={4}
                bg="gray.50"
                borderRadius="md"
                border="1px solid"
                borderColor="gray.200"
                maxH="400px"
                overflowY="auto"
              >
                <Text fontSize="sm" whiteSpace="pre-wrap" lineHeight="tall">
                  {this.selectedChunkText}
                </Text>
              </Box>
            </ModalBody>
          </ModalContent>
        </Modal>
      </Box>
    );
  }
}
