export const isFalsy = (value: unknown): boolean => {
  return value === null || value === undefined || value === '' || value === false;
};
