export const ALPHANUMERIC_WITH_HYPHENS = new RegExp(/[^A-Z0-9_]/g);

/**
 * LRU-style cache for search RegExp objects.
 * Avoids repeated regex compilation for the same search queries.
 */
const SEARCH_REGEX_CACHE = new Map<string, RegExp>();
const CACHE_MAX_SIZE = 100;

/**
 * Escape special regex characters in a string.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get a cached RegExp for case-insensitive search.
 * Uses LRU-style eviction when cache exceeds max size.
 *
 * @param query - The search query (regex patterns supported)
 * @param flags - Optional regex flags (default: 'i' for case-insensitive)
 */
export function getSearchRegex(query: string, flags = 'i'): RegExp {
  const cacheKey = `${query}:${flags}`;

  const cached = SEARCH_REGEX_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Evict oldest entries if cache is full
  if (SEARCH_REGEX_CACHE.size >= CACHE_MAX_SIZE) {
    const firstKey = SEARCH_REGEX_CACHE.keys().next().value;
    if (firstKey) {
      SEARCH_REGEX_CACHE.delete(firstKey);
    }
  }

  const regex = new RegExp(query, flags);
  SEARCH_REGEX_CACHE.set(cacheKey, regex);
  return regex;
}
