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

export type ChatModelProvider = {
  label: string;
  icon: string;
  modelPattern: RegExp;
};

export type ChatModel = {
  readonly value: string;
  readonly name: string;
  readonly description: string;
};

export type ChatModelProviderGroup = {
  readonly label: string;
  readonly icon: string;
  readonly models: readonly ChatModel[];
};

type ChatModelSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  providerGroups: Record<string, ChatModelProviderGroup>;
  providerInfo: Record<string, ChatModelProvider>;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Reusable chat/generation model select component
 * Supports multiple providers and auto-detects provider logos
 */
export const ChatModelSelect = ({
  value,
  onValueChange,
  providerGroups,
  providerInfo,
  placeholder,
  disabled = false,
}: ChatModelSelectProps) => {
  // Detect provider for selected model
  const detectedProvider = value
    ? Object.values(providerInfo).find((provider) => provider.modelPattern.test(value))
    : null;

  return (
    <Select disabled={disabled} onValueChange={onValueChange} value={value}>
      <SelectTrigger disabled={disabled}>
        <SelectValue placeholder={placeholder || 'Select AI model'}>
          {value && detectedProvider ? (
            <div className="flex items-center gap-2">
              <img alt={detectedProvider.label} className="h-4 w-4" src={detectedProvider.icon} />
              <span>{value}</span>
            </div>
          ) : (
            placeholder || 'Select AI model'
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(providerGroups).map(([providerId, provider]) => (
          <SelectGroup key={providerId}>
            <SelectLabel>
              <div className="flex items-center gap-2">
                <img alt={provider.label} className="h-4 w-4" src={provider.icon} />
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
        ))}
      </SelectContent>
    </Select>
  );
};
