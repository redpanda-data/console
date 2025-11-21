/**
 * Copyright 2024 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import React from 'react';
import { Link } from 'react-router-dom';

import { Response } from '../../ai-elements/response';
import { Card, CardContent } from '../../redpanda-ui/components/card';
import { CopyButton } from '../../redpanda-ui/components/copy-button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../redpanda-ui/components/dialog';
import { InlineCode, Text, Link as TypographyLink } from '../../redpanda-ui/components/typography';

type KnowledgeBaseChunkPreviewDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  chunkText: string;
  chunkInfo: {
    document: string;
    chunkId: string;
    topic: string;
  } | null;
};

export const KnowledgeBaseChunkPreviewDialog = React.memo<KnowledgeBaseChunkPreviewDialogProps>(
  ({ isOpen, onClose, chunkText, chunkInfo }) => (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="max-w-5xl" size="xl">
        <DialogHeader>
          <DialogTitle>Chunk Text Preview</DialogTitle>
          <DialogDescription>View the full text content and metadata for this knowledge base chunk</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-6">
          {chunkInfo && (
            <Card className="bg-gray-50" size="full" variant="outlined">
              <CardContent padding="md" space="sm">
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3">
                  <Text as="span" className="font-semibold text-foreground" variant="small">
                    Document:
                  </Text>
                  <div className="flex min-w-0 items-center gap-2">
                    <InlineCode className="max-w-[400px] truncate" title={chunkInfo.document}>
                      {chunkInfo.document}
                    </InlineCode>
                    <CopyButton content={chunkInfo.document} size="sm" variant="ghost" />
                  </div>

                  <Text as="span" className="font-semibold text-foreground" variant="small">
                    Chunk ID:
                  </Text>
                  <InlineCode>{chunkInfo.chunkId}</InlineCode>

                  <Text as="span" className="font-semibold text-foreground" variant="small">
                    Topic:
                  </Text>
                  <TypographyLink as={Link} to={`../../topics/${encodeURIComponent(chunkInfo.topic)}`}>
                    {chunkInfo.topic}
                  </TypographyLink>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <Text as="div" className="font-semibold text-muted-foreground" variant="small">
              Chunk Content
            </Text>
            <Card size="full" variant="default">
              <CardContent className="max-h-[600px] overflow-y-auto" padding="md">
                <Response className="text-sm leading-relaxed">{chunkText}</Response>
              </CardContent>
            </Card>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
);
