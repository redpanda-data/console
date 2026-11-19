// Copyright 2026 Redpanda Data, Inc.

/** Domain metadata. Row identities are never part of submitted key/value pairs. */
export interface KeyValuePair {
  key: string;
  value: string;
}

/** UI identity belongs to the row, independently of either editable field. */
export interface KeyValueRow {
  readonly id: string;
  pair: KeyValuePair;
}

/** Call at row creation: in a state initializer or event, never in a render map. */
export function createKeyValueRow(pair: KeyValuePair): KeyValueRow {
  return { id: crypto.getRandomValues(new Uint32Array(4)).join('-'), pair: { key: pair.key, value: pair.value } };
}

/** Initialize a new document; later edits/reorders must retain these row IDs. */
export function createKeyValueRows(pairs: readonly KeyValuePair[]): KeyValueRow[] {
  return pairs.map(createKeyValueRow);
}

/** Project UI rows back to pure metadata for validation, diffing, and submission. */
export function keyValuePairs(rows: readonly KeyValueRow[]): KeyValuePair[] {
  return rows.map(({ pair }) => ({ key: pair.key, value: pair.value }));
}

export function haveUniqueRowIds(rows: readonly KeyValueRow[]): boolean {
  const seen = new Set<string>();
  for (const row of rows) {
    if (typeof row.id !== 'string' || row.id.trim() === '' || seen.has(row.id)) {
      return false;
    }
    seen.add(row.id);
  }
  return true;
}

export type KeyValueRowChange =
  | { type: 'append'; pair: KeyValuePair }
  | { type: 'remove'; index: number }
  | { type: 'edit'; pairs: KeyValuePair[] };

/** Translate the editor's finite actions for an existing field-array identity owner. */
export function describeKeyValueRowChange(
  previous: readonly KeyValueRow[],
  next: readonly KeyValueRow[]
): KeyValueRowChange {
  if (!(haveUniqueRowIds(previous) && haveUniqueRowIds(next))) {
    throw new TypeError('Key-value rows require unique, non-empty IDs.');
  }
  if (next.length === previous.length && next.every((row, index) => row.id === previous[index]?.id)) {
    return { type: 'edit', pairs: keyValuePairs(next) };
  }
  const appended = next.at(-1);
  if (
    appended !== undefined &&
    next.length === previous.length + 1 &&
    previous.every((row, index) => row.id === next[index]?.id) &&
    previous.every((row) => row.id !== appended.id)
  ) {
    return { type: 'append', pair: { key: appended.pair.key, value: appended.pair.value } };
  }
  if (previous.length === next.length + 1) {
    const nextIds = new Set(next.map(({ id }) => id));
    const removedIndex = previous.findIndex(({ id }) => !nextIds.has(id));
    if (removedIndex >= 0) {
      const remaining = previous.toSpliced(removedIndex, 1);
      if (remaining.length === next.length && remaining.every((row, index) => row.id === next[index]?.id)) {
        return { type: 'remove', index: removedIndex };
      }
    }
  }
  throw new TypeError('Expected a key-value edit, append, or removal. Reorder through the controlled row owner.');
}
