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

import { cn } from 'components/redpanda-ui/lib/utils';
import { CalendarDays, Clock, type LucideIcon, Repeat } from 'lucide-react';

import {
  describeWeekdays,
  type PipelineSchedule,
  runTimeParts,
  type ScheduleCadence,
  scheduleGlanceText,
  scheduleWeekdays,
  WEEKDAY_ORDER,
  weekdayName,
} from '../utils/pipeline-schedule';

// A schedule's look wherever it's shown (the list, the headers, the Runs panel, the dialog): a strip
// of weekdays for a day-based cadence, otherwise an icon for the kind of cadence.

/** The days a schedule runs on, Monday first: each day's initial, filled on a run day. */
function WeekdayStrip({ days, muted = false }: { days: number[]; muted?: boolean }) {
  return (
    <span aria-label={`On ${describeWeekdays(days)}`} className="inline-flex shrink-0 gap-px" role="img">
      {WEEKDAY_ORDER.map((day) => {
        const on = days.includes(day);
        return (
          <span
            aria-hidden
            className={cn(
              'flex size-4 items-center justify-center rounded-[3px] font-semibold text-2xs leading-none',
              on && !muted && 'bg-primary/15 text-primary',
              on && muted && 'bg-muted text-muted-foreground',
              !on && 'text-muted-foreground/40'
            )}
            key={day}
          >
            {weekdayName(day, 'short').charAt(0)}
          </span>
        );
      })}
    </span>
  );
}

const CADENCE_ICON: Partial<Record<ScheduleCadence, LucideIcon>> = {
  hourly: Clock,
  monthly: CalendarDays,
  custom: Repeat,
};

/** A schedule at a glance: its weekday strip and time, or its cadence. */
export function ScheduleGlance({ schedule, muted = false }: { schedule: PipelineSchedule; muted?: boolean }) {
  const days = scheduleWeekdays(schedule);
  const Icon = CADENCE_ICON[schedule.cadence];
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {days ? <WeekdayStrip days={days} muted={muted} /> : null}
      {!days && Icon ? <Icon aria-hidden className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{scheduleGlanceText(schedule)}</span>
    </span>
  );
}

/** The next runs as day tiles; the first carries `soonLabel` ("in 18h"). Dimmed while the schedule is off. */
export function UpcomingRunTiles({
  runs,
  timeZone,
  label,
  soonLabel,
  dimmed = false,
}: {
  runs: number[];
  timeZone: string;
  /** The list's accessible name. */
  label: string;
  soonLabel?: string;
  dimmed?: boolean;
}) {
  return (
    <ul aria-label={label} className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2">
      {runs.map((run, i) => {
        const { weekday, date, time, zone } = runTimeParts(run, timeZone);
        const soon = i === 0 && !dimmed && soonLabel;
        return (
          <li
            className={cn(
              'flex flex-col rounded-md border px-3 py-2',
              soon ? 'border-primary/40 bg-primary/5' : 'border-border',
              dimmed && 'text-muted-foreground'
            )}
            key={run}
          >
            <span className="font-medium text-2xs text-muted-foreground uppercase tracking-wide">{weekday}</span>
            <span className="font-medium text-body">{date}</span>
            <span className="text-body-sm text-muted-foreground">
              {time} {zone}
            </span>
            {soon ? <span className="mt-0.5 font-medium text-body-sm text-primary">{soonLabel}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
