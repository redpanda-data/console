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
  browserTimeZone,
  describeWeekdays,
  type PipelineSchedule,
  runTimeParts,
  type ScheduleCadence,
  scheduleGlanceText,
  scheduleWeekdays,
  WEEKDAY_ORDER,
  weekdayName,
  zoneAbbreviation,
} from '../utils/pipeline-schedule';

// A schedule's look wherever it's shown (the list, the headers, the Runs panel, the dialog): a strip
// of weekdays for a day-based cadence, otherwise an icon for the kind of cadence.

function weekdaysLabel(days: number[]): string {
  if (days.length === 7) {
    return 'Every day';
  }
  return days.length === 5 && days.every((day) => day >= 1 && day <= 5) ? 'Weekdays' : `On ${describeWeekdays(days)}`;
}

/** The days a schedule runs on, Monday first: each day's initial, filled on a run day. */
function WeekdayStrip({ days, muted = false }: { days: number[]; muted?: boolean }) {
  return (
    <span aria-label={weekdaysLabel(days)} className="inline-flex shrink-0 gap-px" role="img">
      {WEEKDAY_ORDER.map((day) => {
        const on = days.includes(day);
        return (
          <span
            aria-hidden
            className={cn(
              'flex size-4 items-center justify-center rounded-xs text-2xs leading-none font-semibold',
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

// A time of day reads in the schedule's zone, so one that isn't the viewer's is named.
function glanceZone(schedule: PipelineSchedule): string | undefined {
  const timeOfDay =
    schedule.cadence !== 'hourly' && !(schedule.cadence === 'custom' && ['minutes', 'hours'].includes(schedule.unit));
  return timeOfDay && schedule.timeZone !== browserTimeZone()
    ? zoneAbbreviation(Date.now(), schedule.timeZone)
    : undefined;
}

/** A schedule at a glance: its weekday strip and time, or its cadence. */
export function ScheduleGlance({ schedule, muted = false }: { schedule: PipelineSchedule; muted?: boolean }) {
  const days = scheduleWeekdays(schedule);
  const Icon = CADENCE_ICON[schedule.cadence];
  const zone = glanceZone(schedule);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {days ? <WeekdayStrip days={days} muted={muted} /> : null}
      {!days && Icon ? <Icon aria-hidden className="size-3.5 shrink-0" /> : null}
      <span className="truncate">
        {scheduleGlanceText(schedule)}
        {zone ? ` ${zone}` : null}
      </span>
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
            <span className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">{weekday}</span>
            <span className="text-body font-medium">{date}</span>
            <span className="text-body-sm text-muted-foreground">
              {time} {zone}
            </span>
            {soon ? <span className="mt-0.5 text-body-sm font-medium text-primary">{soonLabel}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
