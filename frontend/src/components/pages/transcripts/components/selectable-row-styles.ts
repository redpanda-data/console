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
export const selectableRowHover = 'hover:bg-slate-50 dark:hover:bg-slate-900/40';

/**
 * Selected state styling using sky colors to complement the existing
 * sky-500 duration bars in the transcripts UI
 */
export const selectableRowSelected = [
  'data-[selected=true]:bg-sky-50',
  'data-[selected=true]:border-sky-200',
  'data-[selected=true]:hover:bg-sky-100',
  'dark:data-[selected=true]:bg-sky-950/30',
  'dark:data-[selected=true]:border-sky-800/60',
  'dark:data-[selected=true]:hover:bg-sky-950/45',
].join(' ');

/** Focus ring for keyboard navigation */
export const selectableRowFocus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 dark:focus-visible:ring-sky-500/40';
