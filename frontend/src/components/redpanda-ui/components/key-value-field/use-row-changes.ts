'use client';

// Copyright 2026 Redpanda Data, Inc.

import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { useInputListFocus } from '../../lib/input-utils';
import { haveUniqueRowIds, type KeyValueRow } from './rows';

type FocusAction = { type: 'add' } | { type: 'remove'; index: number };
interface FocusRequest {
  action: FocusAction;
  before: readonly KeyValueRow[];
  next: readonly KeyValueRow[];
}

interface RowUpdateError {
  message: string;
  source: readonly KeyValueRow[];
}

/** Error ownership follows the rejected document; this comparison never supplies row identity. */
function errorAppliesToRows(error: RowUpdateError, rows: readonly KeyValueRow[]): boolean {
  return (
    rows.length === error.source.length &&
    rows.every((row, index) => {
      const original = error.source[index];
      return (
        original !== undefined &&
        row.id === original.id &&
        row.pair.key === original.pair.key &&
        row.pair.value === original.pair.value
      );
    })
  );
}

function acceptedFocusRequest(rows: readonly KeyValueRow[], request: FocusRequest): boolean {
  if (request.action.type === 'remove') {
    return rows.length === request.next.length && rows.every((row, index) => row.id === request.next[index]?.id);
  }
  const added = rows.at(-1);
  const requested = request.next.at(-1);
  return (
    rows.length === request.next.length &&
    rows.length === request.before.length + 1 &&
    request.before.every((row, index) => row.id === rows[index]?.id) &&
    added !== undefined &&
    requested !== undefined &&
    request.before.every((row) => row.id !== added.id) &&
    added.pair.key === requested.pair.key &&
    added.pair.value === requested.pair.value
  );
}

/** Focus only an accepted structural update, never an ignored or rejected proposal. */
export function useRowChanges(
  rows: readonly KeyValueRow[],
  onChange: ((rows: KeyValueRow[]) => void) | undefined,
  containerRef: RefObject<HTMLDivElement | null>
) {
  const pending = useRef<FocusRequest | null>(null);
  const [failure, setFailure] = useState<RowUpdateError>();
  const error = failure !== undefined && errorAppliesToRows(failure, rows) ? failure.message : undefined;
  if (failure !== undefined && error === undefined) {
    setFailure(undefined);
  }
  const { onAdd, onRemove } = useInputListFocus(containerRef);
  useLayoutEffect(function focusAcceptedRows() {
    const request = pending.current;
    if (request === null) {
      return;
    }
    if (!haveUniqueRowIds(rows)) {
      pending.current = null;
      return;
    }
    if (acceptedFocusRequest(rows, request)) {
      pending.current = null;
      if (request.action.type === 'add') {
        onAdd();
      } else {
        onRemove(request.action.index);
      }
    } else if (rows !== request.before) {
      pending.current = null;
    }
  });
  const change = (next: KeyValueRow[], action?: FocusAction) => {
    if (onChange === undefined) {
      return;
    }
    pending.current = action === undefined ? null : { action, before: rows, next };
    try {
      onChange(next);
      setFailure(undefined);
    } catch (error_) {
      pending.current = null;
      setFailure({
        source: structuredClone(rows),
        message:
          error_ instanceof Error && error_.message !== '' ? error_.message : 'Could not update the key-value rows.',
      });
    }
  };
  return { change, error };
}
