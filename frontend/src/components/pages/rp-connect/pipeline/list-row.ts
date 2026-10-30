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

import { getUserTagEntries } from 'components/constants';
import type { Pipeline as APIPipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { parseConfigComponentsCached } from './config-components-cache';
import { isDraft, timestampToMillis } from './draft-copy';
import { cpuToTasks } from '../tasks';
import type { PipelineEndStatus } from '../utils/input-end-behavior';
import { nextRuns, type PipelineSchedule, type ScheduleState, scheduleState } from '../utils/pipeline-schedule';

export type TagPair = { key: string; value: string };

/** A row's schedule as the list reads it: what it does now, and when it runs next. */
export type RowSchedule = { schedule: PipelineSchedule; state: ScheduleState; nextRun?: number };

export type PipelineRow = {
  id: string;
  name: string;
  description: string;
  state: Pipeline_State;
  inputs: string[];
  outputs: string[];
  tags: TagPair[];
  isDraft: boolean;
  /** Epoch ms of the last edit. */
  editedAt: number | null;
  /** Empty on a deployed row: only a draft opens the start confirmation, which names these. */
  configYaml: string;
  computeUnits: number;
  /** Whether it stops on its own — what a schedule will need. */
  end: PipelineEndStatus;
  /** Set when this browser holds a schedule for it. */
  schedule?: RowSchedule;
};

export const toPipelineRow = (apiPipeline: APIPipeline): PipelineRow => {
  const { inputs, outputs, end } = parseConfigComponentsCached(apiPipeline.configYaml);
  const tags = getUserTagEntries(apiPipeline.tags);
  const draft = isDraft(apiPipeline);
  return {
    id: apiPipeline.id,
    name: apiPipeline.displayName,
    description: apiPipeline.description,
    state: apiPipeline.state,
    inputs,
    outputs,
    tags,
    isDraft: draft,
    editedAt: timestampToMillis(apiPipeline.updateTime),
    configYaml: draft ? apiPipeline.configYaml : '',
    computeUnits: draft ? (cpuToTasks(apiPipeline.resources?.cpuShares) ?? 0) : 0,
    end,
  };
};

// One string per tag pair, so `arrIncludesSome` and the facet counts agree on the value.
export const tagFilterValue = (tag: TagPair) => `${tag.key}:${tag.value}`;

/** `rows` with their schedules joined in, as of `now`; a row without one comes back as is. */
export function withSchedules(
  rows: PipelineRow[],
  scheduleFor: (pipelineId: string) => PipelineSchedule | undefined,
  now: number
): PipelineRow[] {
  return rows.map((row) => {
    const schedule = scheduleFor(row.id);
    if (!schedule) {
      return row;
    }
    const state = scheduleState(schedule, { status: row.end });
    const [nextRun] = state === 'active' ? nextRuns(schedule, now) : [];
    return { ...row, schedule: { schedule, state, nextRun } };
  });
}

// The soonest run first; then schedules on hold, which need a fix; then paused ones; then none.
const SCHEDULE_RANK: Record<ScheduleState | 'none', number> = { active: 0, 'on-hold': 1, paused: 2, none: 3 };

/** The Schedule column's order. */
export function compareSchedules(a: PipelineRow, b: PipelineRow): number {
  const byState = SCHEDULE_RANK[a.schedule?.state ?? 'none'] - SCHEDULE_RANK[b.schedule?.state ?? 'none'];
  if (byState !== 0) {
    return byState;
  }
  return (a.schedule?.nextRun ?? Number.MAX_SAFE_INTEGER) - (b.schedule?.nextRun ?? Number.MAX_SAFE_INTEGER);
}

/** The soonest next run across the rows: when the list's schedules next move on. */
export function soonestRun(rows: PipelineRow[]): number | undefined {
  let soonest: number | undefined;
  for (const row of rows) {
    const next = row.schedule?.nextRun;
    if (next !== undefined && (soonest === undefined || next < soonest)) {
      soonest = next;
    }
  }
  return soonest;
}
