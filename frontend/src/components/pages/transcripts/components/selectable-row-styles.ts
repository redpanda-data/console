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

/**
 * Shared styling constants for selectable table rows in the transcripts UI.
 * These styles provide consistent visual feedback for selection states across
 * both root trace rows and child span rows.
 */

/** Base structural and interactive styles for selectable rows */
export const selectableRowBase =
  'grid w-full cursor-pointer items-center border-b border-border/30 text-left transition-colors';

/** Hover state for unselected rows */
export const selectableRowHover = 'hover:bg-muted/50 dark:hover:bg-muted/30';

/**
 * Selected state styling using selection colors from the design system
 */
export const selectableRowSelected = [
  'data-[selected=true]:bg-selection',
  'data-[selected=true]:border-primary/30',
  'data-[selected=true]:hover:bg-selection/80',
  'dark:data-[selected=true]:bg-primary-subtle',
  'dark:data-[selected=true]:border-primary/40',
  'dark:data-[selected=true]:hover:bg-primary-subtle/80',
].join(' ');

/** Focus ring for keyboard navigation */
export const selectableRowFocus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:focus-visible:ring-primary/50';
