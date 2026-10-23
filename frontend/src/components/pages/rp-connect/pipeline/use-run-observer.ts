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

import type { RunObservation } from '../utils/pipeline-runs';

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

/** Updates this browser's open run of a pipeline from its state, and ends it once the state shows it's over. */
export function useRunObserver(
  pipelineId: string | undefined,
  state: Pipeline_State | undefined,
  /** Epoch ms of the pipeline's last change. */
  updatedAt: number | null
) {
  const hasOpenRun = useRunHistoryStore((s) =>
    pipelineId ? runsOf(s.runs, pipelineId).some((run) => run.outcome === 'running' && !run.simulated) : false
  );
  const observe = useRunHistoryStore((s) => s.observe);
  useEffect(() => {
    if (pipelineId && hasOpenRun) {
      observe(pipelineId, runObservation(state), { now: Date.now(), updatedAt: updatedAt ?? undefined });
    }
  }, [pipelineId, hasOpenRun, state, updatedAt, observe]);
}
