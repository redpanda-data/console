/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { MessagesTable, type MessagesTableProps } from './messages-table';
import { DEFAULT_MESSAGE_COLUMNS } from '../../../../../stores/topic-settings-store';

const baseProps: MessagesTableProps = {
  messages: [],
  columnConfig: DEFAULT_MESSAGE_COLUMNS,
  density: 'compact',
  timestampFormat: 'default',
  sorting: [],
  onSortingChange: vi.fn(),
  sortingDisabled: false,
  pagination: { pageIndex: 0, pageSize: 10 },
  onPaginationChange: vi.fn(),
  isLoading: false,
  isLiveWaiting: false,
  hasActiveFilter: false,
  selectedKey: null,
  onRowClick: vi.fn(),
  newKeys: new Set(),
};

describe('MessagesTable — error state', () => {
  test('a set error renders the error state, not the empty state', () => {
    render(<MessagesTable {...baseProps} error="request timed out" />);
    expect(screen.getByTestId('messages-error')).toBeInTheDocument();
    expect(screen.getByText('request timed out')).toBeInTheDocument();
    expect(screen.queryByTestId('messages-empty')).not.toBeInTheDocument();
  });

  test('the error state takes priority over the live-waiting state too', () => {
    render(<MessagesTable {...baseProps} error="stream failed" isLiveWaiting />);
    expect(screen.getByTestId('messages-error')).toBeInTheDocument();
    expect(screen.queryByTestId('messages-live-waiting')).not.toBeInTheDocument();
  });

  test('clicking Retry calls onRetry', async () => {
    const onRetry = vi.fn();
    render(<MessagesTable {...baseProps} error="network error" onRetry={onRetry} />);
    await userEvent.click(screen.getByTestId('messages-error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('no error falls back to the normal empty state (regression guard)', () => {
    render(<MessagesTable {...baseProps} error={null} />);
    expect(screen.queryByTestId('messages-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('messages-empty')).toBeInTheDocument();
  });
});

describe('MessagesTable — column sorting is keyboard-accessible', () => {
  test('a sortable header renders as a focusable button', () => {
    render(<MessagesTable {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Timestamp' })).toBeInTheDocument();
  });

  test('tabbing to the Timestamp header and pressing Enter toggles sorting', async () => {
    const onSortingChange = vi.fn();
    render(<MessagesTable {...baseProps} onSortingChange={onSortingChange} />);
    const header = screen.getByRole('button', { name: 'Timestamp' });
    header.focus();
    expect(header).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onSortingChange).toHaveBeenCalledTimes(1);
  });

  test('a non-sortable column has no button, so it is skipped by tab order', () => {
    render(<MessagesTable {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Key' })).not.toBeInTheDocument();
  });
});
