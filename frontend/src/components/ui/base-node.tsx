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

import { cn } from 'components/redpanda-ui/lib/utils';
import type { ReactNode } from 'react';

type BaseNodeProps = {
  children: ReactNode;
  className?: string;
};

export function BaseNode({ children, className }: BaseNodeProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

type BaseNodeHeaderProps = {
  children: ReactNode;
  className?: string;
};

export function BaseNodeHeader({ children, className }: BaseNodeHeaderProps) {
  return (
    <div className={cn('flex items-center gap-2 border-b border-border px-3 py-2', className)}>
      {children}
    </div>
  );
}

type BaseNodeHeaderTitleProps = {
  children: ReactNode;
  className?: string;
};

export function BaseNodeHeaderTitle({ children, className }: BaseNodeHeaderTitleProps) {
  return <span className={cn('truncate text-xs font-medium', className)}>{children}</span>;
}

type BaseNodeContentProps = {
  children: ReactNode;
  className?: string;
};

export function BaseNodeContent({ children, className }: BaseNodeContentProps) {
  return <div className={cn('px-3 py-2', className)}>{children}</div>;
}

type BaseNodeFooterProps = {
  children: ReactNode;
  className?: string;
};

export function BaseNodeFooter({ children, className }: BaseNodeFooterProps) {
  return (
    <div className={cn('flex items-center gap-2 border-t border-border px-3 py-2', className)}>
      {children}
    </div>
  );
}
