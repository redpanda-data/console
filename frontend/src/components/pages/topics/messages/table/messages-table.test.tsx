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

import { describe, expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MessagesTable, type MessagesTableProps } from './messages-table';
import { CompressionType, type TopicMessage } from '../../../../../state/rest-interfaces';
import { DEFAULT_MESSAGE_COLUMNS } from '../../../../../stores/topic-settings-store';

const baseProps: MessagesTableProps = {
  messages: [],
  columnConfig: DEFAULT_MESSAGE_COLUMNS,
  density: 'compact',
  timestampFormat: 'default',
  sorting: [],
  onSortingChange: rs.fn(),
  sortingDisabled: false,
  pagination: { pageIndex: 0, pageSize: 10 },
  onPaginationChange: rs.fn(),
  isLoading: false,
  isLiveWaiting: false,
  hasActiveFilter: false,
  selectedKey: null,
  onRowClick: rs.fn(),
  newKeys: new Set(),
};

describe('the MessagesTable — error state', () => {
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
    const onRetry = rs.fn();
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

describe('the MessagesTable — column sorting is keyboard-accessible', () => {
  test('a sortable header renders as a focusable button', () => {
    render(<MessagesTable {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Timestamp' })).toBeInTheDocument();
  });

  test('tabbing to the Timestamp header and pressing Enter toggles sorting', async () => {
    const onSortingChange = rs.fn();
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

const message = (offset: number): TopicMessage => ({
  partitionID: 0,
  offset,
  timestamp: offset,
  compression: CompressionType.Uncompressed,
  isTransactional: false,
  headers: [],
  key: { payload: `key-${offset}`, isPayloadNull: false, encoding: 'text', schemaId: 0, size: 5 },
  value: { payload: `value-${offset}`, isPayloadNull: false, encoding: 'text', schemaId: 0, size: 7 },
  keyJson: `key-${offset}`,
  valueJson: `value-${offset}`,
  keyBinHexPreview: '',
  valueBinHexPreview: '',
});

describe('messagesTable — new rows and the corner actions', () => {
  test('a freshly arrived row flashes in every cell; an older row does not', () => {
    render(<MessagesTable {...baseProps} messages={[message(1), message(2)]} newKeys={new Set(['0-2'])} />);
    const [olderRow, newRow] = screen.getAllByTestId('messages-table-row');

    expect(newRow.querySelectorAll('.animate-message-flash')).toHaveLength(newRow.querySelectorAll('td').length);
    expect(olderRow.querySelector('.animate-message-flash')).toBeNull();
  });

  test('only the last header title keeps clear of the floating corner actions', () => {
    render(<MessagesTable {...baseProps} />);
    const headers = screen.getAllByRole('columnheader');

    expect(headers.at(-1)?.firstElementChild).toHaveClass('mr-16');
    expect(headers[0].firstElementChild).not.toHaveClass('mr-16');
  });
});

// Checks prop-to-preset wiring, not computed pixels.
test.each([
  ['compact', 'h-14'],
  ['detailed', 'h-16'],
] as const)('selects the %s row-height preset', (density, height) => {
  render(<MessagesTable {...baseProps} density={density} messages={[message(1)]} />);
  expect(screen.getByTestId('messages-table-row')).toHaveClass(height);
});

test('detailed density shows payload metadata; compact density hides it', () => {
  const { rerender } = render(<MessagesTable {...baseProps} density="detailed" messages={[message(1)]} />);
  expect(screen.getAllByText('text')).toHaveLength(2);
  expect(screen.getByText('7 B')).toBeInTheDocument();
  rerender(<MessagesTable {...baseProps} density="compact" messages={[message(1)]} />);
  expect(screen.queryByText('text')).toBeNull();
  expect(screen.queryByText('7 B')).toBeNull();
});
