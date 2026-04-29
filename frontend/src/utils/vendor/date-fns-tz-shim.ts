/**
 * Build-time stub for `date-fns-tz`.
 *
 * `@redpanda-data/ui@4.2.0` ships a single bundled `dist/index.js` with
 * top-level imports from `date-fns-tz` (v2 names: `utcToZonedTime`,
 * `zonedTimeToUtc`). Those imports must resolve at link time even though
 * we no longer use `<DateTimeInput>` — the only component that actually
 * called them. v3 of date-fns-tz renamed both functions, so we can't
 * point at it directly.
 *
 * This module satisfies the link by exporting matching names. The bodies
 * are unreachable: the only callers live inside `DateTimePicker` /
 * `DateTimeInput`, which are never invoked because we replaced their
 * usage with `components/ui/date-time-input`. Drop this file (and the
 * matching aliases in `rsbuild.config.ts`) once `@redpanda-data/ui` is
 * upgraded past v4.2.0.
 */

const unreachable = () => {
  throw new Error('date-fns-tz shim: unreachable — DateTimeInput was replaced; this should not be called.');
};

export const format = unreachable;
export const formatInTimeZone = unreachable;
export const fromZonedTime = unreachable;
export const getTimezoneOffset = unreachable;
export const toDate = unreachable;
export const toZonedTime = unreachable;
export const utcToZonedTime = unreachable;
export const zonedTimeToUtc = unreachable;
