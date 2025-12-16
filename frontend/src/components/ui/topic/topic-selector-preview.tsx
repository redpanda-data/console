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

import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { List, ListItem, Text } from 'components/redpanda-ui/components/typography';

const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/;

type TopicSelectorPreviewProps = {
  selectedTopics: string[];
  getMatchingTopics: (pattern: string) => string[];
};

export const TopicSelectorPreview = ({ selectedTopics, getMatchingTopics }: TopicSelectorPreviewProps) => {
  if (selectedTopics.length === 0) {
    return null;
  }

  const isRegexPattern = (str: string) => REGEX_SPECIAL_CHARS.test(str);

  const exactTopics = selectedTopics.filter((topic) => !isRegexPattern(topic));
  const regexTopics = selectedTopics.filter((topic) => isRegexPattern(topic));

  return (
    <div className="space-y-2">
      <Text className="font-medium text-sm">Preview of selected topics:</Text>

      {/* Show exact topics first */}
      {exactTopics.length > 0 && (
        <div>
          <Card size="sm">
            <CardContent space="sm">
              <Text className="font-medium text-sm">Exact topics ({exactTopics.length}):</Text>
              <div className="max-h-[100px] overflow-y-auto">
                <List className="my-0">
                  {exactTopics.map((topic, idx) => (
                    <ListItem key={idx}>
                      <Text as="span" className="font-mono text-gray-700 text-xs">
                        {topic}
                      </Text>
                    </ListItem>
                  ))}
                </List>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Show regex patterns with their matches */}
      {regexTopics.map((topic, index) => {
        const matchingTopics = getMatchingTopics(topic);

        return (
          <div key={index}>
            <Card size="sm" variant="ghost">
              <CardContent space="sm">
                <Text className="font-medium font-mono text-blue-600 text-sm">
                  {topic}{' '}
                  <Text as="span" className="text-gray-500 text-xs">
                    (regex pattern)
                  </Text>
                </Text>
                {matchingTopics.length > 0 ? (
                  <>
                    <Text className="text-gray-600 text-xs">Matches {matchingTopics.length} existing topics:</Text>
                    <div className="max-h-[100px] overflow-y-auto">
                      <List className="my-0">
                        {matchingTopics.map((matchedTopic, idx) => (
                          <ListItem key={idx}>
                            <Text as="span" className="font-mono text-gray-700 text-xs">
                              {matchedTopic}
                            </Text>
                          </ListItem>
                        ))}
                      </List>
                    </div>
                  </>
                ) : (
                  <Text className="text-gray-500 text-xs">No existing topics match yet</Text>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
};
