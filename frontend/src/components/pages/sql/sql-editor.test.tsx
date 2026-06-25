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

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { SqlEditor } from './sql-editor';

// CodeMirror's layout/measure loop doesn't run in jsdom; the editor surface is
// exercised manually/e2e.
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value }: { value: string }) => <div data-testid="editor">{value}</div>,
}));

const QUERY_1_TAB = /Query 1/;
const QUERY_2_TAB = /Query 2/;
// Matches the Run button's accessible name including its platform Kbd hint.
const RUN_BUTTON = /Run (Ctrl|⌘)/;

const renderEditor = (onRun = vi.fn()) => {
  render(<SqlEditor catalogs={[]} initialQuery="SELECT 1;" onRun={onRun} />);
  return onRun;
};

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('SqlEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('renders the first query tab as the active tab', () => {
    renderEditor();
    expect(screen.getByRole('tab', { name: QUERY_1_TAB })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('editor')).toHaveTextContent('SELECT 1;');
  });

  test('adds a tab and switches back to the first', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'New query' }));
    expect(screen.getByRole('tab', { name: QUERY_2_TAB })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('editor')).toHaveTextContent('');

    fireEvent.click(screen.getByRole('tab', { name: QUERY_1_TAB }));
    expect(screen.getByTestId('editor')).toHaveTextContent('SELECT 1;');
  });

  test('closing a tab keeps the editor on a remaining tab', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'New query' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Query 2' }));
    expect(screen.queryByRole('tab', { name: QUERY_2_TAB })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: QUERY_1_TAB })).toHaveAttribute('aria-selected', 'true');
  });

  test('clicking the close button does not activate the closed tab', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'New query' }));
    fireEvent.click(screen.getByRole('tab', { name: QUERY_1_TAB }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Query 2' }));
    expect(screen.getByRole('tab', { name: QUERY_1_TAB })).toHaveAttribute('aria-selected', 'true');
  });

  test('run sends the active tab SQL and records history', async () => {
    const onRun = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: RUN_BUTTON }));
    expect(onRun).toHaveBeenCalledWith('SELECT 1;');

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('SELECT 1;', { selector: 'span' })).toBeInTheDocument();
  });

  test('history popover shows an empty state before any run', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('No queries yet')).toBeInTheDocument();
  });
});
