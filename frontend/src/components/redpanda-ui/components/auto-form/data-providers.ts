import type React from 'react';

export interface DataProviderOption {
  /** Wire value stored in form state. */
  value: string;
  /** Display label shown in the dropdown. */
  label: string;
  /** Optional helper line shown beneath the label. */
  description?: string;
  /** Optional group heading so related options cluster visually. */
  group?: string;
  /**
   * Optional glyph rendered before the label. Most useful on cross-vendor
   * dropdowns (e.g. Bedrock embeddings mix Amazon Titan + Cohere models,
   * SQL drivers mix Postgres / MySQL / ClickHouse / ...) where a brand
   * mark discriminates faster than the text value. Same-vendor lists
   * (all OpenAI, all Cohere) intentionally omit icons — a uniform icon
   * is visual noise, not signal.
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

/**
 * A data provider is a React hook. Implementations may call `useQuery`,
 * return a memoised constant array, or anything in between — AutoForm
 * never inspects the internals.
 */
export type DataProvider = () => DataProviderResult;

export type DataProviderRegistry = Record<string, DataProvider>;

/**
 * Resolve a data provider by id. Returns `undefined` when the id is not
 * registered; the caller is responsible for rendering a graceful fallback
 * (and, in dev, logging a warning).
 */
export function resolveDataProvider(
  registry: DataProviderRegistry | undefined,
  id: string | undefined
): DataProvider | undefined {
  if (!(registry && id)) {
    return;
  }
  return registry[id];
}
