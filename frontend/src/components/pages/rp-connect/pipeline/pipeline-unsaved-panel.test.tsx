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
import { describe, expect, test, vi } from 'vitest';

import { PipelineUnsavedPanel } from './pipeline-unsaved-panel';

describe('PipelineUnsavedPanel', () => {
  test('renders nothing when there are no unsaved nodes', () => {
    render(<PipelineUnsavedPanel nodes={[]} onSelect={vi.fn()} />);
    expect(screen.queryByTestId('pipeline-unsaved-chip')).not.toBeInTheDocument();
  });

  test('shows the unsaved count and lists nodes, jumping to one on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PipelineUnsavedPanel
        nodes={[
          { id: 'proc-0', label: 'mapping' },
          { id: 'output-0', label: 'kafka', detail: 'orders' },
        ]}
        onSelect={onSelect}
      />
    );

    const chip = screen.getByTestId('pipeline-unsaved-chip');
    expect(chip).toHaveTextContent('2 unsaved');

    await user.click(chip);
    expect(screen.getByText('kafka')).toBeInTheDocument();

    await user.click(screen.getByText('mapping'));
    expect(onSelect).toHaveBeenCalledWith('proc-0');
    // The list collapses after a selection.
    expect(screen.queryByTestId('pipeline-unsaved-list')).not.toBeInTheDocument();
  });

  test('uses the singular label for a single unsaved node', () => {
    render(<PipelineUnsavedPanel nodes={[{ id: 'proc-0', label: 'mapping' }]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('pipeline-unsaved-chip')).toHaveTextContent('1 unsaved');
  });

  test('dismisses the expanded list on Escape', async () => {
    const user = userEvent.setup();
    render(<PipelineUnsavedPanel nodes={[{ id: 'proc-0', label: 'mapping' }]} onSelect={vi.fn()} />);

    await user.click(screen.getByTestId('pipeline-unsaved-chip'));
    expect(screen.getByTestId('pipeline-unsaved-list')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('pipeline-unsaved-list')).not.toBeInTheDocument();
  });

  test('dismisses the expanded list on an outside click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button data-testid="outside" type="button">
          outside
        </button>
        <PipelineUnsavedPanel nodes={[{ id: 'proc-0', label: 'mapping' }]} onSelect={vi.fn()} />
      </div>
    );

    await user.click(screen.getByTestId('pipeline-unsaved-chip'));
    expect(screen.getByTestId('pipeline-unsaved-list')).toBeInTheDocument();

    await user.click(screen.getByTestId('outside'));
    expect(screen.queryByTestId('pipeline-unsaved-list')).not.toBeInTheDocument();

    // Clicking inside the panel (the chip re-toggle aside, rows) must not count as outside.
    await user.click(screen.getByTestId('pipeline-unsaved-chip'));
    expect(screen.getByTestId('pipeline-unsaved-list')).toBeInTheDocument();
  });
});
