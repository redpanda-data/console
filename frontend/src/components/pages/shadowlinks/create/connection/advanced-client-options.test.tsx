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
import { fireEvent, render, screen, waitFor, within } from 'test-utils';

import { AdvancedClientOptions } from './advanced-client-options';
import { FormSchema, type FormValues, initialValues } from '../model';

const TestWrapper = ({ defaultValues = initialValues }: { defaultValues?: FormValues }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form>
        <AdvancedClientOptions />
      </form>
    </Form>
  );
};

// Helper to get input from FormItem wrapper
const getFieldInput = (testId: string) => {
  const formItem = screen.getByTestId(testId);
  return within(formItem).getByRole('spinbutton');
};

describe('AdvancedClientOptions', () => {
  describe('Default values', () => {
    test('should display all fields with correct default values when opened', async () => {
      render(<TestWrapper />);

      // Open the collapsible section
      const toggleButton = screen.getByTestId('advanced-options-toggle');
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByTestId('advanced-options-content')).toBeVisible();
      });

      // Verify all default values
      expect(getFieldInput('metadata-max-age-field')).toHaveValue(10_000);
      expect(getFieldInput('connection-timeout-field')).toHaveValue(1000);
      expect(getFieldInput('retry-backoff-field')).toHaveValue(100);
      expect(getFieldInput('fetch-wait-max-field')).toHaveValue(500);
      expect(getFieldInput('fetch-min-bytes-field')).toHaveValue(5_242_880);
      expect(getFieldInput('fetch-max-bytes-field')).toHaveValue(20_971_520);
    });
  });
});
