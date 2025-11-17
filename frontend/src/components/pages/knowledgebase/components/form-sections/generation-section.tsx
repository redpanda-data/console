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
import { Text } from 'components/redpanda-ui/components/typography';
import { ExternalLink } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type { UseFormReturn } from 'react-hook-form';

import type { KnowledgeBaseCreateFormValues } from '../../schemas';
import { SecretDropdownField } from '../form-fields/secret-dropdown-field';

type GenerationSectionProps = {
  form: UseFormReturn<KnowledgeBaseCreateFormValues>;
  availableSecrets: Array<{ id: string; name: string }>;
};

export const GenerationSection: React.FC<GenerationSectionProps> = ({ form, availableSecrets }) => (
  <Card size="full">
    <CardHeader>
      <CardTitle>Generation</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <FormItem>
          <FormLabel>Provider</FormLabel>
          <div className="flex items-center gap-2 pt-2">
            <img alt="OpenAI" className="h-4 w-4" src={OpenAILogo} />
            <Text>OpenAI</Text>
          </div>
          <Text className="text-sm" variant="muted">
            Only OpenAI is currently supported as a generation provider.
          </Text>
        </FormItem>

        <FormField
          control={form.control}
          name="generationModel"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Model</FormLabel>
              <FormControl>
                <Input placeholder="Generation Model" {...field} />
              </FormControl>
              <FormDescription>
                See{' '}
                <a
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                  href="https://platform.openai.com/docs/models/overview"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  OpenAI models <ExternalLink className="h-3 w-3" />
                </a>{' '}
                for available models.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="generationApiKey"
          render={({ field }) => (
            <SecretDropdownField
              availableSecrets={availableSecrets}
              errorMessage={form.formState.errors.generationApiKey?.message}
              helperText="All credentials are securely stored in your Secrets Store"
              isRequired
              label="API Key"
              onChange={field.onChange}
              placeholder="Select OpenAI API key from secrets"
              scopes={[Scope.REDPANDA_CONNECT]}
              value={field.value}
            />
          )}
        />
      </div>
    </CardContent>
  </Card>
);
