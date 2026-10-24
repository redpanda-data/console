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
  pipelineRunSchema,
  type RunObservation,
} from 'components/pages/rp-connect/utils/pipeline-runs';
import { z } from 'zod';
import { create } from 'zustand';

import {
  onPreviewMapChange,
  pipelinePreviewKey,
  readableEntries,
  readPreviewMap,
  writePreviewMap,
} from './preview-storage';

// Run history preview: the runs this browser started and saw end, newest first, until a server records
// runs.

export const RUN_HISTORY_STORAGE_KEY = 'rpcn-run-history-preview';

const MAX_RUNS_PER_PIPELINE = 50;
const runListSchema = z.array(pipelineRunSchema);
const NO_RUNS: PipelineRun[] = [];

const read = () => readPreviewMap(RUN_HISTORY_STORAGE_KEY);
const readable = (map: Record<string, unknown>) => readableEntries(map, runListSchema, (runs) => runs.length > 0);

/** A pipeline's runs from the store's `runs`, newest first. */
export const runsOf = (runs: Record<string, PipelineRun[]>, pipelineId: string): PipelineRun[] =>
  runs[pipelinePreviewKey(pipelineId)] ?? NO_RUNS;

type RunHistoryStore = {
  runs: Record<string, PipelineRun[]>;
  /** Records a run started from this browser, unless one is already going; `simulated` ones are never ended. */
  startManualRun: (pipelineId: string, options?: { now?: number; simulated?: boolean }) => void;
  /** Marks the run going as stopped from this browser, so it ends as stopped. */
  requestStop: (pipelineId: string) => void;
  /** Updates the run going from what the pipeline's state shows at `now`. */
  observe: (pipelineId: string, seen: RunObservation, now: number) => void;
  replaceRuns: (pipelineId: string, runs: PipelineRun[]) => void;
};

export const useRunHistoryStore = create<RunHistoryStore>()((set, get) => {
  // Each write re-reads storage first, as the schedule preview does; with storage unreadable, it builds on
  // what this page holds. An unchanged list writes nothing.
  const update = (pipelineId: string, change: (runs: PipelineRun[]) => PipelineRun[]) => {
    const key = pipelinePreviewKey(pipelineId);
    const raw = read() ?? get().runs;
    const current = readable({ [key]: raw[key] })[key] ?? NO_RUNS;
    const next = change(current).slice(0, MAX_RUNS_PER_PIPELINE);
    if (next.length === current.length && next.every((run, i) => run === current[i])) {
      return;
    }
    const { [key]: _, ...rest } = raw;
    const nextRaw = next.length > 0 ? { ...rest, [key]: next } : rest;
    writePreviewMap(RUN_HISTORY_STORAGE_KEY, nextRaw);
    set({ runs: readable(nextRaw) });
  };
  return {
    runs: readable(read() ?? {}),
    startManualRun: (pipelineId, { now = Date.now(), simulated }: { now?: number; simulated?: boolean } = {}) =>
      update(pipelineId, (runs) =>
        // One real run at a time; a simulated one going doesn't block it.
        hasOpenRun(runs)
          ? runs
          : [{ id: `manual-${now}`, startTime: now, outcome: 'running', trigger: 'manual', simulated }, ...runs]
      ),
    requestStop: (pipelineId) =>
      update(pipelineId, (runs) =>
        runs.map((run) => (run.outcome === 'running' && !run.stopRequested ? { ...run, stopRequested: true } : run))
      ),
    observe: (pipelineId, seen, now) => update(pipelineId, (runs) => runs.map((run) => observeRun(run, seen, now))),
    replaceRuns: (pipelineId, runs) => update(pipelineId, () => runs),
  };
});

onPreviewMapChange(RUN_HISTORY_STORAGE_KEY, (map) => useRunHistoryStore.setState({ runs: readable(map) }));

export const usePipelineRuns = (pipelineId: string): PipelineRun[] =>
  useRunHistoryStore((s) => runsOf(s.runs, pipelineId));
