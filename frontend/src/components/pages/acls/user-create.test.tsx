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

import userEvent from '@testing-library/user-event';
import { fireEvent, renderWithFileRoutes, screen, waitFor } from 'test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock hooks
vi.mock('react-query/api/user', () => ({
  useLegacyListUsersQuery: vi.fn(),
  useCreateUserMutation: vi.fn(),
  getSASLMechanism: vi.fn(() => 1),
}));

vi.mock('react-query/api/security', () => ({
  useListRolesQuery: vi.fn(),
  useUpdateRoleMembershipMutation: vi.fn(),
}));

vi.mock('state/supported-features', async (importOriginal) => {
  const actual = await importOriginal<typeof import('state/supported-features')>();
  return {
    ...actual,
    Features: { rolesApi: false },
  };
});

vi.mock('state/ui-state', () => ({
  uiState: { pageTitle: '', pageBreadcrumbs: [] },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock Radix tooltip — avoids context mismatch between radix-ui and @radix-ui/react-tooltip
vi.mock('components/redpanda-ui/components/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import React from 'react';
import { useListRolesQuery, useUpdateRoleMembershipMutation } from 'react-query/api/security';
import { useCreateUserMutation, useLegacyListUsersQuery } from 'react-query/api/user';

import UserCreatePage from './user-create';

// jsdom polyfills
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = vi.fn();

const renderPage = () => renderWithFileRoutes(<UserCreatePage />);

/** Find the password <input> inside the password Field wrapper. */
const getPasswordInput = () => {
  const field = screen.getByTestId('create-user-password');
  const input = field.querySelector('input');
  if (!input) {
    throw new Error('Password input not found');
  }
  return input;
};

describe('UserCreatePage', () => {
  const mockCreateUserAsync = vi.fn().mockResolvedValue({});

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useLegacyListUsersQuery).mockReturnValue({
      data: { users: [{ name: 'existing-user' }] },
      isFetching: false,
      error: null,
    } as any);

    vi.mocked(useCreateUserMutation).mockReturnValue({
      mutateAsync: mockCreateUserAsync,
      isPending: false,
    } as any);

    vi.mocked(useUpdateRoleMembershipMutation).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    } as any);

    vi.mocked(useListRolesQuery).mockReturnValue({
      data: { roles: [] },
    } as any);
  });

  describe('Username validation', () => {
    test('shows error when username exceeds 128 characters', async () => {
      renderPage();
      const input = await screen.findByTestId('create-user-name');

      fireEvent.change(input, { target: { value: 'a'.repeat(129) } });

      await waitFor(() => {
        expect(screen.getByText('Must not exceed 128 characters')).toBeInTheDocument();
      });
    });

    test('accepts username at exactly 128 characters without max-length error', async () => {
      renderPage();
      const input = await screen.findByTestId('create-user-name');

      fireEvent.change(input, { target: { value: 'a'.repeat(128) } });

      await waitFor(() => {
        expect(screen.queryByText('Must not exceed 128 characters')).not.toBeInTheDocument();
      });
    });

    test('shows error for invalid characters (spaces)', async () => {
      const user = userEvent.setup();
      renderPage();
      const input = await screen.findByTestId('create-user-name');

      await user.type(input, 'user name');

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/Must not contain any whitespace/);
      });
    });

    test('shows error for duplicate username', async () => {
      const user = userEvent.setup();
      renderPage();
      const input = await screen.findByTestId('create-user-name');

      await user.type(input, 'existing-user');

      await waitFor(() => {
        expect(screen.getByText('User already exists')).toBeInTheDocument();
      });
    });
  });

  describe('Password validation', () => {
    test('shows error when password is shorter than 3 characters', async () => {
      const user = userEvent.setup();
      renderPage();

      await screen.findByTestId('create-user-name');
      const passwordInput = getPasswordInput();

      // Clear the auto-generated password and type a short one
      await user.clear(passwordInput);
      await user.type(passwordInput, 'ab');

      await waitFor(() => {
        expect(screen.getByText('Must be at least 3 characters')).toBeInTheDocument();
      });
    });

    test('shows error when password exceeds 128 characters', async () => {
      renderPage();

      await screen.findByTestId('create-user-name');
      const passwordInput = getPasswordInput();

      fireEvent.change(passwordInput, { target: { value: 'a'.repeat(129) } });

      await waitFor(() => {
        expect(screen.getByText('Must not exceed 128 characters')).toBeInTheDocument();
      });
    });
  });

  describe('Form submission', () => {
    test('submit button is disabled when username is empty', async () => {
      renderPage();

      await screen.findByTestId('create-user-name');

      expect(screen.getByTestId('create-user-submit')).toBeDisabled();
    });

    test('creates user with valid form data', async () => {
      const user = userEvent.setup();
      renderPage();

      const usernameInput = await screen.findByTestId('create-user-name');
      await user.type(usernameInput, 'testuser');

      const submitButton = screen.getByTestId('create-user-submit');
      await waitFor(() => {
        expect(submitButton).toBeEnabled();
      });

      await user.click(submitButton);

      await waitFor(() => {
        expect(mockCreateUserAsync).toHaveBeenCalledTimes(1);
      });
    });

    test('shows confirmation page after successful creation', async () => {
      const user = userEvent.setup();
      renderPage();

      const usernameInput = await screen.findByTestId('create-user-name');
      await user.type(usernameInput, 'newuser');

      const submitButton = screen.getByTestId('create-user-submit');
      await waitFor(() => {
        expect(submitButton).toBeEnabled();
      });

      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('User created successfully')).toBeInTheDocument();
      });

      expect(screen.getByText('newuser')).toBeInTheDocument();
    });
  });
});
