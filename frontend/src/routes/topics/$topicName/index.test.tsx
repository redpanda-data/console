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

import { Route } from './index';

afterEach(() => {
  rs.restoreAllMocks();
});

// A queued query-param update can flush after navigation and supply the literal topic name "undefined".
describe('topic details route', () => {
  test('redirects /topics/undefined back to the topic list', async () => {
    const guard = rs.spyOn(Route.options, 'beforeLoad');
    const router = createTestRouterFromFiles('/topics/undefined');
    await router.load();
    const redirect: unknown = guard.mock.results.find((result) => result.type === 'throw')?.value;
    if (!isRedirect(redirect)) {
      throw new Error('Expected the invalid topic redirect');
    }
    expect(redirect.status).toBe(307);
    expect(redirect.options).toMatchObject({ to: '/topics', replace: true });
    expect(router.state.location.pathname).toBe('/topics');
  });

  test('loads a real topic without redirecting', async () => {
    const guard = rs.spyOn(Route.options, 'beforeLoad');
    const router = createTestRouterFromFiles('/topics/my-real-topic');
    await router.load();
    expect(guard).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ params: { topicName: 'my-real-topic' } }));
    expect(guard.mock.results.every((result) => result.type === 'return')).toBe(true);
    expect(router.state.location.pathname).toBe('/topics/my-real-topic');
    expect(router.state.matches.every((match) => match.status === 'success')).toBe(true);
  });
});
