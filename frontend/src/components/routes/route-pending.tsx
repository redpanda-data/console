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

/**
 * Default pending component for route transitions.
 * Displayed while a route's loader is running.
 */
export const RoutePending = () => (
  <div className="flex items-center justify-center py-12">
    <output aria-label="Loading page" className="flex items-center gap-2 text-muted-foreground">
      <Spinner />
      <span>Loading...</span>
    </output>
  </div>
);
