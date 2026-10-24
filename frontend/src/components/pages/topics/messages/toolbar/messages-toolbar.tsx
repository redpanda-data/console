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

import { ElementTooltip } from 'components/misc/element-tooltip';
import { Button } from 'components/redpanda-ui/components/button';
import { RefreshCwIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { ReadScopePopover, type ReadScopePopoverProps } from './read-scope-popover';
import { TonedIcon } from '../../../shared/toned-icon';

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

const refreshLabel = (isLive: boolean) => (isLive ? 'Streaming live…' : 'Reload records');

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
    {/* icon-lg matches the filter bar's min-h-10; the svg override keeps the glyph at the
        16px the toolbar's other icons use rather than icon-lg's 24px default. */}
    <ElementTooltip content={refreshLabel(isLive)}>
      <Button
        aria-label={refreshLabel(isLive)}
        className="shrink-0 [&_svg]:size-4"
        onClick={onRefresh}
        size="icon-lg"
        testId="messages-refresh"
        variant="outline"
      >
        <TonedIcon icon={RefreshCwIcon} spin={isRefreshing || isLive} />
      </Button>
    </ElementTooltip>
  </div>
);
