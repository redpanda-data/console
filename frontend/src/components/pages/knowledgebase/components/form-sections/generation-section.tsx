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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from 'components/redpanda-ui/components/field';
import { Link } from 'components/redpanda-ui/components/typography';
import { ChatModelSelect } from 'components/ui/ai/chat-model-select';
import { ExternalLink } from 'lucide-react';
import { Controller, type UseFormReturn } from 'react-hook-form';

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
      <FieldGroup>
        <FieldSet>
          <FieldLegend>Generation Model</FieldLegend>
          <Controller
            control={form.control}
            name="generationModel"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel required>Model</FieldLabel>
                <ChatModelSelect
                  onValueChange={field.onChange}
                  providerGroups={MODEL_OPTIONS_BY_PROVIDER}
                  providerInfo={PROVIDER_INFO}
                  value={field.value}
                />
                <FieldDescription>
                  See{' '}
                  <Link
                    className="inline-flex items-center gap-1"
                    href="https://platform.openai.com/docs/models/overview"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    OpenAI models <ExternalLink className="h-3 w-3" />
                  </Link>{' '}
                  for available models.
                </FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldSet>
      </FieldGroup>
    </CardContent>
  </Card>
);
