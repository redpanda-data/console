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

// Formatters are costly to build and these run for every row on each clock tick, so each is kept by its
// locale and options.
const displayFormatters = new Map<string, Intl.DateTimeFormat>();

export function displayFormatter(locale: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`;
  let formatter = displayFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    displayFormatters.set(key, formatter);
  }
  return formatter;
}

export const browserTimeZone = (): string => displayFormatter(undefined, {}).resolvedOptions().timeZone || 'UTC';

/** A run's start split for a day tile, in `timeZone`: "Sat", "Oct 24", "2:00 AM", "PDT". */
export function runTimeParts(
  instant: number,
  timeZone: string,
  locale?: string
): { weekday: string; date: string; time: string; zone: string } {
  return {
    weekday: displayFormatter(locale, { timeZone, weekday: 'short' }).format(instant),
    date: displayFormatter(locale, { timeZone, month: 'short', day: 'numeric' }).format(instant),
    time: displayFormatter(locale, { timeZone, hour: 'numeric', minute: '2-digit' }).format(instant),
    zone: zoneAbbreviation(instant, timeZone, locale),
  };
}

/** A zone's short name at `instant`, e.g. "PDT" or "GMT+5:45". */
export const zoneAbbreviation = (instant: number, timeZone: string, locale?: string): string =>
  displayFormatter(locale, { timeZone, timeZoneName: 'short' })
    .formatToParts(instant)
    .find((p) => p.type === 'timeZoneName')?.value ?? '';
