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
import { RUN_HISTORY_STORAGE_KEY, useRunHistoryStore } from 'state/rpcn-run-history-preview';
import { render, screen, within } from 'test-utils';

import { PipelineRunsPanel } from './pipeline-runs-panel';
import { sampleRuns } from '../../../debug-helper/sample-runs';

const FINITE = 'input:\n  sql_select:\n    table: orders\noutput:\n  drop: {}\n';
const CONTINUOUS = 'input:\n  redpanda:\n    topics: [orders]\noutput:\n  drop: {}\n';

// A Wednesday.
const NOW = Date.UTC(2026, 0, 14, 12);

// A pipeline that stops on its own, with the debug helper's sample runs.
const renderSampleHistory = () => {
  useRunHistoryStore.getState().replaceRuns('p1', sampleRuns(NOW));
  render(<PipelineRunsPanel configYaml={FINITE} pipelineId="p1" />);
};

beforeEach(() => {
  rs.setSystemTime(NOW);
  window.localStorage.removeItem(RUN_HISTORY_STORAGE_KEY);
  useRunHistoryStore.setState({ runs: {} });
  return () => {
    rs.useRealTimers();
  };
});

describe('the PipelineRunsPanel', () => {
  test('shows nothing for a pipeline that never stops', () => {
    render(<PipelineRunsPanel configYaml={CONTINUOUS} pipelineId="p1" />);
    expect(screen.queryByTestId('pipeline-runs-panel')).not.toBeInTheDocument();
  });

  test('a pipeline that stops on its own shows its run history', () => {
    useRunHistoryStore.getState().replaceRuns('p1', [
      {
        id: 'a',
        startTime: NOW - 120_000,
        endTime: NOW - 10_000,
        outcome: 'completed',
        trigger: 'manual',
      },
    ]);
    render(<PipelineRunsPanel configYaml={FINITE} pipelineId="p1" />);
    expect(screen.getByTestId('pipeline-runs-panel')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Run history' });
    expect(within(table).getByText('Completed')).toBeInTheDocument();
    // No run here has message counts, so there's no column for them.
    expect(within(table).queryByRole('columnheader', { name: 'Messages' })).not.toBeInTheDocument();
  });

  test('the history lists each run with how it went, under a strip of the latest outcomes', () => {
    renderSampleHistory();

    expect(screen.getByRole('img', { name: 'Last 8 runs: 3 of 7 that ended completed' })).toBeInTheDocument();
    const rows = within(screen.getByRole('table', { name: 'Run history' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows.map((row) => row.getAttribute('data-outcome'))).toEqual([
      'running',
      'completed',
      'completed',
      'skipped',
      'timed-out',
      'failed',
      'stopped',
      'completed',
    ]);
    // A failed run says why where it's listed.
    expect(rows[5]).toHaveTextContent('Failed');
    expect(rows[5]).toHaveTextContent('output redpanda: SASL authentication failed');
    expect(rows[2]).toHaveTextContent('Manual');
    expect(rows[1]).toHaveTextContent('12.5K in · 12.5K out');
    expect(screen.queryByText('No runs yet')).not.toBeInTheDocument();
  });
});

describe('the run history preview', () => {
  test('records a run started here, and ends it once its pipeline is seen to stop', () => {
    const store = useRunHistoryStore.getState();
    store.startManualRun('p1', { now: 1000 });
    store.observe('p1', 'active', 3000);
    // A second start while one is seen going doesn't add another.
    store.startManualRun('p1', { now: 4000 });
    expect(useRunHistoryStore.getState().runs['default/p1']).toHaveLength(1);

    store.observe('p1', 'stopped', 9000);
    expect(useRunHistoryStore.getState().runs['default/p1']?.[0]).toMatchObject({
      outcome: 'completed',
      trigger: 'manual',
      startTime: 1000,
      endTime: 9000,
    });
  });

  test('a run stopped from here ends as stopped', () => {
    const store = useRunHistoryStore.getState();
    store.startManualRun('p1', { now: 1000 });
    store.observe('p1', 'active', 2000);
    store.requestStop('p1');
    store.observe('p1', 'stopped', 5000);
    expect(useRunHistoryStore.getState().runs['default/p1']?.[0]?.outcome).toBe('stopped');
  });
});
