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

import CohereLogo from 'assets/cohere.svg';
import OpenAILogo from 'assets/openai.svg';
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

export type EmbeddingModel = {
  name: string;
  dimensions: number;
  description: string;
  provider: 'openai' | 'cohere';
};

type EmbeddingModelSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  models: {
    openai: EmbeddingModel[];
    cohere: EmbeddingModel[];
  };
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Reusable embedding model select component
 * Displays models grouped by provider with logos
 */
export const EmbeddingModelSelect = ({ value, onValueChange, models, placeholder, disabled = false }: EmbeddingModelSelectProps) => {
  // Detect provider for selected model
  const allModels = [...models.openai, ...models.cohere];
  const selectedModel = allModels.find((m) => m.name === value);
  const currentProvider = selectedModel?.provider === 'openai' ? OpenAILogo : CohereLogo;
  const currentProviderLabel = selectedModel?.provider === 'openai' ? 'OpenAI' : 'Cohere';

  return (
    <Select disabled={disabled} onValueChange={onValueChange} value={value}>
      <SelectTrigger disabled={disabled}>
        <SelectValue placeholder={placeholder || 'Select embedding model'}>
          {value ? (
            <div className="flex items-center gap-2">
              <img alt={currentProviderLabel} className="h-4 w-4" src={currentProvider} />
              <span>{value}</span>
            </div>
          ) : (
            placeholder || 'Select embedding model'
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>
            <div className="flex items-center gap-2">
              <img alt="OpenAI" className="h-4 w-4" src={OpenAILogo} />
              <span>OpenAI</span>
            </div>
          </SelectLabel>
          {models.openai.map((model) => (
            <SelectItem key={model.name} value={model.name}>
              <div className="flex flex-col gap-0.5">
                <Text className="font-medium">{model.name}</Text>
                <Text className="text-xs" variant="muted">
                  {model.description}
                </Text>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>
            <div className="flex items-center gap-2">
              <img alt="Cohere" className="h-4 w-4" src={CohereLogo} />
              <span>Cohere</span>
            </div>
          </SelectLabel>
          {models.cohere.map((model) => (
            <SelectItem key={model.name} value={model.name}>
              <div className="flex flex-col gap-0.5">
                <Text className="font-medium">{model.name}</Text>
                <Text className="text-xs" variant="muted">
                  {model.description}
                </Text>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
