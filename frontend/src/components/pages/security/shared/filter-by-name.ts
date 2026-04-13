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

/** Filters items by name using a case-insensitive regex match (falls back to substring if the query is an invalid regex). Returns all items if the query is empty. */
export function filterByName<T>(items: T[], query: string, getName: (item: T) => string): T[] {
  if (!query) {
    return items;
  }
  try {
    const re = new RegExp(query, 'i'); // nosemgrep: detect-non-literal-regexp -- client-side UI filter, user only affects their own session
    return items.filter((item) => re.test(getName(item)));
  } catch {
    const lowerQuery = query.toLowerCase();
    return items.filter((item) => getName(item).toLowerCase().includes(lowerQuery));
  }
}
