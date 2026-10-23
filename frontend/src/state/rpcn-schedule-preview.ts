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

import { type PipelineSchedule, pipelineScheduleSchema } from 'components/pages/rp-connect/utils/pipeline-schedule';
import { config } from 'config';
import { create } from 'zustand';

// Scheduling preview: schedules live in this browser only, until the dataplane has a schedule API.

export const SCHEDULE_PREVIEW_STORAGE_KEY = 'rpcn-schedule-preview';

/** A pipeline's key in the browser's preview stores: its cluster, then its id. */
export const pipelinePreviewKey = (pipelineId: string): string => `${config.clusterId || 'default'}/${pipelineId}`;
const scheduleKey = pipelinePreviewKey;

// The stored map as written, entries this version can't read included, so a save never drops them.
// Undefined when storage can't be read at all.
function readRaw(): Record<string, unknown> | undefined {
  if (typeof window === 'undefined') {
    return;
  }
  let text: string | null;
  try {
    text = window.localStorage.getItem(SCHEDULE_PREVIEW_STORAGE_KEY);
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

function readable(raw: Record<string, unknown>): Record<string, PipelineSchedule> {
  const schedules: Record<string, PipelineSchedule> = {};
  for (const [key, value] of Object.entries(raw)) {
    const result = pipelineScheduleSchema.safeParse(value);
    if (result.success) {
      schedules[key] = result.data;
    }
  }
  return schedules;
}

function writeRaw(raw: Record<string, unknown>): void {
  try {
    window.localStorage.setItem(SCHEDULE_PREVIEW_STORAGE_KEY, JSON.stringify(raw));
  } catch {
    // Storage is unavailable; the schedule lasts until the page reloads.
  }
}

type SchedulePreviewStore = {
  schedules: Record<string, PipelineSchedule>;
  saveSchedule: (pipelineId: string, schedule: PipelineSchedule) => void;
  removeSchedule: (pipelineId: string) => void;
};

// Each write re-reads storage first, so a schedule another tab saved meanwhile is kept. With storage
// unreadable, it builds on the schedules this page holds.
export const useSchedulePreviewStore = create<SchedulePreviewStore>()((set, get) => ({
  schedules: readable(readRaw() ?? {}),
  saveSchedule: (pipelineId, schedule) => {
    const raw = { ...(readRaw() ?? get().schedules), [scheduleKey(pipelineId)]: schedule };
    writeRaw(raw);
    set({ schedules: readable(raw) });
  },
  removeSchedule: (pipelineId) => {
    const { [scheduleKey(pipelineId)]: _, ...raw } = readRaw() ?? get().schedules;
    writeRaw(raw);
    set({ schedules: readable(raw) });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    const raw = event.key === SCHEDULE_PREVIEW_STORAGE_KEY || event.key === null ? readRaw() : undefined;
    if (raw) {
      useSchedulePreviewStore.setState({ schedules: readable(raw) });
    }
  });
}

/** The schedule saved for `pipelineId`, from the store's `schedules`. */
export const scheduleOf = (
  schedules: Record<string, PipelineSchedule>,
  pipelineId: string
): PipelineSchedule | undefined => schedules[scheduleKey(pipelineId)];

export const usePipelineSchedule = (pipelineId: string | undefined): PipelineSchedule | undefined =>
  useSchedulePreviewStore((s) => (pipelineId ? s.schedules[scheduleKey(pipelineId)] : undefined));
