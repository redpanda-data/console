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

import { describe, expect, test } from '@rstest/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from 'components/redpanda-ui/components/data-table';

type Row = { id: string; name: string; detail: string };

const columns = [{ accessorKey: 'name', header: 'Name' }];

const rows = (suffix: string) => [
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
    await act(async () => {});

    expect(screen.getByText('alpha v2')).toBeInTheDocument();
    expect(screen.getByText('alpha detail')).toBeInTheDocument();
  });
});
