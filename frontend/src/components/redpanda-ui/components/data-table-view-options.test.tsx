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

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import {
  DataTableToolbar,
  DataTableViewOptions,
  type Task,
  dataTableColumns,
  dataTableMockData,
} from './data-table';

/**
 * Regression tests for DataTable search, faceted filter, and view options.
 *
 * These components broke when React Compiler memoized stale closure values
 * in data-table.tsx and data-table-filter.tsx. The fix was switching the compiler
 * to opt-in mode (compilationMode: 'annotation') and replacing
 * DropdownMenuPrimitive.Trigger with DropdownMenuTrigger.
 */

// ── Harness: full toolbar with a table ──────────────────────────────────

function ToolbarHarness() {
  const table = useReactTable<Task>({
    data: dataTableMockData,
    columns: dataTableColumns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  return (
    <div>
      <DataTableToolbar table={table} testId="toolbar" />
      <table data-testid="task-table">
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Harness: standalone view options ────────────────────────────────────

type SimpleRow = { id: number; name: string; status: string };

const simpleColumns: ColumnDef<SimpleRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'status', header: 'Status' },
];

const simpleData: SimpleRow[] = [
  { id: 1, name: 'Alpha', status: 'active' },
  { id: 2, name: 'Beta', status: 'inactive' },
];

function ViewOptionsHarness() {
  const table = useReactTable({
    data: simpleData,
    columns: simpleColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return <DataTableViewOptions table={table} testId="view-options" />;
}

// ── jsdom shims ─────────────────────────────────────────────────────────

// cmdk calls scrollIntoView which jsdom doesn't implement
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('DataTableToolbar – search input', () => {
  it('accepts keystrokes and updates the filter value', async () => {
    const user = userEvent.setup();
    render(<ToolbarHarness />);

    const searchInput = screen.getByPlaceholderText('Filter tasks...');

    await user.type(searchInput, 'compress');
    expect(searchInput).toHaveValue('compress');
  });

  it('filters table rows when typing', async () => {
    const user = userEvent.setup();
    render(<ToolbarHarness />);

    const table = screen.getByTestId('task-table');
    const initialRows = within(table).getAllByRole('row');
    expect(initialRows.length).toBe(dataTableMockData.length);

    const searchInput = screen.getByPlaceholderText('Filter tasks...');
    // Only TASK-8782 has "compress" in its title
    await user.type(searchInput, 'compress');

    await waitFor(() => {
      const filteredRows = within(table).getAllByRole('row');
      expect(filteredRows.length).toBe(1);
    });
  });

  it('clears the filter when text is removed', async () => {
    const user = userEvent.setup();
    render(<ToolbarHarness />);

    const searchInput = screen.getByPlaceholderText('Filter tasks...');
    const table = screen.getByTestId('task-table');

    await user.type(searchInput, 'compress');
    await waitFor(() => {
      expect(within(table).getAllByRole('row').length).toBe(1);
    });

    await user.clear(searchInput);
    await waitFor(() => {
      expect(within(table).getAllByRole('row').length).toBe(dataTableMockData.length);
    });
  });
});

describe('DataTableToolbar – faceted filter', () => {
  it('renders Status and Priority filter buttons', () => {
    render(<ToolbarHarness />);

    expect(screen.getByRole('button', { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /priority/i })).toBeInTheDocument();
  });
});

describe('DataTableViewOptions', () => {
  it('opens dropdown, toggles a column off, and reopens the dropdown', async () => {
    const user = userEvent.setup();
    render(<ViewOptionsHarness />);

    const viewButton = screen.getByRole('button', { name: /view/i });
    await user.click(viewButton);

    await waitFor(() => {
      expect(screen.getByText('Toggle columns')).toBeInTheDocument();
    });

    const nameCheckbox = screen.getByRole('menuitemcheckbox', { name: /name/i });
    expect(nameCheckbox).toHaveAttribute('data-state', 'checked');

    // Toggle "name" column off
    await user.click(nameCheckbox);

    // Reopen — this was the regression: second click failed with raw primitive trigger
    await user.click(viewButton);

    await waitFor(() => {
      expect(screen.getByText('Toggle columns')).toBeInTheDocument();
    });

    expect(screen.getByRole('menuitemcheckbox', { name: /name/i })).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByRole('menuitemcheckbox', { name: /status/i })).toHaveAttribute('data-state', 'checked');
  });
});
