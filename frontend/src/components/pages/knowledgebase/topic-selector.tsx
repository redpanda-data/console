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

import { create } from '@bufbuild/protobuf';
import { useQuery } from '@connectrpc/connect-query';
import { isMultiValue, Select } from '@redpanda-data/ui';
import { FormLabel } from 'components/redpanda-ui/components/form';
import { Text } from 'components/redpanda-ui/components/typography';
import { ListTopicsRequestSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { useMemo, useState } from 'react';

const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/;

type TopicSelectorProps = {
  selectedTopics: string[];
  onTopicsChange: (topics: string[]) => void;
  isReadOnly?: boolean;
};

export const TopicSelector = ({ selectedTopics, onTopicsChange, isReadOnly = false }: TopicSelectorProps) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all topics
  const { data: topicsData, isLoading } = useQuery(
    listTopics,
    create(ListTopicsRequestSchema, {
      pageSize: 1000,
      pageToken: '',
      filter: {
        nameContains: '',
      },
    })
  );

  const allTopics = (topicsData?.topics || [])
    .filter((topic) => !topic.internal)
    .map((topic) => topic.name)
    .filter(
      (name) =>
        !(name.startsWith('__redpanda') || name.startsWith('_internal') || name.startsWith('_redpanda')) &&
        name !== '_schemas'
    );

  // Check if a string is a regex pattern (contains regex special characters)
  const isRegexPattern = (str: string) => REGEX_SPECIAL_CHARS.test(str);

  // Get matching topics for a pattern - always treat as regex if possible, fallback to substring
  const getMatchingTopics = useMemo(
    () => (pattern: string) => {
      if (!pattern) {
        return [];
      }

      try {
        const regex = new RegExp(pattern);
        const matches = allTopics.filter((topic) => regex.test(topic));
        return matches;
      } catch (_error) {
        // If regex is invalid, fall back to substring match
        return allTopics.filter((topic) => topic.toLowerCase().includes(pattern.toLowerCase()));
      }
    },
    [allTopics]
  );

  // Create options for the select dropdown - always show all topics
  const topicOptions = allTopics.map((name) => ({
    value: name,
    label: name,
  }));

  // Filter options based on search term - always treat as regex first
  const filteredOptions = searchTerm
    ? topicOptions.filter((option) => {
        const matchingTopics = getMatchingTopics(searchTerm);
        return matchingTopics.includes(option.value);
      })
    : topicOptions;

  // Custom option component - show if filtered by regex
  const formatOptionLabel = (option: { value: string; label?: React.ReactNode }): React.ReactNode => {
    // Show if this option is being shown because it matches a regex search
    if (searchTerm && isRegexPattern(searchTerm)) {
      return (
        <div>
          <Text className="font-medium">
            {option.value}{' '}
            <Text as="span" className="text-blue-600 text-xs">
              (matches: {searchTerm})
            </Text>
          </Text>
        </div>
      );
    }
    return option.label;
  };

  // Allow custom input (for regex patterns)
  const handleInputChange = (inputValue: string, { action }: { action: string }) => {
    if (action === 'input-change') {
      setSearchTerm(inputValue);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && searchTerm && !topicOptions.find((opt) => opt.value === searchTerm)) {
      // Add the search term as a new option (likely a regex pattern)
      const newTopics = [...selectedTopics, searchTerm];
      onTopicsChange(newTopics);
      setSearchTerm('');
      event.preventDefault();
    }
  };

  // Format the selected values
  const selectedValues = selectedTopics.map((topic) => {
    const matchingCount = isRegexPattern(topic) ? getMatchingTopics(topic).length : 1;
    return {
      value: topic,
      label: isRegexPattern(topic) ? `${topic} (${matchingCount} matches)` : topic,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <FormLabel required>Input Topics</FormLabel>
        <Text className="mb-2 text-sm" variant="muted">
          Select topics or enter regex patterns (e.g., my-topics-prefix-.*) to index for this knowledge base.
        </Text>

        <Select
          filterOption={() => true}
          formatOptionLabel={formatOptionLabel}
          inputValue={searchTerm}
          isDisabled={isReadOnly}
          isLoading={isLoading}
          isMulti
          isSearchable={!isReadOnly}
          noOptionsMessage={() => (searchTerm ? `Press Enter to add pattern: ${searchTerm}` : 'No topics found')}
          onChange={(selected) => {
            if (isMultiValue(selected)) {
              onTopicsChange(selected.map((item) => item.value));
            } else {
              onTopicsChange([]);
            }
            // Clear search term when selection changes
            setSearchTerm('');
          }}
          onInputChange={handleInputChange}
          onKeyDown={handleKeyDown}
          options={filteredOptions}
          placeholder="Search topics or enter regex patterns..."
          value={selectedValues}
        />
      </div>

      {/* Show preview of what each selected item matches */}
      {selectedTopics.length > 0 && (
        <div>
          <Text className="mb-2 font-medium text-sm">Preview of selected topics:</Text>

          {/* Show exact topics first */}
          {selectedTopics.filter((topic) => !isRegexPattern(topic)).length > 0 && (
            <div className="mb-2 rounded-md border border-gray-200 bg-gray-50 p-2">
              <Text className="mb-1 font-medium text-sm">
                Exact topics ({selectedTopics.filter((topic) => !isRegexPattern(topic)).length}):
              </Text>
              <div className="max-h-[100px] overflow-y-auto">
                {selectedTopics
                  .filter((topic) => !isRegexPattern(topic))
                  .map((topic, idx) => (
                    <Text className="pl-2 text-gray-700 text-xs" key={idx}>
                      • {topic}
                    </Text>
                  ))}
              </div>
            </div>
          )}

          {/* Show regex patterns with their matches */}
          {selectedTopics
            .filter((topic) => isRegexPattern(topic))
            .map((topic, index) => {
              const matchingTopics = getMatchingTopics(topic);

              return (
                <div className="mb-2 rounded-md border border-gray-200 bg-gray-50 p-2" key={index}>
                  <Text className="font-medium text-blue-600 text-sm">
                    {topic}{' '}
                    <Text as="span" className="text-gray-500 text-xs">
                      (regex pattern)
                    </Text>
                  </Text>
                  {matchingTopics.length > 0 ? (
                    <div className="mt-1">
                      <Text className="mb-1 text-gray-600 text-xs">Matches {matchingTopics.length} topics:</Text>
                      <div className="max-h-[100px] overflow-y-auto">
                        {matchingTopics.map((matchedTopic, idx) => (
                          <Text className="pl-2 text-gray-700 text-xs" key={idx}>
                            • {matchedTopic}
                          </Text>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Text className="mt-1 text-red-500 text-xs">No topics match this pattern</Text>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};
