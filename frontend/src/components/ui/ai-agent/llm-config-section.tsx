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
import { Label } from 'components/redpanda-ui/components/label';
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
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { AI_AGENT_SECRET_TEXT, SecretSelector } from 'components/ui/secret/secret-selector';
import { type Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useEffect, useMemo } from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { useAIGatewayStatus } from 'hooks/use-ai-gateway-status';

import { detectProvider, MODEL_OPTIONS_BY_PROVIDER } from '../../pages/agents/ai-agent-model';

import OpenAILogo from 'assets/openai.svg';
import AnthropicLogo from 'assets/anthropic.svg';

const AI_GATEWAY_MODEL_OPTIONS = [
  {
    value: 'openai',
    label: 'OpenAI',
    icon: OpenAILogo,
    description: 'GPT models via AI Gateway',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    icon: AnthropicLogo,
    description: 'Claude models via AI Gateway',
  },
] as const;

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
  gatewayStatusOverride?: { isDeployed: boolean };
}

export const LLMConfigSection: React.FC<LLMConfigSectionProps> = ({
  mode,
  form,
  fieldNames,
  availableSecrets,
  scopes,
  showBaseUrl = false,
  showMaxIterations = true,
  gatewayStatusOverride,
}) => {
  const gatewayStatus = useAIGatewayStatus();
  const isGatewayMode = gatewayStatusOverride?.isDeployed ?? gatewayStatus.isDeployed;

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
      {gatewayStatus.isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <Text variant="muted">Checking AI Gateway status...</Text>
        </div>
      )}

      {gatewayStatus.error && !isGatewayMode && (
        <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
          Unable to check AI Gateway status. Using direct provider configuration.
        </div>
      )}

      {isGatewayMode ? (
        <FormField
          control={form.control}
          name={fieldNames.model}
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Model Provider</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select model provider" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {AI_GATEWAY_MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <img alt={option.label} className="h-4 w-4" src={option.icon} />
                        <div className="flex flex-col">
                          <Text className="font-medium">{option.label}</Text>
                          <Text className="text-xs" variant="muted">
                            {option.description}
                          </Text>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Text variant="muted">
                AI Gateway is deployed. Authentication is handled automatically.
              </Text>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <>
          {mode === 'create' ? (
            <FormField
              control={form.control}
              name={fieldNames.provider}
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Provider</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                    </FormControl>
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
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <div className="space-y-2">
              <Label>Provider</Label>
              <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <Text variant="default">
                  {selectedProvider === 'openai' && 'OpenAI'}
                  {selectedProvider === 'anthropic' && 'Anthropic'}
                  {selectedProvider === 'google' && 'Google'}
                  {selectedProvider === 'openaiCompatible' && 'OpenAI Compatible'}
                  {!selectedProvider && 'Unknown Provider'}
                </Text>
              </div>
            </div>
          )}

          <FormField
            control={form.control}
            name={fieldNames.model}
            render={({ field }: { field: any }) => {
              const providerData = selectedProvider ? MODEL_OPTIONS_BY_PROVIDER[selectedProvider] : null;
              const detectedProvider = field.value ? detectProvider(field.value as string) : null;
              const isFreeTextMode = providerData && providerData.models.length === 0;

              if (isFreeTextMode) {
                return (
                  <FormItem>
                    <FormLabel required>Model</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter model name (e.g., llama-3.1-70b)" {...field} />
                    </FormControl>
                    <Text variant="muted">Enter the model name exactly as supported by your API endpoint</Text>
                    <FormMessage />
                  </FormItem>
                );
              }

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
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          <FormField
            control={form.control}
            name={fieldNames.apiKeySecret}
            render={({ field }: { field: any }) => (
              <FormItem>
                <FormLabel required>API Token</FormLabel>
                <FormControl>
                  <SecretSelector
                    availableSecrets={availableSecrets}
                    customText={AI_AGENT_SECRET_TEXT}
                    onChange={field.onChange}
                    placeholder="Select from secrets store or create new"
                    scopes={scopes}
                    value={field.value}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {showBaseUrl && fieldNames.baseUrl && (
            <FormField
              control={form.control}
              name={fieldNames.baseUrl}
              render={({ field }: { field: any }) => {
                const isRequired = selectedProvider === 'openaiCompatible';
                return (
                  <FormItem>
                    <FormLabel required={isRequired}>Base URL {!isRequired && '(optional)'}</FormLabel>
                    <FormControl>
                      <Input placeholder="https://api.example.com/v1" {...field} />
                    </FormControl>
                    <Text variant="muted">
                      {isRequired
                        ? 'API endpoint URL for your OpenAI-compatible service'
                        : 'Override the default API endpoint for this provider'}
                    </Text>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          )}
        </>
      )}

      {showMaxIterations && (
        <FormField
          control={form.control}
          name={fieldNames.maxIterations}
          render={({ field }: { field: any }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Max Iterations</FormLabel>
                <Text className="font-medium text-sm">{field.value}</Text>
              </div>
              <FormControl>
                <Slider
                  max={100}
                  min={10}
                  onValueChange={(values) => field.onChange(values[0])}
                  value={[field.value]}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
};
