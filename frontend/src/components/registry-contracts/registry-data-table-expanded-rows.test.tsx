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

// App-owned guard for a registry contract the registry ships untested.
// TanStack v9 resets uncontrolled `expanded` when `data` is replaced unless
// `autoResetExpanded: false` is set (registry 3.4.1).

import { describe, expect, test } from '@rstest/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from 'components/redpanda-ui/components/data-table';

type Row = { id: string; name: string; detail: string };

const columns = [{ accessorKey: 'name', header: 'Name' }];

const rows = (suffix: string): Row[] => [
  { id: 'a', name: `alpha ${suffix}`, detail: 'alpha detail' },
  { id: 'b', name: `beta ${suffix}`, detail: 'beta detail' },
];

const Table = ({ data }: { data: Row[] }) => (
  <DataTable
    columns={columns}
    data={data}
    expandRowByClick
    pagination={false}
    subComponent={({ row }) => <div>{row.original.detail}</div>}
    tableOptions={{ getRowId: (row) => row.id }}
  />
);

describe('registry DataTable expanded rows', () => {
  test('an expanded row stays open when the data array is replaced', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Table data={rows('v1')} />);

    await user.click(screen.getByText('alpha v1'));
    expect(screen.getByText('alpha detail')).toBeInTheDocument();

    rerender(<Table data={rows('v2')} />);
    await act(async () => {
      // TanStack queues the reset as a microtask; act drains it before asserting.
    });

    expect(screen.getByText('alpha v2')).toBeInTheDocument();
    expect(screen.getByText('alpha detail')).toBeInTheDocument();
  });
});
