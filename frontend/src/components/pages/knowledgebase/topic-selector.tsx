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
    <div className="space-y-4">
      <div>
        <Text className="mb-2 text-sm" variant="muted">
          Select topics or type regex patterns (e.g., my-topics-prefix-.*) and press Enter to add them.
        </Text>

        <MultiSelect
          disabled={isReadOnly}
          onSearch={(keyword) => setSearchTerm(keyword || '')}
          onValueChange={handleValueChange}
          value={selectedTopics}
        >
          <MultiSelectTrigger className="w-full">
            <MultiSelectValue
              placeholder={isLoading ? 'Loading topics...' : 'Select topics or add regex patterns...'}
            />
          </MultiSelectTrigger>
          <MultiSelectContent>
            <MultiSelectSearch
              onKeyDown={(e) => {
                // Allow adding custom regex patterns by pressing Enter
                if (e.key === 'Enter' && searchTerm && !allTopics.includes(searchTerm)) {
                  e.preventDefault();
                  onTopicsChange([...selectedTopics, searchTerm]);
                  setSearchTerm('');
                }
              }}
              placeholder="Search topics or type regex pattern..."
            />
            <MultiSelectList>
              {filteredTopics.length > 0 &&
                filteredTopics.map((topic) => (
                  <MultiSelectItem key={topic} value={topic}>
                    {topic}
                  </MultiSelectItem>
                ))}
              {filteredTopics.length === 0 && searchTerm && (
                <div className="px-2 py-6 text-center text-sm">
                  <Text className="text-muted-foreground">
                    Press <kbd className="rounded border bg-muted px-1 text-xs">Enter</kbd> to add "{searchTerm}" as a
                    regex pattern
                  </Text>
                </div>
              )}
              <MultiSelectEmpty>No topics found</MultiSelectEmpty>
            </MultiSelectList>
          </MultiSelectContent>
        </MultiSelect>
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
