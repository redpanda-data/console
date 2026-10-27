import { useRef, useState } from 'react';

const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Runs one async action at a time for a confirm button. Calls made while an action is pending are
 * ignored, so a double click cannot repeat a delete, and a rejection becomes `errorMessage` instead
 * of escaping the click handler.
 */
export function usePendingAction() {
  // The ref blocks a second call before React re-renders the disabled button.
  const pendingRef = useRef<boolean>(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const run = (action: () => Promise<void>) => {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setIsPending(true);
    setErrorMessage(null);
    action()
      .finally(() => {
        pendingRef.current = false;
        setIsPending(false);
      })
      .catch((error: unknown) => setErrorMessage(toErrorMessage(error)));
  };

  return { run, isPending, errorMessage, clearError: () => setErrorMessage(null) };
}
