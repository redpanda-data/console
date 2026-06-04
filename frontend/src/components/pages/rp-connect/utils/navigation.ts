/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { useNavigate } from '@tanstack/react-router';

type NavigateFn = ReturnType<typeof useNavigate>;

// '/connect-clusters' takes no search params; centralize the empty-search cast
// TanStack requires so the route name + cast live in one place.
export function navigateToConnectClusters(navigate: NavigateFn) {
  navigate({ to: '/connect-clusters', search: {} as never });
}
