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

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { mockUiState } = vi.hoisted(() => ({
  mockUiState: {
    pageBreadcrumbs: [] as { title: string; linkTo: string }[],
    pageTitle: '',
  },
}));

vi.mock('../../../../state/ui-state', () => ({
  uiState: mockUiState,
}));

import { useSecurityBreadcrumbs } from './use-security-breadcrumbs';

describe('useSecurityBreadcrumbs', () => {
  beforeEach(() => {
    mockUiState.pageBreadcrumbs = [];
    mockUiState.pageTitle = '';
  });

  test('sets "Access Control" as the last breadcrumb (becomes H1)', () => {
    renderHook(() =>
      useSecurityBreadcrumbs([
        { title: 'Users', linkTo: '/security/users' },
        { title: 'alice', linkTo: '/security/users/alice/details' },
      ])
    );

    const crumbs = mockUiState.pageBreadcrumbs;
    expect(crumbs.at(-1)).toEqual({ title: 'Access Control', linkTo: '/security' });
  });

  test('prepends trail entries before "Access Control"', () => {
    renderHook(() =>
      useSecurityBreadcrumbs([
        { title: 'Roles', linkTo: '/security/roles' },
        { title: 'my-role', linkTo: '/security/roles/my-role/details' },
      ])
    );

    expect(mockUiState.pageBreadcrumbs).toEqual([
      { title: 'Roles', linkTo: '/security/roles' },
      { title: 'my-role', linkTo: '/security/roles/my-role/details' },
      { title: 'Access Control', linkTo: '/security' },
    ]);
  });

  test('with empty trail, only "Access Control" is set', () => {
    renderHook(() => useSecurityBreadcrumbs([]));

    expect(mockUiState.pageBreadcrumbs).toEqual([{ title: 'Access Control', linkTo: '/security' }]);
  });

  test('single trail entry for create pages', () => {
    renderHook(() => useSecurityBreadcrumbs([{ title: 'ACLs', linkTo: '/security/acls' }]));

    expect(mockUiState.pageBreadcrumbs).toEqual([
      { title: 'ACLs', linkTo: '/security/acls' },
      { title: 'Access Control', linkTo: '/security' },
    ]);
  });

  test('sets pageTitle to "Access Control"', () => {
    renderHook(() =>
      useSecurityBreadcrumbs([
        { title: 'Users', linkTo: '/security/users' },
        { title: 'alice', linkTo: '/security/users/alice/details' },
      ])
    );

    expect(mockUiState.pageTitle).toBe('Access Control');
  });

  test('sets pageTitle even with empty trail', () => {
    renderHook(() => useSecurityBreadcrumbs([]));

    expect(mockUiState.pageTitle).toBe('Access Control');
  });
});
