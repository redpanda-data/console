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

import { compareSchedules, type PipelineRow, soonestRun, withSchedules } from './list-row';
import { describe, expect, test } from 'bun:test';
import type { PipelineEndStatus } from '../utils/input-end-behavior';
import { defaultSchedule, type PipelineSchedule } from '../utils/pipeline-schedule';

const NOW = Date.parse('2026-10-22T12:00:00Z');

const row = (id: string, end: PipelineEndStatus = 'finite'): PipelineRow => ({
  id,
  name: id,
  description: '',
  state: Pipeline_State.STOPPED,
  inputs: [],
  outputs: [],
  tags: [],
  isDraft: false,
  editedAt: null,
  configYaml: '',
  computeUnits: 0,
  end,
});

const daily = (time: string, enabled = true): PipelineSchedule => ({
  ...defaultSchedule('UTC', NOW),
  enabled,
  time,
});

describe('withSchedules', () => {
  test('joins each row with its schedule: what it does now, and its next run while active', () => {
    const schedules: Record<string, PipelineSchedule> = {
      nightly: daily('02:00'),
      paused: daily('02:00', false),
      endless: daily('02:00'),
    };
    const rows = [row('nightly'), row('paused'), row('endless', 'continuous'), row('plain')];
    const [nightly, paused, endless, plain] = withSchedules(rows, (id) => schedules[id], NOW);

    expect(nightly.schedule).toMatchObject({ state: 'active', nextRun: Date.parse('2026-10-23T02:00:00Z') });
    expect(paused.schedule).toMatchObject({ state: 'paused', nextRun: undefined });
    expect(endless.schedule).toMatchObject({ state: 'on-hold', nextRun: undefined });
    // A row without a schedule comes back as the same object, so its cells don't re-render.
    expect(plain).toBe(rows[3]);
  });
});

describe('the Schedule order', () => {
  test('puts the soonest run first, then on hold, paused, and rows without a schedule', () => {
    const schedules: Record<string, PipelineSchedule> = {
      late: daily('20:00'),
      soon: daily('13:00'),
      paused: daily('13:00', false),
      held: daily('13:00'),
    };
    const rows = withSchedules(
      [row('plain'), row('paused'), row('late'), row('held', 'unknown'), row('soon')],
      (id) => schedules[id],
      NOW
    );
    expect([...rows].sort(compareSchedules).map((r) => r.id)).toEqual(['soon', 'late', 'held', 'paused', 'plain']);
    expect(soonestRun(rows)).toBe(Date.parse('2026-10-22T13:00:00Z'));
    expect(soonestRun([row('plain')])).toBeUndefined();
  });
});
