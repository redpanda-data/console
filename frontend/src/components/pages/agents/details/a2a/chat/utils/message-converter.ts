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

import type { ChatMessage as ChatDbMessage } from 'database/chat-db';
import { nanoid } from 'nanoid';

import type { ChatMessage, ContentBlock } from '../types';

/**
 * Deserialize contentBlocks from database (ISO string → Date)
 */
const deserializeContentBlocks = (dbBlocks: import('database/chat-db').ContentBlock[]): ContentBlock[] =>
  dbBlocks.map((block): ContentBlock => ({ ...block, timestamp: new Date(block.timestamp) }) as ContentBlock);

/**
 * Build chat message from stored contentBlocks
 */
const buildMessageFromStoredBlocks = (dbMsg: ChatDbMessage): ChatMessage => ({
  id: dbMsg.id,
  role: dbMsg.sender === 'user' ? 'user' : 'assistant',
  contentBlocks: deserializeContentBlocks(dbMsg.contentBlocks ?? []),
  timestamp: dbMsg.timestamp,
  contextId: dbMsg.contextId,
  taskId: dbMsg.taskId,
  taskState: dbMsg.taskState as ChatMessage['taskState'],
  taskStartIndex: dbMsg.taskStartIndex,
});

/**
 * Reconstruct contentBlocks from flat fields (backward compatibility)
 */
const reconstructContentBlocks = (dbMsg: ChatDbMessage): ContentBlock[] => {
  const contentBlocks: ContentBlock[] = [];
  const now = new Date();

  // Add main content as task-status-update block
  if (dbMsg.content) {
    contentBlocks.push({
      type: 'task-status-update',
      text: dbMsg.content,
      final: false,
      timestamp: dbMsg.timestamp || now,
    });
  }

  // Add tool calls as blocks
  if (dbMsg.toolCalls) {
    const sortedToolCalls = [...dbMsg.toolCalls].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    for (const tool of sortedToolCalls) {
      contentBlocks.push({
        type: 'tool',
        toolCallId: tool.id,
        toolName: tool.name,
        state: tool.state as 'input-available' | 'output-available' | 'output-error',
        input: tool.input,
        output: tool.output,
        errorText: tool.errorText,
        timestamp: new Date(tool.timestamp),
        messageId: tool.messageId,
      });
    }
  }

  // Add artifacts as blocks
  if (dbMsg.artifacts) {
    for (const artifact of dbMsg.artifacts) {
      // Skip artifacts without required fields
      if (!artifact.id) {
        continue;
      }

      // Convert old text-only format to parts format for backward compatibility
      const parts = artifact.parts || (artifact.text ? [{ kind: 'text' as const, text: artifact.text }] : []);

      if (parts.length === 0) {
        continue;
      }

      contentBlocks.push({
        type: 'artifact',
        artifactId: artifact.id,
        name: artifact.name,
        description: artifact.description,
        parts,
        timestamp: now,
      });
    }
  }

  // Sort blocks by timestamp
  contentBlocks.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return contentBlocks;
};

/**
 * Convert database messages to component message format
 */
export const convertDbToComponent = (dbMessages: ChatDbMessage[]): ChatMessage[] =>
  dbMessages.map((dbMsg) => {
    // NEW: Prefer stored contentBlocks if available (preserves exact temporal structure)
    if (dbMsg.contentBlocks && dbMsg.contentBlocks.length > 0) {
      return buildMessageFromStoredBlocks(dbMsg);
    }

    // FALLBACK: Reconstruct contentBlocks from flat fields (backward compatibility)
    const contentBlocks = reconstructContentBlocks(dbMsg);

    return {
      id: dbMsg.id,
      role: dbMsg.sender === 'user' ? 'user' : 'assistant',
      contentBlocks,
      timestamp: dbMsg.timestamp,
      contextId: dbMsg.contextId,
      taskId: dbMsg.taskId,
      taskState: dbMsg.taskState as ChatMessage['taskState'],
      taskStartIndex: dbMsg.taskStartIndex,
    };
  });

/**
 * Create a new user message with contentBlocks
 */
export const createUserMessage = (prompt: string, contextId: string): ChatMessage => {
  const timestamp = new Date();
  return {
    id: nanoid(),
    role: 'user',
    contentBlocks: [{ type: 'task-status-update', text: prompt || 'Sent with attachments', final: false, timestamp }],
    timestamp,
    contextId,
  };
};

/**
 * Create a new assistant message placeholder with empty contentBlocks
 */
export const createAssistantMessage = (contextId: string): ChatMessage => ({
  id: nanoid(),
  role: 'assistant',
  contentBlocks: [],
  timestamp: new Date(),
  contextId,
});

/**
 * Create an error message with contentBlocks
 */
export const createErrorMessage = (contextId: string): ChatMessage => {
  const timestamp = new Date();
  return {
    id: nanoid(),
    role: 'assistant',
    contentBlocks: [
      { type: 'task-status-update', text: 'Sorry, I encountered an error. Please try again.', final: true, timestamp },
    ],
    timestamp,
    contextId,
  };
};
