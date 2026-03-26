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

import { renderHook } from '@testing-library/react';

import { useHotKey } from './use-hot-key';

describe('useHotKey', () => {
  it('calls onTrigger when key combo matches', () => {
    const onTrigger = vi.fn();
    renderHook(() => useHotKey({ key: 'p', modifiers: ['meta', 'shift'], onTrigger }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true, shiftKey: true }));
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('does not trigger without required modifiers', () => {
    const onTrigger = vi.fn();
    renderHook(() => useHotKey({ key: 'p', modifiers: ['meta', 'shift'], onTrigger }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', shiftKey: true }));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does not trigger when enabled is false', () => {
    const onTrigger = vi.fn();
    renderHook(() => useHotKey({ key: 'p', modifiers: ['meta', 'shift'], enabled: false, onTrigger }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true, shiftKey: true }));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('treats ctrl as meta on non-mac', () => {
    const onTrigger = vi.fn();
    renderHook(() => useHotKey({ key: 'p', modifiers: ['meta', 'shift'], onTrigger }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, shiftKey: true }));
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('cleans up listener on unmount', () => {
    const onTrigger = vi.fn();
    const { unmount } = renderHook(() => useHotKey({ key: 'p', modifiers: ['meta'], onTrigger }));

    unmount();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true }));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('uses latest onTrigger without re-subscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useHotKey({ key: 'k', modifiers: ['meta'], onTrigger: cb }), {
      initialProps: { cb: first },
    });

    rerender({ cb: second });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
