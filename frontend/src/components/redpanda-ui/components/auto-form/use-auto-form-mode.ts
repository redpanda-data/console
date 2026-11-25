'use client';

// Copyright 2026 Redpanda Data, Inc.

import { useState } from 'react';
import type { AutoFormMode } from './types';
import { normalizeModes, resolveInitialMode } from './utils/modes';

/** Keep a user's mode only while it remains available under the current default. */
export function useAutoFormMode(modes: AutoFormMode[] | undefined, defaultMode: AutoFormMode | undefined) {
  const availableModes = normalizeModes(modes);
  const preferredMode = resolveInitialMode(availableModes, defaultMode);
  const [selection, setSelection] = useState(() => ({ defaultMode, value: preferredMode }));
  const mode =
    selection.defaultMode === defaultMode && availableModes.includes(selection.value) ? selection.value : preferredMode;
  const handleModeChange = (value: AutoFormMode) => {
    setSelection({ defaultMode, value });
  };
  return { availableModes, mode, handleModeChange };
}
