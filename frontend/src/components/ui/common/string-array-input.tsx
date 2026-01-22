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

import { CloseIcon } from 'components/icons';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Input } from 'components/redpanda-ui/components/input';
import { useState, type KeyboardEvent } from 'react';

type StringArrayInputProps = {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
};

export const StringArrayInput = ({ value, onChange, placeholder }: StringArrayInputProps) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (!value.includes(inputValue.trim())) {
        onChange([...value, inputValue.trim()]);
      }
      setInputValue('');
    }
  };

  const removeItem = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map((item, index) => (
          <Badge className="gap-1 pr-1" key={item} variant="secondary">
            {item}
            <Button
              className="ml-1 h-4 min-h-4 w-4 min-w-4 rounded-full p-0"
              onClick={() => removeItem(index)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <CloseIcon className="h-3 w-3" />
            </Button>
          </Badge>
        ))}
      </div>
      <Input
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        value={inputValue}
      />
    </div>
  );
};
