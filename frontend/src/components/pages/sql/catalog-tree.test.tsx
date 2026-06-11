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

import userEvent from '@testing-library/user-event';
import { useDescribeTableQuery, useListTablesQuery, useTopicIcebergQuery } from 'react-query/api/sql';
import { render, screen } from 'test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { CatalogTree } from './catalog-tree';
import type { Catalog, TableRef } from './sql-types';

vi.mock('react-query/api/sql', () => ({
  useListTablesQuery: vi.fn(),
  useDescribeTableQuery: vi.fn(),
  useTopicIcebergQuery: vi.fn(),
}));

const tableRef = (name: string, overrides: Partial<TableRef> = {}): TableRef => ({
  id: `rp.public.${name}`,
  name,
  namespaceName: 'public',
  catalogName: 'rp',
  ...overrides,
});

const catalog = (overrides: Partial<Catalog> = {}): Catalog => ({
  name: 'rp',
  displayLabel: 'Redpanda Catalog',
  engine: 'redpanda',
  namespaces: [{ id: 'rp.public', name: 'public', tables: [tableRef('orders'), tableRef('users')] }],
  ...overrides,
});

const noTables = { data: undefined, isLoading: false };

beforeEach(() => {
  vi.mocked(useListTablesQuery).mockReturnValue(noTables as never);
  vi.mocked(useDescribeTableQuery).mockReturnValue({ data: undefined, isLoading: false } as never);
  vi.mocked(useTopicIcebergQuery).mockReturnValue({ isIceberg: false } as never);
});

describe('CatalogTree', () => {
  test('renders an ARIA tree with catalogs, namespaces and tables expanded by default', () => {
    render(<CatalogTree catalogs={[catalog()]} onQueryTable={vi.fn()} role="viewer" />);

    expect(screen.getByRole('tree', { name: 'Catalogs' })).toBeInTheDocument();
    const items = screen.getAllByRole('treeitem');
    expect(items.map((i) => i.getAttribute('aria-level'))).toEqual(['1', '2', '3', '3']);
    expect(screen.getByRole('treeitem', { name: /Redpanda Catalog/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('treeitem', { name: /orders/ })).toBeInTheDocument();
  });

  test('collapsing a catalog hides its namespaces and tables', async () => {
    render(<CatalogTree catalogs={[catalog()]} onQueryTable={vi.fn()} role="viewer" />);

    await userEvent.click(screen.getByRole('treeitem', { name: /Redpanda Catalog/ }));

    expect(screen.getByRole('treeitem', { name: /Redpanda Catalog/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('treeitem', { name: /public/ })).toBeNull();
    expect(screen.queryByRole('treeitem', { name: /orders/ })).toBeNull();
  });

  test('search filters tables and shows the matched count', async () => {
    render(<CatalogTree catalogs={[catalog()]} onQueryTable={vi.fn()} role="viewer" />);

    await userEvent.type(screen.getByPlaceholderText('Search tables'), 'ord');

    expect(screen.getByRole('treeitem', { name: /orders/ })).toBeInTheDocument();
    expect(screen.queryByRole('treeitem', { name: /users/ })).toBeNull();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  test('clicking the query action calls onQueryTable with the catalog and table', async () => {
    const onQueryTable = vi.fn();
    render(<CatalogTree catalogs={[catalog()]} onQueryTable={onQueryTable} role="viewer" />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Query this table' })[0]);

    expect(onQueryTable).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'rp' }),
      expect.objectContaining({ name: 'orders' })
    );
  });

  test('expanding a table lists its columns with type labels', async () => {
    vi.mocked(useDescribeTableQuery).mockReturnValue({
      data: {
        columns: [
          { name: 'id', type: 'INT8' },
          { name: 'payload', type: 'JSONB' },
          { name: 'tags', type: 'TEXT[]' },
        ],
      },
      isLoading: false,
    } as never);
    render(<CatalogTree catalogs={[catalog()]} onQueryTable={vi.fn()} role="viewer" />);

    await userEvent.click(screen.getByRole('treeitem', { name: /orders/ }));

    expect(screen.getByText('payload')).toBeInTheDocument();
    expect(screen.getByText('jsonb')).toBeInTheDocument();
    expect(screen.getByText('text[]')).toBeInTheDocument();
  });

  test('locked tables are disabled and show no query action', () => {
    const locked = catalog({
      namespaces: [{ id: 'rp.public', name: 'public', tables: [tableRef('secret', { allowed: false })] }],
    });
    render(<CatalogTree catalogs={[locked]} onQueryTable={vi.fn()} role="viewer" />);

    expect(screen.getByRole('treeitem', { name: /secret/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Query this table' })).toBeNull();
  });

  test('admin sees the catalog-level add action; viewer does not', () => {
    const onAddTable = vi.fn();
    const { rerender } = render(
      <CatalogTree catalogs={[catalog()]} onAddTable={onAddTable} onQueryTable={vi.fn()} role="admin" />
    );
    expect(screen.getByRole('button', { name: 'Add a topic to this catalog' })).toBeInTheDocument();

    rerender(<CatalogTree catalogs={[catalog()]} onAddTable={onAddTable} onQueryTable={vi.fn()} role="viewer" />);
    expect(screen.queryByRole('button', { name: 'Add a topic to this catalog' })).toBeNull();
  });

  test('namespaces past the page limit paginate with a load-more row', async () => {
    const tables = Array.from({ length: 25 }, (_, i) => tableRef(`t${String(i).padStart(2, '0')}`));
    const big = catalog({ namespaces: [{ id: 'rp.public', name: 'public', tables }] });
    render(<CatalogTree catalogs={[big]} onQueryTable={vi.fn()} role="viewer" />);

    expect(screen.getAllByRole('treeitem', { name: /t\d\d/ })).toHaveLength(20);
    await userEvent.click(screen.getByRole('button', { name: /Load more · 5 remaining/ }));
    expect(screen.getAllByRole('treeitem', { name: /t\d\d/ })).toHaveLength(25);
  });

  test('arrow keys move focus through visible rows; left collapses', async () => {
    render(<CatalogTree catalogs={[catalog()]} onQueryTable={vi.fn()} role="viewer" />);
    const catalogRow = screen.getByRole('treeitem', { name: /Redpanda Catalog/ });
    const namespaceRow = screen.getByRole('treeitem', { name: /public/ });

    catalogRow.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(namespaceRow).toHaveFocus();

    await userEvent.keyboard('{ArrowUp}');
    expect(catalogRow).toHaveFocus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(catalogRow).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('treeitem', { name: /public/ })).toBeNull();
  });
});
