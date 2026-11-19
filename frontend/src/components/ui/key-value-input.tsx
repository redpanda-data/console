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

import { cn } from 'components/redpanda-ui/lib/utils';
import { attachedFirstClassName, attachedLastClassName } from 'utils/attached-controls';
import { Input } from 'components/redpanda-ui/components/input';

export type KeyValuePair = { key: string; value: string };

export type KeyValueInputProps = {
  value: KeyValuePair;
  onChange: (value: KeyValuePair) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  disabled?: boolean;
};

export function KeyValueInput({
  value,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  disabled,
}: KeyValueInputProps) {
  return (
    <div className="flex w-full items-stretch">
      <Input
        className={cn(attachedFirstClassName, 'max-w-[100px] border-r-input border-r bg-primary-wash font-medium text-primary')}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, key: e.target.value })}
        placeholder={keyPlaceholder}
        value={value.key}
      />
      <Input
        className={cn(attachedLastClassName, 'w-full')}
        containerClassName="w-full"
        disabled={disabled}
        onChange={(e) => onChange({ ...value, value: e.target.value })}
        placeholder={valuePlaceholder}
        value={value.value}
      />
    </div>
  );
}
