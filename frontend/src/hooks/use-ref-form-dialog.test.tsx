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

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useRefFormDialog } from './use-ref-form-dialog';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

// Import after mock so we get the mocked version
const getToastError = async () => {
  const { toast } = await import('sonner');
  return toast.error as ReturnType<typeof vi.fn>;
};

describe('useRefFormDialog', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts closed and not submitting', () => {
    const ref = { current: null };
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useRefFormDialog({ ref, onSuccess }));

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it('opens with target and derives isOpen', () => {
    const ref = { current: null };
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useRefFormDialog<string, string>({ ref, onSuccess }));

    act(() => {
      result.current.open('my-target');
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.target).toBe('my-target');
  });

  it('defaults target to true when open is called without argument', () => {
    const ref = { current: null };
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useRefFormDialog({ ref, onSuccess }));

    act(() => {
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.target).toBe(true);
  });

  it('close resets all state', async () => {
    const ref = { current: null };
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useRefFormDialog({ ref, onSuccess }));

    act(() => {
      result.current.open('target');
    });

    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it('calls onSuccess and closes on successful submit', async () => {
    const data = { id: 42 };
    const triggerSubmit = vi.fn().mockResolvedValue({ success: true, data });
    const ref = { current: { triggerSubmit } };
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useRefFormDialog({ ref, onSuccess }));

    act(() => {
      result.current.open();
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(onSuccess).toHaveBeenCalledWith(data, true);
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('keeps dialog open on failed submit', async () => {
    const triggerSubmit = vi.fn().mockResolvedValue({ success: false });
    const ref = { current: { triggerSubmit } };
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useRefFormDialog({ ref, onSuccess }));

    act(() => {
      result.current.open();
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(true);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('aborts in-flight submit when close is called', async () => {
    let resolveSubmit!: (value: { success: boolean; data?: unknown }) => void;
    const inflightPromise = new Promise<{ success: boolean; data?: unknown }>((resolve) => {
      resolveSubmit = resolve;
    });
    const triggerSubmit = vi.fn().mockReturnValue(inflightPromise);
    const ref = { current: { triggerSubmit } };
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useRefFormDialog({ ref, onSuccess }));

    act(() => {
      result.current.open();
    });

    // Start submit but don't await it yet
    let submitPromise: Promise<void>;
    act(() => {
      submitPromise = result.current.submit();
    });

    // Close while submit is in-flight
    act(() => {
      result.current.close();
    });

    // Now resolve the submit with success
    resolveSubmit({ success: true, data: { id: 1 } });

    await act(async () => {
      await submitPromise;
    });

    // onSuccess should NOT have been called because abort happened
    expect(onSuccess).not.toHaveBeenCalled();
    // Dialog should remain closed (close() was called)
    expect(result.current.isOpen).toBe(false);
  });

  it('shows timeout toast and closes on timeout', async () => {
    vi.useFakeTimers();

    const neverResolves = new Promise<never>(() => {
      // intentionally never resolves
    });
    const triggerSubmit = vi.fn().mockReturnValue(neverResolves);
    const ref = { current: { triggerSubmit } };
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useRefFormDialog({ ref, onSuccess, timeout: 5000 }));

    act(() => {
      result.current.open();
    });

    let submitPromise: Promise<void>;
    act(() => {
      submitPromise = result.current.submit();
    });

    // Advance timers past the timeout
    await act(async () => {
      vi.advanceTimersByTime(6000);
      await submitPromise;
    });

    const toastError = await getToastError();
    expect(toastError).toHaveBeenCalledWith('Request timed out');
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('does nothing when submit is called while closed', async () => {
    const triggerSubmit = vi.fn().mockResolvedValue({ success: true, data: {} });
    const ref = { current: { triggerSubmit } };
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useRefFormDialog({ ref, onSuccess }));

    // Dialog is closed (target is null) — submit should be a no-op
    await act(async () => {
      await result.current.submit();
    });

    expect(triggerSubmit).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });
});
