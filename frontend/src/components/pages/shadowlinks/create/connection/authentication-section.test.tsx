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
import { vi } from 'vitest';

import { AuthenticationSection } from './authentication-section';
import { AUTH_METHOD, FormSchema, type FormValues, initialValues } from '../model';

const VIEW_REQUIRED_ACLS_RE = /view required acls/i;

vi.mock('config', () => ({
  isEmbedded: vi.fn(() => false),
  isFeatureFlagEnabled: vi.fn(() => false),
}));

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
        <AuthenticationSection />
        <button data-testid="submit-button" type="submit">
          Submit
        </button>
      </form>
    </Form>
  );
};

describe('AuthenticationSection', () => {
  describe('Toggle rendering', () => {
    test('renders all three auth method options', () => {
      render(<TestWrapper />);

      expect(screen.getByTestId('auth-method-none')).toBeInTheDocument();
      expect(screen.getByTestId('auth-method-scram')).toBeInTheDocument();
      expect(screen.getByTestId('auth-method-plain')).toBeInTheDocument();
    });

    test('defaults to SCRAM and shows SCRAM fields + callout', () => {
      render(<TestWrapper />);

      expect(screen.getByTestId('auth-credentials-form')).toBeInTheDocument();
      expect(screen.getByTestId('scram-username-field')).toBeInTheDocument();
      expect(screen.getByTestId('scram-password-field')).toBeInTheDocument();
      expect(screen.getByTestId('scram-mechanism-field')).toBeInTheDocument();

      const callout = screen.getByTestId('auth-source-cluster-callout');
      expect(callout).toBeInTheDocument();
      expect(callout).toHaveTextContent('The user must exist on the source cluster.');
      expect(screen.getByRole('link', { name: VIEW_REQUIRED_ACLS_RE })).toBeInTheDocument();
    });
  });

  describe('None method', () => {
    test('hides all credentials and the callout when authMethod is none', () => {
      render(<TestWrapper defaultValues={{ ...initialValues, authMethod: AUTH_METHOD.NONE }} />);

      expect(screen.queryByTestId('auth-credentials-form')).not.toBeInTheDocument();
      expect(screen.queryByTestId('auth-source-cluster-callout')).not.toBeInTheDocument();
      expect(screen.queryByTestId('scram-username-field')).not.toBeInTheDocument();
      expect(screen.queryByTestId('plain-username-field')).not.toBeInTheDocument();
      expect(
        screen.getByText('No SASL authentication will be used to connect to the source cluster.')
      ).toBeInTheDocument();
    });
  });

  describe('PLAIN method', () => {
    test('shows username + password but no mechanism dropdown when authMethod is plain', () => {
      render(<TestWrapper defaultValues={{ ...initialValues, authMethod: AUTH_METHOD.PLAIN }} />);

      expect(screen.getByTestId('plain-username-field')).toBeInTheDocument();
      expect(screen.getByTestId('plain-password-field')).toBeInTheDocument();
      expect(screen.queryByTestId('scram-mechanism-field')).not.toBeInTheDocument();
      expect(screen.queryByTestId('scram-username-field')).not.toBeInTheDocument();
      expect(screen.getByTestId('auth-source-cluster-callout')).toBeInTheDocument();
    });

    test('shows validation errors for empty PLAIN credentials', async () => {
      const user = userEvent.setup();
      const customValues: FormValues = {
        ...initialValues,
        authMethod: AUTH_METHOD.PLAIN,
        plainCredentials: { username: '', password: '' },
      };

      render(<TestWrapper defaultValues={customValues} />);

      await user.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(screen.getByText('Username is required when PLAIN is enabled')).toBeInTheDocument();
        expect(screen.getByText('Password is required when PLAIN is enabled')).toBeInTheDocument();
      });
    });
  });

  describe('SCRAM validation', () => {
    test('shows validation errors for empty SCRAM credentials', async () => {
      const user = userEvent.setup();
      const customValues: FormValues = {
        ...initialValues,
        authMethod: AUTH_METHOD.SCRAM,
        scramCredentials: {
          username: '',
          password: '',
          mechanism: initialValues.scramCredentials?.mechanism || 0,
        },
      };

      render(<TestWrapper defaultValues={customValues} />);

      const usernameInput = await screen.findByTestId('scram-username-input');
      const passwordInput = await screen.findByTestId('scram-password-input');

      await user.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(screen.getByText('Username is required when SCRAM is enabled')).toBeInTheDocument();
        expect(screen.getByText('Password is required when SCRAM is enabled')).toBeInTheDocument();
      });

      await user.type(usernameInput, 'admin');
      await user.type(passwordInput, 'secure-password-123');

      await waitFor(() => {
        expect(usernameInput).toHaveValue('admin');
        expect(passwordInput).toHaveValue('secure-password-123');
        expect(screen.queryByText('Username is required when SCRAM is enabled')).not.toBeInTheDocument();
        expect(screen.queryByText('Password is required when SCRAM is enabled')).not.toBeInTheDocument();
      });
    });
  });

  describe('Switching preserves per-method credentials', () => {
    test('typed SCRAM credentials survive a switch to PLAIN and back', async () => {
      const user = userEvent.setup();
      render(<TestWrapper />);

      const scramUsername = await screen.findByTestId('scram-username-input');
      await user.type(scramUsername, 'scram-user');

      await user.click(screen.getByTestId('auth-method-plain'));

      await waitFor(() => {
        expect(screen.getByTestId('plain-username-field')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('scram-username-field')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('auth-method-scram'));

      const scramUsernameAgain = await screen.findByTestId('scram-username-input');
      expect(scramUsernameAgain).toHaveValue('scram-user');
    });
  });
});
