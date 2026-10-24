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

import {
  hasOpenRun,
  observeRun,
  type PipelineRun,
  RUN_OUTCOMES,
  runDurationMs,
  runTally,
  sampleRuns,
  startRecordsRun,
} from './pipeline-runs';
import { describe, expect, test } from 'bun:test';

const START = Date.parse('2026-10-23T15:00:00Z');
const open: PipelineRun = { id: 'r', startTime: START, outcome: 'running', trigger: 'manual' };
const at = (minutes: number) => START + minutes * 60_000;

describe('observeRun', () => {
  test('a run is marked active once its pipeline is seen starting or running', () => {
    const active = observeRun(open, 'active', at(1));
    expect(active.seenActive).toBe(true);
    // Nothing new to record, so the same run comes back.
    expect(observeRun(active, 'active', at(2))).toBe(active);
  });

  test('a stopped state ends a run that was seen active, at the time it was seen', () => {
    const active = observeRun(open, 'active', at(1));
    expect(observeRun(active, 'stopped', at(2))).toMatchObject({ outcome: 'completed', endTime: at(2) });
  });

  test('before it is seen active, a stopped state ends it only after a grace period, with no end time', () => {
    // Soon after the start, a stopped state may be the one from before it.
    expect(observeRun(open, 'stopped', at(1))).toBe(open);
    const ended = observeRun(open, 'stopped', at(3));
    expect(ended).toMatchObject({ outcome: 'completed' });
    expect(ended.endTime).toBeUndefined();
    expect(runDurationMs(ended, at(4))).toBeUndefined();
  });

  test('it ends as stopped when stopped from this browser, and as failed on an error', () => {
    const active = observeRun({ ...open, stopRequested: true }, 'active', at(1));
    expect(observeRun(active, 'stopped', at(2)).outcome).toBe('stopped');
    expect(observeRun(observeRun(open, 'active', at(1)), 'error', at(2))).toMatchObject({
      outcome: 'failed',
      endTime: at(2),
    });
  });

  test('an ended or simulated run is left as it is', () => {
    const done: PipelineRun = { ...open, outcome: 'completed', endTime: at(1) };
    expect(observeRun(done, 'error', at(2))).toBe(done);
    const simulated: PipelineRun = { ...open, simulated: true, seenActive: true };
    expect(observeRun(simulated, 'stopped', at(5))).toBe(simulated);
  });
});

describe('which runs are kept', () => {
  test('a start records a run for a pipeline that stops on its own, or runs on a schedule', () => {
    expect(startRecordsRun('finite')).toBe(true);
    expect(startRecordsRun('continuous')).toBe(false);
    expect(startRecordsRun('continuous', true)).toBe(true);
  });

  test('only a real run going is one to watch', () => {
    expect(hasOpenRun([open])).toBe(true);
    expect(hasOpenRun([{ ...open, simulated: true }])).toBe(false);
    expect(hasOpenRun([{ ...open, outcome: 'completed' }])).toBe(false);
  });
});

describe('durations and tallies', () => {
  test('a run lasts to its end, a running one to now, and a skipped one not at all', () => {
    expect(runDurationMs({ ...open, outcome: 'completed', endTime: at(14) }, at(20))).toBe(14 * 60_000);
    expect(runDurationMs(open, at(3))).toBe(3 * 60_000);
    expect(runDurationMs({ ...open, outcome: 'skipped' }, at(3))).toBeUndefined();
  });

  test('only runs that ended count, and of those the completed ones', () => {
    expect(runTally(sampleRuns(at(0)))).toEqual({ completed: 3, ended: 7 });
  });
});

describe('sampleRuns', () => {
  test('shows every outcome, newest first, and is never ended by a pipeline’s real state', () => {
    const runs = sampleRuns(at(0));
    expect(new Set(runs.map((run) => run.outcome))).toEqual(new Set(RUN_OUTCOMES));
    expect(runs.map((run) => run.startTime)).toEqual([...runs.map((run) => run.startTime)].sort((a, b) => b - a));
    expect(runs.every((run) => run.simulated)).toBe(true);
    expect(new Set(runs.map((run) => run.trigger))).toEqual(new Set(['schedule', 'manual']));
  });
});
