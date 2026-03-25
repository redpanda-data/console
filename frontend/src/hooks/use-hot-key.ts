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

import { useEffect, useRef } from 'react';

type Modifier = 'meta' | 'ctrl' | 'shift' | 'alt';

type HotKeyOptions = {
  key: string;
  modifiers?: Modifier[];
  enabled?: boolean;
  onTrigger: () => void;
};

const MODIFIER_CHECKS: Record<Modifier, (e: KeyboardEvent) => boolean> = {
  meta: (e) => e.metaKey || e.ctrlKey,
  ctrl: (e) => e.ctrlKey,
  shift: (e) => e.shiftKey,
  alt: (e) => e.altKey,
};

function modifiersMatch(e: KeyboardEvent, mods: Modifier[]): boolean {
  return mods.every((mod) => MODIFIER_CHECKS[mod](e));
}

/**
 * Registers a global keyboard shortcut. Automatically cleans up on unmount.
 * 'meta' modifier matches Cmd (macOS) or Ctrl (other platforms).
 *
 * Uses the event handler ref pattern so callers can pass inline arrays
 * and arrow functions without causing listener re-registration.
 */
export function useHotKey({ key, modifiers = [], enabled = true, onTrigger }: HotKeyOptions) {
  const optionsRef = useRef({ onTrigger, modifiers });
  useEffect(() => {
    optionsRef.current = { onTrigger, modifiers };
  }, [onTrigger, modifiers]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handler = (e: KeyboardEvent) => {
      const { onTrigger: trigger, modifiers: mods } = optionsRef.current;

      if (!modifiersMatch(e, mods) || e.key.toLowerCase() !== key.toLowerCase()) {
        return;
      }

      e.preventDefault();
      trigger();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, enabled]);
}
