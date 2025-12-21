/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

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
import { Slider } from 'components/redpanda-ui/components/slider';
import { Text } from 'components/redpanda-ui/components/typography';
import { Field, FieldLabel, FieldDescription, FieldError } from 'components/redpanda-ui/components/field';
import { AI_AGENT_SECRET_TEXT, SecretSelector } from 'components/ui/secret/secret-selector';
import { type Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useEffect, useMemo } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { detectProvider, MODEL_OPTIONS_BY_PROVIDER } from '../../pages/agents/ai-agent-model';

export interface LLMConfigSectionProps {
  mode: 'create' | 'edit';
  form: UseFormReturn<any>;
  fieldNames: {
    provider: string;
    model: string;
    apiKeySecret: string;
    baseUrl?: string;
    maxIterations: string;
  };
  availableSecrets: Array<{ id: string; name: string }>;
  scopes: Scope[];
  showBaseUrl?: boolean;
  showMaxIterations?: boolean;
}

export const LLMConfigSection: React.FC<LLMConfigSectionProps> = ({
  mode,
  form,
  fieldNames,
  availableSecrets,
  scopes,
  showBaseUrl = false,
  showMaxIterations = true,
}) => {
  const selectedProvider = form.watch(fieldNames.provider) as keyof typeof MODEL_OPTIONS_BY_PROVIDER;

  const filteredModels = useMemo(() => {
    if (!selectedProvider) return [];
    const providerData = MODEL_OPTIONS_BY_PROVIDER[selectedProvider];
    return providerData?.models || [];
  }, [selectedProvider]);

  useEffect(() => {
    if (mode === 'create' && filteredModels.length > 0 && filteredModels[0]) {
      const currentModel = form.getValues(fieldNames.model);
      const isValid = filteredModels.some((m: { value: string }) => m.value === currentModel);

      if (!isValid) {
        form.setValue(fieldNames.model, filteredModels[0].value);
      }
    }
  }, [selectedProvider, mode, filteredModels, form, fieldNames]);

  return (
    <div className="space-y-4">
      {mode === 'create' ? (
        <Field data-invalid={!!form.formState.errors[fieldNames.provider]}>
          <FieldLabel htmlFor="provider" required>
            Provider
          </FieldLabel>
          <Controller
            control={form.control}
            name={fieldNames.provider}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger id="provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MODEL_OPTIONS_BY_PROVIDER).map(([providerId, provider]) => (
                    <SelectItem key={providerId} value={providerId}>
                      <div className="flex items-center gap-2">
                        <img alt={provider.label} className="h-4 w-4" src={provider.icon} />
                        <span>{provider.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors[fieldNames.provider] && (
            <FieldError>{form.formState.errors[fieldNames.provider]?.message as string}</FieldError>
          )}
        </Field>
      ) : (
        <Field>
          <FieldLabel>Provider</FieldLabel>
          <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <Text variant="default">
              {selectedProvider === 'openai' && 'OpenAI'}
              {selectedProvider === 'anthropic' && 'Anthropic'}
              {selectedProvider === 'google' && 'Google'}
              {selectedProvider === 'openaiCompatible' && 'OpenAI Compatible'}
              {!selectedProvider && 'Unknown Provider'}
            </Text>
          </div>
        </Field>
      )}

      <Field data-invalid={!!form.formState.errors[fieldNames.model]}>
        <FieldLabel htmlFor="model" required>
          Model
        </FieldLabel>
        <Controller
          control={form.control}
          name={fieldNames.model}
          render={({ field }) => {
            const providerData = selectedProvider ? MODEL_OPTIONS_BY_PROVIDER[selectedProvider] : null;
            const detectedProvider = field.value ? detectProvider(field.value as string) : null;
            const isFreeTextMode = providerData && providerData.models.length === 0;

            if (isFreeTextMode) {
              return (
                <>
                  <Input
                    id="model"
                    placeholder="Enter model name (e.g., llama-3.1-70b)"
                    {...field}
                    aria-invalid={!!form.formState.errors[fieldNames.model]}
                  />
                  <FieldDescription>Enter the model name exactly as supported by your API endpoint</FieldDescription>
                </>
              );
            }

            return (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger id="model">
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
                <SelectContent>
                  {providerData ? (
                    <SelectGroup>
                      <SelectLabel>
                        <div className="flex items-center gap-2">
                          <img alt={providerData.label} className="h-4 w-4" src={providerData.icon} />
                          <span>{providerData.label}</span>
                        </div>
                      </SelectLabel>
                      {filteredModels.map((model: { value: string; name: string; description: string }) => (
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
                  ) : (
                    <div className="p-2">
                      <Text variant="muted">Please select a provider first</Text>
                    </div>
                  )}
                </SelectContent>
              </Select>
            );
          }}
        />
        {form.formState.errors[fieldNames.model] && (
          <FieldError>{form.formState.errors[fieldNames.model]?.message as string}</FieldError>
        )}
      </Field>

      <Field data-invalid={!!form.formState.errors[fieldNames.apiKeySecret]}>
        <FieldLabel htmlFor="apiKeySecret" required>
          API Token
        </FieldLabel>
        <Controller
          control={form.control}
          name={fieldNames.apiKeySecret}
          render={({ field }) => (
            <SecretSelector
              availableSecrets={availableSecrets}
              customText={AI_AGENT_SECRET_TEXT}
              onChange={field.onChange}
              placeholder="Select from secrets store or create new"
              scopes={scopes}
              value={field.value}
            />
          )}
        />
        {form.formState.errors[fieldNames.apiKeySecret] && (
          <FieldError>{form.formState.errors[fieldNames.apiKeySecret]?.message as string}</FieldError>
        )}
      </Field>

      {showBaseUrl && fieldNames.baseUrl && (
        <Field data-invalid={!!form.formState.errors[fieldNames.baseUrl]}>
          <FieldLabel htmlFor="baseUrl" required={selectedProvider === 'openaiCompatible'}>
            Base URL {selectedProvider !== 'openaiCompatible' && '(optional)'}
          </FieldLabel>
          <Input
            id="baseUrl"
            placeholder="https://api.example.com/v1"
            {...form.register(fieldNames.baseUrl)}
            aria-invalid={!!form.formState.errors[fieldNames.baseUrl]}
          />
          <FieldDescription>
            {selectedProvider === 'openaiCompatible'
              ? 'API endpoint URL for your OpenAI-compatible service'
              : 'Override the default API endpoint for this provider'}
          </FieldDescription>
          {form.formState.errors[fieldNames.baseUrl] && (
            <FieldError>{form.formState.errors[fieldNames.baseUrl]?.message as string}</FieldError>
          )}
        </Field>
      )}

      {showMaxIterations && (
        <Field data-invalid={!!form.formState.errors[fieldNames.maxIterations]}>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="maxIterations">Max Iterations</FieldLabel>
            <Text className="font-medium text-sm">{form.watch(fieldNames.maxIterations)}</Text>
          </div>
          <Controller
            control={form.control}
            name={fieldNames.maxIterations}
            render={({ field }) => (
              <Slider
                id="maxIterations"
                max={100}
                min={10}
                onValueChange={(values) => field.onChange(values[0])}
                value={[field.value]}
              />
            )}
          />
          {form.formState.errors[fieldNames.maxIterations] && (
            <FieldError>{form.formState.errors[fieldNames.maxIterations]?.message as string}</FieldError>
          )}
        </Field>
      )}
    </div>
  );
};
