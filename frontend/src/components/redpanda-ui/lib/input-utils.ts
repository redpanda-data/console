import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

// ── Types ──────────────────────────────────────────────────────────────

export type KeyValuePairsSchemaOptions = {
  allowedPattern?: RegExp;
  maxKeyLength?: number;
  maxValueLength?: number;
  maxItems?: number;
};

export type KeyValueDiffResult = {
  created: Record<string, string>;
  updated: Record<string, string>;
  removed: string[];
};

// ── Pure Utilities ─────────────────────────────────────────────────────

/**
 * Returns the indices of items whose key (extracted via `getKey`) appears
 * more than once. Empty keys are ignored.
 */
export function findDuplicateIndices<T>(items: T[], getKey: (item: T) => string): Set<number> {
  const seen = new Map<string, number[]>();
  const duplicates = new Set<number>();

  for (const [index, item] of items.entries()) {
    const key = getKey(item);
    if (!key) {
      continue;
    }

    const existing = seen.get(key);
    if (existing) {
      existing.push(index);
      for (const i of existing) {
        duplicates.add(i);
      }
    } else {
      seen.set(key, [index]);
    }
  }

  return duplicates;
}

function collectPairIssues(
  index: number,
  pair: { key: string; value: string },
  options: KeyValuePairsSchemaOptions,
  duplicates: Set<number>
): { message: string; path: [number, string] }[] {
  const issues: { message: string; path: [number, string] }[] = [];
  const { allowedPattern, maxKeyLength, maxValueLength } = options;

  if (pair.value && !pair.key.trim()) {
    issues.push({ message: 'Key is required when a value is provided', path: [index, 'key'] });
  }

  if (duplicates.has(index)) {
    issues.push({ message: `Duplicate key: "${pair.key}"`, path: [index, 'key'] });
  }

  if (maxKeyLength && pair.key.length > maxKeyLength) {
    issues.push({ message: `Key exceeds maximum length of ${maxKeyLength}`, path: [index, 'key'] });
  }

  if (maxValueLength && pair.value.length > maxValueLength) {
    issues.push({ message: `Value exceeds maximum length of ${maxValueLength}`, path: [index, 'value'] });
  }

  if (allowedPattern && pair.key && !allowedPattern.test(pair.key)) {
    issues.push({ message: 'Key contains invalid characters', path: [index, 'key'] });
  }

  if (allowedPattern && pair.value && !allowedPattern.test(pair.value)) {
    issues.push({ message: 'Value contains invalid characters', path: [index, 'value'] });
  }

  return issues;
}

/**
 * Returns a Zod schema that validates an array of key-value pairs.
 * Checks for empty keys, duplicate keys, character patterns, length
 * limits, and item count.
 *
 * Use with React Hook Form + zodResolver for form-level validation.
 * Adds a root-level issue (shown by `FormMessage`) and per-field issues
 * at `[index, field]` paths for row-level error access.
 */
export function keyValuePairsSchema(options: KeyValuePairsSchemaOptions = {}) {
  return z.array(z.object({ key: z.string(), value: z.string() })).superRefine((pairs, ctx) => {
    const issues: { message: string; path?: [number, string] }[] = [];

    if (options.maxItems !== undefined && pairs.length > options.maxItems) {
      issues.push({ message: `Maximum of ${options.maxItems} items allowed` });
    }

    const duplicates = findDuplicateIndices(pairs, (p) => p.key);

    for (const [index, pair] of pairs.entries()) {
      issues.push(...collectPairIssues(index, pair, options, duplicates));
    }

    for (const issue of issues) {
      ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    }
  });
}

/**
 * Compares an initial set of key-value pairs against the current set and
 * returns which entries were created, updated, or removed.
 *
 * When duplicate keys exist, the last occurrence is used for comparison.
 */
