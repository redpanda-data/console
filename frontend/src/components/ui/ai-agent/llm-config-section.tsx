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
import { useEffect, useMemo } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { useListModelProvidersQuery } from "react-query/api/ai-gateway/model-providers";
import { useListModelsQuery } from "react-query/api/ai-gateway/models";

import { MODEL_OPTIONS_BY_PROVIDER } from "../../pages/agents/ai-agent-model";

export interface LLMConfigSectionProps {
  mode: 'create' | 'edit';
  form: UseFormReturn<any>;
  fieldNames: {
    provider: string;
    model: string;
    apiKeySecret: string;
    baseUrl?: string;
    maxIterations: string;
    gatewayId?: string;
  };
  availableSecrets: Array<{ id: string; name: string }>;
  scopes: Scope[];
  showBaseUrl?: boolean;
  showMaxIterations?: boolean;
  hasGatewayDeployed?: boolean;
  isLoadingGateways?: boolean;
  availableGateways?: Array<{ id: string; displayName: string; description?: string }>;
}

export const LLMConfigSection: React.FC<LLMConfigSectionProps> = ({
  mode,
  form,
  fieldNames,
  availableSecrets,
  scopes,
  showBaseUrl = false,
  showMaxIterations = true,
  hasGatewayDeployed = false,
  isLoadingGateways = false,
  availableGateways = [],
}) => {
  const selectedProvider = form.watch(fieldNames.provider) as keyof typeof MODEL_OPTIONS_BY_PROVIDER;
  const selectedGatewayId = fieldNames.gatewayId ? form.watch(fieldNames.gatewayId) : undefined;
  const isUsingGateway = hasGatewayDeployed && !!selectedGatewayId;

  // Fetch providers and models from AI Gateway when using gateway
  // Filter for enabled providers at the API level
  const { data: providersData, isLoading: isLoadingProviders } = useListModelProvidersQuery(
    { filter: 'enabled = "true"' },
    { enabled: isUsingGateway }
  );

  // Filter models by provider and enabled status
  const { data: modelsData, isLoading: isLoadingModels } = useListModelsQuery(
    {
      filter: selectedProvider
        ? `provider = "${selectedProvider}" AND enabled = "true"`
        : 'enabled = "true"',
    },
    { enabled: isUsingGateway && !!selectedProvider }
  );

	// Get available providers - from gateway API or hardcoded
	const availableProviders = useMemo(() => {
		if (isUsingGateway && providersData?.modelProviders) {
			// Map gateway providers to our format (already filtered for enabled at API level)
			// Provider names are already transformed by the query hook (prefix stripped)
			return providersData.modelProviders.map((provider) => {
				const providerId = provider.name.toLowerCase().replace(/\s+/g, '');

				return {
					id: providerId,
					label: provider.displayName || provider.name,
					icon: MODEL_OPTIONS_BY_PROVIDER[providerId as keyof typeof MODEL_OPTIONS_BY_PROVIDER]?.icon || '',
				};
			});
		}
		// Fallback to hardcoded providers
		return Object.entries(MODEL_OPTIONS_BY_PROVIDER).map(([id, provider]) => ({
			id,
			label: provider.label,
			icon: provider.icon,
		}));
	}, [isUsingGateway, providersData]);

	// Get available models - from gateway API or hardcoded
	const filteredModels = useMemo(() => {
		if (isUsingGateway && modelsData?.models) {
			// Map gateway models to our format (already filtered for enabled at API level)
			// Model names are already transformed by the query hook (prefix stripped)
			return modelsData.models.map((model) => ({
				value: model.name,
				name: model.displayName || model.name,
				description: model.description || '',
			}));
		}
		// Fallback to hardcoded models
		if (!selectedProvider) return [];
		const providerData = MODEL_OPTIONS_BY_PROVIDER[selectedProvider];
		return providerData?.models || [];
	}, [isUsingGateway, modelsData, selectedProvider]);

  // Auto-select first provider when available (create mode)
  useEffect(() => {
    if (mode === 'create' && isUsingGateway && availableProviders.length > 0 && !isLoadingProviders) {
      const currentProvider = form.getValues(fieldNames.provider);
      // Check if current provider is in the available list
      const isValidProvider = availableProviders.some((p) => p.id === currentProvider);

      if (!currentProvider || !isValidProvider) {
        // Auto-select first available provider
        form.setValue(fieldNames.provider, availableProviders[0].id, { shouldValidate: true });
      }
    }
  }, [mode, isUsingGateway, availableProviders, isLoadingProviders, form, fieldNames]);

  // Auto-select first model when available (create mode)
  useEffect(() => {
    if (mode === 'create' && isUsingGateway && filteredModels.length > 0 && filteredModels[0] && !isLoadingModels && selectedProvider) {
      const currentModel = form.getValues(fieldNames.model);
      const isValid = currentModel && filteredModels.some((m: { value: string }) => m.value === currentModel);

      if (!isValid) {
        // Auto-select first available model
        form.setValue(fieldNames.model, filteredModels[0].value, { shouldValidate: true });
      }
    }
  }, [mode, isUsingGateway, selectedProvider, filteredModels, isLoadingModels, form, fieldNames]);

  // Clear API key when using gateway
  useEffect(() => {
    if (isUsingGateway) {
      form.setValue(fieldNames.apiKeySecret, '');
    }
  }, [isUsingGateway, form, fieldNames]);

  return (
    <div className="space-y-4">
      {fieldNames.gatewayId && (
        <Field data-invalid={!!form.formState.errors[fieldNames.gatewayId]}>
          <FieldLabel htmlFor="gateway" required>AI Gateway</FieldLabel>
          <FieldDescription>
            {hasGatewayDeployed && availableGateways.length > 0
              ? 'Route requests through an AI Gateway'
              : 'Gateway not available. Please enable AI Gateway for your cluster.'}
          </FieldDescription>
          <Controller
            control={form.control}
            name={fieldNames.gatewayId}
            render={({ field }) => (
              <Select
                disabled={isLoadingGateways || !hasGatewayDeployed || availableGateways.length === 0}
                onValueChange={field.onChange}
                value={field.value}
              >
                <SelectTrigger id="gateway">
                  <SelectValue
                    placeholder={
                      isLoadingGateways
                        ? 'Loading gateways...'
                        : hasGatewayDeployed && availableGateways.length > 0
                          ? 'Select a gateway'
                          : 'No gateways available'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableGateways.map((gw) => (
                    <SelectItem key={gw.id} value={gw.id}>
                      {gw.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors[fieldNames.gatewayId] && (
            <FieldError>{form.formState.errors[fieldNames.gatewayId]?.message as string}</FieldError>
          )}
        </Field>
      )}

      {mode === 'create' ? (
        <Field data-invalid={!!form.formState.errors[fieldNames.provider]}>
          <FieldLabel htmlFor="provider" required>
            Provider
          </FieldLabel>
          {isUsingGateway && availableProviders.length === 0 && !isLoadingProviders && (
            <FieldDescription>No enabled providers available. Please enable providers in AI Gateway.</FieldDescription>
          )}
          <Controller
            control={form.control}
            name={fieldNames.provider}
            render={({ field }) => (
              <Select
                disabled={isLoadingProviders || (isUsingGateway && availableProviders.length === 0)}
                onValueChange={field.onChange}
                value={field.value}
              >
                <SelectTrigger id="provider">
                  <SelectValue placeholder={
                    isLoadingProviders
                      ? "Loading providers..."
                      : (isUsingGateway && availableProviders.length === 0)
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
				{isUsingGateway && filteredModels.length === 0 && !isLoadingModels && selectedProvider && (
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
							providerData && providerData.models.length === 0;
            const hasNoProviders = isUsingGateway && availableProviders.length === 0 && !isLoadingProviders;
            const hasNoModels = isUsingGateway && filteredModels.length === 0 && !isLoadingModels && !!selectedProvider;

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
              <Select disabled={isLoadingModels || hasNoProviders || hasNoModels} onValueChange={field.onChange} value={field.value}>
                <SelectTrigger id="model">
                  <SelectValue placeholder={
                    hasNoProviders
                      ? "No providers available"
                      : hasNoModels
                        ? "No models available"
                        : isLoadingModels
                          ? "Loading models..."
                          : "Select model"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingModels ? (
                    <div className="p-2">
                      <Text variant="muted">Loading models...</Text>
                    </div>
                  ) : hasNoModels ? (
                    <div className="p-2">
                      <Text variant="muted">No enabled models available</Text>
                    </div>
                  ) : filteredModels.length > 0 ? (
                    <SelectGroup>
                      {providerData && !isUsingGateway && (
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

      {!isUsingGateway && (
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

      {!isUsingGateway && showBaseUrl && fieldNames.baseUrl && (
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
