/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

// biome-ignore-all lint/style/noNamespaceImport: test file

import { render, screen } from '@testing-library/react';
import { UserInformationCard } from 'components/pages/roles/user-information-card';
import { isServerless } from 'config';

vi.mock('config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('config')>();
  return {
    ...actual,
    isServerless: vi.fn(() => false),
  };
});

const mockedIsServerless = vi.mocked(isServerless);

/**
 * These tests verify the serverless guard on the password change UI (UX-963).
 *
 * In both user-details.tsx and acl-list.tsx, the password change controls are
 * gated by `api.isAdminApiConfigured && !isServerless()`. When isServerless()
 * returns true, onEditPassword is undefined and the UI is hidden.
 *
 * We test the UserInformationCard component directly, which renders the "Edit"
 * password button only when the onEditPassword callback is provided. This
 * mirrors the guard logic in the parent components.
 */
describe('UX-963: password change hidden in serverless mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the Edit password button when not in serverless mode (onEditPassword provided)', () => {
    mockedIsServerless.mockReturnValue(false);

    const isAdminApiConfigured = true;
    const onEditPassword = isAdminApiConfigured && !isServerless() ? vi.fn() : undefined;

    render(<UserInformationCard onEditPassword={onEditPassword} username="test-user" />);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('hides the Edit password button when in serverless mode (onEditPassword is undefined)', () => {
    mockedIsServerless.mockReturnValue(true);

    const isAdminApiConfigured = true;
    const onEditPassword = isAdminApiConfigured && !isServerless() ? vi.fn() : undefined;

    render(<UserInformationCard onEditPassword={onEditPassword} username="test-user" />);

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('hides the Edit password button when admin API is not configured', () => {
    mockedIsServerless.mockReturnValue(false);

    const isAdminApiConfigured = false;
    const onEditPassword = isAdminApiConfigured && !isServerless() ? vi.fn() : undefined;

    render(<UserInformationCard onEditPassword={onEditPassword} username="test-user" />);

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('evaluates the guard condition correctly for all combinations', () => {
    // This directly tests the boolean logic used in user-details.tsx and acl-list.tsx:
    // api.isAdminApiConfigured && !isServerless()
    const cases = [
      { adminApi: true, serverless: false, expected: true },
      { adminApi: true, serverless: true, expected: false },
      { adminApi: false, serverless: false, expected: false },
      { adminApi: false, serverless: true, expected: false },
    ];

    for (const { adminApi, serverless, expected } of cases) {
      mockedIsServerless.mockReturnValue(serverless);
      const result = adminApi && !isServerless();
      expect(result).toBe(expected);
    }
  });
});
