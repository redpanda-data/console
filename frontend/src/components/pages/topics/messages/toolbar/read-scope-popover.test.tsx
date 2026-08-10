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

import { ReadScopePopover, type ReadScopePopoverProps } from './read-scope-popover';

const renderPopover = (overrides: Partial<ReadScopePopoverProps> = {}) => {
  const props: ReadScopePopoverProps = {
    topicName: 'test-topic',
    mode: 'newest',
    onModeChange: vi.fn(),
    customOffset: -1,
    onCustomOffsetChange: vi.fn(),
    startTimestamp: -1,
    onStartTimestampChange: vi.fn(),
    maxResults: 50,
    onMaxResultsChange: vi.fn(),
    continuousMode: false,
    onContinuousModeChange: vi.fn(),
    partitionId: -1,
    onPartitionIdChange: vi.fn(),
    partitionCount: 3,
    liveTail: false,
    onLiveTailChange: vi.fn(),
    onOpenDocs: vi.fn(),
    ...overrides,
  };
  render(<ReadScopePopover {...props} />);
  return props;
};

describe('ReadScopePopover', () => {
  test('shows the current mode and limit summary on the trigger', () => {
    renderPopover({ mode: 'oldest', maxResults: 20 });
    expect(screen.getByTestId('read-scope-button')).toHaveTextContent('Oldest');
    expect(screen.getByTestId('read-scope-button')).toHaveTextContent('· 20');
  });

  test('summary reflects continuous paging', () => {
    renderPopover({ continuousMode: true, maxResults: 20 });
    expect(screen.getByTestId('read-scope-button')).toHaveTextContent('· 20/page · continuous');
  });

  test('selecting a mode applies immediately', async () => {
    const props = renderPopover();
    await userEvent.click(screen.getByTestId('read-scope-button'));
    await userEvent.click(screen.getByTestId('read-scope-mode-oldest'));
    expect(props.onModeChange).toHaveBeenCalledWith('oldest');
  });

  test('offset mode exposes the start-offset input', async () => {
    const props = renderPopover({ mode: 'offset', customOffset: 48_210 });
    await userEvent.click(screen.getByTestId('read-scope-button'));
    const offsetInput = screen.getByTestId('read-scope-offset-input');
    expect(offsetInput).toHaveValue('48210');
    await userEvent.type(offsetInput, '7');
    // The input is controlled by the parent; each keystroke reports the parsed offset
    expect(props.onCustomOffsetChange).toHaveBeenCalledWith(482_107);
  });

  test('continuous switch only exists for newest/oldest modes', async () => {
    renderPopover({ mode: 'timestamp' });
    await userEvent.click(screen.getByTestId('read-scope-button'));
    expect(screen.queryByTestId('read-scope-continuous-switch')).not.toBeInTheDocument();
  });

  test('limit segmented control changes max results', async () => {
    const props = renderPopover();
    await userEvent.click(screen.getByTestId('read-scope-button'));
    await userEvent.click(screen.getByTestId('read-scope-limit-100'));
    expect(props.onMaxResultsChange).toHaveBeenCalledWith(100);
  });

  test('live tail is a menu entry and reflects on the trigger', async () => {
    const props = renderPopover({ liveTail: true });
    expect(screen.getByTestId('read-scope-button')).toHaveTextContent('Live tail');
    expect(screen.getByTestId('read-scope-button')).toHaveTextContent('· streaming');
    await userEvent.click(screen.getByTestId('read-scope-button'));
    await userEvent.click(screen.getByTestId('read-scope-mode-live'));
    expect(props.onLiveTailChange).toHaveBeenCalledWith(false);
  });

  test('picking a start mode stops live tail first', async () => {
    const props = renderPopover({ liveTail: true });
    await userEvent.click(screen.getByTestId('read-scope-button'));
    await userEvent.click(screen.getByTestId('read-scope-mode-oldest'));
    expect(props.onLiveTailChange).toHaveBeenCalledWith(false);
    expect(props.onModeChange).toHaveBeenCalledWith('oldest');
  });

  test('onOpenChange reports open/closed so a caller can gate other keyboard shortcuts on it', async () => {
    const onOpenChange = vi.fn();
    renderPopover({ onOpenChange });
    await userEvent.click(screen.getByTestId('read-scope-button'));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    // picking "Live tail" is one of the paths that explicitly closes the popover
    await userEvent.click(screen.getByTestId('read-scope-mode-live'));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
