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

// WARNING: Only modal dialogs disable the save shortcut; non-modal dialog roles must not suppress it.
const MODAL_DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"], [role="alertdialog"]';

type UseSaveHotkeyOptions = {
  /** Register the shortcut (e.g. false in view mode). */
  enabled: boolean;
  /** A save is already in flight — swallow the shortcut but don't kick off another. */
  isSaving: boolean;
  onSave: () => void;
};

/**
 * ⌘S / Ctrl+S saves the pipeline, overriding the browser's save-page dialog.
 * ⌘⇧S (save-as) keeps its browser behaviour, and the shortcut stands down while a modal dialog is open.
 * The generic useHotKey is unsuitable: it always `preventDefault`s on a match, so it could do neither.
 */
export function useSaveHotkey({ enabled, isSaving, onSave }: UseSaveHotkeyOptions) {
  const latest = useRef({ isSaving, onSave });
  latest.current = { isSaving, onSave };

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 's') {
        return;
      }
      if (document.querySelector(MODAL_DIALOG_SELECTOR)) {
        return;
      }
      e.preventDefault();
      // WARNING: Ignore held-key repeats; they can arrive before the first save marks the mutation pending.
      if (e.repeat) {
        return;
      }
      if (!latest.current.isSaving) {
        latest.current.onSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
