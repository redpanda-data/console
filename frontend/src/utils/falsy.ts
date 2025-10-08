export const isFalsy = (value: unknown): boolean =>
  value === null || value === undefined || value === '' || value === false;
