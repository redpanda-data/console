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

import { ConnectError } from '@connectrpc/connect';
import type { ChatMessage as ChatDbMessage } from 'database/chat-db';
import { chatDb } from 'database/chat-db';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { convertDbToComponent } from './message-converter';
import type { ChatMessage, ContentBlock } from '../types';

/**
 * Load messages from database for a specific agent and context
 */
export const loadMessages = async (agentId: string, contextId: string): Promise<ChatMessage[]> => {
  try {
    const dbMessages = await chatDb.messages
      .where('agentId')
      .equals(agentId)
      .and((msg) => msg.contextId === contextId)
      .sortBy('timestamp');

    return convertDbToComponent(dbMessages);
  } catch (loadChatError) {
    const connectError = ConnectError.from(loadChatError);
    toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'load', entity: 'chat' }));
    return [];
  }
};

/**
 * Serialize contentBlocks for database storage (Date → ISO string)
 */
const serializeContentBlocks = (blocks: ContentBlock[]): import('database/chat-db').ContentBlock[] =>
  blocks.map((block) => {
    if (block.type === 'tool') {
      return { ...block, timestamp: block.timestamp.toISOString() };
    }
    if (block.type === 'artifact') {
      return { ...block, timestamp: block.timestamp.toISOString() };
    }
    if (block.type === 'task-status-update') {
      return { ...block, timestamp: block.timestamp.toISOString() };
    }
    return block;
  }) as import('database/chat-db').ContentBlock[];

/**
 * Save a message to the database
 */
export const saveMessage = async (
  message: ChatMessage,
  agentId: string,
  options?: { isStreaming?: boolean; failure?: boolean }
): Promise<void> => {
  try {
    // Extract text content from contentBlocks
    const textBlock = message.contentBlocks.find((block) => block.type === 'task-status-update');
    const textContent = textBlock?.type === 'task-status-update' ? textBlock.text || '' : '';

    const dbMessage: ChatDbMessage = {
      id: message.id,
      agentId,
      content: textContent,
      sender: message.role === 'user' ? 'user' : 'system',
      timestamp: message.timestamp,
      failure: options?.failure ?? false,
      contextId: message.contextId,
      taskId: message.taskId,
      taskState: message.taskState,
      isStreaming: options?.isStreaming,
      taskStartIndex: message.taskStartIndex,
      contentBlocks: serializeContentBlocks(message.contentBlocks), // NEW: Store contentBlocks structure
      usage: message.usage, // Store usage metadata
    };

    await chatDb.addMessage(dbMessage);
  } catch (saveMessageError) {
    const connectError = ConnectError.from(saveMessageError);
    toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'save', entity: 'message' }));
  }
};

/**
 * Update a message in the database
 */
export const updateMessage = async (
  messageId: string,
  updates: {
    content?: string;
    isStreaming?: boolean;
    taskId?: string;
    taskState?: string;
    taskStartIndex?: number;
    artifacts?: Array<{
      artifactId: string;
      name?: string;
      description?: string;
      parts: import('../types').ArtifactPart[];
    }>;
    toolCalls?: Array<{
      id: string;
      name: string;
      state: string;
      input?: unknown;
      output?: unknown;
      errorText?: string;
      messageId: string;
      timestamp: Date;
    }>;
    contentBlocks?: ContentBlock[]; // NEW: store content blocks
    usage?: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      max_input_tokens?: number;
      cached_tokens?: number;
      reasoning_tokens?: number;
    };
  }
): Promise<void> => {
  try {
    // Convert artifacts to database format if provided
    const dbUpdates: Parameters<typeof chatDb.updateMessage>[1] = {
      content: updates.content,
      isStreaming: updates.isStreaming,
      taskId: updates.taskId,
      taskState: updates.taskState,
      taskStartIndex: updates.taskStartIndex,
      usage: updates.usage,
    };

    if (updates.artifacts) {
      dbUpdates.artifacts = updates.artifacts.map((art) => ({
        id: art.artifactId,
        name: art.name,
        description: art.description,
        parts: art.parts,
      }));
    }

    if (updates.toolCalls) {
      dbUpdates.toolCalls = updates.toolCalls.map((tool) => ({
        id: tool.id,
        name: tool.name,
        state: tool.state as 'input-available' | 'output-available' | 'output-error',
        input: tool.input,
        output: tool.output,
        errorText: tool.errorText,
        messageId: tool.messageId,
        timestamp: tool.timestamp,
      }));
    }

    // NEW: Store contentBlocks if provided (serialize timestamps)
    if (updates.contentBlocks) {
      dbUpdates.contentBlocks = serializeContentBlocks(updates.contentBlocks);
    }

    await chatDb.updateMessage(messageId, dbUpdates);
  } catch (updateMessageError) {
    const connectError = ConnectError.from(updateMessageError);
    toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'update', entity: 'message' }));
  }
};

/**
 * Delete multiple messages from the database
 */
export const deleteMessages = async (messageIds: string[]): Promise<void> => {
  try {
    await chatDb.messages.bulkDelete(messageIds);
  } catch (deleteMessagesError) {
    const connectError = ConnectError.from(deleteMessagesError);
    toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'delete', entity: 'messages' }));
  }
};

/**
 * Delete all messages for a specific agent and context
 */
export const clearChatHistory = async (agentId: string, contextId: string): Promise<void> => {
  try {
    await chatDb.messages
      .where('agentId')
      .equals(agentId)
      .and((msg) => msg.contextId === contextId)
      .delete();
  } catch (deleteChatError) {
    const connectError = ConnectError.from(deleteChatError);
    toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'delete', entity: 'chat' }));
  }
};
