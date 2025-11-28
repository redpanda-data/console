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

import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { RerankerModelSelect } from 'components/ui/ai/reranker-model-select';
import { GENERIC_SECRET_VALUE_PATTERN, SecretSelector } from 'components/ui/secret/secret-selector';
import { ExternalLink } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type { UseFormReturn } from 'react-hook-form';

import { COHERE_RERANKER_MODELS } from '../../constants';
import type { KnowledgeBaseCreateFormValues } from '../../schemas';

type RetrievalSectionProps = {
  form: UseFormReturn<KnowledgeBaseCreateFormValues>;
  availableSecrets: Array<{ id: string; name: string }>;
  rerankerEnabled: boolean;
};

export const RetrievalSection: React.FC<RetrievalSectionProps> = ({ form, availableSecrets, rerankerEnabled }) => (
  <Card size="full">
    <CardHeader>
      <CardTitle>Retrieval</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="rerankerEnabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Enable Reranker (Recommended)</FormLabel>
                <FormDescription>
                  Reranker improves search quality by reordering retrieved documents based on relevance.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {rerankerEnabled && (
          <>
            <FormField
              control={form.control}
              name="rerankerModel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Model</FormLabel>
                  <RerankerModelSelect
                    models={COHERE_RERANKER_MODELS}
                    onValueChange={field.onChange}
                    value={field.value || ''}
                  />
                  <FormDescription>
                    See{' '}
                    <a
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                      href="https://docs.cohere.com/docs/rerank"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Cohere rerank models <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    for available models.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rerankerApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>API Key</FormLabel>
                  <FormControl>
                    <SecretSelector
                      availableSecrets={availableSecrets}
                      dialogDescription="Create a new secret for your Cohere API key for reranking. The secret will be stored securely."
                      dialogTitle="Create Cohere API key secret"
                      emptyStateMessage="Create a secret to securely store your Cohere API key"
                      onChange={field.onChange}
                      placeholder="Select Cohere API key from secrets"
                      scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
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
          </>
        )}
      </div>
    </CardContent>
  </Card>
);
