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
import { render, screen, waitFor } from 'test-utils';

import { SyncBehaviorSection } from './sync-behavior-section';
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
    mode: 'onChange',
  });

  if (onFormChange) {
    form.watch((values) => {
      onFormChange(values as FormValues);
    });
  }

  return (
    <Form {...form}>
      <form>
        <SyncBehaviorSection />
      </form>
    </Form>
  );
};

describe('SyncBehaviorSection', () => {
  test('should start collapsed and reveal fields when expanded', async () => {
    const user = userEvent.setup();
    let formValues: FormValues | undefined;

    render(
      <TestWrapper
        onFormChange={(values) => {
          formValues = values;
        }}
      />
    );

    expect(screen.queryByTestId('sr-tail-interval-input')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('sr-sync-behavior-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('sr-tail-interval-input')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('sr-tail-interval-input'), '10s');
    await user.type(screen.getByTestId('sr-full-sync-interval-input'), '5m');
    await user.type(screen.getByTestId('sr-max-request-rate-input'), '30');

    await waitFor(() => {
      expect(formValues?.schemaRegistry?.syncBehavior?.tailInterval).toBe('10s');
      expect(formValues?.schemaRegistry?.syncBehavior?.fullSyncInterval).toBe('5m');
      expect(formValues?.schemaRegistry?.syncBehavior?.maxSourceRequestRate).toBe('30');
    });
  });

  test('should surface a validation error for a malformed interval', async () => {
    const user = userEvent.setup();

    render(<TestWrapper />);

    await user.click(screen.getByTestId('sr-sync-behavior-trigger'));
    await user.type(screen.getByTestId('sr-tail-interval-input'), '10');

    await waitFor(() => {
      expect(screen.getByText('Use a number with a unit, e.g. 10s or 5m')).toBeInTheDocument();
    });
  });
});
