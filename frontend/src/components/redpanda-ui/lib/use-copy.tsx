"use client";

import { useEffect, useState } from "react";

type UseCopyProps = {
  timeout?: number;
};

function useCopy({ timeout = 500 }: UseCopyProps = {}) {
  const [copied, setCopied] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: part of useCopy implementation
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (copied) {
      timeoutId = setTimeout(() => {
        setCopied(false);
      }, timeout);
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [copied]);

  return { copied, setCopied };
}

export default useCopy;
