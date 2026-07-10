/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useEffect, useRef } from 'react';

// A MODAL dialog (settings, discard-changes, …) is capturing input. Scoped to aria-modal so a
// host-shell element or a non-modal popover (role="dialog") can't disable the shortcut.
const MODAL_DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"], [role="alertdialog"]';

type UseSaveHotkeyOptions = {
  /** Register the shortcut (e.g. false in view mode). */
  enabled: boolean;
  /** A save is already in flight — swallow the shortcut but don't kick off another. */
  isSaving: boolean;
  onSave: () => void;
};

/**
 * ⌘S / Ctrl+S saves the pipeline, overriding the browser's save-page dialog, from both the YAML and
 * Visual lanes. Plain ⌘S only — ⌘⇧S (save-as) keeps its browser behaviour — and the shortcut stands
 * down while a modal dialog is open so the press keeps its default behaviour there.
 *
 * The generic {@link useHotKey} isn't used here because it always `preventDefault`s on a match: this
 * handler must let ⌘⇧S through and must not swallow ⌘S while a modal is capturing input.
 */
export function useSaveHotkey({ enabled, isSaving, onSave }: UseSaveHotkeyOptions) {
  // Ref so the listener sees the latest isSaving/onSave without re-registering on every render.
  const latest = useRef({ isSaving, onSave });
  latest.current = { isSaving, onSave };

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      // Plain ⌘S/Ctrl+S only — ⌘⇧S (save-as) keeps its browser behaviour.
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 's') {
        return;
      }
      // Checked before preventDefault, so an unhandled press keeps browser behaviour.
      if (document.querySelector(MODAL_DIALOG_SELECTOR)) {
        return;
      }
      e.preventDefault();
      if (!latest.current.isSaving) {
        latest.current.onSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
