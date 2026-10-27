/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useCopyToClipboard } from 'components/redpanda-ui/lib/use-copy-to-clipboard';
import { isTypingTarget } from 'hooks/use-hot-key';
import { useEffect } from 'react';
import { toast } from 'sonner';

export type KeyboardNavOptions = {
  /** Row keys in on-screen (sorted, paginated) order. */
  visibleKeys: string[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /** Returns the copyable value JSON for a row key. */
  getCopyText: (key: string) => string | undefined;
  enabled: boolean;
};

type KeyContext = Pick<KeyboardNavOptions, 'visibleKeys' | 'selectedKey' | 'onSelect' | 'getCopyText'> & {
  copy: (text: string) => void;
};

/** `/` focuses the filter input. */
const focusFilterInput = (e: KeyboardEvent) => {
  e.preventDefault();
  document.querySelector<HTMLInputElement>('[data-testid="messages-filter-input"]')?.focus();
};

/** j/k or ↑/↓ move the selected row by `delta`, clamped to the visible rows. */
const moveSelection = (e: KeyboardEvent, delta: number, { visibleKeys, selectedKey, onSelect }: KeyContext) => {
  if (visibleKeys.length === 0) {
    return;
  }
  e.preventDefault();
  const currentIndex = selectedKey ? visibleKeys.indexOf(selectedKey) : -1;
  const nextIndex = Math.min(Math.max(currentIndex + delta, 0), visibleKeys.length - 1);
  onSelect(visibleKeys[nextIndex]);
};

/**
 * `c` copies the selected row's value. A modifier held down means the browser's own copy shortcut
 * (Cmd/Ctrl+C) — or another OS/browser binding — not this row-copy shortcut; clobbering the user's
 * real clipboard selection with the row's JSON would otherwise be a very unpleasant surprise.
 */
const copySelectedValue = (e: KeyboardEvent, { selectedKey, getCopyText, copy }: KeyContext) => {
  if (!selectedKey || e.metaKey || e.ctrlKey || e.altKey) {
    return;
  }
  const text = getCopyText(selectedKey);
  if (text !== undefined) {
    copy(text);
  }
};

const KEY_HANDLERS = new Map<string, (e: KeyboardEvent, context: KeyContext) => void>([
  ['/', focusFilterInput],
  ['j', (e, context) => moveSelection(e, 1, context)],
  ['ArrowDown', (e, context) => moveSelection(e, 1, context)],
  ['k', (e, context) => moveSelection(e, -1, context)],
  ['ArrowUp', (e, context) => moveSelection(e, -1, context)],
  ['c', copySelectedValue],
]);

/**
 * Table keyboard navigation from the design mock: j/k or ↑/↓ move the selected
 * row, `c` copies the value, `/` focuses the filter input. Escape is handled by
 * the detail panel itself.
 */
export function useKeyboardNav({ visibleKeys, selectedKey, onSelect, getCopyText, enabled }: KeyboardNavOptions) {
  const { copyToClipboard } = useCopyToClipboard({ onCopy: () => toast.success('Value copied to clipboard') });
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const context: KeyContext = { visibleKeys, selectedKey, onSelect, getCopyText, copy: copyToClipboard };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTypingTarget(e.target)) {
        KEY_HANDLERS.get(e.key)?.(e, context);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, visibleKeys, selectedKey, onSelect, getCopyText, copyToClipboard]);
}
