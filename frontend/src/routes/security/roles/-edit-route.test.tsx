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

import { describe, expect, test } from 'vitest';

import { Route } from './$roleName/edit';

describe('role edit compatibility route', () => {
  test('redirects legacy edit URLs to the update route', () => {
    expect.assertions(5);

    try {
      Route.options.beforeLoad?.({
        params: { roleName: 'topic-reader' },
        search: {},
      } as never);
    } catch (error) {
      const redirect = error as Response & {
        options: {
          params: { roleName: string };
          replace: boolean;
          search: Record<string, string>;
          to: string;
        };
      };

      expect(redirect.status).toBe(307);
      expect(redirect.options.to).toBe('/security/roles/$roleName/update');
      expect(redirect.options.params).toEqual({ roleName: 'topic-reader' });
      expect(redirect.options.replace).toBe(true);
      expect(redirect.options.search).toEqual({});
    }
  });

  test('preserves host search params when redirecting to update', () => {
    expect.assertions(5);

    try {
      Route.options.beforeLoad?.({
        params: { roleName: 'test-bretts' },
        search: { host: 'host.example.com' },
      } as never);
    } catch (error) {
      const redirect = error as Response & {
        options: {
          params: { roleName: string };
          replace: boolean;
          search: Record<string, string>;
          to: string;
        };
      };

      expect(redirect.status).toBe(307);
      expect(redirect.options.to).toBe('/security/roles/$roleName/update');
      expect(redirect.options.params).toEqual({ roleName: 'test-bretts' });
      expect(redirect.options.replace).toBe(true);
      expect(redirect.options.search).toEqual({ host: 'host.example.com' });
    }
  });
});
