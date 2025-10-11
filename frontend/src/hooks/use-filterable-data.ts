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

import { useEffect, useMemo, useState } from 'react';

/**
 * Hook for filtering data with debouncing
 * Replaces the MobX-based FilterableDataSource class
 */
export function useFilterableData<T>(
  dataSource: T[] | undefined,
  filterFn: (filter: string, item: T) => boolean,
  filterText: string,
  debounceMs = 100
) {
  const [debouncedFilterText, setDebouncedFilterText] = useState(filterText);
  const [lastFilterText, setLastFilterText] = useState('');

  // Debounce the filter text
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedFilterText(filterText);
    }, debounceMs);

    return () => clearTimeout(timeout);
  }, [filterText, debounceMs]);

  // Apply filter to data
  const filteredData = useMemo(() => {
    if (!dataSource) {
      return [];
    }

    return dataSource.filter((item) => filterFn(debouncedFilterText, item));
  }, [dataSource, debouncedFilterText, filterFn]);

  // Update lastFilterText after render (not during)
  useEffect(() => {
    setLastFilterText(debouncedFilterText);
  }, [debouncedFilterText]);

  return {
    data: filteredData,
    lastFilterText,
  };
}
