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

export const KnowledgeBaseDocumentDetailsPage = () => {
  const location = useLocation();

  // Get document data from location state (passed from the table)
  const { chunkId, topic, documentName, content, score } = location.state;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <h1 className="text-heading-xl">{documentName}</h1>

      {/* Metadata Card */}
      <Card>
        <CardContent>
          <div className="flex gap-8">
            {score !== undefined && (
              <div>
                <div className="mb-1 font-medium text-body text-muted-foreground">Relevance Score</div>
                <div className="font-mono text-body">{score.toFixed(3)}</div>
              </div>
            )}
            <div>
              <div className="mb-1 font-medium text-body text-muted-foreground">Topic</div>
              <a
                className="text-informative hover:text-informative hover:underline"
                href={`/clusters/${config.clusterId}/topics/${encodeURIComponent(topic ?? '')}`}
              >
                {topic}
              </a>
            </div>
            <div>
              <div className="mb-1 font-medium text-body text-muted-foreground">Chunk ID</div>
              <div className="font-mono text-body">{chunkId}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Card */}
      <Card size="full">
        <CardContent className="space-y-4">
          <div className="font-medium text-body text-muted-foreground">Content</div>
          <Response className="whitespace-pre-wrap break-words">{content}</Response>
        </CardContent>
      </Card>
    </div>
  );
};
