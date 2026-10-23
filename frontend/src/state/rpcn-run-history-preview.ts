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
  withStartedRun,
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

// A pipeline's runs in the stored map; undefined when this version can't read them.
const storedRuns = (raw: Record<string, unknown>, key: string): PipelineRun[] | undefined => {
  const parsed = runListSchema.safeParse(raw[key] ?? NO_RUNS);
  return parsed.success ? parsed.data : undefined;
};

// Stores a pipeline's runs, with no entry for none; returns the map written.
const writeRuns = (raw: Record<string, unknown>, key: string, runs: PipelineRun[]): Record<string, unknown> => {
  const { [key]: _, ...rest } = raw;
  const next = runs.length > 0 ? { ...rest, [key]: runs } : rest;
  writePreviewMap(RUN_HISTORY_STORAGE_KEY, next);
  return next;
};

/** A pipeline's runs from the store's `runs`, newest first. */
export const runsOf = (runs: Record<string, PipelineRun[]>, pipelineId: string): PipelineRun[] =>
  runs[pipelinePreviewKey(pipelineId)] ?? NO_RUNS;

type RunHistoryStore = {
  runs: Record<string, PipelineRun[]>;
  /**
   * Records a run started from this browser, unless one seen active and not asked to stop is going; a
   * start ends any other. `simulated` ones are never ended.
   */
  startManualRun: (pipelineId: string, options?: { now?: number; simulated?: boolean }) => void;
  /** Marks the run going as stopped from this browser, so it ends as stopped. */
  requestStop: (pipelineId: string) => void;
  /** Updates the run going from what the pipeline's state showed when fetched at `fetchedAt`. */
  observe: (pipelineId: string, seen: RunObservation, fetchedAt: number) => void;
  replaceRuns: (pipelineId: string, runs: PipelineRun[]) => void;
};

export const useRunHistoryStore = create<RunHistoryStore>()((set, get) => {
  // Each write re-reads storage first, as the schedule preview does; with storage unreadable, it builds on
  // what this page holds. An unchanged list writes nothing, and one this version can't read is left as is.
  const update = (pipelineId: string, change: (runs: PipelineRun[]) => PipelineRun[]) => {
    const key = pipelinePreviewKey(pipelineId);
    const raw = read() ?? get().runs;
    const current = storedRuns(raw, key);
    if (!current) {
      return;
    }
    const next = change(current).slice(0, MAX_RUNS_PER_PIPELINE);
    if (next.length === current.length && next.every((run, i) => run === current[i])) {
      return;
    }
    set({ runs: readable(writeRuns(raw, key, next)) });
  };
  // When this page last saw each pipeline active, which dates a run's end only if it's recent, and errored,
  // which says a run a new start ends had failed.
  const lastActive = new Map<string, number>();
  const lastError = new Map<string, number>();
  const sighted = (sightings: Map<string, number>, key: string, at: number) =>
    sightings.set(key, Math.max(at, sightings.get(key) ?? 0));
  return {
    runs: readable(read() ?? {}),
    startManualRun: (pipelineId, { now = Date.now(), simulated }: { now?: number; simulated?: boolean } = {}) =>
      update(pipelineId, (runs) =>
        withStartedRun(runs, { now, simulated }, lastError.get(pipelinePreviewKey(pipelineId)))
      ),
    requestStop: (pipelineId) =>
      update(pipelineId, (runs) =>
        runs.map((run) => (run.outcome === 'running' && !run.stopRequested ? { ...run, stopRequested: true } : run))
      ),
    observe: (pipelineId, seen, fetchedAt) => {
      const key = pipelinePreviewKey(pipelineId);
      if (seen === 'active') {
        sighted(lastActive, key, fetchedAt);
      }
      if (seen === 'error') {
        sighted(lastError, key, fetchedAt);
      }
      update(pipelineId, (runs) => runs.map((run) => observeRun(run, seen, fetchedAt, lastActive.get(key))));
    },
    replaceRuns: (pipelineId, runs) => update(pipelineId, () => runs),
  };
});

onPreviewMapChange(RUN_HISTORY_STORAGE_KEY, (map) => useRunHistoryStore.setState({ runs: readable(map) }));

export const usePipelineRuns = (pipelineId: string): PipelineRun[] =>
  useRunHistoryStore((s) => runsOf(s.runs, pipelineId));
