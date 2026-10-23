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
import { SCHEDULE_PREVIEW_STORAGE_KEY, useSchedulePreviewStore } from 'state/rpcn-schedule-preview';
import { render, screen, within } from 'test-utils';

rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
  return { ...actual, isFeatureFlagEnabled: (flag: string) => flag === 'enableRpcnPipelineSchedules' };
});

import { PipelineRunsPanel } from './pipeline-runs-panel';
import { defaultSchedule, type PipelineSchedule } from '../utils/pipeline-schedule';

const FINITE = 'input:\n  sql_select:\n    table: orders\noutput:\n  drop: {}\n';
const CONTINUOUS = 'input:\n  redpanda:\n    topics: [orders]\noutput:\n  drop: {}\n';

const seed = (overrides: Partial<PipelineSchedule>) =>
  useSchedulePreviewStore.getState().saveSchedule('p1', { ...defaultSchedule('UTC'), ...overrides });

beforeEach(() => {
  window.localStorage.removeItem(SCHEDULE_PREVIEW_STORAGE_KEY);
  useSchedulePreviewStore.setState({ schedules: {} });
});

describe('PipelineRunsPanel', () => {
  test('shows nothing for a pipeline without a schedule', () => {
    render(<PipelineRunsPanel configYaml={FINITE} pipelineId="p1" />);
    expect(screen.queryByTestId('pipeline-runs-panel')).not.toBeInTheDocument();
  });

  test('lists the runs coming up, and where their history will be', () => {
    seed({ enabled: true, cadence: 'weekly', weekdays: [1, 4] });
    render(<PipelineRunsPanel configYaml={FINITE} pipelineId="p1" />);
    const panel = screen.getByTestId('pipeline-runs-panel');
    expect(within(panel).getByRole('img', { name: 'On Monday and Thursday' })).toBeInTheDocument();
    const upcoming = within(screen.getByRole('list', { name: 'Upcoming runs' })).getAllByRole('listitem');
    expect(upcoming).toHaveLength(5);
    // Only the first says how soon it is.
    expect(upcoming[0]).toHaveTextContent(/in /);
    expect(upcoming[1]).not.toHaveTextContent(/in \d/);
    expect(within(panel).getByText('No runs yet')).toBeInTheDocument();
  });

  test('a paused schedule can be resumed from the panel; one on hold says why it waits', async () => {
    const user = userEvent.setup();
    seed({ enabled: false });
    const { unmount } = render(<PipelineRunsPanel configYaml={FINITE} pipelineId="p1" />);
    expect(screen.getByText('No runs until the schedule is turned back on.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume schedule' }));
    expect(Object.values(useSchedulePreviewStore.getState().schedules)[0]?.enabled).toBe(true);
    unmount();

    render(<PipelineRunsPanel configYaml={CONTINUOUS} pipelineId="p1" />);
    expect(screen.getByText('No runs until the pipeline stops on its own again.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Upcoming runs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume schedule' })).not.toBeInTheDocument();
  });
});
