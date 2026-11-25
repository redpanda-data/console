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

import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { isRedirect } from '@tanstack/react-router';
import { createTestRouterFromFiles } from 'test-utils';

import { Route } from './$roleName/edit';

afterEach(() => {
  rs.restoreAllMocks();
});

async function loadLegacyRoleRouter(role: string, query: string) {
  // The spy calls the real guard; Router supplies its complete typed context and follows both compatibility hops.
  const guard = rs.spyOn(Route.options, 'beforeLoad');
  const router = createTestRouterFromFiles(`/security/roles/${role}/edit${query}`);
  await router.load();
  const redirect: unknown = guard.mock.results.find((result) => result.type === 'throw')?.value;
  if (!isRedirect(redirect)) {
    throw new Error('Expected the legacy role redirect');
  }
  return { router, redirect };
}

describe('role edit compatibility route', () => {
  test.each([
    { role: 'topic-reader', query: '', search: {} },
    { role: 'test-bretts', query: '?host=host.example.com', search: { host: 'host.example.com' } },
  ])('redirects a legacy edit URL while preserving its search: $role', async ({ role, query, search }) => {
    const { router, redirect } = await loadLegacyRoleRouter(role, query);
    expect(redirect.status).toBe(307);
    expect(redirect.options).toMatchObject({ to: '/security/roles/$roleName/update', replace: true });
    expect({ ...redirect.options.params }).toStrictEqual({ roleName: role });
    expect({ ...redirect.options.search }).toStrictEqual(search);
    expect(router.state.location.pathname).toBe(`/security/roles/${role}/details`);
  });
});
