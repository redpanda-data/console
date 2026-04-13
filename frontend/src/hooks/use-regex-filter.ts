import { useMemo } from 'react';

const cache = new Map<string, RegExp>();

/**
 * Filters `items` by `searchQuery` using a regex (case-insensitive).
 * Falls back to a substring match when `searchQuery` is not a valid regex.
 * Returns the original array reference when `searchQuery` is empty.
 */
export function useRegexFilter<T>(items: T[], searchQuery: string, getText: (item: T) => string): T[] {
  return useMemo(() => {
    if (!searchQuery) {
      return items;
    }
    try {
      let re = cache.get(searchQuery);
      if (!re) {
        re = new RegExp(searchQuery, 'i');
        cache.set(searchQuery, re);
      }
      return items.filter((item) => re.test(getText(item)));
    } catch {
      const q = searchQuery.toLowerCase();
      return items.filter((item) => getText(item).toLowerCase().includes(q));
    }
  }, [items, searchQuery, getText]);
}
