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

import { RefreshIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { cn } from 'components/redpanda-ui/lib/utils';

type RefreshButtonProps = {
  onClick: () => void;
  /** Spins the icon and (by default) disables the button while refreshing. */
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  testId?: string;
};

/** Shared refresh button; icon spins while `loading`. */
export function RefreshButton({ onClick, loading = false, disabled, label = 'Refresh', testId }: RefreshButtonProps) {
  return (
    <Button
      aria-label={label}
      data-testid={testId}
      disabled={disabled ?? loading}
      onClick={onClick}
      size="icon"
      variant="ghost"
    >
      <RefreshIcon className={cn('size-4', loading && 'animate-spin')} />
    </Button>
  );
}
