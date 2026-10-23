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

import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useEffect } from 'react';
import { runsOf, useRunHistoryStore } from 'state/rpcn-run-history-preview';

import { hasOpenRun, isWatchingRun, type RunObservation } from '../utils/pipeline-runs';

const OBSERVATION: Partial<Record<Pipeline_State, RunObservation>> = {
  [Pipeline_State.STARTING]: 'active',
  [Pipeline_State.RUNNING]: 'active',
  [Pipeline_State.STOPPED]: 'stopped',
  [Pipeline_State.COMPLETED]: 'stopped',
  [Pipeline_State.ERROR]: 'error',
};

/** What a pipeline's state says about the run going. */
export const runObservation = (state: Pipeline_State | undefined): RunObservation =>
  (state === undefined ? undefined : OBSERVATION[state]) ?? 'other';

/** Whether this browser has a run of the pipeline going that is still worth polling for. */
export function useWatchingRun(pipelineId: string | undefined): boolean {
  const runs = useRunHistoryStore((s) => (pipelineId ? runsOf(s.runs, pipelineId) : undefined));
  return runs ? isWatchingRun(runs, Date.now()) : false;
}

/** Updates this browser's open run of a pipeline from its state as fetched at `fetchedAt`, and ends it once it's over. */
export function useRunObserver(pipelineId: string | undefined, state: Pipeline_State | undefined, fetchedAt: number) {
  const watching = useRunHistoryStore((s) => (pipelineId ? hasOpenRun(runsOf(s.runs, pipelineId)) : false));
  const observe = useRunHistoryStore((s) => s.observe);
  useEffect(() => {
    if (pipelineId && watching && fetchedAt > 0) {
      observe(pipelineId, runObservation(state), fetchedAt);
    }
  }, [pipelineId, watching, state, fetchedAt, observe]);
}

/**
 * `useRunObserver` for a list of pipelines fetched at `fetchedAt`; returns whether one of them has a run
 * going that is still worth polling for.
 */
export function useRunsObserver(
  pipelines: { id: string; state: Pipeline_State | undefined }[],
  fetchedAt: number
): boolean {
  const runs = useRunHistoryStore((s) => s.runs);
  const observe = useRunHistoryStore((s) => s.observe);
  useEffect(() => {
    if (fetchedAt === 0) {
      return;
    }
    for (const pipeline of pipelines) {
      if (hasOpenRun(runsOf(runs, pipeline.id))) {
        observe(pipeline.id, runObservation(pipeline.state), fetchedAt);
      }
    }
  }, [pipelines, fetchedAt, runs, observe]);
  const now = Date.now();
  return pipelines.some((pipeline) => isWatchingRun(runsOf(runs, pipeline.id), now));
}
