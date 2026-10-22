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

import { z } from 'zod';

import type { PipelineEndStatus } from './input-end-behavior';

export const SCHEDULE_CADENCES = ['hourly', 'daily', 'weekdays', 'weekly', 'monthly', 'custom'] as const;
export type ScheduleCadence = (typeof SCHEDULE_CADENCES)[number];

export const INTERVAL_UNITS = ['minutes', 'hours', 'days', 'weeks'] as const;
export type IntervalUnit = (typeof INTERVAL_UNITS)[number];

export const RUNTIME_UNITS = ['minutes', 'hours'] as const;
export type RuntimeUnit = (typeof RUNTIME_UNITS)[number];

/** Runs closer together than this belong in a pipeline that runs continuously. */
export const MIN_INTERVAL_MINUTES = 15;
/** A year: anything rarer is a one-off, not a schedule. */
export const MAX_INTERVAL_MINUTES = 525_600;
/** 30 days. */
export const MAX_RUNTIME_MINUTES = 43_200;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const UNIT_MINUTES: Record<IntervalUnit, number> = { minutes: 1, hours: 60, days: 1440, weeks: 10_080 };

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PLURAL_S = /s$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    // Throws a RangeError for a zone it doesn't know.
    return Boolean(new Intl.DateTimeFormat('en-US', { timeZone }));
  } catch {
    return false;
  }
};

// An empty number field holds NaN; fields the cadence doesn't use are only checked when it does.
const formNumber = z.custom<number>((value) => typeof value === 'number');

// Why a whole-number field is invalid, if it is.
function wholeNumberIssue(value: number): string | undefined {
  if (!Number.isFinite(value)) {
    return 'Enter a number.';
  }
  if (!Number.isInteger(value)) {
    return 'Enter a whole number.';
  }
  return value < 1 ? 'Enter 1 or more.' : undefined;
}

function intervalIssue(value: { every: number; unit: IntervalUnit }): string | undefined {
  const minutes = value.every * UNIT_MINUTES[value.unit];
  if (minutes < MIN_INTERVAL_MINUTES) {
    return `Runs must be at least ${MIN_INTERVAL_MINUTES} minutes apart.`;
  }
  return minutes > MAX_INTERVAL_MINUTES ? 'Runs must be at most a year apart.' : undefined;
}

export const pipelineScheduleSchema = z
  .object({
    /** Off keeps the settings without running them. */
    enabled: z.boolean(),
    cadence: z.enum(SCHEDULE_CADENCES),
    /** Local start time, `HH:MM`; hourly runs use only its minutes. */
    time: z.string().regex(TIME_PATTERN, 'Enter a time such as 02:00.'),
    /** 0 = Sunday … 6 = Saturday. */
    weekdays: z.array(z.number().int().min(0).max(6)),
    /** Months without this day run on their last day. */
    dayOfMonth: z.number().int().min(1).max(31),
    every: formNumber,
    unit: z.enum(INTERVAL_UNITS),
    /** `YYYY-MM-DD`: the first custom run. */
    startDate: z.string(),
    timeZone: z.string().refine(isValidTimeZone, 'Choose a time zone.'),
    limitRuntime: z.boolean(),
    maxRuntime: formNumber,
    maxRuntimeUnit: z.enum(RUNTIME_UNITS),
  })
  .superRefine((value, ctx) => {
    const issue = (path: string, message: string | undefined) => {
      if (message) {
        ctx.addIssue({ code: 'custom', path: [path], message });
      }
    };
    if (value.cadence === 'weekly' && value.weekdays.length === 0) {
      issue('weekdays', 'Choose at least one day.');
    }
    if (value.cadence === 'custom') {
      issue('every', wholeNumberIssue(value.every) ?? intervalIssue(value));
      issue('startDate', parseDate(value.startDate) ? undefined : 'Choose a start date.');
    }
    if (value.limitRuntime) {
      const limit = value.maxRuntime * (value.maxRuntimeUnit === 'hours' ? 60 : 1);
      issue(
        'maxRuntime',
        wholeNumberIssue(value.maxRuntime) ?? (limit > MAX_RUNTIME_MINUTES ? 'Keep it to 30 days or less.' : undefined)
      );
    }
  });

