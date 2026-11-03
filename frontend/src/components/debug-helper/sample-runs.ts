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

import type { PipelineRun } from '../pages/rp-connect/utils/pipeline-runs';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type SampleRun = Omit<PipelineRun, 'id' | 'startTime' | 'endTime'> & { ago: number; lasted?: number };

// One of each state the history shows, newest first, at fixed offsets from now.
const SAMPLE_RUNS: SampleRun[] = [
  { ago: 12 * MINUTE, outcome: 'running', trigger: 'schedule', messagesIn: 4210, messagesOut: 4180 },
  {
    ago: 1 * DAY,
    lasted: 14 * MINUTE + 32_000,
    outcome: 'completed',
    trigger: 'schedule',
    messagesIn: 12_480,
    messagesOut: 12_480,
  },
  {
    ago: 1 * DAY + 5 * HOUR,
    lasted: 3 * MINUTE + 4000,
    outcome: 'completed',
    trigger: 'manual',
    messagesIn: 2310,
    messagesOut: 2310,
  },
  { ago: 2 * DAY, outcome: 'skipped', trigger: 'schedule', note: 'The previous run was still going.' },
  {
    ago: 3 * DAY,
    lasted: 4 * HOUR,
    outcome: 'timed-out',
    trigger: 'schedule',
    messagesIn: 2_104_000,
    messagesOut: 2_098_500,
    note: 'Stopped at its 4 hour limit.',
  },
  {
    ago: 4 * DAY,
    lasted: 2 * MINUTE + 10_000,
    outcome: 'failed',
    trigger: 'schedule',
    messagesIn: 340,
    messagesOut: 0,
    note: 'output redpanda: SASL authentication failed',
  },
  {
    ago: 5 * DAY,
    lasted: 8 * MINUTE,
    outcome: 'stopped',
    trigger: 'manual',
    messagesIn: 980,
    messagesOut: 975,
    note: 'Stopped from Console.',
  },
  {
    ago: 6 * DAY,
    lasted: 13 * MINUTE + 51_000,
    outcome: 'completed',
    trigger: 'schedule',
    messagesIn: 11_920,
    messagesOut: 11_920,
  },
];

/** A history with a run in every state, for trying the history out before a server records runs. */
export function sampleRuns(now: number): PipelineRun[] {
  return SAMPLE_RUNS.map(({ ago, lasted, ...run }) => {
    const startTime = now - ago;
    return {
      ...run,
      id: `sample-${ago}`,
      startTime,
      endTime: lasted === undefined ? undefined : startTime + lasted,
      simulated: true,
    };
  });
}
