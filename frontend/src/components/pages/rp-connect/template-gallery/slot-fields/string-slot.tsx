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
import { Input } from 'components/redpanda-ui/components/input';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import type { Control, FieldValues } from 'react-hook-form';

import type { StringSlot } from '../pipeline-template-types';

export type StringSlotFieldProps = {
  slot: StringSlot;
  control: Control<FieldValues>;
};

export const StringSlotField = ({ slot, control }: StringSlotFieldProps) => (
  <SimpleFormField
    control={control}
    description={slot.description}
    label={slot.label}
    name={slot.id}
    required={slot.required}
  >
    {(field) =>
      slot.multiline ? (
        <Textarea
          data-testid={`slot-${slot.id}`}
          onChange={field.onChange}
          placeholder={slot.placeholder}
          value={field.value ?? ''}
        />
      ) : (
        <Input
          data-testid={`slot-${slot.id}`}
          onChange={field.onChange}
          placeholder={slot.placeholder}
          value={field.value ?? ''}
        />
      )
    }
  </SimpleFormField>
);
