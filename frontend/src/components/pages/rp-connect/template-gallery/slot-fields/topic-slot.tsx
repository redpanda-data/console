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
import { TopicSelector } from 'components/ui/topic/topic-selector';
import type { Control, FieldValues } from 'react-hook-form';

import type { TopicSlot } from '../pipeline-template-types';

export type TopicSlotFieldProps = {
  slot: TopicSlot;
  control: Control<FieldValues>;
};

export const TopicSlotField = ({ slot, control }: TopicSlotFieldProps) => (
  <SimpleFormField
    control={control}
    description={slot.description}
    label={slot.label}
    name={slot.id}
    required={slot.required}
  >
    {(field) => (
      <div data-testid={`slot-${slot.id}`}>
        <TopicSelector
          onTopicsChange={(topics) => field.onChange(topics[0] ?? '')}
          selectedTopics={field.value ? [field.value] : []}
        />
      </div>
    )}
  </SimpleFormField>
);
