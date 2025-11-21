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

import CohereLogo from 'assets/cohere.svg';
import OpenAILogo from 'assets/openai.svg';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Text } from 'components/redpanda-ui/components/typography';
import {
  GENERIC_SECRET_VALUE_PATTERN,
  OPENAI_API_KEY_PATTERN,
  SecretSelector,
} from 'components/ui/secret/secret-selector';
import { ExternalLink } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type { UseFormReturn } from 'react-hook-form';

import { COHERE_MODELS, detectEmbeddingProvider, OPENAI_MODELS } from '../../constants';
import type { KnowledgeBaseCreateFormValues } from '../../schemas';

type EmbeddingGeneratorSectionProps = {
  form: UseFormReturn<KnowledgeBaseCreateFormValues>;
  availableSecrets: Array<{ id: string; name: string }>;
  embeddingProvider: 'openai' | 'cohere';
};

export const EmbeddingGeneratorSection: React.FC<EmbeddingGeneratorSectionProps> = ({
  form,
  availableSecrets,
  embeddingProvider,
}) => (
  <Card size="full">
    <CardHeader>
      <CardTitle>Embedding Generator</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="embeddingModel"
          render={({ field }) => {
            const detectedProvider = detectEmbeddingProvider(field.value);
            const currentProvider = detectedProvider === 'openai' ? OpenAILogo : CohereLogo;
            const currentProviderLabel = detectedProvider === 'openai' ? 'OpenAI' : 'Cohere';

            return (
              <FormItem>
                <FormLabel required>Model</FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    // Auto-detect and set provider based on selected model
                    const provider = detectEmbeddingProvider(value);
                    if (provider) {
                      form.setValue('embeddingProvider', provider);
                    }
                    // Set dimensions based on selected model
                    const allModels = [...OPENAI_MODELS, ...COHERE_MODELS];
                    const selectedModel = allModels.find((m) => m.name === value);
                    if (selectedModel) {
                      form.setValue('embeddingDimensions', selectedModel.dimensions);
                    }
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select embedding model">
                        {field.value ? (
                          <div className="flex items-center gap-2">
                            <img alt={currentProviderLabel} className="h-4 w-4" src={currentProvider} />
                            <span>{field.value}</span>
                          </div>
                        ) : (
                          'Select embedding model'
                        )}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>
                        <div className="flex items-center gap-2">
                          <img alt="OpenAI" className="h-4 w-4" src={OpenAILogo} />
                          <span>OpenAI</span>
                        </div>
                      </SelectLabel>
                      {OPENAI_MODELS.map((model) => (
                        <SelectItem key={model.name} value={model.name}>
                          <div className="flex flex-col gap-0.5">
                            <Text className="font-medium">{model.name}</Text>
                            <Text className="text-xs" variant="muted">
                              {model.description}
                            </Text>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>
                        <div className="flex items-center gap-2">
                          <img alt="Cohere" className="h-4 w-4" src={CohereLogo} />
                          <span>Cohere</span>
                        </div>
                      </SelectLabel>
                      {COHERE_MODELS.map((model) => (
                        <SelectItem key={model.name} value={model.name}>
                          <div className="flex flex-col gap-0.5">
                            <Text className="font-medium">{model.name}</Text>
                            <Text className="text-xs" variant="muted">
                              {model.description}
                            </Text>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {embeddingProvider === 'openai' && (
                  <FormDescription>
                    See{' '}
                    <a
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                      href="https://platform.openai.com/docs/guides/embeddings/embedding-models#embedding-models"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      OpenAI embedding models <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    for available models and dimensions.
                  </FormDescription>
                )}
                {embeddingProvider === 'cohere' && (
                  <FormDescription>
                    See{' '}
                    <a
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                      href="https://docs.cohere.com/docs/cohere-embed"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Cohere embedding models <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    for available models and dimensions.
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="embeddingDimensions"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Dimensions</FormLabel>
              <FormControl>
                <Input
                  placeholder="1536"
                  type="number"
                  {...field}
                  onChange={(e) => field.onChange(Number.parseInt(e.target.value, 10) || 1536)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {embeddingProvider === 'openai' && (
          <FormField
            control={form.control}
            name="openaiApiKey"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <img alt="OpenAI" className="h-4 w-4" src={OpenAILogo} />
                  <Text className="font-medium text-sm">OpenAI Configuration</Text>
                </div>
                <FormLabel required>API Key</FormLabel>
                <FormControl>
                  <SecretSelector
                    availableSecrets={availableSecrets}
                    dialogDescription="Create a new secret for your OpenAI API key. The secret will be stored securely."
                    dialogTitle="Create OpenAI API key secret"
                    emptyStateMessage="Create a secret to securely store your OpenAI API key"
                    onChange={field.onChange}
                    placeholder="Select OpenAI API key from secrets"
                    scopes={[Scope.REDPANDA_CONNECT]}
                    secretNamePlaceholder="e.g., OPENAI_API_KEY"
                    secretValueDescription="Your OpenAI API key"
                    secretValuePattern={OPENAI_API_KEY_PATTERN}
                    secretValuePlaceholder="Enter OpenAI API key (e.g., sk-...)"
                    value={field.value || ''}
                  />
                </FormControl>
                <FormDescription>All credentials are securely stored in your Secrets Store</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {embeddingProvider === 'cohere' && (
          <FormField
            control={form.control}
            name="cohereApiKey"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <img alt="Cohere" className="h-4 w-4" src={CohereLogo} />
                  <Text className="font-medium text-sm">Cohere Configuration</Text>
                </div>
                <FormLabel required>API Key</FormLabel>
                <FormControl>
                  <SecretSelector
                    availableSecrets={availableSecrets}
                    dialogDescription="Create a new secret for your Cohere API key. The secret will be stored securely."
                    dialogTitle="Create Cohere API key secret"
                    emptyStateMessage="Create a secret to securely store your Cohere API key"
                    onChange={field.onChange}
                    placeholder="Select Cohere API key from secrets"
                    scopes={[Scope.REDPANDA_CONNECT]}
                    secretNamePlaceholder="e.g., COHERE_API_KEY"
                    secretValueDescription="Your Cohere API key"
                    secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                    secretValuePlaceholder="Enter Cohere API key"
                    value={field.value || ''}
                  />
                </FormControl>
                <FormDescription>All credentials are securely stored in your Secrets Store</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
    </CardContent>
  </Card>
);
