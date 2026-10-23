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

import { sampleRuns } from './sample-runs';
import { describe, expect, test } from 'bun:test';
import { RUN_OUTCOMES, runTally } from '../pages/rp-connect/utils/pipeline-runs';

const NOW = Date.parse('2026-10-23T15:00:00Z');

describe('sampleRuns', () => {
  test('shows every outcome, newest first, and is never ended by a pipeline’s real state', () => {
    const runs = sampleRuns(NOW);
    expect(new Set(runs.map((run) => run.outcome))).toEqual(new Set(RUN_OUTCOMES));
    expect(runs.map((run) => run.startTime)).toEqual([...runs.map((run) => run.startTime)].sort((a, b) => b - a));
    expect(runs.every((run) => run.simulated)).toBe(true);
    expect(new Set(runs.map((run) => run.trigger))).toEqual(new Set(['schedule', 'manual']));
    expect(runTally(runs)).toEqual({ completed: 3, ended: 7 });
  });
});
