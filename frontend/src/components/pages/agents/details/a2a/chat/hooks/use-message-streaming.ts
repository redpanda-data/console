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
import { streamText } from 'ai';
import { config } from 'config';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import {
  handleArtifactUpdateEvent,
  handleRawTaskEvent,
  handleResponseMetadataEvent,
  handleStatusUpdateEvent,
  handleTextDeltaEvent,
} from './event-handlers';
import { buildMessageWithContentBlocks, closeActiveTextBlock } from './message-builder';
import type { RawChunk, ResponseMetadataEvent, StreamChunk, StreamingState, TextDeltaEvent } from './streaming-types';
import { a2a } from '../../a2a-provider';
import type { ChatMessage } from '../types';
import { saveMessage, updateMessage } from '../utils/database-operations';
import { createAssistantMessage } from '../utils/message-converter';

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
        Authorization: `Bearer ${config.jwt}`,
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
    };

    // Consume the full stream and process events
    for await (const chunk of streamResult.fullStream) {
      const streamChunk = chunk as StreamChunk;

      // Handle response-metadata events
      if (streamChunk.type === 'response-metadata' && 'id' in streamChunk) {
        handleResponseMetadataEvent(streamChunk as ResponseMetadataEvent, state, assistantMessage, onMessageUpdate);
        continue;
      }

      // Handle raw events (task, status-update, artifact-update)
      if (streamChunk.type === 'raw' && 'rawValue' in streamChunk) {
        const rawChunk = streamChunk as RawChunk;
        const rawValue = rawChunk.rawValue;

        if (rawValue.kind === 'task') {
          handleRawTaskEvent(rawValue, state, assistantMessage, onMessageUpdate);
        } else if (rawValue.kind === 'status-update') {
          handleStatusUpdateEvent(rawValue, state, assistantMessage, onMessageUpdate);
        } else if (rawValue.kind === 'artifact-update') {
          handleArtifactUpdateEvent(rawValue, state, assistantMessage, onMessageUpdate);
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
      state.capturedTaskId = responseMetadata?.id;
    }

    // Build final message with all content blocks
    const finalMessage = buildMessageWithContentBlocks(
      assistantMessage,
      state.contentBlocks,
      state.capturedTaskId,
      state.capturedTaskState
    );

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
      artifacts,
      toolCalls,
      contentBlocks: state.contentBlocks, // Store new format
    });

    return {
      assistantMessage: finalMessage,
      success: true,
    };
  } catch (error) {
    const connectError = ConnectError.from(error);
    toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'stream', entity: 'message' }));
    return {
      assistantMessage,
      success: false,
    };
  }
};
