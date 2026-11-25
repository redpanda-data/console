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

import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { act, renderHook } from '@testing-library/react';

import { type RefFormSubmittable, useRefFormDialog } from './use-ref-form-dialog';

rs.mock('sonner', () => ({ toast: { error: rs.fn() } }));

// Import after mock so we get the mocked version
const getToastError = async () => {
  const { toast } = await import('sonner');
  return toast.error;
};

// Renders the hook around a form whose submit is `triggerSubmit`, with the dialog already open.
function renderOpenDialog(
  triggerSubmit: RefFormSubmittable<unknown>['triggerSubmit'],
  options: { timeout?: number } = {}
) {
  const ref = { current: { triggerSubmit } };
  const onSuccess = rs.fn();
  const { result } = renderHook(() => useRefFormDialog({ ref, onSuccess, ...options }));

  act(() => {
    result.current.open(true);
  });

  return { result, onSuccess };
}

// Starts a submit without awaiting it, so the test can act while it is in flight.
function startSubmit(result: { current: { submit: () => Promise<void> } }): Promise<void> {
  let submitPromise!: Promise<void>;
  act(() => {
    submitPromise = result.current.submit();
  });
  return submitPromise;
}

describe('useRefFormDialog', () => {
  afterEach(() => {
    rs.useRealTimers();
  });

  test('starts closed and not submitting', () => {
    const ref = { current: null };
    const onSuccess = rs.fn();

    const { result } = renderHook(() => useRefFormDialog({ ref, onSuccess }));

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.target).toBeNull();
  });

  test('opens with target and derives isOpen', () => {
    const ref = { current: null };
    const onSuccess = rs.fn();

    const { result } = renderHook(() => useRefFormDialog<string, string>({ ref, onSuccess }));

    act(() => {
      result.current.open('my-target');
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.target).toBe('my-target');
  });

  test('supports an explicit boolean target', () => {
    const ref = { current: null };
    const onSuccess = rs.fn();

    const { result } = renderHook(() => useRefFormDialog({ ref, onSuccess }));

    act(() => {
      result.current.open(true);
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.target).toBe(true);
  });

  test('close resets all state', () => {
    const ref = { current: null };
    const onSuccess = rs.fn();

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

  test('calls onSuccess and closes on successful submit', async () => {
    const data = { id: 42 };
    const triggerSubmit = rs.fn().mockResolvedValue({ success: true, data });
    const ref = { current: { triggerSubmit } };
    const onSuccess = rs.fn();

    const { result } = renderHook(() => useRefFormDialog({ ref, onSuccess }));

    act(() => {
      result.current.open(true);
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(onSuccess).toHaveBeenCalledWith(data, true);
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  test('keeps dialog open on failed submit', async () => {
    const triggerSubmit = rs.fn().mockResolvedValue({ success: false });
    const ref = { current: { triggerSubmit } };
    const onSuccess = rs.fn();

    const { result } = renderHook(() => useRefFormDialog({ ref, onSuccess }));

    act(() => {
      result.current.open(true);
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(true);
    expect(result.current.isSubmitting).toBe(false);
  });

  test('aborts in-flight submit when close is called', async () => {
    let resolveSubmit!: (value: { success: boolean; data?: unknown }) => void;
    const inflightPromise = new Promise<{ success: boolean; data?: unknown }>((resolve) => {
      resolveSubmit = resolve;
    });
    const triggerSubmit = rs.fn().mockReturnValue(inflightPromise);
    const { result, onSuccess } = renderOpenDialog(triggerSubmit);

    // Start submit but don't await it yet
    const submitPromise = startSubmit(result);

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

  test('shows timeout toast and closes on timeout', async () => {
    rs.useFakeTimers();

    const neverResolves = new Promise<never>(() => {
      // intentionally never resolves
    });
    const triggerSubmit = rs.fn().mockReturnValue(neverResolves);
    const { result } = renderOpenDialog(triggerSubmit, { timeout: 5000 });

    const submitPromise = startSubmit(result);

    // Advance timers past the timeout
    await act(async () => {
      rs.advanceTimersByTime(6000);
      await submitPromise;
    });

    const toastError = await getToastError();
    expect(toastError).toHaveBeenCalledWith('Request timed out');
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  test('does nothing when submit is called while closed', async () => {
    const triggerSubmit = rs.fn().mockResolvedValue({ success: true, data: {} });
    const ref = { current: { triggerSubmit } };
    const onSuccess = rs.fn();

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

test.each([false, 0, '', null])('submits present falsy form data: %j', async (data) => {
  const triggerSubmit = rs
    .fn<RefFormSubmittable<unknown>['triggerSubmit']>()
    .mockResolvedValue({ success: true, data });
  const { result, onSuccess } = renderOpenDialog(triggerSubmit);
  await act(async () => {
    await result.current.submit();
  });
  expect(onSuccess).toHaveBeenCalledWith(data, true);
  expect(result.current.isOpen).toBe(false);
});
