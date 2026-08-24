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

import type { QueryClient } from '@tanstack/react-query';
import { legacyListTopicsQueryOptions } from 'react-query/api/topic';

export function prefetchTopicsRouteData(queryClient: QueryClient): void {
  // TanStack Query's prefetch contract resolves on fetch failures. The page
  // observer owns visible errors, so starting this request must not delay nav.
  queryClient.prefetchQuery(legacyListTopicsQueryOptions());
}
