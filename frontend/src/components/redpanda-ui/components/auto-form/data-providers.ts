import type React from 'react';

export interface DataProviderOption {
  /** Wire value stored in form state. */
  value: string;
  label: string;
  description?: string;
  group?: string;
  /**
   * Optional glyph before the label. Use on cross-vendor dropdowns where a
   * brand mark discriminates faster than text; omit on same-vendor lists
   * where a uniform icon is noise, not signal.
   */
  icon?: React.ReactNode;
}

export interface DataProviderResult {
  options: DataProviderOption[];
  /** True while an async source is loading. Static providers may omit this. */
  isLoading?: boolean;
  /** Non-null when the provider failed to load. */
  error?: unknown;
}

/** A data provider is a React hook; AutoForm never inspects its internals. */
export type DataProvider = () => DataProviderResult;

export type DataProviderRegistry = Record<string, DataProvider>;

/** Returns `undefined` for an unregistered id; the caller handles the fallback. */
export function resolveDataProvider(
  registry: DataProviderRegistry | undefined,
  id: string | undefined
): DataProvider | undefined {
  if (!(registry && id)) {
    return;
  }
  return registry[id];
}
