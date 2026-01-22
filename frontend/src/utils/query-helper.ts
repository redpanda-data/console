/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { appGlobal } from '../state/app-global';

/**
 * Converts a URL search string to an object.
 *
 * @deprecated Use TanStack Router's `useSearch()` hook with route-level `validateSearch` instead.
 * This provides type-safe search params with Zod validation.
 *
 * @example
 * // Instead of:
 * const params = queryToObj(window.location.search);
 *
 * // Use:
 * const search = useSearch({ from: '/your-route' });
 */
export const queryToObj = (str: string) => {
  const query = new URLSearchParams(str);
  const obj = {} as Record<string, string>;
  for (const [k, v] of query.entries()) {
    obj[k] = v;
  }

  return obj;
};

/**
 * Converts an object to a URL query string.
 *
 * @deprecated Use TanStack Router's `navigate({ search: ... })` instead.
 * This provides type-safe navigation with search params.
 *
 * @example
 * // Instead of:
 * const queryStr = objToQuery({ page: 1, filter: 'active' });
 *
 * // Use:
 * navigate({ search: { page: 1, filter: 'active' } });
 */
export const objToQuery = (obj: { [key: string]: unknown }) => {
  // '?' + queryString.stringify(obj, stringifyOptions)
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') {
      continue;
    }

    query.append(k, String(v));
  }
  return `?${query.toString()}`;
};

/**
 * Edit the current search query.
 *
 * @deprecated Use TanStack Router's `navigate({ search: (prev) => ... })` instead.
 * This provides type-safe search param updates with proper React integration.
 *
 * @example
 * // Instead of:
 * editQuery((query) => {
 *   query.filter = 'active';
 * });
 *
 * // Use:
 * const navigate = useNavigate({ from: '/your-route' });
 * navigate({
 *   search: (prev) => ({ ...prev, filter: 'active' }),
 *   replace: true,
 * });
 */
export function editQuery(editFunction: (queryObject: Record<string, string | null | undefined>) => void) {
  try {
    const location = appGlobal.historyLocation();
    if (!location) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.warn('Location not available yet, skipping query update');
      return;
    }

    // TanStack Router uses searchStr for the raw search string
    const searchStr = location.searchStr ?? '';
    const currentObj = queryToObj(searchStr);
    editFunction(currentObj);

    const newQuery = objToQuery(currentObj);

    if (searchStr !== newQuery) {
      const path = location.pathname;
      appGlobal.historyReplace(`${path}${newQuery}`);
    }
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.warn('Failed to update query:', error);
  }
}
