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

import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { expect, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { describeTable, listTables } from 'protogen/redpanda/api/dataplane/v1alpha3/sql-SQLService_connectquery';
import { useState } from 'react';
import { render, screen } from 'test-utils';

import { CatalogTree, type CatalogTreeProps } from './catalog-tree';
import type { Catalog, TableRef } from './sql-types';

const tableRef = (name: string, overrides: Partial<TableRef> = {}) => ({
  id: `rp.public.${name}`,
  name,
  namespaceName: 'public',
  catalogName: 'rp',
  ...overrides,
});

function catalogWith(tables: TableRef[]) {
  return {
    name: 'rp',
    displayLabel: 'Redpanda Catalog',
    engine: 'redpanda',
    namespaces: [{ id: 'rp.public', name: 'public', tables }],
  } satisfies Catalog;
}

const CATALOGS = [catalogWith([tableRef('orders'), tableRef('users')])];
const REDPANDA_CATALOG_RE = /Redpanda Catalog/u;
const ORDERS_RE = /orders/u;
const PUBLIC_RE = /public/u;
const USERS_RE = /users/u;
const CUSTOMER_RE = /customer/u;
const SECRET_RE = /secret/u;
const PAGED_TABLE_RE = /t\d\d/u;
const LOAD_MORE_RE = /Load more · 5 remaining/u;
const ADD = 'Add a topic to this catalog';
const REFRESH = 'Refresh catalogs';

const transport = createRouterTransport(({ rpc }) => {
  rpc(listTables, () => ({ tables: [] }));
  rpc(describeTable, ({ catalog, name }) => {
    if (catalog !== 'rp' || name !== 'orders') {
      throw new ConnectError('table not found', Code.NotFound);
    }
    return {
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'payload', type: 'jsonb' },
        { name: 'tags', type: 'text[]' },
        { name: 'customer', type: 'record', fields: [{ name: 'street', type: 'text' }] },
      ],
    };
  });
});

type HostProps = {
  catalogs?: Catalog[];
  sqlRole?: CatalogTreeProps['sqlRole'];
  canAdd?: boolean;
  canRefresh?: boolean;
};

function CatalogHost({ catalogs = CATALOGS, sqlRole = 'viewer', canAdd = false, canRefresh = false }: HostProps) {
  const [target, setTarget] = useState('');
  const [adding, setAdding] = useState(false);
  const [refreshRequests, setRefreshRequests] = useState(0);
  return (
    <>
      <CatalogTree
        catalogs={catalogs}
        isRefreshing={refreshRequests > 0}
        onAddTable={canAdd ? () => setAdding(true) : undefined}
        onQueryTable={(catalog, table) => setTarget(`${catalog.name}.${table.name}`)}
        onRefresh={canRefresh ? () => setRefreshRequests((count) => count + 1) : undefined}
        sqlRole={sqlRole}
      />
      <output aria-label="Query target">{target}</output>
      <output aria-label="Refresh requests">{refreshRequests}</output>
      {adding ? <p>Topic creation requested</p> : null}
    </>
  );
}

const renderTree = (props: HostProps = {}) => render(<CatalogHost {...props} />, { transport });

function renderFocusedTree() {
  renderTree();
  const catalogRow = screen.getByRole('treeitem', { name: REDPANDA_CATALOG_RE });
  catalogRow.focus();
  return { catalogRow, namespaceRow: screen.getByRole('treeitem', { name: PUBLIC_RE }) };
}

test('starts with an expanded accessible tree and hides the descendants when collapsed', async () => {
  renderTree();
  const catalogRow = screen.getByRole('treeitem', { name: REDPANDA_CATALOG_RE });
  expect(screen.getByRole('tree', { name: 'Catalogs' })).toBeInTheDocument();
  expect(screen.getAllByRole('treeitem').map((row) => row.getAttribute('aria-level'))).toEqual(['1', '2', '3', '3']);
  expect(catalogRow).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('treeitem', { name: ORDERS_RE })).toBeVisible();

  await userEvent.click(catalogRow);
  expect(catalogRow).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('treeitem', { name: PUBLIC_RE })).not.toBeInTheDocument();
  expect(screen.queryByRole('treeitem', { name: ORDERS_RE })).not.toBeInTheDocument();
});

