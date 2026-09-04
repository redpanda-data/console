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
import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { render, screen } from 'test-utils';

import { PipelineRunButton, PipelineStateBadge } from './pipeline-run-controls';

const { startMutate, stopMutate } = rs.hoisted(() => ({ startMutate: rs.fn(), stopMutate: rs.fn() }));

rs.mock('react-query/api/pipeline', () => ({
  useStartPipelineMutation: () => ({ mutate: startMutate, isPending: false }),
  useStopPipelineMutation: () => ({ mutate: stopMutate, isPending: false }),
}));

describe('PipelineStateBadge', () => {
  test('reads the state without offering to change it', () => {
    render(<PipelineStateBadge state={Pipeline_State.STOPPED} />);
    const badge = screen.getByTestId('pipeline-state-badge');
    expect(badge).toHaveTextContent('Stopped');
    // Status only: nothing here is clickable, so "Stopped" can't be mistaken for a control.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

describe('PipelineRunButton', () => {
  beforeEach(() => {
    startMutate.mockClear();
    stopMutate.mockClear();
  });

  test('a stopped pipeline offers Start pipeline, which starts it without a confirmation', async () => {
    const user = userEvent.setup();
    render(<PipelineRunButton pipelineId="p1" pipelineState={Pipeline_State.STOPPED} />);

    const start = screen.getByTestId('pipeline-start');
    expect(start).toHaveTextContent('Start pipeline');

    await user.click(start);
    expect(startMutate).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['an errored', Pipeline_State.ERROR],
    ['a completed', Pipeline_State.COMPLETED],
  ])('%s pipeline can be started again', (_label, state) => {
    render(<PipelineRunButton pipelineId="p1" pipelineState={state} />);
    expect(screen.getByTestId('pipeline-start')).toHaveTextContent('Start pipeline');
  });

  test('a running pipeline offers Stop pipeline behind a confirmation', async () => {
    const user = userEvent.setup();
    render(<PipelineRunButton pipelineId="p1" pipelineState={Pipeline_State.RUNNING} />);

    await user.click(screen.getByTestId('pipeline-stop'));
    expect(stopMutate).not.toHaveBeenCalled();
    expect(await screen.findByText('Stop pipeline?')).toBeInTheDocument();

    await user.click(screen.getByTestId('confirm-stop-pipeline'));
    expect(stopMutate).toHaveBeenCalledTimes(1);
  });

  test('a starting pipeline can be cancelled back to Stopped', async () => {
    const user = userEvent.setup();
    render(<PipelineRunButton pipelineId="p1" pipelineState={Pipeline_State.STARTING} />);

    // Not locked mid-start — that's what rescues a pipeline stuck on its way up.
    const cancel = screen.getByTestId('pipeline-stop');
    expect(cancel).toHaveTextContent('Cancel start');
    expect(cancel).not.toBeDisabled();

    await user.click(cancel);
    expect(await screen.findByText('Cancel pipeline start?')).toBeInTheDocument();

    await user.click(screen.getByTestId('confirm-stop-pipeline'));
    expect(stopMutate).toHaveBeenCalledTimes(1);
    expect(startMutate).not.toHaveBeenCalled();
  });

  test('a stopping pipeline keeps Start in place, disabled (already settling toward Stopped)', () => {
    render(<PipelineRunButton pipelineId="p1" pipelineState={Pipeline_State.STOPPING} />);
    expect(screen.getByTestId('pipeline-start')).toBeDisabled();
  });

  test('an unknown state offers no run action to name', () => {
    render(<PipelineRunButton pipelineId="p1" pipelineState={Pipeline_State.UNSPECIFIED} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
