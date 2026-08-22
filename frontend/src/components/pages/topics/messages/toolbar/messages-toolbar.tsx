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
import { cn } from 'components/redpanda-ui/lib/utils';
import { RefreshCwIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { ReadScopePopover, type ReadScopePopoverProps } from './read-scope-popover';

export type MessagesToolbarProps = {
  scopeProps: ReadScopePopoverProps;
  /** The filter bar (or interim quick-search input) rendered between scope and actions. */
  filterSlot: ReactNode;
  /** Extra toolbar actions rendered before refresh. */
  actionsSlot?: ReactNode;
  isRefreshing: boolean;
  /** Live tail keeps the stream open — refresh is a no-op and just keeps spinning. */
  isLive: boolean;
  onRefresh: () => void;
};

export const MessagesToolbar = ({
  scopeProps,
  filterSlot,
  actionsSlot,
  isRefreshing,
  isLive,
  onRefresh,
}: MessagesToolbarProps) => (
  <div className="flex items-center gap-2.5">
    <ReadScopePopover {...scopeProps} />
    <div className="min-w-0 flex-1">{filterSlot}</div>
    {actionsSlot}
    <Button
      className="size-10 shrink-0 [&_svg]:size-4"
      onClick={onRefresh}
      size="icon"
      testId="messages-refresh"
      title={isLive ? 'Streaming live…' : 'Reload records'}
      variant="outline"
    >
      <RefreshCwIcon className={cn('size-4', (isRefreshing || isLive) && 'animate-spin')} />
    </Button>
  </div>
);
