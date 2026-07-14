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

import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Text } from 'components/redpanda-ui/components/typography';

/**
 * Rendered by the router while a route loader is pending. Without it, slow
 * loaders (e.g. shadow link status aggregation on large clusters) leave the
 * user staring at a blank page.
 */
export const RoutePendingFallback = () => (
  <div className="flex h-64 items-center justify-center" data-testid="route-pending-fallback">
    <div className="flex items-center gap-2">
      <Spinner className="h-6 w-6" />
      <Text>Loading...</Text>
    </div>
  </div>
);
