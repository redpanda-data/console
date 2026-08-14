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

import { ShadowSchemaRegistrySection } from './shadow-schema-registry-section';
import { FormSchema, type FormValues, initialValues, SCHEMA_REGISTRY_MODE } from '../../model';

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
        <ShadowSchemaRegistrySection />
      </form>
    </Form>
  );
};

describe('ShadowSchemaRegistrySection', () => {
  test('should render the three modes with none selected by default', () => {
    render(<TestWrapper />);

    expect(screen.getByTestId('sr-mode-topic-tab')).toBeInTheDocument();
    expect(screen.getByTestId('sr-mode-api-tab')).toBeInTheDocument();
    expect(screen.getByTestId('sr-mode-none-tab')).toBeInTheDocument();
    expect(screen.getByTestId('sr-mode-description')).toHaveTextContent('Schema Registry shadowing is off');
    expect(screen.queryByTestId('sr-source-connection-section')).not.toBeInTheDocument();
  });

  test('should mirror the legacy switch into topic mode on mount', async () => {
    render(<TestWrapper defaultValues={{ ...initialValues, enableSchemaRegistrySync: true }} />);

    await waitFor(() => {
      expect(screen.getByTestId('sr-mode-description')).toHaveTextContent("Replicate the source cluster's _schemas");
    });
  });

  test('should reveal api sections and mirror enableSchemaRegistrySync when switching modes', async () => {
    const user = userEvent.setup();
    let formValues: FormValues | undefined;

    render(
      <TestWrapper
        onFormChange={(values) => {
          formValues = values;
        }}
      />
    );

    await user.click(screen.getByTestId('sr-mode-topic-tab'));
    await waitFor(() => {
      expect(formValues?.schemaRegistry?.mode).toBe(SCHEMA_REGISTRY_MODE.TOPIC);
      expect(formValues?.enableSchemaRegistrySync).toBe(true);
    });

    await user.click(screen.getByTestId('sr-mode-api-tab'));
    await waitFor(() => {
      expect(formValues?.schemaRegistry?.mode).toBe(SCHEMA_REGISTRY_MODE.API);
      // API mode is not the legacy topic sync, so the mirrored switch is off.
      expect(formValues?.enableSchemaRegistrySync).toBe(false);
    });

    expect(screen.getByTestId('sr-source-connection-section')).toBeInTheDocument();
    expect(screen.getByTestId('sr-scope-section')).toBeInTheDocument();
    expect(screen.getByTestId('sr-sync-behavior')).toBeInTheDocument();
  });
});
