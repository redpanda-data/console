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
import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { render, screen } from 'test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { PipelineStatusToggle } from './pipeline-status-toggle';

const { startMutate, stopMutate } = vi.hoisted(() => ({ startMutate: vi.fn(), stopMutate: vi.fn() }));

vi.mock('react-query/api/pipeline', () => ({
  useStartPipelineMutation: () => ({ mutate: startMutate, isPending: false }),
  useStopPipelineMutation: () => ({ mutate: stopMutate, isPending: false }),
}));

describe('PipelineStatusToggle', () => {
  beforeEach(() => {
    startMutate.mockClear();
    stopMutate.mockClear();
  });

  test('a STARTING pipeline stays interactive and can be cancelled back to Stopped', async () => {
    const user = userEvent.setup();
    render(<PipelineStatusToggle pipelineId="p1" pipelineState={Pipeline_State.STARTING} />);

    // The toggle is NOT locked mid-start — that's what rescues a stuck pipeline.
    const toggle = screen.getByTestId('pipeline-run-toggle');
    expect(toggle).not.toBeDisabled();

    // Turning it off asks to cancel the start (not the generic "Stop pipeline?").
    await user.click(toggle);
    expect(await screen.findByText('Cancel pipeline start?')).toBeInTheDocument();

    // Confirming issues the stop request (which returns the pipeline to Stopped).
    await user.click(screen.getByRole('button', { name: 'Cancel start' }));
    expect(stopMutate).toHaveBeenCalledTimes(1);
    expect(startMutate).not.toHaveBeenCalled();
  });

  test('a STOPPING pipeline stays locked (already settling toward Stopped)', () => {
    render(<PipelineStatusToggle pipelineId="p1" pipelineState={Pipeline_State.STOPPING} />);
    expect(screen.getByTestId('pipeline-run-toggle')).toHaveAttribute('data-disabled');
  });
});
