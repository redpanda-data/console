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

import { ConnectError } from '@connectrpc/connect';
import { Clock, Send, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { KnowledgeBaseChunkPreviewDialog } from './knowledge-base-chunk-preview-dialog';
import { KnowledgeBaseDocumentList, type RetrievalResult } from './knowledge-base-document-list';
import type { KnowledgeBase } from '../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useCallMCPServerToolMutation } from '../../../react-query/api/remote-mcp';
import { Button } from '../../redpanda-ui/components/button';
import { DynamicCodeBlock } from '../../redpanda-ui/components/code-block-dynamic';
import { FormItem, FormLabel } from '../../redpanda-ui/components/form';
import { Input } from '../../redpanda-ui/components/input';
import { Skeleton } from '../../redpanda-ui/components/skeleton';
import { Textarea } from '../../redpanda-ui/components/textarea';
import { Heading, Text } from '../../redpanda-ui/components/typography';

type PlaygroundTabProps = {
  knowledgeBase: KnowledgeBase;
};

type MCPToolResponse = {
  content: Array<{
    type: string;
    text?: string;
  }>;
};

export const PlaygroundTab = React.memo<PlaygroundTabProps>(({ knowledgeBase }) => {
  const [query, setQuery] = useState('');
  const [topN, setTopN] = useState(10);
  const [retrievalResults, setRetrievalResults] = useState<RetrievalResult[]>([]);

  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [selectedChunkText, setSelectedChunkText] = useState('');
  const [selectedChunkInfo, setSelectedChunkInfo] = useState<{
    document: string;
    chunkId: string;
    topic: string;
  } | null>(null);

  // Abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  const { mutateAsync: callMCPTool, isPending: isQueryLoading, error: queryError } = useCallMCPServerToolMutation();

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    },
    []
  );

  const cancelQuery = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const callRetrievalAPI = useCallback(async () => {
    if (!query.trim()) {
      toast.error('Query Required', {
        description: 'Please enter a query to retrieve results.',
      });
      return;
    }

    if (!knowledgeBase.retrievalApiUrl) {
      toast.error('No Retrieval API', {
        description: 'This knowledge base does not have a retrieval API URL configured.',
      });
      return;
    }

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const mcpResponse = (await callMCPTool({
        serverUrl: knowledgeBase.retrievalApiUrl,
        toolName: 'retrieval',
        parameters: {
          query,
          top_n: topN,
        },
        signal: abortController.signal,
      })) as MCPToolResponse;

      if (!mcpResponse.content || mcpResponse.content.length === 0) {
        toast.error('Invalid Response', {
          description: 'No content returned from the retrieval API.',
        });
        return;
      }

      const textContent = mcpResponse.content[0];
      if (textContent.type !== 'text' || !textContent.text) {
        toast.error('Invalid Response', {
          description: 'Expected text content from the retrieval API.',
        });
        return;
      }

      const results = JSON.parse(textContent.text);
      if (!Array.isArray(results)) {
        toast.error('Invalid Response', {
          description: 'Expected array of results from the retrieval API.',
        });
        return;
      }

      setRetrievalResults(results);
    } catch (error) {
      // Don't show toast for cancellation
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage !== 'Request was cancelled' && !errorMessage.includes('abort')) {
        const connectError = ConnectError.from(error);
        toast.error(
          formatToastErrorMessageGRPC({
            error: connectError,
            action: 'retrieve',
            entity: 'knowledge base',
          })
        );
      }
    } finally {
      // Clear the abort controller ref when request completes
      abortControllerRef.current = null;
    }
  }, [query, knowledgeBase.retrievalApiUrl, topN, callMCPTool]);

  const openTextModal = useCallback((result: RetrievalResult) => {
    setSelectedChunkText(result.text);
    setSelectedChunkInfo({
      document: result.document_name,
      chunkId: result.chunk_id,
      topic: result.topic,
    });
    setIsTextModalOpen(true);
  }, []);

  const closeTextModal = useCallback(() => {
    setIsTextModalOpen(false);
    setSelectedChunkText('');
    setSelectedChunkInfo(null);
  }, []);

  return (
    <>
      <div className="flex flex-col gap-4">
        <Heading level={2}>Playground</Heading>

        {knowledgeBase.retrievalApiUrl && (
          <div className="space-y-2">
            <FormLabel>Retrieval API URL</FormLabel>
            <DynamicCodeBlock code={knowledgeBase.retrievalApiUrl} lang="text" />
          </div>
        )}
        <FormItem>
          <FormLabel>Query</FormLabel>
          <Textarea
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                callRetrievalAPI().catch(() => {
                  // Error already handled by the API call
                });
              }
            }}
            placeholder="Enter your query here... (e.g., 'which redpanda tiers exist? Show a table')"
            rows={3}
            value={query}
          />
        </FormItem>

        <FormItem>
          <FormLabel>Number of Results</FormLabel>
          <Input
            className="w-[120px]"
            max={100}
            min={1}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (value >= 1 && value <= 100) {
                setTopN(value);
              } else if (value > 100) {
                setTopN(100);
              } else {
                setTopN(1);
              }
            }}
            type="number"
            value={topN}
          />
        </FormItem>

        <div className="flex gap-2">
          {isQueryLoading ? (
            <>
              <Button disabled variant="secondary">
                <Clock className="h-4 w-4 animate-spin" />
                Retrieving...
              </Button>
              <Button onClick={cancelQuery} variant="destructive">
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </>
          ) : (
            <Button
              disabled={!(knowledgeBase.retrievalApiUrl && query.trim())}
              onClick={callRetrievalAPI}
              variant="secondary"
            >
              <Send className="h-4 w-4" />
              Submit Query
            </Button>
          )}
        </div>

        {/* Loading skeleton */}
        {isQueryLoading && retrievalResults.length === 0 && (
          <div className="flex flex-col gap-2">
            <Text as="div" variant="small">
              Results
            </Text>
            <Skeleton className="h-[250px] w-full rounded-xl" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {/* Error display */}
        {!isQueryLoading && queryError && (
          <div className="flex flex-col gap-2">
            <Text as="div" variant="small">
              Error
            </Text>
            <div className="rounded-lg border border-red-500 bg-red-50 p-4">
              <Text className="text-red-700" variant="default">
                {queryError.message || 'An error occurred while retrieving results'}
              </Text>
            </div>
          </div>
        )}

        {/* Results table */}
        {retrievalResults.length > 0 && (
          <KnowledgeBaseDocumentList isLoading={isQueryLoading} onRowClick={openTextModal} results={retrievalResults} />
        )}
      </div>

      <KnowledgeBaseChunkPreviewDialog
        chunkInfo={selectedChunkInfo}
        chunkText={selectedChunkText}
        isOpen={isTextModalOpen}
        onClose={closeTextModal}
      />
    </>
  );
});

PlaygroundTab.displayName = 'PlaygroundTab';
