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

import { type PipelineProblem, PipelineProblemsPanel } from './pipeline-problems-panel';

const PROBLEMS: PipelineProblem[] = [
  { key: 'p1', message: 'field required', nodeId: 'input-0', nodeLabel: 'kafka_franz', target: { kind: 'input' } },
];

describe('PipelineProblemsPanel', () => {
  test('renders nothing without problems or missing secrets', () => {
    render(<PipelineProblemsPanel onSelectProblem={vi.fn()} problems={[]} />);
    expect(screen.queryByTestId('pipeline-problems-chip')).not.toBeInTheDocument();
  });

  test('expands to the problem list and selects a node on click', async () => {
    const user = userEvent.setup();
    const onSelectProblem = vi.fn();
    render(<PipelineProblemsPanel onSelectProblem={onSelectProblem} problems={PROBLEMS} />);

    const chip = screen.getByTestId('pipeline-problems-chip');
    expect(chip).toHaveTextContent('1 problem');

    await user.click(chip);
    await user.click(screen.getByText('field required'));
    expect(onSelectProblem).toHaveBeenCalledWith('input-0', { kind: 'input' }, undefined);
    // The list collapses after a selection.
    expect(screen.queryByTestId('pipeline-problems-list')).not.toBeInTheDocument();
  });

  test('dismisses the expanded list on Escape', async () => {
    const user = userEvent.setup();
    render(<PipelineProblemsPanel onSelectProblem={vi.fn()} problems={PROBLEMS} />);

    await user.click(screen.getByTestId('pipeline-problems-chip'));
    expect(screen.getByTestId('pipeline-problems-list')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('pipeline-problems-list')).not.toBeInTheDocument();
  });

  test('dismisses the expanded list on an outside click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button data-testid="outside" type="button">
          outside
        </button>
        <PipelineProblemsPanel onSelectProblem={vi.fn()} problems={PROBLEMS} />
      </div>
    );

    await user.click(screen.getByTestId('pipeline-problems-chip'));
    expect(screen.getByTestId('pipeline-problems-list')).toBeInTheDocument();

    await user.click(screen.getByTestId('outside'));
    expect(screen.queryByTestId('pipeline-problems-list')).not.toBeInTheDocument();
  });
});
