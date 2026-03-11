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

import { Group } from 'components/redpanda-ui/components/group';
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
    <Group attached>
      <Input
        className="max-w-[100px] bg-primary-alpha-default border-r-input border-r font-medium text-primary-foreground"
        disabled={disabled}
        onChange={(e) => onChange({ ...value, key: e.target.value })}
        placeholder={keyPlaceholder}
        value={value.key}
      />
      <Input
        className="w-full"
        containerClassName="w-full"
        disabled={disabled}
        onChange={(e) => onChange({ ...value, value: e.target.value })}
        placeholder={valuePlaceholder}
        value={value.value}
      />
    </Group>
  );
}