export function getKeyValueDiff(
  initial: { key: string; value: string }[],
  current: { key: string; value: string }[]
): KeyValueDiffResult {
  const initialMap = new Map<string, string>();
  for (const { key, value } of initial) {
    if (key) {
      initialMap.set(key, value);
    }
  }

  const currentMap = new Map<string, string>();
  for (const { key, value } of current) {
    if (key) {
      currentMap.set(key, value);
    }
  }

  const created: Record<string, string> = {};
  const updated: Record<string, string> = {};
  const removed: string[] = [];

  for (const [key, value] of currentMap) {
    if (!initialMap.has(key)) {
      created[key] = value;
    } else if (initialMap.get(key) !== value) {
      updated[key] = value;
    }
  }

  for (const key of initialMap.keys()) {
    if (!currentMap.has(key)) {
      removed.push(key);
    }
  }

  return { created, updated, removed };
}

// ── Hooks ──────────────────────────────────────────────────────────────

/**
 * Manages focus in a dynamic list of input rows. Call `onAdd` after
 * appending a row to focus the first input in the new row, and
 * `onRemove` after deleting a row to focus the next logical row.
 *
 * Rows must have a `data-row` attribute for the selector to work.
 */
export function useInputListFocus(containerRef: RefObject<HTMLElement | null>) {
  const pendingRef = useRef<'add' | { type: 'remove'; index: number } | null>(null);

  const onAdd = useCallback(() => {
    pendingRef.current = 'add';
  }, []);

  const onRemove = useCallback((deletedIndex: number) => {
    pendingRef.current = { type: 'remove', index: deletedIndex };
  }, []);

  // Runs after every render to apply any pending focus action.
  // The ref check is cheap and clears immediately, so subsequent
  // renders are no-ops.
  useEffect(() => {
    const event = pendingRef.current;
    if (!(event && containerRef.current)) {
      return;
    }
    pendingRef.current = null;

    const rows = containerRef.current.querySelectorAll<HTMLElement>('[data-row]');

    if (event === 'add') {
      const lastRow = rows.item(rows.length - 1);
      const input = lastRow?.querySelector<HTMLElement>('input, [role="combobox"]');
      input?.focus();
    } else {
      const targetIndex = Math.min(event.index, rows.length - 1);
      if (targetIndex >= 0) {
        const row = rows[targetIndex];
        const input = row?.querySelector<HTMLElement>('input, [role="combobox"]');
        input?.focus();
      } else {
        // No rows remain — focus the add button if present
        const addButton = containerRef.current.querySelector<HTMLElement>('[data-slot="add-button"]');
        addButton?.focus();
      }
    }
  });

  return { onAdd, onRemove };
}

/**
 * Preserves object references for array items that have not changed
 * between renders, reducing unnecessary child re-renders.
 */
export function useMemoizedArray<T>(items: T[], isEqual: (a: T, b: T) => boolean = Object.is): T[] {
  const prevRef = useRef(items);
  const prev = prevRef.current;

  if (prev === items) {
    return prev;
  }

  let changed = prev.length !== items.length;
  const result: T[] = [];

  for (const [i, item] of items.entries()) {
    if (i < prev.length && isEqual(prev[i], item)) {
      result.push(prev[i]);
    } else {
      result.push(item);
      changed = true;
    }
  }

  if (!changed) {
    return prev;
  }

  prevRef.current = result;
  return result;
}

/**
 * Provides soft-delete behaviour with timed auto-confirm. Call
 * `markForRemoval` with a unique identifier and a callback that
 * performs the actual removal — the callback fires after `timeout` ms
 * unless `undoRemoval` is called first.
 */
export function useUndoRemoval(timeout = 5000) {
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const markForRemoval = useCallback(
    (id: string, onConfirm: () => void) => {
      setPending((prev) => new Set([...prev, id]));

      const existing = timersRef.current.get(id);
      if (existing) {
        clearTimeout(existing);
      }

      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        onConfirm();
      }, timeout);

      timersRef.current.set(id, timer);
    },
    [timeout]
  );

  const undoRemoval = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setPending((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isPending = useCallback((id: string) => pending.has(id), [pending]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return { markForRemoval, undoRemoval, isPending, pending };
}
