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
import { SCHEDULE_PREVIEW_STORAGE_KEY, useSchedulePreviewStore } from 'state/rpcn-schedule-preview';
import { render, screen, within } from 'test-utils';

rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
  return { ...actual, isFeatureFlagEnabled: (flag: string) => flag === 'enableRpcnPipelineSchedules' };
});

import { PipelineRunsPanel } from './pipeline-runs-panel';
import { defaultSchedule, describeSchedule, type PipelineSchedule } from '../utils/pipeline-schedule';

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
    seed({ enabled: true });
    render(<PipelineRunsPanel configYaml={FINITE} pipelineId="p1" />);
    const panel = screen.getByTestId('pipeline-runs-panel');
    expect(panel).toHaveTextContent(`${describeSchedule(defaultSchedule('UTC'))} · Scheduled`);
    expect(within(screen.getByRole('list', { name: 'Upcoming runs' })).getAllByRole('listitem')).toHaveLength(5);
    for (const column of ['Started', 'Ended', 'Duration', 'Messages in', 'Messages out', 'Outcome']) {
      expect(within(panel).getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    expect(within(panel).getByText(/No runs recorded yet\./)).toBeInTheDocument();
  });

  test('a paused or on-hold schedule has no runs coming up, and says why', () => {
    seed({ enabled: false });
    const { unmount } = render(<PipelineRunsPanel configYaml={FINITE} pipelineId="p1" />);
    expect(screen.getByText('The schedule is paused, so no runs are coming up.')).toBeInTheDocument();
    unmount();

    seed({ enabled: true });
    render(<PipelineRunsPanel configYaml={CONTINUOUS} pipelineId="p1" />);
    expect(screen.getByText('Runs are on hold until the pipeline stops on its own again.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Upcoming runs' })).not.toBeInTheDocument();
  });
});
