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

import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Textarea } from 'components/redpanda-ui/components/textarea';

export interface ToolParameter {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  enum?: unknown[];
  items?: {
    enum?: unknown[];
  };
}

interface ParameterInputProps {
  param: ToolParameter;
  value: unknown;
  onChange: (value: unknown) => void;
}

export const ParameterInput = ({ param, value, onChange }: ParameterInputProps) => {
  if (param.type === 'string') {
    // If string has enum values, show as select
    if (param.enum && Array.isArray(param.enum)) {
      return (
        <Select value={String(value || '')} onValueChange={(val) => onChange(val)}>
          <SelectTrigger>
            <SelectValue placeholder={`Select ${param.name}...`} />
          </SelectTrigger>
          <SelectContent>
            {param.enum.map((option) => (
              <SelectItem key={String(option)} value={String(option)}>
                {String(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Otherwise show regular input
    return (
      <Input
        placeholder={`Enter ${param.name}...`}
        value={String(value || '')}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (param.type === 'number' || param.type === 'integer') {
    return (
      <Input
        type="number"
        placeholder={`Enter ${param.name}...`}
        value={String(value || '')}
        onChange={(e) =>
          onChange(
            param.type === 'integer' ? Number.parseInt(e.target.value) || '' : Number.parseFloat(e.target.value) || '',
          )
        }
      />
    );
  }

  if (param.type === 'boolean') {
    return (
      <Select value={value?.toString() || ''} onValueChange={(val) => onChange(val === 'true')}>
        <SelectTrigger>
          <SelectValue placeholder="Select true or false" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (param.type === 'array') {
    // If array has items with enum, show as select
    if (param.items?.enum && Array.isArray(param.items.enum)) {
      return (
        <Select
          value={Array.isArray(value) && value.length > 0 ? String(value[0]) : ''}
          onValueChange={(val) => onChange([val])}
        >
          <SelectTrigger>
            <SelectValue placeholder={`Select ${param.name}...`} />
          </SelectTrigger>
          <SelectContent>
            {param.items.enum.map((option) => (
              <SelectItem key={String(option)} value={String(option)}>
                {String(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Otherwise show textarea for JSON input
    return (
      <Textarea
        placeholder={`Enter ${param.name} as JSON array...`}
        value={typeof value === 'string' ? value : JSON.stringify(value, null, 2) || ''}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            onChange(e.target.value);
          }
        }}
        className="min-h-20 font-mono"
      />
    );
  }

  if (param.type === 'object') {
    return (
      <Textarea
        placeholder={`Enter ${param.name} as JSON object...`}
        value={typeof value === 'string' ? value : JSON.stringify(value, null, 2) || ''}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            onChange(e.target.value);
          }
        }}
        className="min-h-20 font-mono"
      />
    );
  }

  return (
    <Textarea
      placeholder={`Enter ${param.name}...`}
      value={String(value || '')}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-20"
    />
  );
};
