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

import { zodResolver } from '@hookform/resolvers/zod';
import userEvent from '@testing-library/user-event';
import { Form } from 'components/redpanda-ui/components/form';
import { useForm, useWatch } from 'react-hook-form';
import { render, screen, waitFor } from 'test-utils';

import { TopicConfigTab } from './topic-config-tab';
import { getDefaultProperties } from './topic-properties-config';
import { FormSchema, type FormValues, initialValues } from '../create/model';

const TestWrapper = ({ defaultValues = initialValues }: { defaultValues?: FormValues }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
    mode: 'onBlur',
  });
  const formValues = useWatch({ control: form.control });

  return (
    <Form {...form}>
      <form>
        <TopicConfigTab />
        <div data-testid="form-state">{JSON.stringify(formValues)}</div>
      </form>
    </Form>
  );
};

const renderTopicConfigTab = (overrides: Partial<FormValues>) => {
  const user = userEvent.setup();
  render(<TestWrapper defaultValues={{ ...initialValues, ...overrides }} />);
  return { user, toggle: screen.getByTestId('exclude-default-switch') };
};

// The form state the wrapper mirrors into the DOM
const readFormState = () => JSON.parse(screen.getByTestId('form-state').textContent || '{}');

describe('the TopicConfigTab', () => {
  describe('exclude default properties toggle', () => {
    test('should remove default properties from topicProperties when excludeDefault is enabled', async () => {
      const { user, toggle } = renderTopicConfigTab({
        excludeDefault: false,
        topicProperties: [...getDefaultProperties(), 'segment.bytes', 'flush.ms'],
      });
      expect(toggle).not.toBeChecked();

      // Enable exclude default
      await user.click(toggle);

      await waitFor(() => {
        expect(toggle).toBeChecked();
      });

      // Check that default properties were removed from topicProperties
      const state = readFormState();

      // Only non-default properties should remain
      expect(state.topicProperties).toEqual(['segment.bytes', 'flush.ms']);
      expect(state.topicProperties).not.toContain('retention.bytes');
      expect(state.topicProperties).not.toContain('retention.ms');
    });

    test('should add default properties to topicProperties when excludeDefault is disabled', async () => {
      const { user, toggle } = renderTopicConfigTab({
        excludeDefault: true,
        topicProperties: ['segment.bytes', 'flush.ms'],
      });
      expect(toggle).toBeChecked();

      // Disable exclude default
      await user.click(toggle);

      await waitFor(() => {
        expect(toggle).not.toBeChecked();
      });

      // Check that default properties were added to topicProperties
      const state = readFormState();

      // Should contain all default properties plus the existing ones
      expect(state.topicProperties).toEqual(
        expect.arrayContaining([
          'segment.bytes',
          'flush.ms',
          'retention.bytes',
          'retention.ms',
          'delete.retention.ms',
          'min.compaction.lag.ms',
          'max.compaction.lag.ms',
          'replication.factor',
          'compression.type',
        ])
      );
    });
  });
});
