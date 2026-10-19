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

import {
  defaultSchedule,
  describeRuntime,
  describeSchedule,
  nextRuns,
  normalizeSchedule,
  type PipelineSchedule,
  pipelineScheduleSchema,
  runtimeOverlapsNextRun,
  shortestGapMinutes,
  zonedTimeToInstant,
} from './pipeline-schedule';
import { describe, expect, test } from 'bun:test';

const at = (text: string) => Date.parse(text);
const iso = (ms: number[]) => ms.map((m) => new Date(m).toISOString());

const schedule = (overrides: Partial<PipelineSchedule>): PipelineSchedule => ({
  ...defaultSchedule('UTC', at('2026-10-19T00:00:00Z')),
  enabled: true,
  ...overrides,
});

describe('zonedTimeToInstant', () => {
  test('applies the zone offset in force on that date', () => {
    const wall = { year: 2026, month: 7, day: 1, hour: 2, minute: 0 };
    expect(new Date(zonedTimeToInstant(wall, 'Europe/London')).toISOString()).toBe('2026-07-01T01:00:00.000Z');
    expect(new Date(zonedTimeToInstant(wall, 'UTC')).toISOString()).toBe('2026-07-01T02:00:00.000Z');
    expect(
      new Date(zonedTimeToInstant({ year: 2026, month: 1, day: 1, hour: 0, minute: 0 }, 'Asia/Kathmandu')).toISOString()
    ).toBe('2025-12-31T18:15:00.000Z');
  });

  test('a time skipped by DST moves past the gap; a repeated one takes its first occurrence', () => {
    const skipped = { year: 2026, month: 3, day: 8, hour: 2, minute: 30 };
    expect(new Date(zonedTimeToInstant(skipped, 'America/New_York')).toISOString()).toBe('2026-03-08T07:30:00.000Z');
    const repeated = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };
    expect(new Date(zonedTimeToInstant(repeated, 'America/New_York')).toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  test('a repeated time takes its first occurrence east of UTC too', () => {
    const berlin = { year: 2026, month: 10, day: 25, hour: 2, minute: 30 };
    expect(new Date(zonedTimeToInstant(berlin, 'Europe/Berlin')).toISOString()).toBe('2026-10-25T00:30:00.000Z');
    const sydney = { year: 2026, month: 4, day: 5, hour: 2, minute: 30 };
    expect(new Date(zonedTimeToInstant(sydney, 'Australia/Sydney')).toISOString()).toBe('2026-04-04T15:30:00.000Z');
  });
});

const localMinute = (ms: number, timeZone: string) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone, minute: 'numeric' }).format(ms));

