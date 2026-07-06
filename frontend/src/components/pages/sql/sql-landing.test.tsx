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
import { render, screen } from 'test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { SqlLanding, type SqlLandingProps } from './sql-landing';
import type { Catalog } from './sql-types';

const HISTORY_KEY = 'rp_sql_history_v1';

const catalogs: Catalog[] = [
  {
    name: 'default_redpanda_catalog',
    displayLabel: 'Redpanda Catalog',
    engine: 'redpanda',
    namespaces: [
      {
        id: 'default_redpanda_catalog.public',
        name: 'public',
        tables: [
          {
            id: 'default_redpanda_catalog.public.orders',
            name: 'orders',
            namespaceName: 'public',
            catalogName: 'default_redpanda_catalog',
            topicName: 'orders',
          },
          {
            id: 'default_redpanda_catalog.public.cars',
            name: 'cars',
            namespaceName: 'public',
            catalogName: 'default_redpanda_catalog',
          },
        ],
      },
    ],
  },
];

const ORDERS_SQL = 'SELECT *\nFROM default_redpanda_catalog=>orders\nLIMIT 100;';

const PREVIEW_ORDERS_RE = /Preview orders/;
const OPEN_EDITOR_RE = /Open query editor/;
const ADD_TOPIC_RE = /Add a topic/;
const ASK_ADMIN_RE = /Ask an admin to add a Redpanda topic/;

function renderLanding(overrides: Partial<SqlLandingProps> = {}) {
  const onRunQuery = vi.fn();
  const onOpenEditor = vi.fn();
  const onAddTopic = vi.fn();
  const onRetry = vi.fn();
  render(
    <SqlLanding
      catalogs={catalogs}
      hasTables={true}
      isError={false}
      isLoading={false}
      onAddTopic={onAddTopic}
      onOpenEditor={onOpenEditor}
      onRetry={onRetry}
      onRunQuery={onRunQuery}
      sqlRole="admin"
      {...overrides}
    />
  );
  return { onAddTopic, onOpenEditor, onRetry, onRunQuery };
}

afterEach(() => {
  localStorage.clear();
});

describe('SqlLanding populated overview', () => {
  test('renders the derived metrics and the catalog tables', () => {
    renderLanding();
    expect(screen.getByText('Queryable tables')).toBeInTheDocument();
    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.getByText('cars')).toBeInTheDocument();
    expect(screen.getByText('Redpanda Catalog')).toBeInTheDocument();
  });

  test('a suggested query runs the table preview SQL', async () => {
    const { onRunQuery } = renderLanding();
    await userEvent.click(screen.getByRole('button', { name: PREVIEW_ORDERS_RE }));
    expect(onRunQuery).toHaveBeenCalledWith(ORDERS_SQL);
  });

  test('Open query editor switches to the editor', async () => {
    const { onOpenEditor } = renderLanding();
    await userEvent.click(screen.getByRole('button', { name: OPEN_EDITOR_RE }));
    expect(onOpenEditor).toHaveBeenCalledOnce();
  });

  test('recent queries from history are listed and re-runnable', async () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([{ sql: 'SELECT 1', at: Date.now() }]));
    const { onRunQuery } = renderLanding();
    await userEvent.click(screen.getByText('SELECT 1'));
    expect(onRunQuery).toHaveBeenCalledWith('SELECT 1');
  });
});

describe('SqlLanding loading and error states', () => {
  test('a load in flight shows the loading row, not the empty-state onboarding', () => {
    renderLanding({ isLoading: true, catalogs: [], hasTables: false });
    expect(screen.getByText('Loading catalogs…')).toBeInTheDocument();
    expect(screen.queryByText('No tables yet')).toBeNull();
    expect(screen.queryByText(/Connected/)).toBeNull();
  });

  test('a failed catalog load shows the error state with retry, not the empty state', async () => {
    const { onRetry } = renderLanding({ isError: true, catalogs: [], hasTables: false });
    expect(screen.getByText("Couldn't load the SQL catalog")).toBeInTheDocument();
    expect(screen.queryByText('No tables yet')).toBeNull();
    expect(screen.queryByText(/Connected/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('SqlLanding onboarding (empty catalog)', () => {
  test('admin sees the add-topic CTA', async () => {
    const { onAddTopic } = renderLanding({ hasTables: false, catalogs: [] });
    expect(screen.getByText('Add a topic as a table')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: ADD_TOPIC_RE }));
    expect(onAddTopic).toHaveBeenCalledOnce();
  });

  test('viewer is told to ask an admin and gets no add-topic action', () => {
    renderLanding({ hasTables: false, catalogs: [], sqlRole: 'viewer' });
    expect(screen.getByText(ASK_ADMIN_RE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ADD_TOPIC_RE })).toBeNull();
  });
});
