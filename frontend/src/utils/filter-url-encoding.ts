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

import { createParser } from 'nuqs';

import { FilterEntry } from '../state/ui';

// Regex patterns for base64url encoding (performance optimization)
const PLUS_REGEX = /\+/g;
const SLASH_REGEX = /\//g;
const PADDING_REGEX = /=+$/;
const DASH_REGEX = /-/g;
const UNDERSCORE_REGEX = /_/g;

/**
 * Simplified filter structure for URL encoding
 * Only includes essential fields, omitting runtime-only properties
 */
export interface FilterEntryForUrl {
  id: string;
  isActive: boolean;
  name: string;
  code: string;
  transpiledCode: string;
}

/**
 * Convert a FilterEntry to URL-safe format
 * Strips out MobX observables and non-serializable properties
 */
export function filterToUrlFormat(filter: FilterEntry): FilterEntryForUrl {
  return {
    id: filter.id,
    isActive: filter.isActive,
    name: filter.name,
    code: filter.code,
    transpiledCode: filter.transpiledCode,
  };
}

/**
 * Encode filters array to a URL-safe string
 * Uses base64 encoding of JSON for compactness
 */
export function encodeFiltersForUrl(filters: FilterEntry[]): string {
  if (!filters || filters.length === 0) {
    return '';
  }

  try {
    const simplifiedFilters = filters.map(filterToUrlFormat);
    const json = JSON.stringify(simplifiedFilters);
    // Use base64url encoding (URL-safe variant)
    return btoa(json).replace(PLUS_REGEX, '-').replace(SLASH_REGEX, '_').replace(PADDING_REGEX, '');
  } catch (_error) {
    return '';
  }
}

/**
 * Decode filters from URL parameter
 * Returns null if decoding fails or parameter is empty
 */
export function decodeFiltersFromUrl(urlParam: string | null): FilterEntryForUrl[] | null {
  if (!urlParam) {
    return null;
  }

  try {
    // Restore base64 padding and standard characters
    const base64 = urlParam.replace(DASH_REGEX, '+').replace(UNDERSCORE_REGEX, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    const decoded = JSON.parse(json);

    if (!Array.isArray(decoded)) {
      return null;
    }

    // Validate structure
    return decoded.filter(
      (f): f is FilterEntryForUrl =>
        typeof f === 'object' &&
        f !== null &&
        typeof f.id === 'string' &&
        typeof f.isActive === 'boolean' &&
        typeof f.name === 'string' &&
        typeof f.code === 'string' &&
        typeof f.transpiledCode === 'string'
    );
  } catch (_error) {
    return null;
  }
}

/**
 * Convert URL format back to FilterEntry
 * Creates a new FilterEntry with the decoded data
 */
export function urlFormatToFilter(urlFilter: FilterEntryForUrl): FilterEntry {
  const filter = new FilterEntry();
  filter.id = urlFilter.id;
  filter.isActive = urlFilter.isActive;
  filter.name = urlFilter.name;
  filter.code = urlFilter.code;
  filter.transpiledCode = urlFilter.transpiledCode;
  filter.isNew = false; // Filters from URL are not new

  return filter;
}

/**
 * Merge URL filters with existing filters
 * Prioritizes URL filters but preserves filters not in URL
 *
 * @param urlFilters - Filters from URL parameter
 * @param existingFilters - Current filters in state
 * @returns Merged filter array
 */
export function mergeUrlFiltersWithExisting(
  urlFilters: FilterEntryForUrl[] | null,
  existingFilters: FilterEntry[]
): FilterEntry[] {
  if (!urlFilters || urlFilters.length === 0) {
    return existingFilters;
  }

  // Convert URL filters to FilterEntry objects
  const urlFilterEntries = urlFilters.map(urlFormatToFilter);

  // Create a map of URL filter IDs for quick lookup
  const urlFilterIds = new Set(urlFilters.map((f) => f.id));

  // Keep existing filters that aren't in the URL
  const preservedFilters = existingFilters.filter((f) => !urlFilterIds.has(f.id));

  // Combine: URL filters take precedence
  return [...urlFilterEntries, ...preservedFilters];
}

/**
 * Custom nuqs parser for filter arrays
 * Handles encoding/decoding filters to/from URL parameters
 */
export const parseAsFilters = createParser({
  parse: (value: string) => {
    const decoded = decodeFiltersFromUrl(value);
    return decoded ? decoded.map(urlFormatToFilter) : [];
  },
  serialize: (filters: FilterEntry[]) => encodeFiltersForUrl(filters),
})
  .withDefault([])
  .withOptions({ history: 'push', shallow: false });
