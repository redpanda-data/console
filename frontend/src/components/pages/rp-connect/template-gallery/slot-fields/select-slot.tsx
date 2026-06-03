/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { SimpleFormField } from 'components/redpanda-ui/components/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import type { Control, FieldValues } from 'react-hook-form';

import type { SelectSlot } from '../pipeline-template-types';

export type SelectSlotFieldProps = {
  slot: SelectSlot;
  control: Control<FieldValues>;
};

export const SelectSlotField = ({ slot, control }: SelectSlotFieldProps) => (
  <SimpleFormField
    control={control}
    description={slot.description}
    label={slot.label}
    name={slot.id}
    required={slot.required}
  >
    {(field) => (
      <Select onValueChange={field.onChange} value={field.value ?? ''}>
        <SelectTrigger data-testid={`slot-${slot.id}`}>
          <SelectValue placeholder="Select an option..." />
        </SelectTrigger>
        <SelectContent>
          {slot.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )}
  </SimpleFormField>
);
