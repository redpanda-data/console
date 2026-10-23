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

import { z } from 'zod';

import type { PipelineEndStatus } from './input-end-behavior';

// A pipeline's runs, shaped as the scheduling API sketches them (start, end, outcome, trigger, message
// counts). Until a server records runs, the preview keeps the ones this browser starts and sees end.

export const RUN_OUTCOMES = ['running', 'completed', 'failed', 'timed-out', 'stopped', 'skipped'] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

const RUN_TRIGGERS = ['schedule', 'manual'] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const pipelineRunSchema = z.object({
  id: z.string(),
  /** Epoch ms. */
  startTime: z.number(),
  endTime: z.number().optional(),
  outcome: z.enum(RUN_OUTCOMES),
  trigger: z.enum(RUN_TRIGGERS),
  messagesIn: z.number().optional(),
  messagesOut: z.number().optional(),
  /** Why it failed, timed out, was skipped or was stopped. */
  note: z.string().optional(),
  /** Seen starting or running since it began, so a stopped state is its end, not stale data from before. */
  seenActive: z.boolean().optional(),
  /** Stopped from this browser, so its end reads as stopped rather than completed. */
  stopRequested: z.boolean().optional(),
  /** Made up to try the history out, so the pipeline's real state never ends it. */
  simulated: z.boolean().optional(),
});

export type PipelineRun = z.infer<typeof pipelineRunSchema>;

/** How long it ran, in ms: to `now` while running; none for a run that was skipped. */
export function runDurationMs(run: PipelineRun, now: number): number | undefined {
  if (run.outcome === 'skipped') {
    return;
  }
  const end = run.outcome === 'running' ? now : run.endTime;
  return end === undefined ? undefined : Math.max(end - run.startTime, 0);
}

/** What the pipeline's state says about an open run. */
export type RunObservation = 'active' | 'stopped' | 'error' | 'other';

// How long a run can go unseen before a stopped state means it ended out of sight, at a time unknown.
const UNSEEN_RUN_MS = 2 * 60_000;

/**
 * An open run updated by what the pipeline's state showed when fetched at `fetchedAt`: marked active once
 * it's seen starting or running, and ended once it's seen stopped (completed, or stopped if asked to) or
 * errored. Data fetched before the start is ignored. Before the run is seen active, a stopped state may
 * still be the one from before its start, so it ends the run only after a grace period. The end time is
 * the sighting only when the run was seen active (`lastActiveAt`) shortly before. The same run comes back
 * when nothing changes.
 */
export function observeRun(
  run: PipelineRun,
  seen: RunObservation,
  fetchedAt: number,
  lastActiveAt?: number
): PipelineRun {
  if (run.outcome !== 'running' || run.simulated || fetchedAt < run.startTime) {
    return run;
  }
  if (seen === 'active') {
    return run.seenActive ? run : { ...run, seenActive: true };
  }
  if (seen === 'other' || !(run.seenActive || fetchedAt - run.startTime > UNSEEN_RUN_MS)) {
    return run;
  }
  return endedRun(run, seen, fetchedAt, lastActiveAt);
}

function endedRun(
  run: PipelineRun,
  seen: 'stopped' | 'error',
  fetchedAt: number,
  lastActiveAt: number | undefined
): PipelineRun {
  const seenLately =
    lastActiveAt !== undefined && lastActiveAt >= run.startTime && fetchedAt - lastActiveAt <= UNSEEN_RUN_MS;
  const end = seenLately ? fetchedAt : undefined;
  if (seen === 'error') {
    return { ...run, outcome: 'failed', endTime: end, note: 'The pipeline stopped with an error. Its logs say why.' };
  }
  return run.stopRequested
    ? { ...run, outcome: 'stopped', endTime: end, note: 'Stopped from Console.' }
    : { ...run, outcome: 'completed', endTime: end };
}

// A run that a new start ends: stopped if it was seen active (it was asked to stop), else failed if the
// pipeline errored since it began, and dropped otherwise, as nothing showed it ran.
const supersededRun = (run: PipelineRun, now: number, lastErrorAt: number | undefined): PipelineRun[] => {
  if (run.seenActive) {
    return [endedRun(run, 'stopped', now, undefined)];
  }
  return lastErrorAt !== undefined && lastErrorAt >= run.startTime
    ? [endedRun(run, 'error', lastErrorAt, undefined)]
    : [];
};

/**
 * `runs` with a manual run started at `now` first, unless a real run going was seen active and not asked
 * to stop. Any other run going is over, as the pipeline started again; `lastErrorAt`, when the pipeline
 * was last seen errored, says whether one not seen active failed.
 */
export function withStartedRun(
  runs: PipelineRun[],
  { now, simulated }: { now: number; simulated?: boolean },
  lastErrorAt?: number
): PipelineRun[] {
  const open = runs.find((run) => run.outcome === 'running' && !run.simulated);
  // A simulated run never ends a real one.
  if (open && (simulated || (open.seenActive && !open.stopRequested))) {
    return runs;
  }
  const earlier = runs.flatMap((run) => (run === open ? supersededRun(run, now, lastErrorAt) : [run]));
  return [{ id: `manual-${now}`, startTime: now, outcome: 'running', trigger: 'manual', simulated }, ...earlier];
}

/** Whether a real run is going: one this browser started and is watching for its end. */
export const hasOpenRun = (runs: PipelineRun[]): boolean =>
  runs.some((run) => run.outcome === 'running' && !run.simulated);

// How long a page polls for a run's end; a longer run is ended by the page's next fetch.
const RUN_WATCH_MS = 60 * 60_000;

/** Whether a real run going started recently enough to poll for its end. */
export const isWatchingRun = (runs: PipelineRun[], now: number): boolean =>
  runs.some((run) => run.outcome === 'running' && !run.simulated && now - run.startTime < RUN_WATCH_MS);

/** Whether starting a pipeline records a run: only one that stops on its own has a run that ends. */
export const startRecordsRun = (end: PipelineEndStatus): boolean => end === 'finite';

/** How many of the runs that ended completed. */
export function runTally(runs: PipelineRun[]): { completed: number; ended: number } {
  const ended = runs.filter((run) => run.outcome !== 'running');
  return { completed: ended.filter((run) => run.outcome === 'completed').length, ended: ended.length };
}
