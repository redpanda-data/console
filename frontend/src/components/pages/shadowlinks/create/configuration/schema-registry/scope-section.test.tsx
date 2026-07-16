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
import userEvent from '@testing-library/user-event';
import { Form } from 'components/redpanda-ui/components/form';
import { useForm } from 'react-hook-form';
import { render, screen, waitFor, within } from 'test-utils';

import { ScopeSection } from './scope-section';
import { FormSchema, type FormValues, initialValues, SCHEMA_REGISTRY_MODE } from '../../model';

const apiModeValues: FormValues = {
  ...initialValues,
  schemaRegistry: {
    ...initialValues.schemaRegistry,
    mode: SCHEMA_REGISTRY_MODE.API,
    sourceUrl: 'https://schema-registry.example.com:8081',
  },
};

const TestWrapper = ({
  defaultValues = apiModeValues,
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
        <ScopeSection />
      </form>
    </Form>
  );
};

describe('ScopeSection', () => {
  test('should hide context and subject inputs while the entire registry is in scope', () => {
    render(<TestWrapper />);

    expect(screen.queryByTestId('sr-scope-specify-fields')).not.toBeInTheDocument();
  });

  test('should collect contexts and subjects as chips', async () => {
    const user = userEvent.setup();
    let formValues: FormValues | undefined;

    render(
      <TestWrapper
        onFormChange={(values) => {
          formValues = values;
        }}
      />
    );

    await user.click(screen.getByTestId('sr-scope-specify-tab'));

    await waitFor(() => {
      expect(screen.getByTestId('sr-scope-specify-fields')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('sr-contexts-input-field'), '.prod{enter}');
    await user.type(screen.getByTestId('sr-subjects-input-field'), ':.prod:orders-value{enter}');

    await waitFor(() => {
      expect(formValues?.schemaRegistry?.contexts).toEqual(['.prod']);
      expect(formValues?.schemaRegistry?.subjects).toEqual([':.prod:orders-value']);
    });

    // Removing a chip updates form state
    const chip = screen.getByTestId('sr-contexts-input-chip-.prod');
    await user.click(within(chip).getByRole('button', { name: 'Remove tag' }));
    await waitFor(() => {
      expect(formValues?.schemaRegistry?.contexts).toEqual([]);
    });
  });

  test('should manage context mapping rows when destinations are mapped', async () => {
    const user = userEvent.setup();
    let formValues: FormValues | undefined;

    render(
      <TestWrapper
        onFormChange={(values) => {
          formValues = values;
        }}
      />
    );

    await user.click(screen.getByTestId('sr-dest-map-radio'));

    // Switching to map seeds a first empty row
    await waitFor(() => {
      expect(screen.getByTestId('sr-mapping-0-source')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('sr-mapping-0-source'), '.prod');
    await user.type(screen.getByTestId('sr-mapping-0-destination'), '.dr');

    await user.click(screen.getByTestId('sr-add-mapping-button'));
    await waitFor(() => {
      expect(screen.getByTestId('sr-mapping-1-source')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('sr-mapping-1-remove'));
    await waitFor(() => {
      expect(screen.queryByTestId('sr-mapping-1-source')).not.toBeInTheDocument();
      expect(formValues?.schemaRegistry?.contextMappings).toMatchObject([{ source: '.prod', destination: '.dr' }]);
    });

    // Switching back to preserve hides the rows but keeps them in form state
    await user.click(screen.getByTestId('sr-dest-preserve-radio'));
    await waitFor(() => {
      expect(screen.queryByTestId('sr-context-mappings')).not.toBeInTheDocument();
      expect(formValues?.schemaRegistry?.destinationContextsMode).toBe('preserve');
    });
  });
});
