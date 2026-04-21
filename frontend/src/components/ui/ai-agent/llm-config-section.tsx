/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "components/redpanda-ui/components/field";
import { Input } from "components/redpanda-ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "components/redpanda-ui/components/select";
import { Slider } from "components/redpanda-ui/components/slider";
import { Text } from "components/redpanda-ui/components/typography";
import {
	AI_AGENT_SECRET_TEXT,
	SecretSelector,
} from "components/ui/secret/secret-selector";
import type { Scope } from "protogen/redpanda/api/dataplane/v1/secret_pb";
import { LLMProviderType } from "protogen/redpanda/api/adp/v1alpha1/llm_provider_pb";
import { useEffect, useMemo } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { useListLLMProvidersQuery } from "react-query/api/aigw/llm-providers";

import { MODEL_OPTIONS_BY_PROVIDER, PROVIDER_INFO } from "../../pages/agents/ai-agent-model";

/**
 * Maps LLMProviderType enum values to the form's provider type strings.
 */
const LLM_PROVIDER_TYPE_TO_FORM_ID: Record<LLMProviderType, string | undefined> = {
	[LLMProviderType.LLM_PROVIDER_TYPE_OPENAI]: 'openai',
	[LLMProviderType.LLM_PROVIDER_TYPE_ANTHROPIC]: 'anthropic',
	[LLMProviderType.LLM_PROVIDER_TYPE_GOOGLE]: 'google',
	[LLMProviderType.LLM_PROVIDER_TYPE_BEDROCK]: undefined, // not supported yet
	[LLMProviderType.LLM_PROVIDER_TYPE_OPENAI_COMPATIBLE]: undefined, // not supported yet
	[LLMProviderType.LLM_PROVIDER_TYPE_UNSPECIFIED]: undefined,
};

export interface LLMConfigSectionProps {
  mode: 'create' | 'edit';
  form: UseFormReturn<any>;
  fieldNames: {
    provider: string;
    model: string;
    apiKeySecret: string;
    baseUrl?: string;
    maxIterations: string;
    llmProvider?: string;
  };
  availableSecrets: Array<{ id: string; name: string }>;
  scopes: Scope[];
  showBaseUrl?: boolean;
  showMaxIterations?: boolean;
  hasAigwDeployed?: boolean;
}

