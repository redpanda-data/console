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
import { CohereLogo } from 'assets/connectors/logos/cohere-logo';
import { OpenAILogo } from 'assets/connectors/logos/openai-logo';
import { Combine, ExternalLink } from 'lucide-react';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';

import { Scope } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import {
  type KnowledgeBase,
  type KnowledgeBaseUpdate,
  KnowledgeBaseUpdate_EmbeddingGenerator_Provider_CohereSchema,
  KnowledgeBaseUpdate_EmbeddingGenerator_Provider_OpenAISchema,
  KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema,
} from '../../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { Card, CardContent, CardHeader, CardTitle } from '../../../redpanda-ui/components/card';
import { FormControl, FormItem, FormLabel } from '../../../redpanda-ui/components/form';
import { Input } from '../../../redpanda-ui/components/input';
import { Heading, Text } from '../../../redpanda-ui/components/typography';
import { EmbeddingModelSelect } from '../../../ui/ai/embedding-model-select';
import { GENERIC_SECRET_VALUE_PATTERN, SecretSelector } from '../../../ui/secret/secret-selector';
import { COHERE_MODELS, OPENAI_MODELS } from '../constants';

type KnowledgeBaseUpdateForm = KnowledgeBaseUpdate & {
  indexer?: KnowledgeBaseUpdate['indexer'] & {
    exactTopics?: string[];
    regexPatterns?: string[];
  };
};

type EmbeddingGeneratorSectionProps = {
  knowledgeBase: KnowledgeBase;
  isEditMode: boolean;
  embeddingApiKey: string;
  availableSecrets: Array<{ id: string; name: string }>;
  onEmbeddingApiKeyChange: (secretId: string) => void;
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

export const EmbeddingGeneratorSection = ({
  knowledgeBase,
  isEditMode,
  embeddingApiKey,
  availableSecrets,
  onEmbeddingApiKeyChange,
}: EmbeddingGeneratorSectionProps) => {
  const { watch, setValue } = useFormContext<KnowledgeBaseUpdateForm>();
  const formData = watch();

  const embeddingGen = knowledgeBase.embeddingGenerator;

  // Ensure embedding provider is always properly initialized when entering edit mode
  useEffect(() => {
    if (isEditMode && formData.embeddingGenerator) {
      const hasProvider = formData.embeddingGenerator.provider?.provider.case;

      if (!hasProvider && embeddingGen?.provider?.provider.case) {
        // Provider structure exists in server data but not in form - re-initialize
        const provider = embeddingGen.provider.provider.case;
        const apiKey = embeddingGen.provider.provider.value.apiKey || '';

        if (provider === 'openai') {
          setValue(
            'embeddingGenerator.provider',
            create(KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema, {
              provider: {
                case: 'openai',
                value: create(KnowledgeBaseUpdate_EmbeddingGenerator_Provider_OpenAISchema, {
                  apiKey,
                }),
              },
            }),
            { shouldDirty: false }
          );
        } else if (provider === 'cohere') {
          setValue(
            'embeddingGenerator.provider',
            create(KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema, {
              provider: {
                case: 'cohere',
                value: create(KnowledgeBaseUpdate_EmbeddingGenerator_Provider_CohereSchema, {
                  baseUrl: embeddingGen.provider.provider.value.baseUrl || '',
                  apiKey,
                }),
              },
            }),
            { shouldDirty: false }
          );
        }
      }
    }
  }, [isEditMode, formData.embeddingGenerator, embeddingGen, setValue]);

  return (
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
              <FormItem>
                <FormLabel>Model</FormLabel>
                <p className="mb-2 text-muted-foreground text-sm">Model cannot be changed after creation.</p>
                <EmbeddingModelSelect
                  disabled
                  models={{
                    openai: OPENAI_MODELS,
                    cohere: COHERE_MODELS,
                  }}
                  onValueChange={() => {
                    // Disabled - no action
                  }}
                  value={embeddingGen?.model || ''}
                />
              </FormItem>

              <FormItem>
                <FormLabel>Dimensions</FormLabel>
                <p className="mb-2 text-muted-foreground text-sm">Dimensions cannot be changed after creation.</p>
                <Input disabled type="number" value={embeddingGen?.dimensions?.toString() || 'Not configured'} />
              </FormItem>

              <FormItem>
                <FormLabel required>API Key</FormLabel>
                <p className="mb-2 text-muted-foreground text-sm">
                  All credentials are securely stored in your Secrets Store
                </p>
                <FormControl>
                  <SecretSelector
                    availableSecrets={availableSecrets}
                    dialogDescription={`Create a new secret for your ${formData.embeddingGenerator?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} API key`}
                    dialogTitle={`Create ${formData.embeddingGenerator?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} API Key Secret`}
                    onChange={onEmbeddingApiKeyChange}
                    placeholder={`Select ${formData.embeddingGenerator?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} API key from secrets`}
                    scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                    secretNamePlaceholder={`e.g., ${formData.embeddingGenerator?.provider?.provider.case === 'openai' ? 'OPENAI' : 'COHERE'}_API_KEY`}
                    secretValueDescription={`Your ${formData.embeddingGenerator?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} API key`}
                    secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                    secretValuePlaceholder="Enter API key"
                    value={embeddingApiKey}
                  />
                </FormControl>
              </FormItem>
            </>
          ) : (
            <>
              <Heading level={3}>
                {embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} Configuration
              </Heading>
              <FormItem>
                <FormLabel>Model</FormLabel>
                <div className="relative">
                  <Input className="pl-9" disabled value={embeddingGen?.model || 'Not configured'} />
                  <div className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3">
                    {embeddingGen?.provider?.provider.case === 'openai' ? (
                      <OpenAILogo className="h-4 w-4 shrink-0" />
                    ) : (
                      <CohereLogo className="h-4 w-4 shrink-0" />
                    )}
                  </div>
                </div>
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
                <Input
                  disabled
                  value={extractSecretName(embeddingGen?.provider?.provider.value?.apiKey || '') || 'Not configured'}
                />
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
