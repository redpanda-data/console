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

import { Button } from 'components/redpanda-ui/components/button';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, DownloadIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { prettyBytes } from '../../../../../utils/utils';

export type MessagesFooterProps = {
  totalLoaded: number;
  pageIndex: number;
  pageSize: number;
  onPageChange: (pageIndex: number) => void;
  continuousMode: boolean;
  /** Continuous mode: rows currently shown in the display window. */
  windowSize: number;
  windowCap: number;
  trimmedCount: number;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  loadMoreCount: number;
  onLoadMore: () => void;
  /** Stats line (hidden while live tailing / refreshing). */
  showStats: boolean;
  bytesConsumed: number;
  elapsedMs: number | null;
};

const RangeLabel = ({
  continuousMode,
  windowSize,
  totalLoaded,
  pageIndex,
  pageSize,
  trimmedCount,
}: Pick<
  MessagesFooterProps,
  'continuousMode' | 'windowSize' | 'totalLoaded' | 'pageIndex' | 'pageSize' | 'trimmedCount'
>) => {
  if (continuousMode) {
    return (
      <span className="flex items-center gap-3 text-muted-foreground text-sm">
        Showing {windowSize} in window · {totalLoaded} loaded
        {trimmedCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs">
            <Trash2Icon className="size-3.5" />
            {trimmedCount} older trimmed
          </span>
        )}
      </span>
    );
  }
  if (totalLoaded === 0) {
    return <span className="text-muted-foreground text-sm">No messages loaded</span>;
  }
  const start = pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, totalLoaded);
  return (
    <span className="text-muted-foreground text-sm">
      {start}–{end} of {totalLoaded} loaded
    </span>
  );
};

export const MessagesFooter = ({
  totalLoaded,
  pageIndex,
  pageSize,
  onPageChange,
  continuousMode,
  windowSize,
  windowCap,
  trimmedCount,
  canLoadMore,
  isLoadingMore,
  loadMoreCount,
  onLoadMore,
  showStats,
  bytesConsumed,
  elapsedMs,
}: MessagesFooterProps) => {
  const pageCount = Math.max(1, Math.ceil(totalLoaded / pageSize));

  // The footer is the natural bottom-of-list marker for infinite scroll (the table itself
  // doesn't scroll independently — the page does). Scrolling this sentinel into view loads
  // the next page automatically; the button below stays as an explicit, always-available
  // affordance rather than the only way to load more.
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Read through refs rather than as effect deps: `onLoadMore` is a fresh closure from the
  // parent every render, and `isLoadingMore` flips constantly while paging. Depending on either
  // tore the observer down and rebuilt it on every render, and observe() reports the sentinel's
  // *current* intersection state as soon as it's called — with the window height capped, the
  // sentinel never leaves the viewport, so that per-render rebuild alone kept re-firing onLoadMore
  // in an unbounded loop with no user scrolling.
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const isLoadingMoreRef = useRef(isLoadingMore);
  isLoadingMoreRef.current = isLoadingMore;
  useEffect(() => {
    if (!(continuousMode && canLoadMore)) {
      return;
    }
    const el = sentinelRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMoreRef.current) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [continuousMode, canLoadMore]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <RangeLabel
          continuousMode={continuousMode}
          pageIndex={pageIndex}
          pageSize={pageSize}
          totalLoaded={totalLoaded}
          trimmedCount={trimmedCount}
          windowSize={windowSize}
        />
        {continuousMode ? (
          <div className="flex items-center gap-3.5">
            <span className="flex items-center gap-2 text-muted-foreground text-xs">
              <span className="inline-block size-2 rounded-full bg-green-600" />
              {windowSize} in buffer · window {windowCap}
            </span>
            {canLoadMore && (
              <Button
                isLoading={isLoadingMore}
                onClick={onLoadMore}
                size="sm"
                testId="messages-load-more"
                variant="outline"
              >
                <ChevronDownIcon className="size-4" />
                Load {loadMoreCount} more
              </Button>
            )}
            <div aria-hidden="true" className="h-px w-px" data-testid="messages-load-more-sentinel" ref={sentinelRef} />
          </div>
        ) : (
          <nav className="flex items-center gap-2" data-testid="messages-pagination">
            <Button
              disabled={pageIndex === 0}
              onClick={() => onPageChange(pageIndex - 1)}
              size="sm"
              testId="messages-prev-page"
              variant="ghost"
            >
              <ChevronLeftIcon className="size-4" />
              Previous
            </Button>
            <span className="px-2 text-sm tabular-nums">
              Page {pageIndex + 1} of {pageCount}
            </span>
            <Button
              disabled={pageIndex + 1 >= pageCount}
              onClick={() => onPageChange(pageIndex + 1)}
              size="sm"
              testId="messages-next-page"
              variant="ghost"
            >
              Next
              <ChevronRightIcon className="size-4" />
            </Button>
          </nav>
        )}
      </div>
      {showStats && (bytesConsumed > 0 || elapsedMs !== null) && (
        <div className="flex items-center gap-3.5 text-muted-foreground text-xs" data-testid="messages-stats">
          <span className="flex items-center gap-1.5" title="Total size fetched">
            <DownloadIcon className="size-3.5" />
            {prettyBytes(bytesConsumed)}
          </span>
          {elapsedMs !== null && (
            <span className="flex items-center gap-1.5" title="Fetch latency">
              <ClockIcon className="size-3.5" />
              {Math.round(elapsedMs)}ms
            </span>
          )}
        </div>
      )}
    </div>
  );
};
