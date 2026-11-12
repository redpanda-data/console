/** Return enumerable own string keys; structural object types cannot prove an exact runtime key set or nonempty tuple. */
export function enumFromKeys(obj: object): string[] {
  return Object.keys(obj);
}
