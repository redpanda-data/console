'use client';

// Copyright 2026 Redpanda Data, Inc.

import React from 'react';

export function useCopyToClipboard({
  timeout = 2000,
  onCopy,
}: {
  timeout?: number | undefined;
  onCopy?: (() => void) | undefined;
} = {}) {
  const [isCopied, setIsCopied] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const copyToClipboard = async (value: string) => {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (typeof clipboard?.writeText !== 'function') {
      setError('Clipboard access is unavailable.');
      return;
    }

    if (value === '') {
      return;
    }

    try {
      await clipboard.writeText(value);
      setError(undefined);
      setIsCopied(true);

      if (onCopy !== undefined) {
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
