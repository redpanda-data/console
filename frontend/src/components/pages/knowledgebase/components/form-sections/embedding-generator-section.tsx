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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Text } from 'components/redpanda-ui/components/typography';
import { GENERIC_SECRET_VALUE_PATTERN } from 'components/ui/secret/secret-selector';
import { ExternalLink } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type { UseFormReturn } from 'react-hook-form';

import type { KnowledgeBaseCreateFormValues } from '../../schemas';
import { SecretDropdownField } from '../form-fields/secret-dropdown-field';

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
          name="embeddingProvider"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="openai">
                    <div className="flex items-center gap-2">
                      <img alt="OpenAI" className="h-4 w-4" src={OpenAILogo} />
                      <span>OpenAI</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="cohere">
                    <div className="flex items-center gap-2">
                      <img alt="Cohere" className="h-4 w-4" src={CohereLogo} />
                      <span>Cohere</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="embeddingModel"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Model</FormLabel>
              <FormControl>
                <Input placeholder="text-embedding-ada-002" {...field} />
              </FormControl>
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
          )}
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
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <img alt="OpenAI" className="h-4 w-4" src={OpenAILogo} />
                  <Text className="font-medium text-sm">OpenAI Configuration</Text>
                </div>
                <SecretDropdownField
                  availableSecrets={availableSecrets}
                  errorMessage={form.formState.errors.openaiApiKey?.message}
                  helperText="All credentials are securely stored in your Secrets Store"
                  isRequired
                  label="API Key"
                  onChange={field.onChange}
                  placeholder="Select OpenAI API key from secrets"
                  scopes={[Scope.REDPANDA_CONNECT]}
                  value={field.value || ''}
                />
              </div>
            )}
          />
        )}

        {embeddingProvider === 'cohere' && (
          <FormField
            control={form.control}
            name="cohereApiKey"
            render={({ field }) => (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <img alt="Cohere" className="h-4 w-4" src={CohereLogo} />
                  <Text className="font-medium text-sm">Cohere Configuration</Text>
                </div>
                <SecretDropdownField
                  availableSecrets={availableSecrets}
                  dialogDescription="Create a new secret for your Cohere API key. The secret will be stored securely."
                  dialogTitle="Create Cohere API key secret"
                  emptyStateMessage="Create a secret to securely store your Cohere API key"
                  errorMessage={form.formState.errors.cohereApiKey?.message}
                  helperText="All credentials are securely stored in your Secrets Store"
                  isRequired
                  label="API Key"
                  onChange={field.onChange}
                  placeholder="Select Cohere API key from secrets"
                  scopes={[Scope.REDPANDA_CONNECT]}
                  secretNamePlaceholder="e.g., COHERE_API_KEY"
                  secretValueDescription="Your Cohere API key"
                  secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                  secretValuePlaceholder="Enter Cohere API key"
                  value={field.value || ''}
                />
              </div>
            )}
          />
        )}
      </div>
    </CardContent>
  </Card>
);