export type PipelineSchedule = z.infer<typeof pipelineScheduleSchema>;

/** The schedule as saved: fields the cadence doesn't use are reset, so stale values never block a later save. */
export function normalizeSchedule(schedule: PipelineSchedule, now: number = Date.now()): PipelineSchedule {
  const fallback = defaultSchedule(schedule.timeZone, now);
  const custom = schedule.cadence === 'custom';
  return {
    ...schedule,
    every: custom ? schedule.every : fallback.every,
    unit: custom ? schedule.unit : fallback.unit,
    startDate: custom ? schedule.startDate : fallback.startDate,
    weekdays: schedule.cadence === 'weekly' ? schedule.weekdays : fallback.weekdays,
    maxRuntime: schedule.limitRuntime ? schedule.maxRuntime : fallback.maxRuntime,
    maxRuntimeUnit: schedule.limitRuntime ? schedule.maxRuntimeUnit : fallback.maxRuntimeUnit,
  };
}

export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

type CalendarDate = { year: number; month: number; day: number };
type WallTime = CalendarDate & { hour: number; minute: number };

function parseDate(value: string): CalendarDate | undefined {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return;
  }
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const probe = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return probe.getUTCMonth() === date.month - 1 && probe.getUTCDate() === date.day ? date : undefined;
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = TIME_PATTERN.exec(value);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : { hour: 0, minute: 0 };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(instant: number, timeZone: string): WallTime & { second: number } {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

const wallMs = (t: WallTime) => Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute);

