'use client';

// Copyright 2026 Redpanda Data, Inc.

import React from 'react';

export interface MultiSelectOptionItem {
  label?: React.ReactNode | undefined;
  selectedTestId?: string | undefined;
  testId?: string | undefined;
  value: string;
}

interface MultiSelectContextValue {
  cacheItem: React.Dispatch<MultiSelectOptionItem>;
  controlRef: React.RefObject<HTMLDivElement | null>;
  disabled?: boolean | undefined;

  filter?: (boolean | ((keyword: string, current: string) => boolean)) | undefined;

  itemCache: Map<string, MultiSelectOptionItem>;

  maxCount?: number | undefined;

  onDeselect: (value: string, item: MultiSelectOptionItem) => void;

  onSearch?: ((keyword?: string) => void) | undefined;

  onSelect: (value: string, item: MultiSelectOptionItem) => void;

  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  value: string[];
}

export const MultiSelectContext = React.createContext<MultiSelectContextValue | undefined>(undefined);

export function useMultiSelect() {
  const context = React.useContext(MultiSelectContext);

  if (context === undefined) {
    throw new Error('useMultiSelect must be used within MultiSelectProvider');
  }

  return context;
}
