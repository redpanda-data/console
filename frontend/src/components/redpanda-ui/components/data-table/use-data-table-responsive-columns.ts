// Copyright 2026 Redpanda Data, Inc.

'use client';

import type { RowData } from '@tanstack/react-table';
import { type RefObject, useRef } from 'react';

import { useLayoutEffect } from '../../lib/use-layout-effect';

import type { DataTableInstance } from './data-table-features';

export type DataTableResponsiveColumnRule = Readonly<{
  /** TanStack column ID or accessor key. */
  columnId: string;
  /** Hide the column while the measured container is narrower than this width. */
  hideBelowPx: number;
}>;

function applyResponsiveColumnVisibility<TData extends RowData>(
  table: DataTableInstance<TData, unknown>,
  rules: readonly DataTableResponsiveColumnRule[],
  width: number
) {
  if (width <= 0) {
    return;
  }
  table.setColumnVisibility((current) => {
    let changed = false;
    const next = { ...current };
    for (const { columnId, hideBelowPx } of rules) {
      if (!table.getColumn(columnId)) {
        continue;
      }
      const visible = width >= hideBelowPx;
      if ((current[columnId] ?? true) !== visible) {
        next[columnId] = visible;
        changed = true;
      }
    }
    return changed ? next : current;
  });
}

/**
 * Lets listed columns follow container-width breakpoints rather than viewport media queries.
 * Responsive rules own visibility for the columns they list.
 */
export function useDataTableResponsiveColumns<TData extends RowData>(
  table: DataTableInstance<TData, unknown>,
  containerRef: RefObject<HTMLElement | null>,
  rules: readonly DataTableResponsiveColumnRule[]
): void {
  const tableRef = useRef(table);
  const rulesRef = useRef(rules);
  const rulesKey = JSON.stringify(rules);

  useLayoutEffect(
    function updateResponsiveColumnInputs() {
      tableRef.current = table;
      rulesRef.current = rules;
    },
    [rules, table]
  );

  useLayoutEffect(
    function observeDataTableWidth() {
      const container = containerRef.current;
      if (!container || rulesRef.current.length === 0) {
        return;
      }

      applyResponsiveColumnVisibility(
        tableRef.current,
        rulesRef.current,
        Math.round(container.getBoundingClientRect().width)
      );
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver((entries) => {
        const width = Math.round(entries[0]?.contentRect.width ?? container.getBoundingClientRect().width);
        applyResponsiveColumnVisibility(tableRef.current, rulesRef.current, width);
      });
      observer.observe(container);
      return () => observer.disconnect();
    },
    [containerRef, rulesKey]
  );
}
