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
import { List, ListItem } from 'components/redpanda-ui/components/typography';

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
      <div className="text-body font-medium">Preview of selected topics:</div>

      {/* Show exact topics first */}
      {exactTopics.length > 0 && (
        <div>
          <Card size="sm">
            <CardContent space="sm">
              <div className="text-body font-medium">Exact topics ({exactTopics.length}):</div>
              <div className="max-h-[100px] overflow-y-auto">
                <List className="my-0">
                  {exactTopics.map((topic, idx) => (
                    <ListItem key={idx}>
                      <span className="text-body-sm font-mono text-gray-700">
                        {topic}
                      </span>
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
                <div className="text-body font-medium font-mono text-informative">
                  {topic}{' '}
                  <span className="text-body-sm text-gray-500">
                    (regex pattern)
                  </span>
                </div>
                {matchingTopics.length > 0 ? (
                  <>
                    <div className="text-body-sm text-gray-600">Matches {matchingTopics.length} existing topics:</div>
                    <div className="max-h-[100px] overflow-y-auto">
                      <List className="my-0">
                        {matchingTopics.map((matchedTopic, idx) => (
                          <ListItem key={idx}>
                            <span className="text-body-sm font-mono text-gray-700">
                              {matchedTopic}
                            </span>
                          </ListItem>
                        ))}
                      </List>
                    </div>
                  </>
                ) : (
                  <div className="text-body-sm text-gray-500">No existing topics match yet</div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
};
