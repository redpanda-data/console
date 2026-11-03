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
import { isFeatureFlagEnabled } from 'config';
import { create } from 'zustand';

import {
  onPreviewMapChange,
  pipelinePreviewKey,
  readableEntries,
  readPreviewMap,
  writePreviewMap,
} from './preview-storage';

// Scheduling preview: schedules live in this browser only, until the dataplane has a schedule API.

export const SCHEDULE_PREVIEW_STORAGE_KEY = 'rpcn-schedule-preview';

export const areSchedulesEnabled = (): boolean => isFeatureFlagEnabled('enableRpcnPipelineSchedules');

const read = () => readPreviewMap(SCHEDULE_PREVIEW_STORAGE_KEY);
const readable = (map: Record<string, unknown>) => readableEntries(map, pipelineScheduleSchema);

type SchedulePreviewStore = {
  schedules: Record<string, PipelineSchedule>;
  saveSchedule: (pipelineId: string, schedule: PipelineSchedule) => void;
  removeSchedule: (pipelineId: string) => void;
};

// Each write re-reads storage first, so a schedule another tab saved meanwhile is kept. With storage
// unreadable, it builds on the schedules this page holds.
export const useSchedulePreviewStore = create<SchedulePreviewStore>()((set, get) => {
  const write = (map: Record<string, unknown>) => {
    writePreviewMap(SCHEDULE_PREVIEW_STORAGE_KEY, map);
    set({ schedules: readable(map) });
  };
  return {
    schedules: readable(read() ?? {}),
    saveSchedule: (pipelineId, schedule) =>
      write({ ...(read() ?? get().schedules), [pipelinePreviewKey(pipelineId)]: schedule }),
    removeSchedule: (pipelineId) => {
      const { [pipelinePreviewKey(pipelineId)]: _, ...rest } = read() ?? get().schedules;
      write(rest);
    },
  };
});

onPreviewMapChange(SCHEDULE_PREVIEW_STORAGE_KEY, (map) =>
  useSchedulePreviewStore.setState({ schedules: readable(map) })
);

/** The schedule saved for `pipelineId`, from the store's `schedules`. */
export const scheduleOf = (
  schedules: Record<string, PipelineSchedule>,
  pipelineId: string
): PipelineSchedule | undefined => schedules[pipelinePreviewKey(pipelineId)];

export const usePipelineSchedule = (pipelineId: string | undefined): PipelineSchedule | undefined =>
  useSchedulePreviewStore((s) => (pipelineId ? s.schedules[pipelinePreviewKey(pipelineId)] : undefined));