export const LLMConfigSection: React.FC<LLMConfigSectionProps> = ({
  mode,
  form,
  fieldNames,
  availableSecrets,
  scopes,
  showBaseUrl = false,
  showMaxIterations = true,
  hasAigwDeployed = false,
}) => {
  const selectedProvider = form.watch(fieldNames.provider) as keyof typeof MODEL_OPTIONS_BY_PROVIDER;
  const selectedLlmProvider = fieldNames.llmProvider ? form.watch(fieldNames.llmProvider) : undefined;

  // Fetch providers from AI Gateway v2 when aigw is deployed
  const { data: providersData, isLoading: isLoadingProviders } = useListLLMProvidersQuery(
    {},
    { enabled: hasAigwDeployed }
  );

  // Get available providers - from aigw API or hardcoded
  const availableProviders = useMemo(() => {
    if (hasAigwDeployed && providersData?.llmProviders) {
      // Map aigw providers to our format, filtering for enabled and supported only
      return providersData.llmProviders
        .filter((provider) => provider.enabled && LLM_PROVIDER_TYPE_TO_FORM_ID[provider.type] !== undefined)
        .map((provider) => {
          const formTypeId = LLM_PROVIDER_TYPE_TO_FORM_ID[provider.type]!;

          return {
            id: provider.name,
            label: provider.displayName || provider.name,
            icon: PROVIDER_INFO[formTypeId as keyof typeof PROVIDER_INFO]?.icon || '',
            type: provider.type,
          };
        });
    }
    // Fallback to hardcoded providers
    return Object.entries(MODEL_OPTIONS_BY_PROVIDER).map(([id, provider]) => ({
      id,
      label: provider.label,
      icon: provider.icon,
      type: undefined as LLMProviderType | undefined,
    }));
  }, [hasAigwDeployed, providersData]);

  // Get available models - from aigw provider's models or hardcoded
  const filteredModels = useMemo(() => {
    if (hasAigwDeployed && providersData?.llmProviders && selectedLlmProvider) {
      // Find the selected provider and get its models
      const provider = providersData.llmProviders.find((p) => p.name === selectedLlmProvider);
      if (provider) {
        return provider.models.map((modelName) => ({
          value: modelName,
          name: modelName,
          description: '',
        }));
      }
      return [];
    }
    // Fallback to hardcoded models
    if (!selectedProvider) return [];
    const providerData = MODEL_OPTIONS_BY_PROVIDER[selectedProvider];
    return providerData?.models || [];
  }, [hasAigwDeployed, providersData, selectedLlmProvider, selectedProvider]);

  // Auto-select first provider when available (create mode)
  useEffect(() => {
    if (mode === 'create' && hasAigwDeployed && availableProviders.length > 0 && !isLoadingProviders) {
      const currentLlmProvider = fieldNames.llmProvider ? form.getValues(fieldNames.llmProvider) : undefined;
      const isValidProvider = currentLlmProvider && availableProviders.some((p) => p.id === currentLlmProvider);

      if (!currentLlmProvider || !isValidProvider) {
        // Use handleProviderChange to set all fields consistently
        handleProviderChange(availableProviders[0].id);
      }
    }
  }, [mode, hasAigwDeployed, availableProviders, isLoadingProviders]);

  // Auto-select first model when provider changes or models become available
  useEffect(() => {
    if (hasAigwDeployed && filteredModels.length > 0 && filteredModels[0] && selectedLlmProvider) {
      const currentModel = form.getValues(fieldNames.model);
      const isValid = currentModel && filteredModels.some((m: { value: string }) => m.value === currentModel);

      if (!isValid) {
        form.setValue(fieldNames.model, filteredModels[0].value, { shouldValidate: true });
      }
    }
  }, [hasAigwDeployed, selectedLlmProvider, filteredModels, form, fieldNames]);

  // Clear API key when using aigw
  useEffect(() => {
    if (hasAigwDeployed) {
      form.setValue(fieldNames.apiKeySecret, '');
    }
  }, [hasAigwDeployed, form, fieldNames]);

  // Handle provider selection - sets both llmProvider and provider fields in gateway mode
  const handleProviderChange = (providerNameOrId: string) => {
    if (hasAigwDeployed && fieldNames.llmProvider) {
      // In gateway mode, the value is the provider NAME (e.g., "my-openai-prod")
      // Use form.setValue for all fields to ensure form.watch picks them up
      form.setValue(fieldNames.llmProvider, providerNameOrId, { shouldDirty: true, shouldValidate: true });
      // Also set the provider TYPE (e.g., "openai", "anthropic") for the proto mapping
      const selectedGwProvider = availableProviders.find((p) => p.id === providerNameOrId);
      if (selectedGwProvider?.type != null) {
        const formTypeId = LLM_PROVIDER_TYPE_TO_FORM_ID[selectedGwProvider.type] ?? 'openaiCompatible';
        form.setValue(fieldNames.provider, formTypeId, { shouldDirty: true, shouldValidate: true });
      }
    } else {
      // In non-gateway mode, value is the provider type ID directly
      form.setValue(fieldNames.provider, providerNameOrId, { shouldDirty: true, shouldValidate: true });
    }
    // Clear model when switching providers
    form.setValue(fieldNames.model, '', { shouldValidate: false });
  };

  return (
    <div className="space-y-4">
      {mode === 'create' ? (
        <Field data-invalid={!!form.formState.errors[fieldNames.provider]}>
          <FieldLabel htmlFor="provider" required>
            Provider
          </FieldLabel>
          {hasAigwDeployed && availableProviders.length === 0 && !isLoadingProviders && (
            <FieldDescription>No enabled providers available. Please enable providers in AI Gateway.</FieldDescription>
          )}
          <Controller
            control={form.control}
            name={hasAigwDeployed && fieldNames.llmProvider ? fieldNames.llmProvider : fieldNames.provider}
            render={({ field }) => (
              <Select
                disabled={isLoadingProviders || (hasAigwDeployed && availableProviders.length === 0)}
                onValueChange={(value) => {
                  field.onChange(value);
                  handleProviderChange(value);
                }}
                value={field.value}
              >
                <SelectTrigger id="provider">
                  <SelectValue placeholder={
                    isLoadingProviders
                      ? "Loading providers..."
                      : (hasAigwDeployed && availableProviders.length === 0)
                        ? "No providers available"
                        : "Select provider"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {availableProviders.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      <div className="flex items-center gap-2">
                        {provider.icon && <img alt={provider.label} className="h-4 w-4" src={provider.icon} />}
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
            <Text>
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
        {hasAigwDeployed && filteredModels.length === 0 && selectedLlmProvider && (
          <FieldDescription>No enabled models available. Please enable models in AI Gateway.</FieldDescription>
        )}
        <Controller
          control={form.control}
          name={fieldNames.model}
          render={({ field }) => {
            const providerData = selectedProvider
              ? MODEL_OPTIONS_BY_PROVIDER[selectedProvider]
              : null;
            const isFreeTextMode =
              !hasAigwDeployed && providerData && providerData.models.length === 0;
            const hasNoProviders = hasAigwDeployed && availableProviders.length === 0 && !isLoadingProviders;
            const hasNoModels = hasAigwDeployed && filteredModels.length === 0 && !!selectedLlmProvider;

            if (isFreeTextMode) {
              return (
                <>
                  <Input
                    disabled={hasNoProviders || hasNoModels}
                    id="model"
                    placeholder="Enter model name (e.g., llama-3.1-70b)"
                    {...field}
                    aria-invalid={!!form.formState.errors[fieldNames.model]}
                    aria-describedby={form.formState.errors[fieldNames.model] ? 'model-error' : undefined}
                  />
                  <FieldDescription>Enter the model name exactly as supported by your API endpoint</FieldDescription>
                </>
              );
            }

            return (
              <Select disabled={hasNoProviders || hasNoModels} onValueChange={field.onChange} value={field.value || undefined}>
                <SelectTrigger id="model">
                  <SelectValue placeholder={
                    hasNoProviders
                      ? "No providers available"
                      : hasNoModels
                        ? "No models available"
                        : "Select model"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {hasNoModels ? (
                    <div className="p-2">
                      <Text variant="muted">No enabled models available</Text>
                    </div>
                  ) : filteredModels.length > 0 ? (
                    <SelectGroup>
                      {providerData && !hasAigwDeployed && (
                        <SelectLabel>
                          <div className="flex items-center gap-2">
                            <img alt={providerData.label} className="h-4 w-4" src={providerData.icon} />
                            <span>{providerData.label}</span>
                          </div>
                        </SelectLabel>
                      )}
                      {filteredModels.map((model: { value: string; name: string; description: string }) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.name}
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
          <FieldError id="model-error">{form.formState.errors[fieldNames.model]?.message as string}</FieldError>
        )}
      </Field>

      {!hasAigwDeployed && (
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
      )}

      {!hasAigwDeployed && showBaseUrl && fieldNames.baseUrl && (
        <Field data-invalid={!!form.formState.errors[fieldNames.baseUrl]}>
          <FieldLabel htmlFor="baseUrl" required={selectedProvider === 'openaiCompatible'}>
            Base URL {selectedProvider !== 'openaiCompatible' && '(optional)'}
          </FieldLabel>
          <Input
            id="baseUrl"
            placeholder="https://api.example.com/v1"
            {...form.register(fieldNames.baseUrl)}
            aria-invalid={!!form.formState.errors[fieldNames.baseUrl]}
            aria-describedby={form.formState.errors[fieldNames.baseUrl] ? 'baseUrl-error' : undefined}
          />
          <FieldDescription>
            {selectedProvider === 'openaiCompatible'
              ? 'API endpoint URL for your OpenAI-compatible service'
              : 'Override the default API endpoint for this provider'}
          </FieldDescription>
          {form.formState.errors[fieldNames.baseUrl] && (
            <FieldError id="baseUrl-error">{form.formState.errors[fieldNames.baseUrl]?.message as string}</FieldError>
          )}
        </Field>
      )}

			{showMaxIterations && (
				<Field data-invalid={!!form.formState.errors[fieldNames.maxIterations]}>
					<div className="flex items-center justify-between">
						<FieldLabel htmlFor="maxIterations">Max Iterations</FieldLabel>
						<Text className="font-medium text-sm">
							{form.watch(fieldNames.maxIterations)}
						</Text>
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
						<FieldError>
							{
								form.formState.errors[fieldNames.maxIterations]
									?.message as string
							}
						</FieldError>
					)}
				</Field>
			)}
		</div>
	);
};
