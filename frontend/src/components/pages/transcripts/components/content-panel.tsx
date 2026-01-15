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

import { cn } from 'components/redpanda-ui/lib/utils';
import type { FC, ReactNode } from 'react';

type ContentPanelProps = {
  children: ReactNode;
  /** Padding size: 'sm' = p-2, 'md' = p-3 */
  padding?: 'sm' | 'md';
  /** Add internal spacing between children */
  spacing?: boolean;
  /** Additional CSS classes */
  className?: string;
};

/**
 * Reusable content panel for displaying information in trace detail tabs.
 * Provides consistent styling for bordered panels with background.
 */
export const ContentPanel: FC<ContentPanelProps> = ({ children, padding = 'sm', spacing = false, className }) => (
  <div
    className={cn('rounded border bg-muted/30', padding === 'sm' ? 'p-2' : 'p-3', spacing && 'space-y-2', className)}
  >
    {children}
  </div>
);