describe('nextRuns', () => {
  test('daily runs keep their local time across a DST change', () => {
    const daily = schedule({ cadence: 'daily', time: '02:00', timeZone: 'Europe/London' });
    expect(iso(nextRuns(daily, at('2026-10-24T12:00:00Z'), 3))).toEqual([
      '2026-10-25T02:00:00.000Z',
      '2026-10-26T02:00:00.000Z',
      '2026-10-27T02:00:00.000Z',
    ]);
    expect(iso(nextRuns(daily, at('2026-10-19T00:30:00Z'), 1))).toEqual(['2026-10-19T01:00:00.000Z']);
  });

  test('weekdays skip the weekend', () => {
    const weekdays = schedule({ cadence: 'weekdays', time: '08:00' });
    // 2026-10-23 is a Friday.
    expect(iso(nextRuns(weekdays, at('2026-10-23T12:00:00Z'), 2))).toEqual([
      '2026-10-26T08:00:00.000Z',
      '2026-10-27T08:00:00.000Z',
    ]);
  });

  test('weekly runs on the chosen days', () => {
    const weekly = schedule({ cadence: 'weekly', weekdays: [1, 3], time: '09:30' });
    expect(iso(nextRuns(weekly, at('2026-10-19T10:00:00Z'), 3))).toEqual([
      '2026-10-21T09:30:00.000Z',
      '2026-10-26T09:30:00.000Z',
      '2026-10-28T09:30:00.000Z',
    ]);
  });

  test('a monthly day past the end of a month runs on its last day', () => {
    const monthly = schedule({ cadence: 'monthly', dayOfMonth: 31 });
    expect(iso(nextRuns(monthly, at('2026-10-19T00:00:00Z'), 3))).toEqual([
      '2026-10-31T02:00:00.000Z',
      '2026-11-30T02:00:00.000Z',
      '2026-12-31T02:00:00.000Z',
    ]);
  });

  test('hourly runs at the chosen minute', () => {
    const hourly = schedule({ cadence: 'hourly', time: '00:15' });
    expect(iso(nextRuns(hourly, at('2026-10-19T12:20:00Z'), 2))).toEqual([
      '2026-10-19T13:15:00.000Z',
      '2026-10-19T14:15:00.000Z',
    ]);
    expect(iso(nextRuns(hourly, at('2026-10-19T12:10:00Z'), 1))).toEqual(['2026-10-19T12:15:00.000Z']);
  });

  test('hourly runs stay on the chosen minute across DST, and never in the past', () => {
    const newYork = schedule({ cadence: 'hourly', time: '00:15', timeZone: 'America/New_York' });
    // 06:20Z is 01:20 the second time round on fall-back night.
    const [first] = nextRuns(newYork, at('2026-11-01T06:20:00Z'), 1);
    expect(first).toBeGreaterThan(at('2026-11-01T06:20:00Z'));
    expect(new Date(first).toISOString()).toBe('2026-11-01T07:15:00.000Z');

    const berlin = schedule({ cadence: 'hourly', time: '00:15', timeZone: 'Europe/Berlin' });
    expect(iso(nextRuns(berlin, at('2026-07-01T00:10:00Z'), 1))).toEqual(['2026-07-01T00:15:00.000Z']);

    // Lord Howe jumps from 02:00 to 02:30: only the skipped 02:15 moves past the gap, the rest stay on :15.
    const lordHowe = schedule({ cadence: 'hourly', time: '00:15', timeZone: 'Australia/Lord_Howe' });
    const runs = nextRuns(lordHowe, at('2026-10-03T12:00:00Z'), 8);
    expect(runs.map((ms) => localMinute(ms, 'Australia/Lord_Howe'))).toEqual([15, 15, 15, 45, 15, 15, 15, 15]);
  });

  test('custom intervals count from the start date', () => {
    const fortnightly = schedule({ cadence: 'custom', every: 2, unit: 'weeks', startDate: '2026-10-05' });
    expect(iso(nextRuns(fortnightly, at('2026-10-19T12:00:00Z'), 2))).toEqual([
      '2026-11-02T02:00:00.000Z',
      '2026-11-16T02:00:00.000Z',
    ]);
    expect(iso(nextRuns(fortnightly, at('2026-10-19T01:00:00Z'), 1))).toEqual(['2026-10-19T02:00:00.000Z']);
    expect(iso(nextRuns(fortnightly, at('2026-09-01T00:00:00Z'), 1))).toEqual(['2026-10-05T02:00:00.000Z']);

    const halfHourly = schedule({ cadence: 'custom', every: 30, unit: 'minutes', startDate: '2026-10-19' });
    expect(iso(nextRuns(halfHourly, at('2026-10-19T12:10:00Z'), 2))).toEqual([
      '2026-10-19T12:30:00.000Z',
      '2026-10-19T13:00:00.000Z',
    ]);
  });

  test('custom hour steps keep the wall clock across DST', () => {
    const threeHourly = schedule({
      cadence: 'custom',
      every: 3,
      unit: 'hours',
      time: '00:00',
      startDate: '2026-11-01',
      timeZone: 'America/New_York',
    });
    expect(iso(nextRuns(threeHourly, at('2026-11-01T03:00:00Z'), 3))).toEqual([
      '2026-11-01T04:00:00.000Z',
      '2026-11-01T08:00:00.000Z',
      '2026-11-01T11:00:00.000Z',
    ]);
  });

  test('an invalid schedule has no runs', () => {
    expect(nextRuns(schedule({ cadence: 'weekly', weekdays: [] }), at('2026-10-19T00:00:00Z'))).toEqual([]);
  });
});

