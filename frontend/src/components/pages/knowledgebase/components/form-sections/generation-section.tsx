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
import { FormDescription, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { ChatModelSelect } from 'components/ui/ai/chat-model-select';
import { ExternalLink } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

import { MODEL_OPTIONS_BY_PROVIDER, PROVIDER_INFO } from '../../../agents/ai-agent-model';
import type { KnowledgeBaseCreateFormValues } from '../../schemas';

type GenerationSectionProps = {
  form: UseFormReturn<KnowledgeBaseCreateFormValues>;
};

export const GenerationSection: React.FC<GenerationSectionProps> = ({ form }) => (
  <Card size="full">
    <CardHeader>
      <CardTitle>Generation</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="generationModel"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Model</FormLabel>
              <ChatModelSelect
                onValueChange={field.onChange}
                providerGroups={MODEL_OPTIONS_BY_PROVIDER}
                providerInfo={PROVIDER_INFO}
                value={field.value}
              />
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
      </div>
    </CardContent>
  </Card>
);
