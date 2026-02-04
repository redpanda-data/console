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

import type { JSONRPCError, Task, TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { streamText } from 'ai';
import { config } from 'config';

import {
  handleArtifactUpdateEvent,
  handleResponseMetadataEvent,
  handleStatusUpdateEvent,
  handleTaskEvent,
  handleTextDeltaEvent,
} from './event-handlers';
import { buildMessageWithContentBlocks, closeActiveTextBlock } from './message-builder';
import type { ResponseMetadataEvent, StreamChunk, StreamingState, TextDeltaEvent } from './streaming-types';
import { a2a } from '../../a2a-provider';
import type { ChatMessage, ContentBlock } from '../types';
import { saveMessage, updateMessage } from '../utils/database-operations';
import { createAssistantMessage } from '../utils/message-converter';

/**
 * Regex patterns for parsing JSON-RPC error details from error messages.
 *
 * Why regex? The a2a-js SDK throws plain Error objects with formatted strings
 * instead of structured error objects. The SDK has access to the structured
 * JSON-RPC error (code, message, data) but serializes it into the error message:
 *
 *   // a2a-js/src/client/transports/json_rpc_transport.ts
 *   if ('error' in a2aStreamResponse) {
 *     const err = a2aStreamResponse.error;
 *     throw new Error(
 *       `SSE event contained an error: ${err.message} (Code: ${err.code}) Data: ${JSON.stringify(err.data || {})}`
 *     );
 *   }
 *
 * Until the SDK exposes structured error data, we parse it back out.
 */
const JSON_RPC_CODE_REGEX = /\(Code:\s*(-?\d+)\)/i;
const JSON_RPC_DATA_REGEX = /Data:\s*(\{[^}]*\})/i;
const JSON_RPC_MESSAGE_REGEX = /error:\s*([^(]+)\s*\(Code:/i;
const ERROR_PREFIX_STREAMING_REGEX = /^Error during streaming[^:]*:\s*/i;
const ERROR_PREFIX_SSE_REGEX = /^SSE event contained an error:\s*/i;
const ERROR_SUFFIX_CODE_REGEX = /\s*\(Code:\s*-?\d+\).*$/i;

/**
 * Parse A2A/JSON-RPC error details from an error message string.
 */
const parseA2AError = (error: unknown): JSONRPCError => {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Try to parse JSON-RPC error from the error message
  // Format: "SSE event contained an error: <message> (Code: <code>) Data: <json> (code: <connect_code>)"
  const jsonRpcMatch = errorMessage.match(JSON_RPC_CODE_REGEX);
  const dataMatch = errorMessage.match(JSON_RPC_DATA_REGEX);
  const messageMatch = errorMessage.match(JSON_RPC_MESSAGE_REGEX);

  // Extract just the core error message without wrapper text
  let message = errorMessage;
  if (messageMatch?.[1]) {
    message = messageMatch[1].trim();
  } else {
    // Remove common prefixes
    message = message
      .replace(ERROR_PREFIX_STREAMING_REGEX, '')
      .replace(ERROR_PREFIX_SSE_REGEX, '')
      .replace(ERROR_SUFFIX_CODE_REGEX, '')
      .trim();
  }

  const code = jsonRpcMatch?.[1] ? Number.parseInt(jsonRpcMatch[1], 10) : -1;

  let data: Record<string, unknown> | undefined;
  if (dataMatch?.[1]) {
    try {
      data = JSON.parse(dataMatch[1]);
    } catch {
      // Invalid JSON in data field
    }
  }

  return {
    code,
    message: message || 'Unknown error',
    data,
  };
};

type StreamMessageParams = {
  prompt: string;
  agentId: string;
  agentCardUrl: string;
  model: string | undefined;
  contextId: string;
  onMessageUpdate: (message: ChatMessage) => void;
};

type StreamMessageResult = {
  assistantMessage: ChatMessage;
  success: boolean;
};

/**
 * Stream a message using the a2a provider
 */
export const streamMessage = async ({
  prompt,
  agentId,
  agentCardUrl,
  model,
  contextId,
  onMessageUpdate,
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
}: StreamMessageParams): Promise<StreamMessageResult> => {
  // Create assistant message placeholder
  const assistantMessage = createAssistantMessage(contextId);

  // Add placeholder to database
  await saveMessage(assistantMessage, agentId, { isStreaming: true });

  // Notify caller about the new message
  onMessageUpdate(assistantMessage);

  try {
    // Stream the response using a2a provider
    const streamResult = streamText({
      model: a2a(agentCardUrl, {
        model: model || undefined,
      }),
      prompt,
      providerOptions: {
        a2a: {
          contextId,
        },
      },
      headers: {
        ...(config.jwt && { Authorization: `Bearer ${config.jwt}` }),
      },
      includeRawChunks: true, // Enable raw events to capture taskId from task/status-update/artifact-update events
    });

    // Initialize streaming state with new contentBlocks approach
    const state: StreamingState = {
      contentBlocks: [],
      activeTextBlock: null,
      lastEventTimestamp: new Date(),
      capturedTaskId: undefined,
      capturedTaskState: undefined,
      previousTaskState: undefined,
      taskIdCapturedAtBlockIndex: undefined,
      latestUsage: undefined,
    };

    // Consume the full stream and process events
    for await (const chunk of streamResult.fullStream) {
      const streamChunk = chunk as StreamChunk;

      // Handle response-metadata events
      if (streamChunk.type === 'response-metadata' && 'id' in streamChunk) {
        handleResponseMetadataEvent(streamChunk as ResponseMetadataEvent, state, assistantMessage, onMessageUpdate);
        continue;
      }

      // Handle A2A SDK events directly (no Raw wrapper)
      if (streamChunk.type === 'raw' && 'rawValue' in streamChunk) {
        const event = streamChunk.rawValue;

        if (event && typeof event === 'object' && 'kind' in event) {
          if (event.kind === 'task') {
            handleTaskEvent(event as Task, state, assistantMessage, onMessageUpdate);
          } else if (event.kind === 'status-update') {
            handleStatusUpdateEvent(event as TaskStatusUpdateEvent, state, assistantMessage, onMessageUpdate);
          } else if (event.kind === 'artifact-update') {
            handleArtifactUpdateEvent(event as TaskArtifactUpdateEvent, state, assistantMessage, onMessageUpdate);
          }
        }
        continue;
      }

      // Handle text-delta events
      if (streamChunk.type === 'text-delta') {
        const textDelta = streamChunk as TextDeltaEvent;
        handleTextDeltaEvent(textDelta.text, state, assistantMessage, onMessageUpdate);
      }
    }

    // Close any active text block before finalizing
    closeActiveTextBlock(state.contentBlocks, state.activeTextBlock);
    state.activeTextBlock = null;

    // Get final text content (for backward compatibility with DB)
    const finalContent = await streamResult.text;

    // If we didn't capture taskId during streaming, try to get it from response metadata
    if (!state.capturedTaskId) {
      const responseMetadata = await streamResult.response;
      const potentialTaskId = responseMetadata?.id;
      // ONLY set taskId if it's a valid task (starts with "task-"), not a regular message (starts with "msg-")
      if (potentialTaskId?.startsWith('task-')) {
        state.capturedTaskId = potentialTaskId;
      }
    }

    // Build final message with all content blocks
    const finalMessage = buildMessageWithContentBlocks({
      baseMessage: assistantMessage,
      contentBlocks: state.contentBlocks,
      taskId: state.capturedTaskId,
      taskState: state.capturedTaskState,
      taskStartIndex: state.taskIdCapturedAtBlockIndex,
      usage: state.latestUsage,
    });

    // Extract artifacts and toolCalls from content blocks for DB compatibility
    const artifacts = state.contentBlocks
      .filter((block) => block.type === 'artifact')
      .map((block) => ({
        artifactId: block.artifactId,
        name: block.name,
        description: block.description,
        parts: block.parts,
      }));

    const toolCalls = state.contentBlocks
      .filter((block) => block.type === 'tool')
      .map((block) => ({
        id: block.toolCallId,
        name: block.toolName,
        state: block.state,
        input: block.input,
        output: block.output,
        errorText: block.errorText,
        messageId: block.messageId || '',
        timestamp: block.timestamp,
      }));

    // Update database with final content blocks
    await updateMessage(assistantMessage.id, {
      content: finalContent,
      isStreaming: false,
      taskId: state.capturedTaskId,
      taskState: state.capturedTaskState,
      taskStartIndex: state.taskIdCapturedAtBlockIndex,
      artifacts,
      toolCalls,
      contentBlocks: state.contentBlocks, // Store new format
      usage: state.latestUsage, // Store usage metadata
    });

    return {
      assistantMessage: finalMessage,
      success: true,
    };
  } catch (error) {
    // Parse JSON-RPC error details
    const a2aError = parseA2AError(error);

    // Create error content block
    const errorBlock: ContentBlock = {
      type: 'a2a-error',
      error: a2aError,
      timestamp: new Date(),
    };

    // Build message with error block
    const errorMessage = buildMessageWithContentBlocks({
      baseMessage: assistantMessage,
      contentBlocks: [errorBlock],
      taskId: undefined,
      taskState: 'failed',
      taskStartIndex: undefined,
    });

    // Update database with error
    await updateMessage(assistantMessage.id, {
      content: '',
      isStreaming: false,
      taskState: 'failed',
      contentBlocks: [errorBlock],
    });

    // Notify caller about error message
    onMessageUpdate(errorMessage);

    return {
      assistantMessage: errorMessage,
      success: false,
    };
  }
};
