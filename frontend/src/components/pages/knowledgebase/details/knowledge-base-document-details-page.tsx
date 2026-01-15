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

import { useLocation } from '@tanstack/react-router';
import { config } from 'config';

import { Response } from '../../../ai-elements/response';
import { Card, CardContent } from '../../../redpanda-ui/components/card';
import { Heading, Text } from '../../../redpanda-ui/components/typography';

export const KnowledgeBaseDocumentDetailsPage = () => {
  const location = useLocation();

  // Get document data from location state (passed from the table)
  const { chunkId, topic, documentName, content, score } = location.state;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <Heading level={1}>{documentName}</Heading>

      {/* Metadata Card */}
      <Card>
        <CardContent>
          <div className="flex gap-8">
            {score !== undefined && (
              <div>
                <Text className="mb-1 font-medium text-sm" variant="muted">
                  Relevance Score
                </Text>
                <Text className="font-mono" variant="default">
                  {score.toFixed(3)}
                </Text>
              </div>
            )}
            <div>
              <Text className="mb-1 font-medium text-sm" variant="muted">
                Topic
              </Text>
              <a
                className="text-blue-500 hover:text-blue-600 hover:underline"
                href={`/clusters/${config.clusterId}/topics/${encodeURIComponent(topic ?? '')}`}
              >
                {topic}
              </a>
            </div>
            <div>
              <Text className="mb-1 font-medium text-sm" variant="muted">
                Chunk ID
              </Text>
              <Text className="font-mono" variant="default">
                {chunkId}
              </Text>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Card */}
      <Card size="full">
        <CardContent className="space-y-4">
          <Text className="font-medium text-sm" variant="muted">
            Content
          </Text>
          <Response className="whitespace-pre-wrap break-words">{content}</Response>
        </CardContent>
      </Card>
    </div>
  );
};
