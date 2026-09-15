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

import { describe, expect, test } from '@rstest/core';

import { Route } from './index';

// Regression test: navigating away from the Messages tab (e.g. clicking the "Topics"
// breadcrumb) while a nuqs query-param update is still queued can flush that update
// after the route changed, re-navigating here with topicName literally "undefined".
// This must bounce back to the topic list instead of rendering a 404.
describe('topic details route', () => {
  test('redirects /topics/undefined back to the topic list', () => {
    expect.assertions(3);

    try {
      Route.options.beforeLoad?.({ params: { topicName: 'undefined' } } as never);
    } catch (error) {
      const redirect = error as Response & {
        options: { replace: boolean; to: string };
      };

      expect(redirect.status).toBe(307);
      expect(redirect.options.to).toBe('/topics');
      expect(redirect.options.replace).toBe(true);
    }
  });

  test('does not redirect a real topic name', () => {
    expect(() => Route.options.beforeLoad?.({ params: { topicName: 'my-real-topic' } } as never)).not.toThrow();
  });
});