test('search filters tables', async () => {
  renderTree();
  await userEvent.type(screen.getByPlaceholderText('Search tables'), 'ord');

  expect(screen.getByRole('treeitem', { name: ORDERS_RE })).toBeInTheDocument();
  expect(screen.queryByRole('treeitem', { name: USERS_RE })).not.toBeInTheDocument();
});

test('the query action sends the selected catalog and table to the host', async () => {
  renderTree();
  await userEvent.click(screen.getAllByRole('button', { name: 'Query this table' })[0]);

  expect(screen.getByRole('status', { name: 'Query target' })).toHaveTextContent('rp.orders');
});

test('renders described column types and expands a nested field on demand', async () => {
  renderTree();
  await userEvent.click(screen.getByRole('treeitem', { name: ORDERS_RE }));

  expect(await screen.findByText('payload')).toBeInTheDocument();
  expect(screen.getByText('jsonb')).toBeInTheDocument();
  expect(screen.getByText('text[]')).toBeInTheDocument();
  expect(screen.queryByText('street')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: CUSTOMER_RE }));
  expect(screen.getByText('street')).toBeVisible();
});

test('locked tables are disabled and show no query action', () => {
  renderTree({ catalogs: [catalogWith([tableRef('secret', { allowed: false })])] });

  expect(screen.getByRole('treeitem', { name: SECRET_RE })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Query this table' })).not.toBeInTheDocument();
});

test('only admins can start adding a topic from the catalog', async () => {
  const { rerender } = renderTree({ canAdd: true, sqlRole: 'admin' });
  expect(screen.getByRole('button', { name: 'Add a topic' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: ADD }));
  expect(screen.getByText('Topic creation requested')).toBeVisible();

  rerender(<CatalogHost canAdd sqlRole="viewer" />);
  expect(screen.queryByRole('button', { name: ADD })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add a topic' })).not.toBeInTheDocument();
});

test('namespaces past the page limit paginate with a load-more row', async () => {
  const tables = Array.from({ length: 25 }, (_, i) => tableRef(`t${String(i).padStart(2, '0')}`));
  renderTree({ catalogs: [catalogWith(tables)] });

  expect(screen.getAllByRole('treeitem', { name: PAGED_TABLE_RE })).toHaveLength(20);
  await userEvent.click(screen.getByRole('button', { name: LOAD_MORE_RE }));
  expect(screen.getAllByRole('treeitem', { name: PAGED_TABLE_RE })).toHaveLength(25);
});

test('arrow keys move focus through visible rows; left collapses', async () => {
  const { catalogRow, namespaceRow } = renderFocusedTree();

  await userEvent.keyboard('{ArrowDown}');
  expect(namespaceRow).toHaveFocus();
  await userEvent.keyboard('{ArrowUp}');
  expect(catalogRow).toHaveFocus();
  await userEvent.keyboard('{ArrowLeft}');
  expect(catalogRow).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('treeitem', { name: PUBLIC_RE })).not.toBeInTheDocument();
});

test('asks the host to refresh once and hides the action if the host cannot refresh', async () => {
  const { rerender } = renderTree({ canRefresh: true });
  const refresh = screen.getByRole('button', { name: REFRESH });
  expect(refresh).toBeEnabled();

  await userEvent.click(refresh);
  expect(refresh).toBeDisabled();
  expect(screen.getByRole('status', { name: 'Refresh requests' })).toHaveTextContent('1');
  rerender(<CatalogHost />);
  expect(screen.queryByRole('button', { name: REFRESH })).not.toBeInTheDocument();
});
