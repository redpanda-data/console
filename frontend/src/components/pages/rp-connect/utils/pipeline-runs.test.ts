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
  isWatchingRun,
  observeRun,
  type PipelineRun,
  runDurationMs,
  runTally,
  startRecordsRun,
  withStartedRun,
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
    expect(observeRun(active, 'stopped', at(2), at(1))).toMatchObject({ outcome: 'completed', endTime: at(2) });
  });

  test('a run last seen active long before it was seen stopped ended at a time unknown', () => {
    const active = observeRun(open, 'active', at(1));
    const ended = observeRun(active, 'stopped', at(60), at(1));
    expect(ended).toMatchObject({ outcome: 'completed' });
    expect(ended.endTime).toBeUndefined();
    // Seen active only in an earlier page, so not lately at all.
    expect(observeRun(active, 'stopped', at(2)).endTime).toBeUndefined();
  });

  test('data fetched before the run started is ignored', () => {
    const active = observeRun(open, 'active', at(1));
    expect(observeRun(active, 'stopped', START - 1, at(1))).toBe(active);
    expect(observeRun(open, 'active', START - 1)).toBe(open);
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
    expect(observeRun(observeRun(open, 'active', at(1)), 'error', at(2), at(1))).toMatchObject({
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

describe('withStartedRun', () => {
  const done: PipelineRun = { ...open, id: 'done', outcome: 'completed', endTime: at(-5) };

  test('a start records a run, unless a real run going was seen active', () => {
    expect(withStartedRun([done], { now: at(1) })).toEqual([
      { id: `manual-${at(1)}`, startTime: at(1), outcome: 'running', trigger: 'manual', simulated: undefined },
      done,
    ]);
    const active = { ...open, seenActive: true };
    expect(withStartedRun([active], { now: at(1) })).toEqual([active]);
    // A simulated run going doesn't block a real one, and a simulated start never ends a real run.
    expect(withStartedRun([{ ...open, simulated: true }], { now: at(1) })).toHaveLength(2);
    expect(withStartedRun([open], { now: at(1), simulated: true })).toEqual([open]);
  });

  // The pipeline couldn't be started again while that run was going.
  test('a start ends a run not seen active yet: failed if the pipeline errored since it began', () => {
    const [started, failed] = withStartedRun([open, done], { now: at(1) }, at(0.5));
    expect(started).toMatchObject({ outcome: 'running', startTime: at(1) });
    expect(failed).toMatchObject({ id: open.id, outcome: 'failed' });
    expect(failed?.endTime).toBeUndefined();
  });

  // A row menu offers Start while the pipeline is still stopping.
  test('a start ends a run seen active that was asked to stop, as stopped at a time unknown', () => {
    const stopping: PipelineRun = { ...open, seenActive: true, stopRequested: true };
    const [started, stopped] = withStartedRun([stopping, done], { now: at(5) });
    expect(started).toMatchObject({ outcome: 'running', startTime: at(5) });
    expect(stopped).toMatchObject({ id: open.id, outcome: 'stopped' });
    expect(stopped?.endTime).toBeUndefined();
  });

  test('a start drops a run not seen active yet when nothing showed it ran', () => {
    expect(withStartedRun([open, done], { now: at(1) }).map((run) => run.id)).toEqual([`manual-${at(1)}`, 'done']);
    // An error from before the run began says nothing about it.
    expect(withStartedRun([open], { now: at(1) }, START - 1)).toHaveLength(1);
  });
});

describe('which runs are kept', () => {
  test('a start records a run only for a pipeline that stops on its own', () => {
    expect(startRecordsRun('finite')).toBe(true);
    expect(startRecordsRun('continuous')).toBe(false);
    expect(startRecordsRun('unknown')).toBe(false);
  });

  test('only a real run going is one to watch', () => {
    expect(hasOpenRun([open])).toBe(true);
    expect(hasOpenRun([{ ...open, simulated: true }])).toBe(false);
    expect(hasOpenRun([{ ...open, outcome: 'completed' }])).toBe(false);
  });

  test('a run going is polled for during its first hour only', () => {
    expect(isWatchingRun([open], at(59))).toBe(true);
    expect(isWatchingRun([open], at(60))).toBe(false);
    expect(isWatchingRun([{ ...open, simulated: true }], at(1))).toBe(false);
    expect(isWatchingRun([{ ...open, outcome: 'completed' }], at(1))).toBe(false);
  });
});

describe('durations and tallies', () => {
  test('a run lasts to its end, a running one to now, and a skipped one not at all', () => {
    expect(runDurationMs({ ...open, outcome: 'completed', endTime: at(14) }, at(20))).toBe(14 * 60_000);
    expect(runDurationMs(open, at(3))).toBe(3 * 60_000);
    expect(runDurationMs({ ...open, outcome: 'skipped' }, at(3))).toBeUndefined();
  });

  test('only runs that ended count, and of those the completed ones', () => {
    const ended = (outcome: PipelineRun['outcome']): PipelineRun => ({ ...open, outcome, endTime: at(1) });
    expect(runTally([open, ended('completed'), ended('failed'), ended('completed')])).toEqual({
      completed: 2,
      ended: 3,
    });
  });
});
