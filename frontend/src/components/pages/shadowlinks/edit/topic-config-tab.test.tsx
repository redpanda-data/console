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
import { Form } from 'components/redpanda-ui/components/form';
import { useForm } from 'react-hook-form';
import { fireEvent, render, screen, waitFor } from 'test-utils';

import { TopicConfigTab } from './topic-config-tab';
import { getDefaultProperties } from './topic-properties-config';
import { FormSchema, type FormValues, initialValues } from '../create/model';

const TestWrapper = ({ defaultValues = initialValues }: { defaultValues?: FormValues }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
    mode: 'onBlur',
  });

  return (
    <Form {...form}>
      <form>
        <TopicConfigTab />
        <div data-testid="form-state">{JSON.stringify(form.watch())}</div>
      </form>
    </Form>
  );
};

describe('TopicConfigTab', () => {
  describe('Exclude default properties toggle', () => {
    test('should remove default properties from topicProperties when excludeDefault is enabled', async () => {
      const defaultProps = getDefaultProperties();
      const customValues: FormValues = {
        ...initialValues,
        excludeDefault: false,
        topicProperties: [...defaultProps, 'segment.bytes', 'flush.ms'],
      };

      render(<TestWrapper defaultValues={customValues} />);

      const toggle = screen.getByTestId('exclude-default-switch');
      expect(toggle).not.toBeChecked();

      // Enable exclude default
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(toggle).toBeChecked();
      });

      // Check that default properties were removed from topicProperties
      const formState = screen.getByTestId('form-state');
      const state = JSON.parse(formState.textContent || '{}');

      // Only non-default properties should remain
      expect(state.topicProperties).toEqual(['segment.bytes', 'flush.ms']);
      expect(state.topicProperties).not.toContain('retention.bytes');
      expect(state.topicProperties).not.toContain('retention.ms');
    });

    test('should add default properties to topicProperties when excludeDefault is disabled', async () => {
      const customValues: FormValues = {
        ...initialValues,
        excludeDefault: true,
        topicProperties: ['segment.bytes', 'flush.ms'],
      };

      render(<TestWrapper defaultValues={customValues} />);

      const toggle = screen.getByTestId('exclude-default-switch');
      expect(toggle).toBeChecked();

      // Disable exclude default
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(toggle).not.toBeChecked();
      });

      // Check that default properties were added to topicProperties
      const formState = screen.getByTestId('form-state');
      const state = JSON.parse(formState.textContent || '{}');

      // Should contain all default properties plus the existing ones
      expect(state.topicProperties).toContain('segment.bytes');
      expect(state.topicProperties).toContain('flush.ms');
      expect(state.topicProperties).toContain('retention.bytes');
      expect(state.topicProperties).toContain('retention.ms');
      expect(state.topicProperties).toContain('delete.retention.ms');
      expect(state.topicProperties).toContain('min.compaction.lag.ms');
      expect(state.topicProperties).toContain('max.compaction.lag.ms');
      expect(state.topicProperties).toContain('replication.factor');
      expect(state.topicProperties).toContain('compression.type');
    });
  });
});
