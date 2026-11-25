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

import { zodResolver } from '@hookform/resolvers/zod';
import { describe, expect, test } from '@rstest/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { Form } from 'components/redpanda-ui/components/form';
import { useForm } from 'react-hook-form';

import { AdvancedTopicSettings } from './advanced-topic-settings';
import { type AddTopicFormData, addTopicFormSchema } from '../types/wizard';

function Harness() {
  const form = useForm<AddTopicFormData>({
    resolver: zodResolver(addTopicFormSchema),
    mode: 'onChange',
    defaultValues: {
      topicName: 'orders',
      partitions: 1,
      replicationFactor: 1,
      retentionTimeMs: 7,
      retentionTimeUnit: 'days',
      retentionSize: 1,
      retentionSizeUnit: 'GiB',
    },
  });
  return (
    <Form {...form}>
      <AdvancedTopicSettings form={form} isExistingTopic={false} />
    </Form>
  );
}

describe('the advanced topic settings', () => {
  test('shows a retention value error below its attached row, describing the input', async () => {
    render(<Harness />);

    // Typed a character at a time, `-` alone is not a number, so set the value whole.
    const [retentionTime] = screen.getAllByPlaceholderText('7');
    fireEvent.change(retentionTime, { target: { value: '-5' } });

    const message = await screen.findByText('Retention time must be at least 0.');
    expect(retentionTime).toHaveAttribute('aria-invalid', 'true');
    expect(retentionTime.getAttribute('aria-describedby')?.split(' ')).toContain(message.id);
  });
});
