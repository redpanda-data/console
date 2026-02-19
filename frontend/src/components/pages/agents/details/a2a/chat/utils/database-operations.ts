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

import { createA2AClient } from './a2a-client';
import { buildMessageFromStoredBlocks, reconstructContentBlocks } from './message-converter';
import { taskToContentBlocks } from './task-to-content-blocks';
import type { ChatMessage, ContentBlock } from '../types';

/**
 * Load messages from database for a specific agent and context.
 * Assistant messages with a taskId are hydrated via tasks/get from the A2A server.
 * User messages and error-only assistant messages are reconstructed from DB.
 */
export const loadMessages = async (
  agentId: string,
  contextId: string,
  agentCardUrl: string
): Promise<ChatMessage[]> => {
  try {
    const dbMessages = await chatDb.messages
      .where('agentId')
      .equals(agentId)
      .and((msg) => msg.contextId === contextId)
      .sortBy('timestamp');

    return await hydrateMessages(dbMessages, agentCardUrl);
  } catch (loadChatError) {
    const connectError = ConnectError.from(loadChatError);
    toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'load', entity: 'chat' }));
    return [];
  }
};

/**
 * Hydrate DB message stubs into full ChatMessages.
 * - User messages: reconstruct from DB (they store prompt text)
 * - Assistant messages with taskId: fetch via tasks/get, convert to ContentBlocks
 * - Assistant messages without taskId (errors): use stored contentBlocks from DB
 */
const hydrateMessages = async (dbMessages: ChatDbMessage[], agentCardUrl: string): Promise<ChatMessage[]> => {
  // Collect taskIds that need fetching
  const taskIds = dbMessages.filter((msg) => msg.sender === 'system' && msg.taskId).map((msg) => msg.taskId as string);

  // Fetch all tasks in parallel
  const taskMap = await fetchTasks(taskIds, agentCardUrl);

  return dbMessages.map((dbMsg) => {
    // User messages: reconstruct from DB
    if (dbMsg.sender === 'user') {
      return buildMessageFromStoredBlocks(dbMsg);
    }

    // Assistant messages with taskId: use fetched task data
    const task = dbMsg.taskId ? taskMap.get(dbMsg.taskId) : undefined;
    if (dbMsg.taskId && task) {
      return {
        id: dbMsg.id,
        role: 'assistant' as const,
        contentBlocks: taskToContentBlocks(task),
        timestamp: dbMsg.timestamp,
        contextId: dbMsg.contextId,
        taskId: dbMsg.taskId,
        taskState: task.status.state as ChatMessage['taskState'],
        taskStartIndex: 0,
        usage: dbMsg.usage,
      };
    }

    // Assistant messages with taskId but tasks/get failed: show placeholder
    if (dbMsg.taskId && !taskMap.has(dbMsg.taskId)) {
      return {
        id: dbMsg.id,
        role: 'assistant' as const,
        contentBlocks: [
          {
            type: 'task-status-update' as const,
            taskState: dbMsg.taskState as ChatMessage['taskState'],
            text: 'Task history unavailable (agent may be offline)',
            final: true,
            timestamp: dbMsg.timestamp,
          },
        ],
        timestamp: dbMsg.timestamp,
        contextId: dbMsg.contextId,
        taskId: dbMsg.taskId,
        taskState: dbMsg.taskState as ChatMessage['taskState'],
        taskStartIndex: 0,
        usage: dbMsg.usage,
      };
    }

    // Assistant messages without taskId: old error messages with stored contentBlocks
    if (dbMsg.contentBlocks?.length) {
      return buildMessageFromStoredBlocks(dbMsg);
    }

    // Ancient messages: reconstruct from flat fields
    return {
      id: dbMsg.id,
      role: 'assistant' as const,
      contentBlocks: reconstructContentBlocks(dbMsg),
      timestamp: dbMsg.timestamp,
      contextId: dbMsg.contextId,
      taskId: dbMsg.taskId,
      taskState: dbMsg.taskState as ChatMessage['taskState'],
      taskStartIndex: dbMsg.taskStartIndex,
      usage: dbMsg.usage,
    };
  });
};

/**
 * Fetch multiple tasks from the A2A server in parallel.
 * Returns a Map of taskId -> Task for successful fetches.
 * Failed fetches are silently omitted (caller handles missing entries).
 */
const fetchTasks = async (
  taskIds: string[],
  agentCardUrl: string
): Promise<Map<string, import('@a2a-js/sdk').Task>> => {
  const taskMap = new Map<string, import('@a2a-js/sdk').Task>();
  if (taskIds.length === 0) {
    return taskMap;
  }

  try {
    const client = await createA2AClient(agentCardUrl);
    const results = await Promise.allSettled(taskIds.map((id) => client.getTask({ id })));

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        const response = result.value;
        // GetTaskResponse = JSONRPCErrorResponse | GetTaskSuccessResponse
        if ('error' in response) {
          continue;
        }
        if ('result' in response) {
          taskMap.set(taskIds[i], response.result as import('@a2a-js/sdk').Task);
        }
      }
    }
  } catch {
    // Client creation failed -- all tasks unavailable
  }

  return taskMap;
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
    if (block.type === 'connection-status') {
      return { ...block, timestamp: block.timestamp.toISOString() };
    }
    if (block.type === 'a2a-error') {
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
    isStreaming?: boolean;
    taskId?: string;
    taskState?: string;
    taskStartIndex?: number;
    contentBlocks?: ContentBlock[];
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
    const dbUpdates: Parameters<typeof chatDb.updateMessage>[1] = {
      isStreaming: updates.isStreaming,
      taskId: updates.taskId,
      taskState: updates.taskState,
      taskStartIndex: updates.taskStartIndex,
      usage: updates.usage,
    };

    // Only store contentBlocks for error paths (a2a-error blocks aren't in Task)
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
