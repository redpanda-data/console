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
const REDPANDA_CATALOG_RE = /Redpanda Catalog/;
const ORDERS_RE = /orders/;
const PUBLIC_RE = /public/;
const USERS_RE = /users/;
const CUSTOMER_RE = /customer/;
const SECRET_RE = /secret/;
const PAGED_TABLE_RE = /t\d\d/;
const LOAD_MORE_RE = /Load more · 5 remaining/;

beforeEach(() => {
  vi.mocked(useListTablesQuery).mockReturnValue(noTables as never);
  vi.mocked(useDescribeTableQuery).mockReturnValue({ data: undefined, isLoading: false } as never);
  vi.mocked(useTopicIcebergQuery).mockReturnValue({ isIceberg: false } as never);
});

describe('CatalogTree', () => {
  test('renders an ARIA tree with catalogs, namespaces and tables expanded by default', () => {
    render(<CatalogTree catalogs={[catalog()]} onQueryTable={vi.fn()} sqlRole="viewer" />);

    expect(screen.getByRole('tree', { name: 'Catalogs' })).toBeInTheDocument();
    const items = screen.getAllByRole('treeitem');
    expect(items.map((i) => i.getAttribute('aria-level'))).toEqual(['1', '2', '3', '3']);
    expect(screen.getByRole('treeitem', { name: REDPANDA_CATALOG_RE })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('treeitem', { name: ORDERS_RE })).toBeInTheDocument();
  });

  test('collapsing a catalog hides its namespaces and tables', async () => {
    render(<CatalogTree catalogs={[catalog()]} onQueryTable={vi.fn()} sqlRole="viewer" />);

    await userEvent.click(screen.getByRole('treeitem', { name: REDPANDA_CATALOG_RE }));

    expect(screen.getByRole('treeitem', { name: REDPANDA_CATALOG_RE })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('treeitem', { name: PUBLIC_RE })).toBeNull();
    expect(screen.queryByRole('treeitem', { name: ORDERS_RE })).toBeNull();
  });

  test('search filters tables', async () => {
    render(<CatalogTree catalogs={[catalog()]} onQueryTable={vi.fn()} sqlRole="viewer" />);

    await userEvent.type(screen.getByPlaceholderText('Search tables'), 'ord');

    expect(screen.getByRole('treeitem', { name: ORDERS_RE })).toBeInTheDocument();
    expect(screen.queryByRole('treeitem', { name: USERS_RE })).toBeNull();
  });

  test('clicking the query action calls onQueryTable with the catalog and table', async () => {
    const onQueryTable = vi.fn();
    render(<CatalogTree catalogs={[catalog()]} onQueryTable={onQueryTable} sqlRole="viewer" />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Query this table' })[0]);

    expect(onQueryTable).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'rp' }),
      expect.objectContaining({ name: 'orders' })
    );
  });

  test('expanding a table lists its columns with type labels', async () => {
    // Types arrive lower-cased from the backend; composite columns as "json"
    // with their nested fields parsed server-side.
    vi.mocked(useDescribeTableQuery).mockReturnValue({
      data: {
        columns: [
          { name: 'id', type: 'bigint' },
          { name: 'payload', type: 'jsonb' },
          { name: 'tags', type: 'text[]' },
          { name: 'customer', type: 'json', fields: [{ name: 'street', type: 'text' }] },
        ],
      },
      isLoading: false,
    } as never);
    render(<CatalogTree catalogs={[catalog()]} onQueryTable={vi.fn()} sqlRole="viewer" />);

    await userEvent.click(screen.getByRole('treeitem', { name: ORDERS_RE }));

    expect(screen.getByText('payload')).toBeInTheDocument();
    expect(screen.getByText('jsonb')).toBeInTheDocument();
    expect(screen.getByText('text[]')).toBeInTheDocument();

    // Composite column shows "json" and expands into its nested fields.
    const customerRow = screen.getByRole('button', { name: CUSTOMER_RE });
    expect(customerRow).toBeInTheDocument();
    expect(screen.queryByText('street')).not.toBeInTheDocument();
    await userEvent.click(customerRow);
    expect(screen.getByText('street')).toBeInTheDocument();
  });

  test('locked tables are disabled and show no query action', () => {
    const locked = catalog({
      namespaces: [{ id: 'rp.public', name: 'public', tables: [tableRef('secret', { allowed: false })] }],
    });
    render(<CatalogTree catalogs={[locked]} onQueryTable={vi.fn()} sqlRole="viewer" />);

    expect(screen.getByRole('treeitem', { name: SECRET_RE })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Query this table' })).toBeNull();
  });

  test('admin sees the catalog-level add action; viewer does not', () => {
    const onAddTable = vi.fn();
    const { rerender } = render(
      <CatalogTree catalogs={[catalog()]} onAddTable={onAddTable} onQueryTable={vi.fn()} sqlRole="admin" />
    );
    expect(screen.getByRole('button', { name: 'Add a topic to this catalog' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a topic' })).toBeInTheDocument();

    rerender(<CatalogTree catalogs={[catalog()]} onAddTable={onAddTable} onQueryTable={vi.fn()} sqlRole="viewer" />);
    expect(screen.queryByRole('button', { name: 'Add a topic to this catalog' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a topic' })).toBeNull();
  });

  test('namespaces past the page limit paginate with a load-more row', async () => {
    const tables = Array.from({ length: 25 }, (_, i) => tableRef(`t${String(i).padStart(2, '0')}`));
    const big = catalog({ namespaces: [{ id: 'rp.public', name: 'public', tables }] });
    render(<CatalogTree catalogs={[big]} onQueryTable={vi.fn()} sqlRole="viewer" />);

    expect(screen.getAllByRole('treeitem', { name: PAGED_TABLE_RE })).toHaveLength(20);
    await userEvent.click(screen.getByRole('button', { name: LOAD_MORE_RE }));
    expect(screen.getAllByRole('treeitem', { name: PAGED_TABLE_RE })).toHaveLength(25);
  });

  test('arrow keys move focus through visible rows; left collapses', async () => {
    render(<CatalogTree catalogs={[catalog()]} onQueryTable={vi.fn()} sqlRole="viewer" />);
    const catalogRow = screen.getByRole('treeitem', { name: REDPANDA_CATALOG_RE });
    const namespaceRow = screen.getByRole('treeitem', { name: PUBLIC_RE });

    catalogRow.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(namespaceRow).toHaveFocus();

    await userEvent.keyboard('{ArrowUp}');
    expect(catalogRow).toHaveFocus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(catalogRow).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('treeitem', { name: PUBLIC_RE })).toBeNull();
  });
});
