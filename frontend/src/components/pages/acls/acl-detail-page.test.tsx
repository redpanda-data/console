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

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { AclDetail } from './acl.model';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockUseGetAclsByPrincipal, mockNavigate } = vi.hoisted(() => ({
  mockUseGetAclsByPrincipal: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('react-query/api/acl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-query/api/acl')>();
  return { ...actual, useGetAclsByPrincipal: mockUseGetAclsByPrincipal };
});

// Control params/search per-test via module-level variables
let currentAclName = '';
let currentHost: string | undefined;

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    getRouteApi: () => ({
      useParams: () => ({ aclName: currentAclName }),
      useSearch: () => ({ host: currentHost }),
    }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('state/ui-state', () => ({
  uiState: { pageBreadcrumbs: [] },
}));

vi.mock('./acl-details', () => ({
  ACLDetails: () => <div data-testid="acl-details" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const singleHostAclDetail = (principal: string): AclDetail => ({
  sharedConfig: { principal, host: '*' },
  rules: [],
});

/** Return value that shows the detail view (single host, no HostSelector). */
const aclDetailResult = (principal: string) => ({
  data: [singleHostAclDetail(principal)],
  isLoading: false,
});

/** Return value that keeps the component in "loading" state — useful when we
 *  only care about the call arguments, not what gets rendered. */
const loadingResult = { data: undefined, isLoading: true };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AclDetailPage — principal URL encoding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGetAclsByPrincipal.mockReturnValue(loadingResult);
  });

  test('Group principal in URL is passed to the API as-is', async () => {
    currentAclName = 'Group:mygroup';
    currentHost = '*';

    const { default: AclDetailPage } = await import('./acl-detail-page');
    render(<AclDetailPage />);

    await waitFor(() => {
      expect(mockUseGetAclsByPrincipal).toHaveBeenCalledWith('Group:mygroup', '*');
    });
  });

  test('bare User name (no prefix) defaults to User: principal type', async () => {
    currentAclName = 'alice';
    currentHost = '*';

    const { default: AclDetailPage } = await import('./acl-detail-page');
    render(<AclDetailPage />);

    await waitFor(() => {
      expect(mockUseGetAclsByPrincipal).toHaveBeenCalledWith('User:alice', '*');
    });
  });

  test('explicit User: prefix is preserved correctly', async () => {
    currentAclName = 'User:alice';
    currentHost = '*';

    const { default: AclDetailPage } = await import('./acl-detail-page');
    render(<AclDetailPage />);

    await waitFor(() => {
      expect(mockUseGetAclsByPrincipal).toHaveBeenCalledWith('User:alice', '*');
    });
  });

  test('Edit button navigates to update page preserving aclName and host for Group principal', async () => {
    currentAclName = 'Group:mygroup';
    currentHost = '*';
    mockUseGetAclsByPrincipal.mockReturnValue(aclDetailResult('Group:mygroup'));

    const { default: AclDetailPage } = await import('./acl-detail-page');
    render(<AclDetailPage />);

    const editButton = await screen.findByTestId('update-acl-button');
    await userEvent.click(editButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/security/acls/Group:mygroup/update',
        search: { host: '*' },
      });
    });
  });
});
