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

import {
  Combine,
  Database,
  ExternalLink,
  Plus,
  Settings,
  Shuffle,
  Sparkles,
  TableOfContents,
  Trash2,
} from 'lucide-react';
import React, { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';

import { UserDropdown } from './components/form-fields/user-dropdown';
import { TopicSelector } from './topic-selector';
import { Scope } from '../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { SASLMechanism } from '../../../protogen/redpanda/api/dataplane/v1/user_pb';
import type {
  KnowledgeBase,
  KnowledgeBaseUpdate,
} from '../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useListSecretsQuery } from '../../../react-query/api/secret';
import { Button } from '../../redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../redpanda-ui/components/card';
import { Checkbox } from '../../redpanda-ui/components/checkbox';
import { DynamicCodeBlock } from '../../redpanda-ui/components/code-block-dynamic';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../redpanda-ui/components/form';
import { Input } from '../../redpanda-ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../redpanda-ui/components/select';
import { Textarea } from '../../redpanda-ui/components/textarea';
import { Heading, Text } from '../../redpanda-ui/components/typography';
import { GENERIC_SECRET_VALUE_PATTERN, SecretSelector } from '../../ui/secret/secret-selector';

type KnowledgeBaseConfigurationTabProps = {
  knowledgeBase: KnowledgeBase;
  isEditMode: boolean;
  getCurrentData: () => KnowledgeBaseUpdate | null;
};

const hasDuplicateKeys = (tags: Array<{ key: string; value: string }>) => {
  const keys = tags.map((tag) => tag.key.trim()).filter((key) => key !== '');
  return keys.length !== new Set(keys).size;
};

const getDuplicateKeys = (tags: Array<{ key: string; value: string }>) => {
  const keys = tags.map((tag) => tag.key.trim()).filter((key) => key !== '');
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  return new Set(duplicates);
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
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex component with multiple configuration sections, refactoring would require significant restructuring
}: KnowledgeBaseConfigurationTabProps) => {
  const { control, watch, setValue } = useFormContext<KnowledgeBaseUpdate>();
  const formData = watch();
  const { data: secretsData } = useListSecretsQuery();

  // Store editable tags in local state, independent from form state
  const [editableTags, setEditableTags] = React.useState<Array<{ key: string; value: string }>>([]);

  const postgres =
    knowledgeBase.vectorDatabase?.vectorDatabase.case === 'postgres'
      ? knowledgeBase.vectorDatabase.vectorDatabase.value
      : null;

  const embeddingGen = knowledgeBase.embeddingGenerator;
  const indexer = knowledgeBase.indexer;
  const retriever = knowledgeBase.retriever;
  const reranker = retriever?.reranker;
  const generation = knowledgeBase.generation;

  // Get current data (prioritizes edited state over server data)
  const currentData = getCurrentData();

  // Extract secret IDs from template format (${secrets.SECRET_ID} -> SECRET_ID)
  const postgresDsn = extractSecretName(
    currentData?.vectorDatabase?.vectorDatabase.case === 'postgres'
      ? currentData.vectorDatabase.vectorDatabase.value.dsn
      : ''
  );

  const embeddingApiKey = extractSecretName(
    (currentData?.embeddingGenerator?.provider?.provider.case === 'openai' &&
      currentData.embeddingGenerator.provider.provider.value.apiKey) ||
      (currentData?.embeddingGenerator?.provider?.provider.case === 'cohere' &&
        currentData.embeddingGenerator.provider.provider.value.apiKey) ||
      ''
  );

  const redpandaPassword = extractSecretName(currentData?.indexer?.redpandaPassword || '');

  const rerankerApiKey = extractSecretName(
    currentData?.retriever?.reranker?.provider?.provider.case === 'cohere'
      ? currentData.retriever.reranker.provider.provider.value.apiKey
      : ''
  );

  const generationApiKey = extractSecretName(
    currentData?.generation?.provider?.provider.case === 'openai'
      ? currentData.generation.provider.provider.value.apiKey
      : ''
  );

  const availableSecrets =
    secretsData?.secrets
      ?.filter((secret) => secret !== undefined)
      .map((secret) => ({
        id: secret.id,
        name: secret.id,
      })) || [];

  // Initialize editableTags from knowledgeBase.tags when component mounts or knowledgeBase changes
  useEffect(() => {
    if (knowledgeBase.tags && typeof knowledgeBase.tags === 'object') {
      const newTagsArray = Object.entries(knowledgeBase.tags).map(([key, value]) => ({ key, value }));
      setEditableTags(newTagsArray);
    } else {
      setEditableTags([]);
    }
  }, [knowledgeBase]);

  // Serialize editableTags to form state whenever they change
  // Only include tags with both key and value filled
  useEffect(() => {
    const tagsMap: Record<string, string> = {};
    for (const tag of editableTags) {
      // Only include tags where both key and value are non-empty
      if (tag.key.trim() && tag.value.trim()) {
        tagsMap[tag.key.trim()] = tag.value.trim();
      }
    }
    setValue('tags', tagsMap, { shouldDirty: true });
  }, [editableTags, setValue]);

  return (
    <div className="flex flex-col gap-6">
      {/* Knowledge Base Configuration Section */}
      <Card className="px-0 py-0" size="full">
        <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <Text className="font-semibold">Knowledge Base Configuration</Text>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <FormLabel>ID</FormLabel>
              <DynamicCodeBlock code={knowledgeBase.id} lang="text" />
            </div>

            {isEditMode ? (
              <FormField
                control={control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormItem>
                <FormLabel>Display Name</FormLabel>
                <Input disabled value={knowledgeBase.displayName} />
              </FormItem>
            )}

            {isEditMode ? (
              <FormField
                control={control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <div className="min-h-[78px] rounded-md border p-3">{knowledgeBase.description}</div>
              </FormItem>
            )}

            <div className="space-y-2">
              <FormLabel>Retrieval API URL</FormLabel>
              <p className="text-muted-foreground text-sm">
                This URL is automatically generated by the system for accessing the knowledge base.
              </p>
              <DynamicCodeBlock code={knowledgeBase.retrievalApiUrl} lang="text" />
            </div>

            {(editableTags.length > 0 || isEditMode) && (
              <div className="flex flex-col gap-2 space-y-4">
                <Heading className="font-medium text-sm" level={4}>
                  Tags
                </Heading>
                <div className="space-y-2">
                  {isEditMode && hasDuplicateKeys(editableTags) && (
                    <Text className="text-destructive" variant="small">
                      Tags must have unique keys
                    </Text>
                  )}
                  {editableTags.map((tag, index) => {
                    const duplicateKeys = isEditMode ? getDuplicateKeys(editableTags) : new Set();
                    const isDuplicateKey = tag.key.trim() !== '' && duplicateKeys.has(tag.key.trim());
                    return (
                      <div className="flex items-center gap-2" key={`tag-${index}`}>
                        <div className="flex-1">
                          <Input
                            className={isDuplicateKey ? 'border-destructive focus:border-destructive' : ''}
                            disabled={!isEditMode}
                            onChange={(e) => {
                              const newTags = [...editableTags];
                              newTags[index] = { ...newTags[index], key: e.target.value };
                              setEditableTags(newTags);
                            }}
                            placeholder="Key"
                            value={tag.key}
                          />
                        </div>
                        <div className="flex-1">
                          <Input
                            disabled={!isEditMode}
                            onChange={(e) => {
                              const newTags = [...editableTags];
                              newTags[index] = { ...newTags[index], value: e.target.value };
                              setEditableTags(newTags);
                            }}
                            placeholder="Value"
                            value={tag.value}
                          />
                        </div>
                        {isEditMode && (
                          <div className="flex h-9 items-end">
                            <Button
                              onClick={() => {
                                const newTags = editableTags.filter((_, i) => i !== index);
                                setEditableTags(newTags);
                              }}
                              size="sm"
                              variant="outline"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {isEditMode && (
                    <Button
                      className="w-full"
                      onClick={() => {
                        setEditableTags([...editableTags, { key: '', value: '' }]);
                      }}
                      variant="dashed"
                    >
                      <Plus className="h-4 w-4" />
                      Add Tag
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Vector Database Section */}
      <Card className="px-0 py-0" size="full">
        <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <Text className="font-semibold">Vector Database</Text>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-col gap-4">
            {isEditMode ? (
              <FormField
                control={control}
                name="vectorDatabase.vectorDatabase.value.dsn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>PostgreSQL DSN</FormLabel>
                    <p className="mb-2 text-muted-foreground text-sm">
                      All credentials are securely stored in your Secrets Store
                    </p>
                    <FormControl>
                      <SecretSelector
                        availableSecrets={availableSecrets}
                        dialogDescription="Create a new secret for your PostgreSQL connection string"
                        dialogTitle="Create PostgreSQL DSN Secret"
                        onChange={field.onChange}
                        placeholder="Select PostgreSQL DSN secret"
                        scopes={[Scope.UNSPECIFIED]}
                        secretNamePlaceholder="e.g., POSTGRES_DSN"
                        secretValueDescription="PostgreSQL connection string (e.g., postgresql://user:password@host:port/database)"
                        secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                        secretValuePlaceholder="postgresql://user:password@host:port/database"
                        value={postgresDsn}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="space-y-2">
                <FormLabel>PostgreSQL DSN</FormLabel>
                <p className="text-muted-foreground text-sm">
                  All credentials are securely stored in your Secrets Store
                </p>
                <DynamicCodeBlock code={postgres?.dsn || 'Not configured'} lang="text" />
              </div>
            )}

            {postgres && (
              <FormItem>
                <FormLabel>Table Name</FormLabel>
                <p className="mb-2 text-muted-foreground text-sm">Table name cannot be changed after creation.</p>
                <Input disabled value={postgres.table} />
              </FormItem>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Embedding Generator Section */}
      <Card className="px-0 py-0" size="full">
        <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
          <CardTitle className="flex items-center gap-2">
            <Combine className="h-4 w-4" />
            <Text className="font-semibold">Embedding Generator</Text>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-col gap-4">
            {isEditMode ? (
              <>
                <Heading level={3}>
                  {embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} Configuration
                </Heading>

                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <Input disabled value={embeddingGen?.model || ''} />
                </FormItem>

                {embeddingGen?.provider?.provider.case === 'openai' && (
                  <p className="-mt-2 mb-2 text-muted-foreground text-sm">
                    <a
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                      href="https://platform.openai.com/docs/guides/embeddings/embedding-models#embedding-models"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      OpenAI embedding models <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    for available models and dimensions.
                  </p>
                )}

                {embeddingGen?.provider?.provider.case === 'cohere' && (
                  <p className="-mt-2 mb-2 text-muted-foreground text-sm">
                    See{' '}
                    <a
                      className="text-blue-500"
                      href="https://docs.cohere.com/docs/cohere-embed"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Cohere embedding models
                    </a>{' '}
                    for available models and dimensions.
                  </p>
                )}

                <FormItem>
                  <FormLabel>Dimensions</FormLabel>
                  <Input disabled value={embeddingGen?.dimensions?.toString() || ''} />
                </FormItem>

                <FormField
                  control={control}
                  name="embeddingGenerator.provider.provider.value.apiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>API Key</FormLabel>
                      <p className="mb-2 text-muted-foreground text-sm">
                        All credentials are securely stored in your Secrets Store
                      </p>
                      <FormControl>
                        <SecretSelector
                          availableSecrets={availableSecrets}
                          dialogDescription={`Create a new secret for your ${embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} API key`}
                          dialogTitle={`Create ${embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} API Key Secret`}
                          onChange={field.onChange}
                          placeholder={`Select ${embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} API key from secrets`}
                          scopes={[Scope.UNSPECIFIED]}
                          secretNamePlaceholder={`e.g., ${embeddingGen?.provider?.provider.case === 'openai' ? 'OPENAI' : 'COHERE'}_API_KEY`}
                          secretValueDescription={`Your ${embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} API key`}
                          secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                          secretValuePlaceholder="Enter API key"
                          value={embeddingApiKey}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : (
              <>
                <Heading level={3}>
                  {embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} Configuration
                </Heading>
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <Input disabled value={embeddingGen?.model || 'Not configured'} />
                </FormItem>

                {embeddingGen?.provider?.provider.case === 'openai' && (
                  <p className="-mt-2 mb-2 text-muted-foreground text-sm">
                    <a
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                      href="https://platform.openai.com/docs/guides/embeddings/embedding-models#embedding-models"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      OpenAI embedding models <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    for available models and dimensions.
                  </p>
                )}

                {embeddingGen?.provider?.provider.case === 'cohere' && (
                  <p className="-mt-2 mb-2 text-muted-foreground text-sm">
                    See{' '}
                    <a
                      className="text-blue-500"
                      href="https://docs.cohere.com/docs/cohere-embed"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Cohere embedding models
                    </a>{' '}
                    for available models and dimensions.
                  </p>
                )}

                <FormItem>
                  <FormLabel>Dimensions</FormLabel>
                  <Input disabled value={embeddingGen?.dimensions?.toString() || 'Not configured'} />
                </FormItem>
                <div className="space-y-2">
                  <FormLabel>API Key</FormLabel>
                  <p className="text-muted-foreground text-sm">
                    All credentials are securely stored in your Secrets Store
                  </p>
                  <DynamicCodeBlock
                    code={embeddingGen?.provider?.provider.value?.apiKey || 'Not configured'}
                    lang="text"
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Indexer Section */}
      <Card className="px-0 py-0" size="full">
        <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
          <CardTitle className="flex items-center gap-2">
            <TableOfContents className="h-4 w-4" />
            <Text className="font-semibold">Indexer</Text>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-col gap-4">
            {isEditMode ? (
              <>
                <div className="flex gap-4">
                  <FormField
                    control={control}
                    name="indexer.chunkSize"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel required>Chunk Size</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            min={1}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            type="number"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name="indexer.chunkOverlap"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel required>Chunk Overlap</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            min={0}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            type="number"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <FormItem>
                  <FormLabel required>Input Topics</FormLabel>
                  <FormField
                    control={control}
                    name="indexer.inputTopics"
                    render={({ field }) => (
                      <TopicSelector onTopicsChange={field.onChange} selectedTopics={field.value || []} />
                    )}
                  />
                </FormItem>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <FormField
                      control={control}
                      name="indexer.redpandaUsername"
                      render={({ field }) => (
                        <UserDropdown
                          helperText="Select from existing Redpanda users"
                          isRequired
                          label="Redpanda Username"
                          onChange={field.onChange}
                          value={field.value || ''}
                        />
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <FormField
                      control={control}
                      name="indexer.redpandaPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Redpanda Password</FormLabel>
                          <p className="mb-2 text-muted-foreground text-sm">
                            All credentials are securely stored in your Secrets Store
                          </p>
                          <FormControl>
                            <SecretSelector
                              availableSecrets={availableSecrets}
                              dialogDescription="Create a new secret for your Redpanda password"
                              dialogTitle="Create Redpanda Password Secret"
                              onChange={field.onChange}
                              placeholder="Enter password or select from secrets"
                              scopes={[Scope.UNSPECIFIED]}
                              secretNamePlaceholder="e.g., REDPANDA_PASSWORD"
                              secretValueDescription="Your Redpanda user password"
                              secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                              secretValuePlaceholder="Enter password"
                              value={redpandaPassword}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={control}
                  name="indexer.redpandaSaslMechanism"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>SASL Mechanism</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(Number(value))}
                        value={String(field.value || SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={String(SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256)}>
                            SCRAM-SHA-256
                          </SelectItem>
                          <SelectItem value={String(SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512)}>
                            SCRAM-SHA-512
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </>
            ) : (
              <>
                <div className="flex gap-4">
                  <FormItem className="flex-1">
                    <FormLabel>Chunk Size</FormLabel>
                    <Input disabled type="number" value={indexer?.chunkSize || 512} />
                  </FormItem>
                  <FormItem className="flex-1">
                    <FormLabel>Chunk Overlap</FormLabel>
                    <Input disabled type="number" value={indexer?.chunkOverlap || 100} />
                  </FormItem>
                </div>

                <FormItem>
                  <FormLabel>Input Topics</FormLabel>
                  <TopicSelector
                    isReadOnly={true}
                    onTopicsChange={() => {
                      // Read-only field, no action needed
                    }}
                    selectedTopics={indexer?.inputTopics || []}
                  />
                </FormItem>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <UserDropdown
                      helperText="Select from existing Redpanda users"
                      isDisabled
                      isRequired
                      label="Redpanda Username"
                      onChange={() => {
                        // Read-only field, no action needed
                      }}
                      value={indexer?.redpandaUsername || ''}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <FormLabel>Redpanda Password</FormLabel>
                    <p className="text-muted-foreground text-sm">
                      All credentials are securely stored in your Secrets Store
                    </p>
                    <DynamicCodeBlock code={indexer?.redpandaPassword || 'Not configured'} lang="text" />
                  </div>
                </div>

                <FormItem>
                  <FormLabel>SASL Mechanism</FormLabel>
                  <Input
                    disabled
                    value={
                      indexer?.redpandaSaslMechanism === SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512
                        ? 'SCRAM-SHA-512'
                        : 'SCRAM-SHA-256'
                    }
                  />
                </FormItem>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Retriever Section */}
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
                <FormField
                  control={control}
                  name="retriever.reranker.enabled"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        <FormLabel className="mb-0 font-medium">Enable Reranker (Recommended)</FormLabel>
                      </div>
                      <p className="mt-1 text-muted-foreground text-sm">
                        Reranker improves search quality by reordering retrieved documents based on relevance.
                      </p>
                    </FormItem>
                  )}
                />

                {formData.retriever?.reranker?.enabled && (
                  <>
                    <FormField
                      control={control}
                      name="retriever.reranker.provider.provider.case"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Provider</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || 'cohere'}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="cohere">Cohere</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name="retriever.reranker.provider.provider.value.model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Model</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name="retriever.reranker.provider.provider.value.apiKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>API Key</FormLabel>
                          <p className="mb-2 text-muted-foreground text-sm">
                            All credentials are securely stored in your Secrets Store
                          </p>
                          <FormControl>
                            <SecretSelector
                              availableSecrets={availableSecrets}
                              dialogDescription="Create a new secret for your Cohere API key"
                              dialogTitle="Create Cohere API Key Secret"
                              onChange={field.onChange}
                              placeholder="Select Cohere API key from secrets"
                              scopes={[Scope.UNSPECIFIED]}
                              secretNamePlaceholder="e.g., COHERE_API_KEY"
                              secretValueDescription="Your Cohere API key"
                              secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                              secretValuePlaceholder="Enter API key"
                              value={rerankerApiKey}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
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

                {reranker?.enabled && reranker.provider && (
                  <>
                    <FormItem>
                      <FormLabel>Provider</FormLabel>
                      <Input disabled value={reranker.provider.provider.case || 'Not configured'} />
                    </FormItem>

                    {reranker.provider.provider.case === 'cohere' && (
                      <>
                        <FormItem>
                          <FormLabel>Model</FormLabel>
                          <Input disabled value={reranker.provider.provider.value.model} />
                        </FormItem>
                        <div className="space-y-2">
                          <FormLabel>API Key</FormLabel>
                          <DynamicCodeBlock
                            code={reranker.provider.provider.value.apiKey || 'Not configured'}
                            lang="text"
                          />
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Generation Section */}
      <Card className="px-0 py-0" size="full">
        <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <Text className="font-semibold">Generation</Text>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-col gap-4">
            <Text variant="small">
              The Generation provider is used to generate the final response in the chat endpoint.
            </Text>

            {isEditMode ? (
              <>
                <Heading level={3}>
                  {generation?.provider?.provider.case === 'openai' ? 'OpenAI' : 'OpenAI'} Configuration
                </Heading>

                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <Input disabled value={generation?.model || ''} />
                </FormItem>

                <FormField
                  control={control}
                  name="generation.provider.provider.value.apiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>API Key</FormLabel>
                      <Text className="mb-2" variant="muted">
                        OpenAI API key for authentication
                      </Text>
                      <FormControl>
                        <SecretSelector
                          availableSecrets={availableSecrets}
                          dialogDescription="Create a new secret for your OpenAI API key"
                          dialogTitle="Create OpenAI API Key Secret"
                          onChange={field.onChange}
                          placeholder="Select OpenAI API key from secrets"
                          scopes={[Scope.UNSPECIFIED]}
                          secretNamePlaceholder="e.g., OPENAI_API_KEY"
                          secretValueDescription="Your OpenAI API key"
                          secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                          secretValuePlaceholder="Enter API key"
                          value={generationApiKey}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : (
              <>
                <Heading level={3}>
                  {generation?.provider?.provider.case === 'openai' ? 'OpenAI' : 'OpenAI'} Configuration
                </Heading>

                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <Input disabled value={generation?.model || ''} />
                </FormItem>

                <div className="space-y-2">
                  <FormLabel>API Key</FormLabel>
                  <DynamicCodeBlock
                    code={
                      generation?.provider?.provider.case === 'openai'
                        ? generation.provider.provider.value.apiKey
                        : 'Not configured'
                    }
                    lang="text"
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
