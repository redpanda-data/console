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

import type { RefObject } from 'react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

/** Minimal contract a ref-based form must satisfy. */
type RefFormSubmittable<TData> = {
  triggerSubmit: () => Promise<{ success: boolean; data?: TData }>;
};

type UseRefFormDialogOptions<TData, TTarget> = {
  ref: RefObject<RefFormSubmittable<TData> | null>;
  onSuccess: (data: TData, target: TTarget) => void;
  timeout?: number;
};

type UseRefFormDialogReturn<TTarget> = {
  isOpen: boolean;
  isSubmitting: boolean;
  target: TTarget | null;
  open: (target?: TTarget) => void;
  close: () => void;
  submit: () => Promise<void>;
};

const DEFAULT_TIMEOUT = 30_000;

function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timerId)),
    new Promise<never>((_, reject) => {
      timerId = setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]);
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === 'timeout';
}

function useRefFormDialog<TData, TTarget = boolean>(
  options: UseRefFormDialogOptions<TData, TTarget>
): UseRefFormDialogReturn<TTarget> {
  const { ref, onSuccess, timeout = DEFAULT_TIMEOUT } = options;
  const [target, setTarget] = useState<TTarget | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const close = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setTarget(null);
    setIsSubmitting(false);
  }, []);

  const open = useCallback((t?: TTarget) => {
    setTarget((t ?? true) as TTarget);
  }, []);

  const submit = useCallback(async () => {
    const formRef = ref.current;
    if (!formRef || target === null || abortRef.current !== null) {
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;
    setIsSubmitting(true);

    try {
      const result = await raceWithTimeout(formRef.triggerSubmit(), timeout);

      if (abort.signal.aborted) {
        return;
      }

      if (result.success && result.data) {
        onSuccess(result.data, target);
        close();
      } else {
        setIsSubmitting(false);
      }
    } catch (error) {
      if (abort.signal.aborted) {
        return;
      }
      if (isTimeoutError(error)) {
        toast.error('Request timed out');
        close();
      } else {
        setIsSubmitting(false);
      }
    }
  }, [ref, target, onSuccess, timeout, close]);

  return {
    isOpen: target !== null,
    isSubmitting,
    target,
    open,
    close,
    submit,
  };
}

export { useRefFormDialog };
export type { RefFormSubmittable, UseRefFormDialogOptions, UseRefFormDialogReturn };
