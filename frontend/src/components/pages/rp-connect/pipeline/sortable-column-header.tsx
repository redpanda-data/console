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

import type { Column } from '@tanstack/react-table';
import { Button } from 'components/redpanda-ui/components/button';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

/**
 * Sort-only column header: one click cycles ascending → descending → default
 * order. Unlike the registry DataTableColumnHeader there is no dropdown and no
 * "Hide" item — pages without a column-visibility control have no way to bring
 * a hidden column back. Candidate for upstreaming into the registry.
 */
export function SortableColumnHeader<TData, TValue>({
  column,
  title,
}: {
  column: Column<TData, TValue>;
  title: string;
}) {
  if (!column.getCanSort()) {
    return <div>{title}</div>;
  }

  const sorted = column.getIsSorted();
  let sortIcon = <ChevronsUpDown />;
  if (sorted === 'asc') {
    sortIcon = <ArrowUp />;
  } else if (sorted === 'desc') {
    sortIcon = <ArrowDown />;
  }

  return (
    <Button className="-ml-3 h-8" onClick={column.getToggleSortingHandler()} size="sm" variant="secondary-ghost">
      <span>{title}</span>
      {sortIcon}
    </Button>
  );
}
