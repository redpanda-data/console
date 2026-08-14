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

import { renderHook } from '@testing-library/react';

import { useSaveHotkey } from './use-save-hotkey';

const pressSave = (init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
};

// Remove any dialog nodes a test appended so a leaked modal can't disable the shortcut elsewhere.
afterEach(() => {
  for (const el of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
    el.remove();
  }
});

describe('useSaveHotkey', () => {
  it('saves and prevents the browser default on ⌘S', () => {
    const onSave = vi.fn();
    renderHook(() => useSaveHotkey({ enabled: true, isSaving: false, onSave }));

    const event = pressSave();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('treats Ctrl+S as save on non-mac', () => {
    const onSave = vi.fn();
    renderHook(() => useSaveHotkey({ enabled: true, isSaving: false, onSave }));

    pressSave({ metaKey: false, ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('ignores ⌘⇧S so save-as keeps its browser behaviour', () => {
    const onSave = vi.fn();
    renderHook(() => useSaveHotkey({ enabled: true, isSaving: false, onSave }));

    const event = pressSave({ shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('stands down while a modal dialog is open, without swallowing the key', () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);

    const onSave = vi.fn();
    renderHook(() => useSaveHotkey({ enabled: true, isSaving: false, onSave }));

    const event = pressSave();
    expect(onSave).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores auto-repeated keydowns from a held ⌘S', () => {
    const onSave = vi.fn();
    renderHook(() => useSaveHotkey({ enabled: true, isSaving: false, onSave }));

    pressSave();
    // Holding the key fires repeats faster than isSaving can re-render — they must not re-save,
    // but still preventDefault so the browser's save dialog can't open mid-hold.
    const repeatEvent = pressSave({ repeat: true });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(repeatEvent.defaultPrevented).toBe(true);
  });

  it('swallows the shortcut but does not start a second save while one is in flight', () => {
    const onSave = vi.fn();
    renderHook(() => useSaveHotkey({ enabled: true, isSaving: true, onSave }));

    const event = pressSave();
    expect(onSave).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('does nothing when disabled', () => {
    const onSave = vi.fn();
    renderHook(() => useSaveHotkey({ enabled: false, isSaving: false, onSave }));

    const event = pressSave();
    expect(onSave).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('cleans up the listener on unmount', () => {
    const onSave = vi.fn();
    const { unmount } = renderHook(() => useSaveHotkey({ enabled: true, isSaving: false, onSave }));

    unmount();

    pressSave();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('uses the latest onSave/isSaving without re-subscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb, saving }) => useSaveHotkey({ enabled: true, isSaving: saving, onSave: cb }),
      {
        initialProps: { cb: first, saving: true },
      }
    );

    // While saving, the press is swallowed.
    pressSave();
    expect(first).not.toHaveBeenCalled();

    // After isSaving flips false and onSave changes, the same listener sees both.
    rerender({ cb: second, saving: false });
    pressSave();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
