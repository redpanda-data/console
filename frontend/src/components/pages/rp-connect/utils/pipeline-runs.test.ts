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

import { observeRun, type PipelineRun, RUN_OUTCOMES, runDurationMs, runTally, sampleRuns } from './pipeline-runs';
import { describe, expect, test } from 'bun:test';

const START = Date.parse('2026-10-23T15:00:00Z');
const open: PipelineRun = { id: 'r', startTime: START, outcome: 'running', trigger: 'manual' };
const at = (minutes: number) => START + minutes * 60_000;

describe('observeRun', () => {
  test('a run is marked active once its pipeline is seen starting or running', () => {
    const active = observeRun(open, 'active', { now: at(1) });
    expect(active.seenActive).toBe(true);
    // Nothing new to record, so the same run comes back.
    expect(observeRun(active, 'active', { now: at(2) })).toBe(active);
  });

  test('a stopped state ends it only once the run was seen active, or the pipeline changed since it began', () => {
    // Before either, a stopped state may be the one from before the start.
    expect(observeRun(open, 'stopped', { now: at(1), updatedAt: START - 60_000 })).toBe(open);
    const active = observeRun(open, 'active', { now: at(1) });
    expect(observeRun(active, 'stopped', { now: at(2) })).toMatchObject({ outcome: 'completed', endTime: at(2) });
    expect(observeRun(open, 'stopped', { now: at(5), updatedAt: at(3) })).toMatchObject({
      outcome: 'completed',
      endTime: at(3),
    });
  });

  test('it ends as stopped when stopped from this browser, and as failed on an error', () => {
    const active = observeRun({ ...open, stopRequested: true }, 'active', { now: at(1) });
    expect(observeRun(active, 'stopped', { now: at(2) }).outcome).toBe('stopped');
    expect(observeRun(observeRun(open, 'active', { now: at(1) }), 'error', { now: at(2) })).toMatchObject({
      outcome: 'failed',
      endTime: at(2),
    });
  });

  test('an ended or simulated run is left as it is', () => {
    const done: PipelineRun = { ...open, outcome: 'completed', endTime: at(1) };
    expect(observeRun(done, 'error', { now: at(2) })).toBe(done);
    const simulated: PipelineRun = { ...open, simulated: true, seenActive: true };
    expect(observeRun(simulated, 'stopped', { now: at(2), updatedAt: at(1) })).toBe(simulated);
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
