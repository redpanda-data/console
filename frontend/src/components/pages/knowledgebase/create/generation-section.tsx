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
  FieldSeparator,
  FieldSet,
} from 'components/redpanda-ui/components/field';
import { Link, Text } from 'components/redpanda-ui/components/typography';
import { ChatModelSelect } from 'components/ui/ai/chat-model-select';
import { SecretSelector } from 'components/ui/secret/secret-selector';
import { ExternalLink, MessageSquare } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { Controller, type UseFormReturn } from 'react-hook-form';

import type { KnowledgeBaseCreateFormValues } from './schemas';
import { MODEL_OPTIONS_BY_PROVIDER, PROVIDER_INFO } from '../../agents/ai-agent-model';

// Provider documentation URLs (currently only OpenAI is supported for generation)
const PROVIDER_DOCS = {
  openai: {
    url: 'https://platform.openai.com/docs/models/overview',
    label: 'OpenAI models',
  },
};

type GenerationSectionProps = {
  form: UseFormReturn<KnowledgeBaseCreateFormValues>;
  availableSecrets: Array<{ id: string; name: string }>;
};

export const GenerationSection: React.FC<GenerationSectionProps> = ({ form, availableSecrets }) => {
  // Only OpenAI is supported for generation currently (backend limitation)
  const supportedProviders = {
    openai: MODEL_OPTIONS_BY_PROVIDER.openai,
  };

  return (
    <Card size="full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          <Text className="font-semibold">Generation</Text>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Generation Model Configuration</FieldLegend>
            <FieldDescription>
              Configure the language model used to generate responses from retrieved knowledge. Currently only OpenAI
              models are supported.
            </FieldDescription>
            <Controller
              control={form.control}
              name="generationModel"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel required>Model</FieldLabel>
                  <ChatModelSelect
                    onValueChange={field.onChange}
                    providerGroups={supportedProviders}
                    providerInfo={PROVIDER_INFO}
                    value={field.value}
                  />
                  <FieldDescription>
                    See{' '}
                    <Link
                      className="inline-flex items-center gap-1"
                      href={PROVIDER_DOCS.openai.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {PROVIDER_DOCS.openai.label} <ExternalLink className="h-3 w-3" />
                    </Link>{' '}
                    for available models.
                  </FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldSet>

          <FieldSeparator />

          <FieldSet>
            <FieldLegend>API Credentials</FieldLegend>
            <Controller
              control={form.control}
              name="openaiApiKey"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel required>OpenAI API Key</FieldLabel>
                  <SecretSelector
                    availableSecrets={availableSecrets}
                    customText={{
                      dialogDescription:
                        'Create a new secret for your OpenAI API key. The secret will be stored securely.',
                      secretNamePlaceholder: 'e.g., OPENAI_API_KEY',
                      secretValuePlaceholder: 'Enter OpenAI API key (e.g., sk-...)',
                      secretValueDescription: 'Your OpenAI API key for generation',
                      emptyStateDescription: 'Create a secret to securely store your OpenAI API key',
                    }}
                    onChange={field.onChange}
                    placeholder="Select OpenAI API key from secrets"
                    scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                    value={field.value || ''}
                  />
                  <FieldDescription>
                    Required for generating responses. All credentials are securely stored in your Secrets Store
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
};
