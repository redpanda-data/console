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
import { useEffect, useMemo } from 'react';

import { useFilterableData } from '../../hooks/use-filterable-data';
import { AnimatePresence, animProps_span_searchResult, MotionSpan } from '../../utils/animation-props';

type SearchBarProps<TItem> = {
  dataSource: () => TItem[];
  isFilterMatch: (filter: string, item: TItem) => boolean;
  filterText: string;
  onQueryChanged: (value: string) => void;
  onFilteredDataChanged: (data: TItem[]) => void;
  placeholderText?: string;
};

/*
    todo: autocomplete:
    - save as suggestion on focus lost, enter, or clear
    - only show entries with matching start
*/
// todo: allow setting custom "rows" to search, and case sensitive or not (pass those along to isFilterMatch)

function SearchBar<TItem>({
  dataSource,
  isFilterMatch,
  filterText,
  onQueryChanged,
  onFilteredDataChanged,
  placeholderText,
}: SearchBarProps<TItem>) {
  const sourceData = dataSource();
  const { data: filteredData, lastFilterText } = useFilterableData(sourceData, isFilterMatch, filterText);

  // Notify parent when filtered data changes
  useEffect(() => {
    onFilteredDataChanged(filteredData);
  }, [filteredData, onFilteredDataChanged]);

  const onChange = (text: string) => {
    onQueryChanged(text);
  };

  const searchSummary = useMemo(() => {
    if (!sourceData || sourceData.length === 0) {
      return null;
    }

    if (!lastFilterText) {
      return null;
    }

    const sourceLength = sourceData.length;
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
  }, [sourceData, lastFilterText, filteredData]);

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
      {/* <AutoComplete placeholder='Quick Search' size='large'
                style={{ width: 'auto', padding: '0' }}
                onChange={v => this.filteredSource.filterText = String(v)}
                dataSource={['battle-logs', 'customer', 'asdfg', 'kafka', 'some word']}
            > */}
      <SearchField
        placeholderText={placeholderText}
        searchText={filterText}
        setSearchText={onChange}
        width="350px"
        // addonAfter={
        //     <Popover trigger='click' placement='right' title='Search Settings' content={<this.Settings />}>
        //         <Icon type='setting' style={{ color: '#0006' }} />
        //     </Popover>
        // }
      />

      <AnimatePresence>
        {searchSummary && (
          <MotionSpan identityKey={searchSummary?.identity ?? 'null'} overrideAnimProps={animProps_span_searchResult}>
            <span style={{ opacity: 0.8, paddingLeft: '1em' }}>{searchSummary?.node}</span>
          </MotionSpan>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SearchBar;
