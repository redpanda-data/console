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

import { SearchField } from '@redpanda-data/ui';
import { type ReactNode, useEffect, useMemo } from 'react';

import { AnimatePresence, animProps_span_searchResult, MotionSpan } from '../../utils/animation-props';

interface SearchBarProps<TItem> {
  dataSource: () => TItem[];
  isFilterMatch: (filter: string, item: TItem) => boolean;
  filterText: string;
  onQueryChanged: (value: string) => void;
  onFilteredDataChanged: (data: TItem[]) => void;
  placeholderText?: string;
}

function SearchBar<TItem>(props: SearchBarProps<TItem>) {
  const { dataSource, isFilterMatch, filterText, onQueryChanged, onFilteredDataChanged, placeholderText } = props;

  const source = dataSource();
  const filteredData = useMemo(() => {
    if (!source) return [];
    return source.filter((item) => isFilterMatch(filterText, item));
  }, [source, filterText, isFilterMatch]);

  useEffect(() => {
    onFilteredDataChanged(filteredData);
  }, [filteredData, onFilteredDataChanged]);

  const filterSummary = useMemo((): { identity: string; node: ReactNode } | null => {
    if (!source || source.length === 0) {
      return null;
    }

    if (!filterText) {
      return null;
    }

    const sourceLength = source.length;
    const resultLength = filteredData.length;

    if (sourceLength === resultLength) {
      return { identity: 'all', node: <span>Filter matched everything</span> };
    }

    return {
      identity: 'r',
      node: (
        <span>
          <span style={{ fontWeight: 600 }}>{filteredData.length}</span> results
        </span>
      ),
    };
  }, [source, filterText, filteredData]);

  return (
    <div
      style={{
        marginBottom: '.5rem',
        padding: '0',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <SearchField
        placeholderText={placeholderText}
        searchText={filterText}
        setSearchText={onQueryChanged}
        width="350px"
      />

      <AnimatePresence>
        {Boolean(filterSummary) && (
          <MotionSpan identityKey={filterSummary?.identity ?? 'null'} overrideAnimProps={animProps_span_searchResult}>
            <span style={{ opacity: 0.8, paddingLeft: '1em' }}>{filterSummary?.node}</span>
          </MotionSpan>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SearchBar;
