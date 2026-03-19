import { useEffect, useRef } from 'react';

type UseEmbeddedAuthPrewarmArgs = {
  enabled?: boolean;
  debounceMs?: number;
  dedupeMs?: number;
  prewarm: () => Promise<void>;
};

/**
 * Runs a best-effort auth prewarm when the tab becomes active again.
 *
 * Focus and visibility events usually arrive in a burst, so this hook debounces
 * them and also deduplicates in-flight work.
 */
export const useEmbeddedAuthPrewarm = ({
  enabled = true,
  debounceMs = 150,
  dedupeMs = 1000,
  prewarm,
}: UseEmbeddedAuthPrewarmArgs) => {
  const prewarmRef = useRef(prewarm);
  const timeoutRef = useRef<number | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastRunAtRef = useRef(0);

  prewarmRef.current = prewarm;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const runPrewarm = () => {
      const now = Date.now();
      if (inFlightRef.current || now - lastRunAtRef.current < dedupeMs) {
        return;
      }

      lastRunAtRef.current = now;
      inFlightRef.current = Promise.resolve(prewarmRef.current())
        .catch(() => {
          // Best-effort prewarm only. Callers handle any hard auth failures.
        })
        .finally(() => {
          inFlightRef.current = null;
        });
    };

    const schedulePrewarm = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        runPrewarm();
      }, debounceMs);
    };

    window.addEventListener('focus', schedulePrewarm);
    document.addEventListener('visibilitychange', schedulePrewarm);

    return () => {
      window.removeEventListener('focus', schedulePrewarm);
      document.removeEventListener('visibilitychange', schedulePrewarm);
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [debounceMs, dedupeMs, enabled]);
};
