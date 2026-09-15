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
  /** Skip the shortcut while the user is typing in an input, textarea, select, or contenteditable. */
  ignoreWhenTyping?: boolean;
  onTrigger: () => void;
};

const TYPING_TAG_REGEX = /^(input|textarea|select)$/i;

export const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return el !== null && (TYPING_TAG_REGEX.test(el.tagName) || el.isContentEditable);
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
export function useHotKey({ key, modifiers = [], enabled = true, ignoreWhenTyping = false, onTrigger }: HotKeyOptions) {
  const optionsRef = useRef({ onTrigger, modifiers, ignoreWhenTyping });
  useEffect(() => {
    optionsRef.current = { onTrigger, modifiers, ignoreWhenTyping };
  }, [onTrigger, modifiers, ignoreWhenTyping]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handler = (e: KeyboardEvent) => {
      const { onTrigger: trigger, modifiers: mods, ignoreWhenTyping: ignoreTyping } = optionsRef.current;

      if (!modifiersMatch(e, mods) || e.key.toLowerCase() !== key.toLowerCase()) {
        return;
      }

      if (ignoreTyping && isTypingTarget(e.target)) {
        return;
      }

      e.preventDefault();
      trigger();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, enabled]);
}