describe('pipelineScheduleSchema', () => {
  const issue = (value: PipelineSchedule) => pipelineScheduleSchema.safeParse(value).error?.issues[0]?.message;

  test('runs must be at least 15 minutes apart', () => {
    expect(issue(schedule({ cadence: 'custom', every: 10, unit: 'minutes' }))).toBe(
      'Runs must be at least 15 minutes apart.'
    );
    expect(issue(schedule({ cadence: 'custom', every: 15, unit: 'minutes' }))).toBeUndefined();
    // The interval only applies to a custom cadence.
    expect(issue(schedule({ cadence: 'daily', every: 1, unit: 'minutes' }))).toBeUndefined();
  });

  test('fields the cadence doesn’t use never block it', () => {
    expect(issue(schedule({ cadence: 'daily', every: Number.NaN }))).toBeUndefined();
    expect(issue(schedule({ limitRuntime: false, maxRuntime: Number.NaN }))).toBeUndefined();
    expect(issue(schedule({ limitRuntime: true, maxRuntime: Number.NaN }))).toBe('Enter a number.');
    expect(issue(schedule({ cadence: 'custom', every: Number.NaN }))).toBe('Enter a number.');
  });

  test('runs at most a year apart, and runtime limits up to 30 days', () => {
    expect(issue(schedule({ cadence: 'custom', every: 600_000, unit: 'weeks' }))).toBe(
      'Runs must be at most a year apart.'
    );
    expect(issue(schedule({ limitRuntime: true, maxRuntime: 721, maxRuntimeUnit: 'hours' }))).toBe(
      'Keep it to 30 days or less.'
    );
  });

  test('saving resets what the cadence doesn’t use', () => {
    const saved = normalizeSchedule(
      schedule({ cadence: 'daily', every: Number.NaN, limitRuntime: false, maxRuntime: Number.NaN }),
      at('2026-10-19T00:00:00Z')
    );
    expect(saved).toMatchObject({ every: 2, unit: 'weeks', maxRuntime: 1, startDate: '2026-10-19' });
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });

  test('rejects a week with no days, a bad time zone and a malformed time', () => {
    expect(issue(schedule({ cadence: 'weekly', weekdays: [] }))).toBe('Choose at least one day.');
    expect(issue(schedule({ timeZone: 'Mars/Olympus' }))).toBe('Choose a time zone.');
    expect(issue(schedule({ time: '25:00' }))).toBe('Enter a time such as 02:00.');
    expect(issue(schedule({ cadence: 'custom', startDate: '2026-02-30' }))).toBe('Choose a start date.');
  });
});

describe('describeSchedule', () => {
  test('reads as a sentence', () => {
    const say = (overrides: Partial<PipelineSchedule>) => describeSchedule(schedule(overrides), 'en-US');
    expect(say({ cadence: 'daily' })).toBe('Every day at 2:00 AM');
    expect(say({ cadence: 'weekdays', time: '08:00' })).toBe('Weekdays at 8:00 AM');
    expect(say({ cadence: 'weekly', weekdays: [3, 1], time: '09:30' })).toBe('Every Monday and Wednesday at 9:30 AM');
    expect(say({ cadence: 'weekly', weekdays: [0, 1, 5] })).toBe('Every Monday, Friday and Sunday at 2:00 AM');
    expect(say({ cadence: 'monthly', dayOfMonth: 22 })).toBe('Monthly on the 22nd at 2:00 AM');
    expect(say({ cadence: 'hourly', time: '00:15' })).toBe('Every hour at :15');
    expect(say({ cadence: 'custom', every: 2, unit: 'weeks' })).toBe('Every 2 weeks at 2:00 AM');
    expect(say({ cadence: 'custom', every: 1, unit: 'days' })).toBe('Every day at 2:00 AM');
    expect(say({ cadence: 'custom', every: 30, unit: 'minutes' })).toBe('Every 30 minutes');
  });

  test('runtime reads in the largest whole unit', () => {
    expect(describeRuntime(90)).toBe('90 minutes');
    expect(describeRuntime(120)).toBe('2 hours');
    expect(describeRuntime(60)).toBe('1 hour');
  });
});

describe('overlap', () => {
  test('a runtime limit as long as the gap lets a run make the next one skip', () => {
    expect(shortestGapMinutes(schedule({ cadence: 'weekly', weekdays: [1, 5] }))).toBe(3 * 1440);
    const hourly = schedule({ cadence: 'hourly', limitRuntime: true, maxRuntime: 2, maxRuntimeUnit: 'hours' });
    expect(runtimeOverlapsNextRun(hourly)).toBe(true);
    expect(runtimeOverlapsNextRun({ ...hourly, maxRuntime: 30, maxRuntimeUnit: 'minutes' })).toBe(false);
    expect(runtimeOverlapsNextRun({ ...hourly, limitRuntime: false })).toBe(false);
  });

  test('a short DST day brings daily runs an hour closer', () => {
    const london = schedule({ cadence: 'daily', timeZone: 'Europe/London' });
    expect(shortestGapMinutes(london)).toBe(1380);
    expect(runtimeOverlapsNextRun({ ...london, limitRuntime: true, maxRuntime: 1410, maxRuntimeUnit: 'minutes' })).toBe(
      true
    );
    expect(shortestGapMinutes(schedule({ cadence: 'daily', timeZone: 'UTC' }))).toBe(1440);
  });
});
