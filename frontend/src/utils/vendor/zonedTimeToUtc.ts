/**
 * Build-time stub for the v2 deep path `date-fns-tz/zonedTimeToUtc`.
 * `@redpanda-data/ui@4.2.0` does `import zonedTimeToUtc from 'date-fns-tz/zonedTimeToUtc'`,
 * which only existed in v2. We replaced the only call site (`<DateTimeInput>`),
 * so the body is unreachable.
 */
const unreachable = () => {
  throw new Error('date-fns-tz/zonedTimeToUtc shim: unreachable — DateTimeInput was replaced.');
};

export default unreachable;