function offsetAt(instant: number, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant a wall-clock time happens in a zone. A time a DST change repeats takes its first
 * occurrence; one a change skips moves past the gap (02:30 becomes 03:30).
 */
export function zonedTimeToInstant(time: WallTime, timeZone: string): number {
  const wall = wallMs(time);
  // The offsets either side of any change near this time.
  const before = wall - offsetAt(wall - DAY_MS, timeZone);
  const after = wall - offsetAt(wall + DAY_MS, timeZone);
  const valid = [before, after].filter((at) => wallMs(zonedParts(at, timeZone)) === wall);
  return valid.length > 0 ? Math.min(...valid) : before;
}

const wallOf = (ms: number): WallTime => {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
};

// Runs every `stepMinutes` of wall-clock time from `anchor`, so they keep their local time across DST;
// a step a change folds onto an earlier run is dropped.
type Steps = { anchor: WallTime; stepMinutes: number; timeZone: string };

function steppedRuns({ anchor, stepMinutes, timeZone }: Steps, from: number, count: number): number[] {
  const stepMs = stepMinutes * MINUTE_MS;
  const anchorWall = wallMs(anchor);
  const fromWall = wallMs(zonedParts(from, timeZone));
  let k = Math.max(0, Math.floor((fromWall - anchorWall) / stepMs) - 1);
  const runs: number[] = [];
  for (let tries = 0; runs.length < count && tries < count * 4 + 8; tries += 1, k += 1) {
    const at = zonedTimeToInstant(wallOf(anchorWall + k * stepMs), timeZone);
    if (at > from && at > (runs.at(-1) ?? Number.NEGATIVE_INFINITY)) {
      runs.push(at);
    }
  }
  return runs;
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const weekdayOf = (date: CalendarDate) => new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
const daysInMonth = (date: CalendarDate) => new Date(Date.UTC(date.year, date.month, 0)).getUTCDate();

function runsOnDay(schedule: PipelineSchedule, date: CalendarDate): boolean {
  switch (schedule.cadence) {
    case 'weekdays': {
      const day = weekdayOf(date);
      return day >= 1 && day <= 5;
    }
    case 'weekly':
      return schedule.weekdays.includes(weekdayOf(date));
    case 'monthly':
      return date.day === Math.min(schedule.dayOfMonth, daysInMonth(date));
    default:
      return true;
  }
}

// Monthly needs at most a few months to find its runs; the bound only guards a schedule that never matches.
const MAX_DAYS_SCANNED = 800;

function dailyRuns(schedule: PipelineSchedule, from: number, count: number): number[] {
  const { hour, minute } = parseTime(schedule.time);
  const runs: number[] = [];
  let date: CalendarDate = zonedParts(from, schedule.timeZone);
  for (let i = 0; i < MAX_DAYS_SCANNED && runs.length < count; i += 1, date = addDays(date, 1)) {
    if (runsOnDay(schedule, date)) {
      const at = zonedTimeToInstant({ ...date, hour, minute }, schedule.timeZone);
      if (at > from) {
        runs.push(at);
      }
    }
  }
  return runs;
}

function hourlyRuns(schedule: PipelineSchedule, from: number, count: number): number[] {
  const { minute } = parseTime(schedule.time);
  const today = zonedParts(from, schedule.timeZone);
  return steppedRuns(
    { anchor: { ...today, hour: 0, minute }, stepMinutes: 60, timeZone: schedule.timeZone },
    from,
    count
  );
}

function customRuns(schedule: PipelineSchedule, from: number, count: number): number[] {
  const start = parseDate(schedule.startDate);
  if (!start) {
    return [];
  }
  const { hour, minute } = parseTime(schedule.time);
  const stepMinutes = schedule.every * UNIT_MINUTES[schedule.unit];
  return steppedRuns({ anchor: { ...start, hour, minute }, stepMinutes, timeZone: schedule.timeZone }, from, count);
}

/** The next `count` run start times after `from` (epoch ms); empty for a schedule that can't run. */
export function nextRuns(schedule: PipelineSchedule, from: number, count = 1): number[] {
  if (!pipelineScheduleSchema.safeParse(schedule).success) {
    return [];
  }
  switch (schedule.cadence) {
    case 'hourly':
      return hourlyRuns(schedule, from, count);
    case 'custom':
      return customRuns(schedule, from, count);
    default:
      return dailyRuns(schedule, from, count);
  }
}

export const maxRuntimeMinutes = (schedule: PipelineSchedule): number | undefined =>
  schedule.limitRuntime ? schedule.maxRuntime * (schedule.maxRuntimeUnit === 'hours' ? 60 : 1) : undefined;

// How far the zone's clock moves for daylight saving, in minutes (0 without DST).
function dstShiftMinutes(timeZone: string, now: number = Date.now()): number {
  const year = new Date(now).getUTCFullYear();
  const winter = offsetAt(Date.UTC(year, 0, 1), timeZone);
  const summer = offsetAt(Date.UTC(year, 6, 1), timeZone);
  return Math.abs(winter - summer) / MINUTE_MS;
}

/**
 * The shortest gap between two runs, in minutes. Runs step by the zone's clock, so a gap longer than
 * the DST shift is that much shorter across a spring-forward change.
 */
export function shortestGapMinutes(schedule: PipelineSchedule): number {
  const gap = calendarGapMinutes(schedule);
  const shift = dstShiftMinutes(schedule.timeZone);
  return gap > shift ? gap - shift : gap;
}

function calendarGapMinutes(schedule: PipelineSchedule): number {
  switch (schedule.cadence) {
    case 'hourly':
      return 60;
    case 'custom':
      return schedule.every * UNIT_MINUTES[schedule.unit];
    case 'weekly': {
      const days = [...new Set(schedule.weekdays)].sort((a, b) => a - b);
      if (days.length < 2) {
        return UNIT_MINUTES.weeks;
      }
      const gaps = days.map((day, i) => (i === 0 ? day + 7 - (days.at(-1) ?? day) : day - days[i - 1]));
      return Math.min(...gaps) * 1440;
    }
    case 'monthly':
      return 28 * 1440;
    default:
      return 1440;
  }
}

/** Whether the runtime limit lets a run outlast the gap before the next one, which then skips. */
export function runtimeOverlapsNextRun(schedule: PipelineSchedule): boolean {
  const limit = maxRuntimeMinutes(schedule);
  return limit !== undefined && limit >= shortestGapMinutes(schedule);
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Monday first, as a week picker reads. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const weekdayName = (day: number, style: 'long' | 'short' = 'long') =>
  style === 'long' ? WEEKDAY_NAMES[day] : WEEKDAY_NAMES[day].slice(0, 3);

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) {
    return `${n}th`;
  }
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** A `HH:MM` wall time in the reader's locale, e.g. "2:00 AM" or "02:00". */
export function formatWallTime(time: string, locale?: string): string {
  const { hour, minute } = parseTime(time);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
    Date.UTC(2000, 0, 1, hour, minute)
  );
}

const singular = (unit: string) => unit.replace(PLURAL_S, '');
const plural = (n: number, unit: string) => `${n} ${n === 1 ? singular(unit) : unit}`;

function listDays(days: number[]): string {
  const names = WEEKDAY_ORDER.filter((day) => days.includes(day)).map((day) => weekdayName(day));
  if (names.length <= 2) {
    return names.join(' and ');
  }
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The schedule in a sentence, e.g. "Every Monday and Friday at 2:00 AM". */
export function describeSchedule(schedule: PipelineSchedule, locale?: string): string {
  const at = formatWallTime(schedule.time, locale);
  switch (schedule.cadence) {
    case 'hourly':
      return `Every hour at :${schedule.time.slice(3)}`;
    case 'daily':
      return `Every day at ${at}`;
    case 'weekdays':
      return `Weekdays at ${at}`;
    case 'weekly':
      return schedule.weekdays.length === 7 ? `Every day at ${at}` : `Every ${listDays(schedule.weekdays)} at ${at}`;
    case 'monthly':
      return `Monthly on the ${ordinal(schedule.dayOfMonth)} at ${at}`;
    default:
      if (schedule.unit === 'minutes' || schedule.unit === 'hours') {
        return `Every ${plural(schedule.every, schedule.unit)}`;
      }
      return schedule.every === 1
        ? `Every ${singular(schedule.unit)} at ${at}`
        : `Every ${plural(schedule.every, schedule.unit)} at ${at}`;
  }
}

export function describeRuntime(minutes: number): string {
  return minutes % 60 === 0 ? plural(minutes / 60, 'hours') : plural(minutes, 'minutes');
}

/** A run's start in the schedule's zone, e.g. "Tue, Oct 20, 2:00 AM BST". */
export function formatRunTime(instant: number, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(instant);
}

/** Today's date in a zone, `YYYY-MM-DD`. */
export function zonedToday(timeZone: string, now: number = Date.now()): string {
  const { year, month, day } = zonedParts(now, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `on-hold`: switched on, but the pipeline no longer stops on its own. */
export type ScheduleState = 'active' | 'paused' | 'on-hold';

/** What a schedule does for a pipeline that ends as `end` says. */
export function scheduleState(schedule: PipelineSchedule, end: { status: PipelineEndStatus }): ScheduleState {
  if (!schedule.enabled) {
    return 'paused';
  }
  return end.status === 'finite' ? 'active' : 'on-hold';
}

export function defaultSchedule(timeZone: string = browserTimeZone(), now: number = Date.now()): PipelineSchedule {
  return {
    enabled: false,
    cadence: 'daily',
    time: '02:00',
    weekdays: [1],
    dayOfMonth: 1,
    every: 2,
    unit: 'weeks',
    startDate: zonedToday(timeZone, now),
    timeZone,
    limitRuntime: false,
    maxRuntime: 1,
    maxRuntimeUnit: 'hours',
  };
}
