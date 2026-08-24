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

import { QueryClient } from '@tanstack/react-query';
import { legacyListTopicsQueryOptions } from 'react-query/api/topic';

import { prefetchTopicsRouteData } from './-loader';

vi.mock('sonner', () => ({ toast: {} }));

it('warms the exact Query cache entry observed by the topics page', () => {
  const queryClient = new QueryClient();
  const prefetchQuery = vi.spyOn(queryClient, 'prefetchQuery').mockResolvedValue();

  prefetchTopicsRouteData(queryClient);

  expect(prefetchQuery).toHaveBeenCalledOnce();
  expect(prefetchQuery.mock.calls[0][0].queryKey).toEqual(legacyListTopicsQueryOptions().queryKey);
});

it('starts data warming without delaying navigation', () => {
  const queryClient = new QueryClient();
  vi.spyOn(queryClient, 'prefetchQuery').mockReturnValue(new Promise(() => undefined));

  expect(prefetchTopicsRouteData(queryClient)).toBeUndefined();
});
