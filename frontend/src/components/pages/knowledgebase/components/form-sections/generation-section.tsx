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
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
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
          render={({ field }) => {
            // Detect provider for the selected model
            const detectedProvider = field.value
              ? Object.values(PROVIDER_INFO).find((provider) => provider.modelPattern.test(field.value))
              : null;

            return (
              <FormItem>
                <FormLabel required>Model</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select AI model">
                        {field.value && detectedProvider ? (
                          <div className="flex items-center gap-2">
                            <img alt={detectedProvider.label} className="h-4 w-4" src={detectedProvider.icon} />
                            <span>{field.value}</span>
                          </div>
                        ) : (
                          'Select AI model'
                        )}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(MODEL_OPTIONS_BY_PROVIDER).map(([providerId, provider]) => {
                      const logoSrc = provider.icon;
                      return (
                        <SelectGroup key={providerId}>
                          <SelectLabel>
                            <div className="flex items-center gap-2">
                              <img alt={provider.label} className="h-4 w-4" src={logoSrc} />
                              <span>{provider.label}</span>
                            </div>
                          </SelectLabel>
                          {provider.models.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                              <div className="flex flex-col gap-0.5">
                                <Text className="font-medium">{model.name}</Text>
                                <Text className="text-xs" variant="muted">
                                  {model.description}
                                </Text>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    })}
                  </SelectContent>
                </Select>
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
            );
          }}
        />
      </div>
    </CardContent>
  </Card>
);
