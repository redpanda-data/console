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
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) {
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[data-testid="messages-filter-input"]')?.focus();
        return;
      }
      if (e.key === 'j' || e.key === 'ArrowDown' || e.key === 'k' || e.key === 'ArrowUp') {
        if (visibleKeys.length === 0) {
          return;
        }
        e.preventDefault();
        const delta = e.key === 'j' || e.key === 'ArrowDown' ? 1 : -1;
        const currentIndex = selectedKey ? visibleKeys.indexOf(selectedKey) : -1;
        const nextIndex = Math.min(Math.max(currentIndex + delta, 0), visibleKeys.length - 1);
        onSelect(visibleKeys[nextIndex]);
        return;
      }
      // A modifier held down means the browser's own copy shortcut (Cmd/Ctrl+C) — or another
      // OS/browser binding — not this row-copy shortcut; clobbering the user's real clipboard
      // selection with the row's JSON would otherwise be a very unpleasant surprise.
      if (e.key === 'c' && selectedKey && !(e.metaKey || e.ctrlKey || e.altKey)) {
        const text = getCopyText(selectedKey);
        if (text !== undefined) {
          copyToClipboard(text);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, visibleKeys, selectedKey, onSelect, getCopyText, copyToClipboard]);
}
