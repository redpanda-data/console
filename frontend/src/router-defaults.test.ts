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

import { RouteError } from './components/routes/route-error';
import { RoutePending } from './components/routes/route-pending';
import { routerDefaults } from './router-defaults';

describe('routerDefaults', () => {
  it('preloads on intent while TanStack Query owns caching and route boundaries', () => {
    expect(routerDefaults).toEqual({
      defaultErrorComponent: RouteError,
      defaultPendingComponent: RoutePending,
      defaultPreload: 'intent',
      defaultPreloadStaleTime: 0,
    });
  });
});
