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
import { Input } from 'components/redpanda-ui/components/input';
import { Text } from 'components/redpanda-ui/components/typography';
import { GENERIC_SECRET_VALUE_PATTERN } from 'components/ui/secret/secret-selector';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type { UseFormReturn } from 'react-hook-form';

import type { KnowledgeBaseCreateFormValues } from '../../schemas';
import { SecretDropdownField } from '../form-fields/secret-dropdown-field';

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
            <div className="flex items-center gap-2">
              <img alt="Cohere" className="h-4 w-4" src={CohereLogo} />
              <Text className="font-medium text-sm">Cohere Reranker Configuration</Text>
            </div>

            <FormField
              control={form.control}
              name="rerankerModel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Model</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., rerank-v3.5" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rerankerApiKey"
              render={({ field }) => (
                <SecretDropdownField
                  availableSecrets={availableSecrets}
                  dialogDescription="Create a new secret for your Cohere API key for reranking. The secret will be stored securely."
                  dialogTitle="Create Cohere API key secret"
                  emptyStateMessage="Create a secret to securely store your Cohere API key"
                  errorMessage={form.formState.errors.rerankerApiKey?.message}
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
              )}
            />
          </>
        )}
      </div>
    </CardContent>
  </Card>
);
