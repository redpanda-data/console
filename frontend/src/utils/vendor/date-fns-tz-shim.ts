// Build-time stub for `date-fns-tz`. @redpanda-data/ui@4.2.0 imports v2 names
// at module top-level; date-fns v4 no longer exports the private subpaths v2
// reaches into, so we satisfy the link with an unreachable shim. The only
// caller (`<DateTimeInput>`) was replaced by `components/ui/date-time-input`.
// Drop this (and the rsbuild + vitest aliases) once @redpanda-data/ui is gone.

const unreachable = () => {
  throw new Error('date-fns-tz shim: unreachable — DateTimeInput was replaced.');
};

export const format = unreachable;
export const formatInTimeZone = unreachable;
export const fromZonedTime = unreachable;
export const getTimezoneOffset = unreachable;
export const toDate = unreachable;
export const toZonedTime = unreachable;
export const utcToZonedTime = unreachable;
export const zonedTimeToUtc = unreachable;
