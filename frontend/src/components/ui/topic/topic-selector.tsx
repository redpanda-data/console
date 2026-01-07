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

'use client';

import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectSearch,
  MultiSelectTrigger,
  MultiSelectValue,
} from 'components/redpanda-ui/components/multi-select';
import { Text } from 'components/redpanda-ui/components/typography';
import { useMemo, useState } from 'react';
import { useListTopicsQuery } from 'react-query/api/topic';

type TopicSelectorProps = {
  selectedTopics: string[];
  onTopicsChange: (topics: string[]) => void;
  isReadOnly?: boolean;
};

export const TopicSelector = ({ selectedTopics, onTopicsChange, isReadOnly = false }: TopicSelectorProps) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all topics (hideInternalTopics filters out topic.internal and topics starting with '_')
  // Disable the query in read-only mode since we don't need to fetch topics when just displaying
  const { data: topicsData, isLoading } = useListTopicsQuery(
    undefined,
    { enabled: !isReadOnly },
    { hideInternalTopics: true }
  );

  // Additional filtering for topics starting with '__redpanda' (double underscore)
  // Note: Single underscore prefixes (_schemas, _internal, _redpanda) are already filtered by hideInternalTopics
  const allTopics = (topicsData?.topics || [])
    .map((topic) => topic.name)
    .filter((name) => !name.startsWith('__redpanda'));

  // Filter topics based on search term
  const filteredTopics = useMemo(() => {
    if (!searchTerm) {
      return allTopics;
    }
    const lowerSearch = searchTerm.toLowerCase();
    return allTopics.filter((topic) => topic.toLowerCase().includes(lowerSearch));
  }, [allTopics, searchTerm]);

  // Handle selecting items (both from list and custom patterns via Enter key)
  const handleValueChange = (values: string[]) => {
    onTopicsChange(values);
  };

  return (
    <MultiSelect
      disabled={isReadOnly}
      onSearch={(keyword) => setSearchTerm(keyword || '')}
      onValueChange={handleValueChange}
      value={selectedTopics}
    >
      <MultiSelectTrigger className="w-full">
        <MultiSelectValue placeholder={isLoading ? 'Loading topics...' : 'Select topics...'} />
      </MultiSelectTrigger>
      <MultiSelectContent>
        <MultiSelectSearch placeholder="Search topics..." />
        <MultiSelectList>
          {filteredTopics.length > 0 &&
            filteredTopics.map((topic) => (
              <MultiSelectItem key={topic} value={topic}>
                {topic}
              </MultiSelectItem>
            ))}
          {filteredTopics.length === 0 && searchTerm && (
            <div className="flex min-h-32 items-center justify-center px-2 py-6">
              <Text className="text-muted-foreground text-sm">No topics found matching "{searchTerm}"</Text>
            </div>
          )}
          <MultiSelectEmpty>No topics found</MultiSelectEmpty>
        </MultiSelectList>
      </MultiSelectContent>
    </MultiSelect>
  );
};
