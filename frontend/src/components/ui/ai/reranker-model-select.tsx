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

export type RerankerModel = {
  name: string;
  description: string;
};

type RerankerModelSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  models: RerankerModel[];
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Reusable reranker model select component
 * Currently supports Cohere models, can be extended for other providers
 */
export const RerankerModelSelect = ({
  value,
  onValueChange,
  models,
  placeholder,
  disabled = false,
}: RerankerModelSelectProps) => (
  <Select disabled={disabled} onValueChange={onValueChange} value={value}>
    <SelectTrigger disabled={disabled}>
      <SelectValue placeholder={placeholder || 'Select reranker model'}>
        {value ? (
          <div className="flex items-center gap-2">
            <img alt="Cohere" className="h-4 w-4" src={CohereLogo} />
            <span>{value}</span>
          </div>
        ) : (
          placeholder || 'Select reranker model'
        )}
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectLabel>
          <div className="flex items-center gap-2">
            <img alt="Cohere" className="h-4 w-4" src={CohereLogo} />
            <span>Cohere</span>
          </div>
        </SelectLabel>
        {models.map((model) => (
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
