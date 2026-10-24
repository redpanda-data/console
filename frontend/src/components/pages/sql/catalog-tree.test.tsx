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

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { useDescribeTableQuery, useListTablesQuery, useTopicIcebergQuery } from 'react-query/api/sql';
import { render, screen } from 'test-utils';

import { CatalogTree } from './catalog-tree';
import type { Catalog, TableRef } from './sql-types';

rs.mock('react-query/api/sql', () => ({
  useListTablesQuery: rs.fn(),
  useDescribeTableQuery: rs.fn(),
  useTopicIcebergQuery: rs.fn(),
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
  rs.mocked(useListTablesQuery).mockReturnValue(noTables as never);
  rs.mocked(useDescribeTableQuery).mockReturnValue({ data: undefined, isLoading: false } as never);
  rs.mocked(useTopicIcebergQuery).mockReturnValue({ isIceberg: false } as never);
});

// Renders a viewer tree with the default catalog and returns its catalog and namespace rows.
const renderTreeRows = () => {
  render(<CatalogTree catalogs={[catalog()]} onQueryTable={rs.fn()} sqlRole="viewer" />);
  return {
    catalogRow: screen.getByRole('treeitem', { name: REDPANDA_CATALOG_RE }),
    namespaceRow: screen.getByRole('treeitem', { name: PUBLIC_RE }),
  };
};

// Types arrive lower-cased from the backend; composite columns as "record"
// with their nested fields parsed server-side.
const renderExpandedOrdersColumns = async () => {
  rs.mocked(useDescribeTableQuery).mockReturnValue({
    data: {
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'payload', type: 'jsonb' },
        { name: 'tags', type: 'text[]' },
        { name: 'customer', type: 'record', fields: [{ name: 'street', type: 'text' }] },
      ],
    },
    isLoading: false,
  } as never);
  render(<CatalogTree catalogs={[catalog()]} onQueryTable={rs.fn()} sqlRole="viewer" />);

  await userEvent.click(screen.getByRole('treeitem', { name: ORDERS_RE }));
};

