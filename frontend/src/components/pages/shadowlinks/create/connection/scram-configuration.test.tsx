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

import { ScramConfiguration } from './scram-configuration';
import { FormSchema, type FormValues, initialValues } from '../model';

const TestWrapper = ({ defaultValues = initialValues }: { defaultValues?: FormValues }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
    mode: 'onBlur',
  });

  const onSubmit = () => {
    // Test form submission
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <ScramConfiguration />
        <button data-testid="submit-button" type="submit">
          Submit
        </button>
      </form>
    </Form>
  );
};

describe('ScramConfiguration', () => {
  describe('SCRAM enabled state', () => {
    test('should show credentials form when switch is enabled', () => {
      const customValues: FormValues = {
        ...initialValues,
        useScram: true,
      };

      render(<TestWrapper defaultValues={customValues} />);

      const scramSwitch = screen.getByTestId('enable-scram-switch');
      expect(scramSwitch).toBeChecked();
      expect(screen.getByTestId('scram-username-input')).toBeInTheDocument();
      expect(screen.getByTestId('scram-password-input')).toBeInTheDocument();
      expect(screen.getByTestId('scram-mechanism-select')).toBeInTheDocument();
    });

    test('should hide credentials form when switch is disabled', () => {
      const customValues: FormValues = {
        ...initialValues,
        useScram: false,
      };

      render(<TestWrapper defaultValues={customValues} />);

      const scramSwitch = screen.getByTestId('enable-scram-switch');
      expect(scramSwitch).not.toBeChecked();
      expect(screen.queryByTestId('scram-username-input')).not.toBeInTheDocument();
      expect(screen.queryByTestId('scram-password-input')).not.toBeInTheDocument();
      expect(screen.queryByTestId('scram-mechanism-select')).not.toBeInTheDocument();
    });

    test('should toggle credentials form when switch is clicked', async () => {
      render(<TestWrapper />);

      const scramSwitch = screen.getByTestId('enable-scram-switch');

      // Initially disabled (default)
      expect(scramSwitch).not.toBeChecked();
      expect(screen.queryByTestId('scram-username-input')).not.toBeInTheDocument();

      // Enable SCRAM
      fireEvent.click(scramSwitch);

      await waitFor(() => {
        expect(scramSwitch).toBeChecked();
        expect(screen.getByTestId('scram-username-input')).toBeInTheDocument();
        expect(screen.getByTestId('scram-password-input')).toBeInTheDocument();
        expect(screen.getByTestId('scram-mechanism-select')).toBeInTheDocument();
      });

      // Disable SCRAM
      fireEvent.click(scramSwitch);

      await waitFor(() => {
        expect(scramSwitch).not.toBeChecked();
        expect(screen.queryByTestId('scram-username-input')).not.toBeInTheDocument();
        expect(screen.queryByTestId('scram-password-input')).not.toBeInTheDocument();
        expect(screen.queryByTestId('scram-mechanism-select')).not.toBeInTheDocument();
      });
    });
  });

  describe('Input validation', () => {
    test('should show validation errors when inputs are invalid', async () => {
      const customValues: FormValues = {
        ...initialValues,
        useScram: true,
        scramCredentials: {
          username: '',
          password: '',
          mechanism: initialValues.scramCredentials?.mechanism || 0,
        },
      };

      render(<TestWrapper defaultValues={customValues} />);

      const usernameInput = await screen.findByTestId('scram-username-input');
      const passwordInput = await screen.findByTestId('scram-password-input');

      const submitButton = screen.getByTestId('submit-button');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText('SCRAM username is required for authentication. Provide a username or disable SCRAM.')
        ).toBeInTheDocument();
        expect(
          screen.getByText('SCRAM password is required for authentication. Provide a password or disable SCRAM.')
        ).toBeInTheDocument();
      });

      fireEvent.change(usernameInput, { target: { value: 'admin' } });
      fireEvent.change(passwordInput, { target: { value: 'secure-password-123' } });

      await waitFor(() => {
        expect(usernameInput).toHaveValue('admin');
        expect(passwordInput).toHaveValue('secure-password-123');
        expect(
          screen.queryByText('SCRAM username is required for authentication. Provide a username or disable SCRAM.')
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText('SCRAM password is required for authentication. Provide a password or disable SCRAM.')
        ).not.toBeInTheDocument();
      });
    });
  });
});
