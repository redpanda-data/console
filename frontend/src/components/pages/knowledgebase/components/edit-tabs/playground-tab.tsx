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

import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { PlaygroundTabProps } from './types';
import { config } from '../../../../../config';
import { createMCPClientWithSession } from '../../../../../react-query/api/remote-mcp';
import { ChatMarkdown } from '../../../../chat/chat-markdown';
import { Badge } from '../../../../redpanda-ui/components/badge';
import { Button } from '../../../../redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../../redpanda-ui/components/dialog';
import { FormItem, FormLabel } from '../../../../redpanda-ui/components/form';
import { Input } from '../../../../redpanda-ui/components/input';
import { RadioGroup, RadioGroupItem } from '../../../../redpanda-ui/components/radio-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../redpanda-ui/components/table';
import { Textarea } from '../../../../redpanda-ui/components/textarea';

type MCPToolResponse = {
  content: Array<{
    type: string;
    text?: string;
  }>;
};

export const PlaygroundTab = React.memo<PlaygroundTabProps>(({ knowledgeBase }) => {
  const [playgroundMode, setPlaygroundMode] = useState<'retrieve' | 'chat'>('retrieve');
  const [query, setQuery] = useState('');
  const [topN, setTopN] = useState(10);
  const [isQueryLoading, setIsQueryLoading] = useState(false);
  const [retrievalResults, setRetrievalResults] = useState<
    Array<{
      score?: number;
      document_name: string;
      chunk_id: string;
      topic: string;
      text: string;
    }>
  >([]);
  const [chatResponse, setChatResponse] = useState('');
  const [chatLoadingPhase, setChatLoadingPhase] = useState<'retrieving' | 'thinking'>('retrieving');

  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [selectedChunkText, setSelectedChunkText] = useState('');
  const [selectedChunkInfo, setSelectedChunkInfo] = useState<{
    document: string;
    chunkId: string;
    topic: string;
  } | null>(null);

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

    setIsQueryLoading(true);
    try {
      const token = config.jwt;

      if (!token) {
        toast.error('Authentication Required', {
          description: 'JWT token is not available. Please ensure you are properly authenticated.',
        });
        return;
      }

      const { client } = await createMCPClientWithSession(knowledgeBase.retrievalApiUrl, 'redpanda-console-playground');

      const mcpResponse = (await client.callTool({
        name: 'retrieval',
        arguments: {
          query,
          top_n: topN,
        },
      })) as MCPToolResponse;

      if (!mcpResponse.content || mcpResponse.content.length === 0) {
        throw new Error('Invalid MCP response: no content returned');
      }

      const textContent = mcpResponse.content[0];
      if (textContent.type !== 'text' || !textContent.text) {
        throw new Error('Invalid MCP response: expected text content');
      }

      const results = JSON.parse(textContent.text);
      if (!Array.isArray(results)) {
        throw new Error('Invalid MCP response: expected array of results');
      }

      setRetrievalResults(results);

      toast.success('Query Completed', {
        description: `Retrieved ${results.length} results`,
      });
    } catch (error) {
      toast.error('Query Failed', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsQueryLoading(false);
    }
  }, [query, knowledgeBase.retrievalApiUrl, topN]);

  const callChatAPI = useCallback(async () => {
    if (!query.trim()) {
      toast.error('Query Required', {
        description: 'Please enter a query to chat.',
      });
      return;
    }

    if (!knowledgeBase.retrievalApiUrl) {
      toast.error('No Chat API', {
        description: 'This knowledge base does not have a chat API URL configured.',
      });
      return;
    }

    setIsQueryLoading(true);
    setChatLoadingPhase('retrieving');

    const thinkingTimer = setTimeout(() => {
      setChatLoadingPhase('thinking');
    }, 1000);

    try {
      const token = config.jwt;

      if (!token) {
        clearTimeout(thinkingTimer);
        setIsQueryLoading(false);
        toast.error('Authentication Required', {
          description: 'JWT token is not available. Please ensure you are properly authenticated.',
        });
        return;
      }

      const { client } = await createMCPClientWithSession(knowledgeBase.retrievalApiUrl, 'redpanda-console-playground');

      const mcpResponse = (await client.callTool({
        name: 'chat',
        arguments: {
          query,
          top_n: topN,
        },
      })) as MCPToolResponse;

      if (!mcpResponse.content || mcpResponse.content.length === 0) {
        throw new Error('Invalid MCP response: no content returned');
      }

      const textContent = mcpResponse.content[0];
      if (textContent.type !== 'text' || !textContent.text) {
        throw new Error('Invalid MCP response: expected text content');
      }

      const result = JSON.parse(textContent.text);
      if (typeof result !== 'object' || result === null) {
        throw new Error('Invalid MCP response: expected JSON object');
      }

      setChatResponse(result.response || 'No response received');

      toast.success('Chat Completed', {
        description: 'Received chat response',
      });
    } catch (error) {
      toast.error('Chat Failed', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      clearTimeout(thinkingTimer);
      setIsQueryLoading(false);
    }
  }, [query, knowledgeBase.retrievalApiUrl, topN]);

  const openTextModal = useCallback((text: string, document: string, chunkId: string, topic: string) => {
    setSelectedChunkText(text);
    setSelectedChunkInfo({ document, chunkId, topic });
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
        <h2 className="font-semibold text-lg">Playground</h2>

        <FormItem>
          <FormLabel>Mode</FormLabel>
          <RadioGroup
            onValueChange={(value) => setPlaygroundMode(value as 'retrieve' | 'chat')}
            orientation="horizontal"
            value={playgroundMode}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id="mode-retrieve" value="retrieve" />
              <label className="cursor-pointer font-medium text-sm" htmlFor="mode-retrieve">
                Retrieve
              </label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="mode-chat" value="chat" />
              <label className="cursor-pointer font-medium text-sm" htmlFor="mode-chat">
                Chat
              </label>
            </div>
          </RadioGroup>
        </FormItem>

        {playgroundMode === 'retrieve' && (
          <div className="flex flex-col gap-4">
            <FormItem>
              <FormLabel>Query</FormLabel>
              <Textarea
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    callRetrievalAPI().catch(() => {});
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
                onChange={(e) => setTopN(Number(e.target.value))}
                type="number"
                value={topN}
              />
            </FormItem>

            <Button
              className="w-fit"
              disabled={!knowledgeBase.retrievalApiUrl || isQueryLoading}
              onClick={callRetrievalAPI}
            >
              {isQueryLoading ? 'Retrieving...' : 'Submit Query'}
            </Button>

            {knowledgeBase.retrievalApiUrl && (
              <p className="text-gray-600 text-sm">Using retrieval API: {knowledgeBase.retrievalApiUrl}</p>
            )}

            {retrievalResults.length > 0 && (
              <div>
                <h3 className="mb-3 font-semibold text-md">Results ({retrievalResults.length})</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Score</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Chunk ID</TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead>Text Preview</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {retrievalResults.map((result, index) => (
                      <TableRow key={index}>
                        <TableCell>{result.score?.toFixed(3)}</TableCell>
                        <TableCell>{result.document_name}</TableCell>
                        <TableCell>{result.chunk_id}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{result.topic}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <button
                            className="line-clamp-2 cursor-pointer text-left text-blue-500 text-sm hover:text-blue-600 hover:underline"
                            onClick={() =>
                              openTextModal(result.text, result.document_name, result.chunk_id, result.topic)
                            }
                            title="Click to view full text"
                            type="button"
                          >
                            {result.text}
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {playgroundMode === 'chat' && (
          <div className="flex flex-col gap-4">
            <FormItem>
              <FormLabel>Chat Message</FormLabel>
              <Textarea
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    callChatAPI().catch(() => {});
                  }
                }}
                placeholder="Ask a question about your knowledge base... (e.g., 'What are the different redpanda tiers and their features?')"
                rows={3}
                value={query}
              />
            </FormItem>

            <FormItem>
              <FormLabel>Number of Context Documents</FormLabel>
              <Input
                className="w-[120px]"
                max={100}
                min={1}
                onChange={(e) => setTopN(Number(e.target.value))}
                type="number"
                value={topN}
              />
            </FormItem>

            <Button className="w-fit" disabled={!knowledgeBase.retrievalApiUrl || isQueryLoading} onClick={callChatAPI}>
              {isQueryLoading
                ? chatLoadingPhase === 'retrieving'
                  ? 'Retrieving documents...'
                  : 'Thinking...'
                : 'Send Message'}
            </Button>

            {knowledgeBase.retrievalApiUrl && (
              <p className="text-gray-600 text-sm">Using chat API: {knowledgeBase.retrievalApiUrl}</p>
            )}

            {chatResponse && (
              <div>
                <h3 className="mb-3 font-semibold text-md">Response</h3>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                  <ChatMarkdown
                    message={{
                      content: chatResponse,
                      sender: 'system' as const,
                      timestamp: new Date(),
                      id: 'chat-response',
                      agentId: 'knowledgebase',
                      failure: false,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog onOpenChange={(open) => !open && closeTextModal()} open={isTextModalOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Chunk Text Preview</DialogTitle>
            {selectedChunkInfo && (
              <div className="flex gap-4 text-gray-600 text-sm">
                <p>
                  <strong>Document:</strong> {selectedChunkInfo.document}
                </p>
                <p>
                  <strong>Chunk ID:</strong> {selectedChunkInfo.chunkId}
                </p>
                <Badge variant="outline">{selectedChunkInfo.topic}</Badge>
              </div>
            )}
          </DialogHeader>
          <DialogBody>
            <div className="max-h-[400px] overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{selectedChunkText}</p>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
});

PlaygroundTab.displayName = 'PlaygroundTab';
