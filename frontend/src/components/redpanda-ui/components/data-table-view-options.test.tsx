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

import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DataTableViewOptions } from './data-table';

type TestRow = { id: number; name: string; status: string };

const columns: ColumnDef<TestRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'status', header: 'Status' },
];

const data: TestRow[] = [
  { id: 1, name: 'Alpha', status: 'active' },
  { id: 2, name: 'Beta', status: 'inactive' },
];

function Harness() {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return <DataTableViewOptions table={table} testId="view-options" />;
}

describe('DataTableViewOptions', () => {
  it('opens dropdown, toggles a column off, and reopens the dropdown', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // 1. Click "View" to open the dropdown
    const viewButton = screen.getByRole('button', { name: /view/i });
    await user.click(viewButton);

    // 2. Verify column checkboxes appear
    await waitFor(() => {
      expect(screen.getByText('Toggle columns')).toBeInTheDocument();
    });

    const nameCheckbox = screen.getByRole('menuitemcheckbox', { name: /name/i });
    const statusCheckbox = screen.getByRole('menuitemcheckbox', { name: /status/i });
    expect(nameCheckbox).toBeInTheDocument();
    expect(statusCheckbox).toBeInTheDocument();

    // Both columns should initially be checked (visible)
    expect(nameCheckbox).toHaveAttribute('data-state', 'checked');
    expect(statusCheckbox).toHaveAttribute('data-state', 'checked');

    // 3. Toggle "name" column off
    await user.click(nameCheckbox);

    // The dropdown closes after clicking a checkbox item; verify the column is now unchecked
    // by reopening the dropdown.

    // 4. Click "View" again - this is the regression scenario.
    //    With the raw primitive trigger, this second click would fail to reopen.
    await user.click(viewButton);

    await waitFor(() => {
      expect(screen.getByText('Toggle columns')).toBeInTheDocument();
    });

    // "name" should now be unchecked, "status" should still be checked
    const nameCheckboxAfter = screen.getByRole('menuitemcheckbox', { name: /name/i });
    const statusCheckboxAfter = screen.getByRole('menuitemcheckbox', { name: /status/i });
    expect(nameCheckboxAfter).toHaveAttribute('data-state', 'unchecked');
    expect(statusCheckboxAfter).toHaveAttribute('data-state', 'checked');
  });
});
