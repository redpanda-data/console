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

import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { cn } from 'components/redpanda-ui/lib/utils';
import { memo } from 'react';

import { LOG_GRID_COLUMNS } from './log-row';

/**
 * Skeleton for a single log row.
 * Uses the same CSS Grid layout as LogRow for perfect alignment.
 */
export const LogRowSkeleton = memo(({ className }: { className?: string }) => (
  <div
    className={cn('grid w-full items-center gap-3 border-border/50 border-b px-3 py-2', LOG_GRID_COLUMNS, className)}
  >
    {/* Timestamp */}
    <Skeleton className="h-4 w-[100px]" />

    {/* Level badge */}
    <Skeleton className="h-5 w-[50px] rounded-full" />

    {/* Path */}
    <Skeleton className="h-4 w-[80px]" />

    {/* Message */}
    <Skeleton className="h-4 w-full" />
  </div>
));

LogRowSkeleton.displayName = 'LogRowSkeleton';

type LogRowsSkeletonProps = {
  /** Number of skeleton rows to display */
  rows?: number;
  /** Include header row skeleton */
  showHeader?: boolean;
};

/**
 * Skeleton for the log rows list (internal loading state).
 * Used when logs are being fetched but we already have the toolbar visible.
 */
export const LogRowsSkeleton = memo(({ rows = 8, showHeader = false }: LogRowsSkeletonProps) => (
  <div className="flex flex-col rounded-md border">
    {showHeader ? (
      <div
        className={cn(
          'sticky top-0 z-10 grid w-full items-center gap-3 border-border/50 border-b bg-muted/50 px-3 py-2',
          LOG_GRID_COLUMNS
        )}
      >
        <Skeleton className="h-4 w-[70px]" />
        <Skeleton className="h-4 w-[40px]" />
        <Skeleton className="h-4 w-[30px]" />
        <Skeleton className="h-4 w-[55px]" />
      </div>
    ) : null}
    {Array.from({ length: rows }).map((_, i) => (
      <LogRowSkeleton key={`row-skeleton-${i.toString()}`} />
    ))}
  </div>
));

LogRowsSkeleton.displayName = 'LogRowsSkeleton';

type LogExplorerToolbarSkeletonProps = {
  /** Show scope filter skeleton */
  showScopeFilter?: boolean;
  /** Show refresh button skeleton */
  showRefreshButton?: boolean;
};

/**
 * Skeleton for the LogExplorer toolbar.
 * Matches: Search | Level filter | Scope filter | ... | Refresh | Count
 */
export const LogExplorerToolbarSkeleton = memo(
  ({ showScopeFilter = true, showRefreshButton = true }: LogExplorerToolbarSkeletonProps) => (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search input */}
      <Skeleton className="h-8 w-[200px]" />

      {/* Level filter button */}
      <Skeleton className="h-8 w-[80px]" />

      {/* Scope filter button (optional) */}
      {showScopeFilter ? <Skeleton className="h-8 w-[80px]" /> : null}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Refresh button (optional) */}
      {showRefreshButton ? <Skeleton className="h-8 w-[90px]" /> : null}

      {/* Log count */}
      <Skeleton className="h-4 w-[60px]" />
    </div>
  )
);

LogExplorerToolbarSkeleton.displayName = 'LogExplorerToolbarSkeleton';

type LogExplorerSkeletonProps = {
  /** Number of skeleton rows to display */
  rows?: number;
  /** Maximum height of the skeleton list area */
  maxHeight?: string;
  /** Show scope filter in toolbar */
  showScopeFilter?: boolean;
  /** Show refresh button in toolbar */
  showRefreshButton?: boolean;
  /** Class name for the container */
  className?: string;
};

/**
 * Full skeleton for the LogExplorer component.
 * Use this for top-level loading states (e.g., when pipeline is loading).
 *
 * Includes:
 * - Toolbar skeleton (search, filters, refresh, count)
 * - Log rows skeleton
 *
 * @example
 * ```tsx
 * // Top-level page loading
 * if (isPipelineLoading) {
 *   return <LogExplorerSkeleton />;
 * }
 *
 * // Or with custom options
 * <LogExplorerSkeleton rows={10} showScopeFilter={false} />
 * ```
 */
export const LogExplorerSkeleton = memo(
  ({
    rows = 8,
    maxHeight = '600px',
    showScopeFilter = true,
    showRefreshButton = true,
    className,
  }: LogExplorerSkeletonProps) => (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Toolbar */}
      <LogExplorerToolbarSkeleton showRefreshButton={showRefreshButton} showScopeFilter={showScopeFilter} />

      {/* Log rows */}
      <div className="overflow-hidden rounded-md border" style={{ maxHeight }}>
        <LogRowsSkeleton rows={rows} />
      </div>
    </div>
  )
);

LogExplorerSkeleton.displayName = 'LogExplorerSkeleton';
