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
  observeRun,
  type PipelineRun,
  pipelineRunSchema,
  type RunObservation,
} from 'components/pages/rp-connect/utils/pipeline-runs';
import { z } from 'zod';
import { create } from 'zustand';

import { pipelinePreviewKey } from './rpcn-schedule-preview';

// Run history preview: the runs this browser started and saw end, newest first, until a server records
// runs. Stored as the schedule preview is.

export const RUN_HISTORY_STORAGE_KEY = 'rpcn-run-history-preview';

const MAX_RUNS_PER_PIPELINE = 50;
const runListSchema = z.array(pipelineRunSchema);
const NO_RUNS: PipelineRun[] = [];

// The stored map as written; undefined when storage can't be read at all.
function readRaw(): Record<string, unknown> | undefined {
  if (typeof window === 'undefined') {
    return;
  }
  let text: string | null;
  try {
    text = window.localStorage.getItem(RUN_HISTORY_STORAGE_KEY);
  } catch {
    return;
  }
  try {
    const parsed: unknown = JSON.parse(text ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readable(raw: Record<string, unknown>): Record<string, PipelineRun[]> {
  const runs: Record<string, PipelineRun[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    const result = runListSchema.safeParse(value);
    if (result.success && result.data.length > 0) {
      runs[key] = result.data;
    }
  }
  return runs;
}

function writeRaw(raw: Record<string, unknown>): void {
  try {
    window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(raw));
  } catch {
    // Storage is unavailable; the history lasts until the page reloads.
  }
}

/** A pipeline's runs from the store's `runs`, newest first. */
export const runsOf = (runs: Record<string, PipelineRun[]>, pipelineId: string): PipelineRun[] =>
  runs[pipelinePreviewKey(pipelineId)] ?? NO_RUNS;

type RunHistoryStore = {
  runs: Record<string, PipelineRun[]>;
  /** Records a run started from this browser, unless one is already going; `simulated` ones are never ended. */
  startManualRun: (pipelineId: string, options?: { now?: number; simulated?: boolean }) => void;
  /** Marks the run going as stopped from this browser, so it ends as stopped. */
  requestStop: (pipelineId: string) => void;
  /** Updates the run going from what the pipeline's state now shows. */
  observe: (pipelineId: string, seen: RunObservation, at: { now: number; updatedAt?: number }) => void;
  replaceRuns: (pipelineId: string, runs: PipelineRun[]) => void;
};

export const useRunHistoryStore = create<RunHistoryStore>()((set, get) => {
  // Each write re-reads storage first, as the schedule preview does; with storage unreadable, it builds on
  // what this page holds. An unchanged list writes nothing.
  const update = (pipelineId: string, change: (runs: PipelineRun[]) => PipelineRun[]) => {
    const key = pipelinePreviewKey(pipelineId);
    const raw = readRaw() ?? get().runs;
    const current = readable({ [key]: raw[key] })[key] ?? NO_RUNS;
    const next = change(current).slice(0, MAX_RUNS_PER_PIPELINE);
    if (next.length === current.length && next.every((run, i) => run === current[i])) {
      return;
    }
    const { [key]: _, ...rest } = raw;
    const nextRaw = next.length > 0 ? { ...rest, [key]: next } : rest;
    writeRaw(nextRaw);
    set({ runs: readable(nextRaw) });
  };
  return {
    runs: readable(readRaw() ?? {}),
    startManualRun: (pipelineId, { now = Date.now(), simulated }: { now?: number; simulated?: boolean } = {}) =>
      update(pipelineId, (runs) =>
        // One real run at a time; a simulated one going doesn't block it.
        runs.some((run) => run.outcome === 'running' && !run.simulated)
          ? runs
          : [{ id: `manual-${now}`, startTime: now, outcome: 'running', trigger: 'manual', simulated }, ...runs]
      ),
    requestStop: (pipelineId) =>
      update(pipelineId, (runs) =>
        runs.map((run) => (run.outcome === 'running' && !run.stopRequested ? { ...run, stopRequested: true } : run))
      ),
    observe: (pipelineId, seen, at) => update(pipelineId, (runs) => runs.map((run) => observeRun(run, seen, at))),
    replaceRuns: (pipelineId, runs) => update(pipelineId, () => runs),
  };
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    const raw = event.key === RUN_HISTORY_STORAGE_KEY || event.key === null ? readRaw() : undefined;
    if (raw) {
      useRunHistoryStore.setState({ runs: readable(raw) });
    }
  });
}

export const usePipelineRuns = (pipelineId: string): PipelineRun[] =>
  useRunHistoryStore((s) => runsOf(s.runs, pipelineId));
