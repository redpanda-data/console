type DefinedProperties<T> = {
  [Key in keyof T as undefined extends T[Key] ? never : Key]: T[Key];
} & {
  [Key in keyof T as undefined extends T[Key] ? Key : never]?: Exclude<T[Key], undefined>;
};

/** Copy string-keyed metadata, omitting undefined properties without changing nested values. */
export function omitUndefined<const T extends Record<string, unknown>>(value: T): DefinedProperties<T>;
export function omitUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
