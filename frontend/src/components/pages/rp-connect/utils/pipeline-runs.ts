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

// How long a run can go unseen before a stopped state means it ran and ended out of sight.
const UNSEEN_RUN_GRACE_MS = 2 * 60_000;

/**
 * An open run updated by what the pipeline's state shows at `now`: marked active once it's seen starting
 * or running, and ended once it's seen stopped (completed, or stopped if asked to) or errored. Before the
 * run is seen active, a stopped state may be the one from before its start, so it ends the run only after
 * a grace period, with its end unknown. The same run comes back when nothing changes.
 */
export function observeRun(run: PipelineRun, seen: RunObservation, now: number): PipelineRun {
  if (run.outcome !== 'running' || run.simulated) {
    return run;
  }
  if (seen === 'active') {
    return run.seenActive ? run : { ...run, seenActive: true };
  }
  if (seen === 'other' || !(run.seenActive || now - run.startTime > UNSEEN_RUN_GRACE_MS)) {
    return run;
  }
  const end = run.seenActive ? Math.max(now, run.startTime) : undefined;
  if (seen === 'error') {
    return { ...run, outcome: 'failed', endTime: end, note: 'The pipeline stopped with an error. Its logs say why.' };
  }
  return run.stopRequested
    ? { ...run, outcome: 'stopped', endTime: end, note: 'Stopped from Console.' }
    : { ...run, outcome: 'completed', endTime: end };
}

/** Whether a real run is going: one this browser started and is watching for its end. */
export const hasOpenRun = (runs: PipelineRun[]): boolean =>
  runs.some((run) => run.outcome === 'running' && !run.simulated);

/** Whether starting a pipeline records a run: it stops on its own, or runs on a schedule. */
export const startRecordsRun = (end: PipelineEndStatus, scheduled = false): boolean => end === 'finite' || scheduled;

/** How many of the runs that ended completed. */
export function runTally(runs: PipelineRun[]): { completed: number; ended: number } {
  const ended = runs.filter((run) => run.outcome !== 'running');
  return { completed: ended.filter((run) => run.outcome === 'completed').length, ended: ended.length };
}

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