describe('the CatalogTree', () => {
  describe('structure', () => {
    test('renders an ARIA tree with catalogs, namespaces and tables expanded by default', () => {
      render(<CatalogTree catalogs={[catalog()]} onQueryTable={rs.fn()} sqlRole="viewer" />);

      expect(screen.getByRole('tree', { name: 'Catalogs' })).toBeInTheDocument();
      const items = screen.getAllByRole('treeitem');
      expect(items.map((i) => i.getAttribute('aria-level'))).toEqual(['1', '2', '3', '3']);
      expect(screen.getByRole('treeitem', { name: REDPANDA_CATALOG_RE })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('treeitem', { name: ORDERS_RE })).toBeInTheDocument();
    });

    test('collapsing a catalog hides its namespaces and tables', async () => {
      render(<CatalogTree catalogs={[catalog()]} onQueryTable={rs.fn()} sqlRole="viewer" />);

      await userEvent.click(screen.getByRole('treeitem', { name: REDPANDA_CATALOG_RE }));

      expect(screen.getByRole('treeitem', { name: REDPANDA_CATALOG_RE })).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('treeitem', { name: PUBLIC_RE })).toBeNull();
      expect(screen.queryByRole('treeitem', { name: ORDERS_RE })).toBeNull();
    });

    test('search filters tables', async () => {
      render(<CatalogTree catalogs={[catalog()]} onQueryTable={rs.fn()} sqlRole="viewer" />);

      await userEvent.type(screen.getByPlaceholderText('Search tables'), 'ord');

      expect(screen.getByRole('treeitem', { name: ORDERS_RE })).toBeInTheDocument();
      expect(screen.queryByRole('treeitem', { name: USERS_RE })).toBeNull();
    });

    test('clicking the query action calls onQueryTable with the catalog and table', async () => {
      const onQueryTable = rs.fn();
      render(<CatalogTree catalogs={[catalog()]} onQueryTable={onQueryTable} sqlRole="viewer" />);

      await userEvent.click(screen.getAllByRole('button', { name: 'Query this table' })[0]);

      expect(onQueryTable).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'rp' }),
        expect.objectContaining({ name: 'orders' })
      );
    });
  });

  describe('columns', () => {
    test('expanding a table lists its columns with type labels', async () => {
      await renderExpandedOrdersColumns();

      expect(screen.getByText('payload')).toBeInTheDocument();
      expect(screen.getByText('jsonb')).toBeInTheDocument();
      expect(screen.getByText('text[]')).toBeInTheDocument();
    });

    test('a composite column expands into its nested fields', async () => {
      await renderExpandedOrdersColumns();

      // Composite column shows "record" and expands into its nested fields.
      const customerRow = screen.getByRole('button', { name: CUSTOMER_RE });
      expect(customerRow).toBeInTheDocument();
      expect(screen.queryByText('street')).not.toBeInTheDocument();
      await userEvent.click(customerRow);
      expect(screen.getByText('street')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    test('locked tables are disabled and show no query action', () => {
      const locked = catalog({
        namespaces: [{ id: 'rp.public', name: 'public', tables: [tableRef('secret', { allowed: false })] }],
      });
      render(<CatalogTree catalogs={[locked]} onQueryTable={rs.fn()} sqlRole="viewer" />);

      expect(screen.getByRole('treeitem', { name: SECRET_RE })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Query this table' })).toBeNull();
    });

    test('admin sees the catalog-level add action; viewer does not', () => {
      const onAddTable = rs.fn();
      const { rerender } = render(
        <CatalogTree catalogs={[catalog()]} onAddTable={onAddTable} onQueryTable={rs.fn()} sqlRole="admin" />
      );
      expect(screen.getByRole('button', { name: 'Add a topic to this catalog' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add a topic' })).toBeInTheDocument();

      rerender(<CatalogTree catalogs={[catalog()]} onAddTable={onAddTable} onQueryTable={rs.fn()} sqlRole="viewer" />);
      expect(screen.queryByRole('button', { name: 'Add a topic to this catalog' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Add a topic' })).toBeNull();
    });

    test('namespaces past the page limit paginate with a load-more row', async () => {
      const tables = Array.from({ length: 25 }, (_, i) => tableRef(`t${String(i).padStart(2, '0')}`));
      const big = catalog({ namespaces: [{ id: 'rp.public', name: 'public', tables }] });
      render(<CatalogTree catalogs={[big]} onQueryTable={rs.fn()} sqlRole="viewer" />);

      expect(screen.getAllByRole('treeitem', { name: PAGED_TABLE_RE })).toHaveLength(20);
      await userEvent.click(screen.getByRole('button', { name: LOAD_MORE_RE }));
      expect(screen.getAllByRole('treeitem', { name: PAGED_TABLE_RE })).toHaveLength(25);
    });

    test('arrow keys move focus through visible rows; left collapses', async () => {
      const { catalogRow, namespaceRow } = renderTreeRows();

      catalogRow.focus();
      await userEvent.keyboard('{ArrowDown}');
      expect(namespaceRow).toHaveFocus();

      await userEvent.keyboard('{ArrowUp}');
      expect(catalogRow).toHaveFocus();

      await userEvent.keyboard('{ArrowLeft}');
      expect(catalogRow).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('treeitem', { name: PUBLIC_RE })).toBeNull();
    });

    test('refresh button calls onRefresh', async () => {
      const onRefresh = rs.fn();
      render(<CatalogTree catalogs={[catalog()]} onQueryTable={rs.fn()} onRefresh={onRefresh} sqlRole="viewer" />);
      await userEvent.click(screen.getByRole('button', { name: 'Refresh catalogs' }));
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    test('refresh button is disabled while refreshing and hidden without onRefresh', () => {
      const { unmount } = render(
        <CatalogTree catalogs={[catalog()]} isRefreshing onQueryTable={rs.fn()} onRefresh={rs.fn()} sqlRole="viewer" />
      );
      expect(screen.getByRole('button', { name: 'Refresh catalogs' })).toBeDisabled();
      unmount();

      render(<CatalogTree catalogs={[catalog()]} onQueryTable={rs.fn()} sqlRole="viewer" />);
      expect(screen.queryByRole('button', { name: 'Refresh catalogs' })).toBeNull();
    });
  });
});
