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

import { describe, expect, rs, test } from '@rstest/core';
import { fireEvent, render, screen } from '@testing-library/react';

import { SqlEditor } from './sql-editor';

// CodeMirror's layout/measure loop doesn't run in Happy DOM; the editor surface is
// exercised manually/e2e.
rs.mock('@uiw/react-codemirror', () => ({
  default: ({ value }: { value: string }) => <div data-testid="editor">{value}</div>,
}));

const QUERY_1_TAB = /Query 1/u;
const QUERY_2_TAB = /Query 2/u;
const RUN_BUTTON = /Run (?:Ctrl|⌘)/u;

const renderEditor = () => {
  const onRun = rs.fn();
  const editor = render(<SqlEditor catalogs={[]} initialQuery="SELECT 1;" onRun={onRun} />);
  return { ...editor, onRun };
};

describe('the SqlEditor', () => {
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

  test('run sends active SQL and history survives a remount', async () => {
    const { onRun, unmount } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: RUN_BUTTON }));
    expect(onRun).toHaveBeenCalledWith('SELECT 1;');
    unmount();

    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('SELECT 1;', { selector: 'span' })).toBeInTheDocument();
  });

  test('history popover shows an empty state before any run', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('No queries yet')).toBeInTheDocument();
  });
});
