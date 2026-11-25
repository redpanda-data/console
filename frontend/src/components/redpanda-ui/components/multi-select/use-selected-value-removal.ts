'use client';

// Copyright 2026 Redpanda Data, Inc.

import React from 'react';
import { type MultiSelectOptionItem, useMultiSelect } from './context';

interface RemovalRequest {
  button: HTMLButtonElement;
  neighbors: string[];
  value: string;
}

export function useSelectedValueRemoval() {
  const { value, onDeselect, triggerRef } = useMultiSelect();
  const pending = React.useRef<RemovalRequest | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState<string>();
  React.useLayoutEffect(function restoreAcceptedRemovalFocus() {
    const request = pending.current;
    pending.current = null;
    if (request === null || value.includes(request.value)) {
      return;
    }
    const document = request.button.ownerDocument;
    if (document.activeElement !== request.button && document.activeElement !== document.body) {
      return;
    }
    const controls = containerRef.current?.querySelectorAll<HTMLButtonElement>('[data-multi-select-remove]');
    const buttons = Array.from(controls ?? []);
    const next = request.neighbors
      .flatMap((candidate) => buttons.filter((button) => button.dataset['multiSelectRemove'] === candidate))
      .at(0);
    (next ?? triggerRef.current)?.focus({ preventScroll: true });
  });
  const remove = (event: React.MouseEvent<HTMLButtonElement>, itemValue: string, item: MultiSelectOptionItem) => {
    const index = value.indexOf(itemValue);
    pending.current = {
      value: itemValue,
      button: event.currentTarget,
      neighbors: [...value.slice(index + 1), ...value.slice(0, index).toReversed()],
    };
    try {
      onDeselect(itemValue, item);
      setError(undefined);
    } catch (error_) {
      pending.current = null;
      setError(
        error_ instanceof Error && error_.message !== '' ? error_.message : 'Could not remove the selected item.'
      );
    }
  };
  return { containerRef, error, remove };
}
