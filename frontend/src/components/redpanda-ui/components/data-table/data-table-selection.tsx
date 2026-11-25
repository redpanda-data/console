// Copyright 2026 Redpanda Data, Inc.

'use client';

import type { RowData } from '@tanstack/react-table';
import { Checkbox } from '../checkbox';
import type { DataTableInstance, DataTableRow } from './data-table-features';

interface SelectionProps<TData extends RowData> {
  table: Omit<DataTableInstance<TData>, 'state'>;
}

/** Native page-selection control, independent of the caller's data-column schema. */
export function DataTablePageSelection<TData extends RowData>({ table }: SelectionProps<TData>) {
  return (
    <table.Subscribe
      selector={() => ({ all: table.getIsAllPageRowsSelected(), some: table.getIsSomePageRowsSelected() })}
      source={table.atoms.rowSelection}
    >
      {({ all, some }) => (
        <Checkbox
          aria-label="Select all"
          checked={all || (some ? 'indeterminate' : false)}
          className="translate-y-0.5"
          onCheckedChange={(value) => {
            table.toggleAllPageRowsSelected(Boolean(value));
          }}
        />
      )}
    </table.Subscribe>
  );
}

/** Ineligible records retain their native cell but do not advertise a selection action. */
export function DataTableRecordSelection<TData extends RowData>({
  table,
  row,
}: SelectionProps<TData> & { row: DataTableRow<TData> }) {
  return row.getCanSelect() ? (
    <table.Subscribe selector={(selection) => Boolean(selection[row.id])} source={table.atoms.rowSelection}>
      {(selected) => (
        <Checkbox
          aria-label="Select row"
          checked={selected}
          className="translate-y-0.5"
          onCheckedChange={(value) => {
            row.toggleSelected(Boolean(value));
          }}
        />
      )}
    </table.Subscribe>
  ) : null;
}
