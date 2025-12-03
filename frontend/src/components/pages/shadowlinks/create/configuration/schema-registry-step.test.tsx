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

import { SchemaRegistryStep } from './schema-registry-step';
import { FormSchema, type FormValues, initialValues } from '../model';

const TestWrapper = ({
  defaultValues = initialValues,
  onFormChange,
}: {
  defaultValues?: FormValues;
  onFormChange?: (values: FormValues) => void;
}) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
  });

  if (onFormChange) {
    form.watch((values) => {
      onFormChange(values as FormValues);
    });
  }

  return (
    <Form {...form}>
      <form>
        <SchemaRegistryStep />
      </form>
    </Form>
  );
};

describe('SchemaRegistryStep', () => {
  describe('Toggle switch', () => {
    test('should toggle enableSchemaRegistrySync value when switch is clicked', async () => {
      let formValues: FormValues | undefined;

      render(
        <TestWrapper
          onFormChange={(values) => {
            formValues = values;
          }}
        />
      );

      const switchElement = screen.getByTestId('sr-enable-switch');

      expect(switchElement).toHaveAttribute('data-state', 'unchecked');

      fireEvent.click(switchElement);

      await waitFor(() => {
        expect(switchElement).toHaveAttribute('data-state', 'checked');
        expect(formValues?.enableSchemaRegistrySync).toBe(true);
      });

      fireEvent.click(switchElement);

      await waitFor(() => {
        expect(switchElement).toHaveAttribute('data-state', 'unchecked');
        expect(formValues?.enableSchemaRegistrySync).toBe(false);
      });
    });
  });
});
