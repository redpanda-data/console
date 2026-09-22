'use client';

// Copyright 2026 Redpanda Data, Inc.

import React from 'react';

export function useCopyToClipboard({ timeout = 2000, onCopy }: { timeout?: number; onCopy?: () => void } = {}) {
  const [isCopied, setIsCopied] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const copyToClipboard = async (value: string) => {
    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
      setError('Clipboard access is unavailable.');
      return;
    }

    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setError(undefined);
      setIsCopied(true);

      if (onCopy) {
        onCopy();
      }

      setTimeout(() => {
        setIsCopied(false);
      }, timeout);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not copy to the clipboard.');
    }
  };

  return { copyToClipboard, error, isCopied };
}
