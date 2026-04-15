/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Skeleton } from 'components/redpanda-ui/components/skeleton';

/**
 * Skeleton that mimics the 3-column user table:
 * [name] [role tags ...] [action icon]
 */
export const TableSkeleton = () => (
  <div className="my-4 rounded-md border p-4">
    {/* Header */}
    <div className="flex items-center gap-4 px-4 py-3">
      <Skeleton className="flex-1" size="sm" variant="text" />
      <Skeleton size="sm" variant="text" width="md" />
      <Skeleton size="sm" variant="text" width="xs" />
    </div>
    {/* Rows */}
    {Array.from({ length: 4 }).map((_, i) => (
      <div className="flex items-center gap-4 px-4 py-3" key={i}>
        <Skeleton className="flex-1" size="sm" variant="text" width="sm" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-6 w-6 rounded" />
      </div>
    ))}
  </div>
);
