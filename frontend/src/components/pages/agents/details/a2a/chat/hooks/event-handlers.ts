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
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { buildMessageWithContentBlocks, closeActiveTextBlock } from './message-builder';
import type {
  RawArtifactUpdateEvent,
  RawStatusUpdateEvent,
  RawTaskEvent,
  ResponseMetadataEvent,
  StreamingState,
} from './streaming-types';
import type { ChatMessage, ContentBlock } from '../types';

/**
 * Handle response-metadata event to capture initial taskId
 */
export const handleResponseMetadataEvent = (
  event: ResponseMetadataEvent,
  state: StreamingState,
  assistantMessage: ChatMessage,
  onMessageUpdate: (message: ChatMessage) => void
): void => {
  const potentialTaskId = event.id;
  if (potentialTaskId && !state.capturedTaskId) {
    state.capturedTaskId = potentialTaskId;

    // IMPORTANT: Close active text block BEFORE recording task index
    // This ensures text that arrived before the task event is captured as pre-task content
    closeActiveTextBlock(state.contentBlocks, state.activeTextBlock);
    state.activeTextBlock = null;

    // Record the block index where taskId was captured
    // This allows splitting pre-task content from task-related content
    state.taskIdCapturedAtBlockIndex = state.contentBlocks.length;

    // Update message with new taskId (don't add content blocks for metadata events)
    const updatedMessage = buildMessageWithContentBlocks({
      baseMessage: assistantMessage,
      contentBlocks: state.contentBlocks,
      taskId: state.capturedTaskId,
      taskState: state.capturedTaskState,
      taskStartIndex: state.taskIdCapturedAtBlockIndex,
    });
    onMessageUpdate(updatedMessage);
  }
};

/**
 * Handle raw task event to capture taskId and initial state
 */
export const handleRawTaskEvent = (
  event: RawTaskEvent,
  state: StreamingState,
  assistantMessage: ChatMessage,
  onMessageUpdate: (message: ChatMessage) => void
): void => {
  if (event.id && !state.capturedTaskId) {
    state.capturedTaskId = event.id;

    // IMPORTANT: Close active text block BEFORE recording task index
    // This ensures text that arrived before the task event is captured as pre-task content
    closeActiveTextBlock(state.contentBlocks, state.activeTextBlock);
    state.activeTextBlock = null;

    // Record the block index where taskId was captured
    // This allows splitting pre-task content from task-related content
    state.taskIdCapturedAtBlockIndex = state.contentBlocks.length;

    // Capture initial task state if present
    if (event.status?.state) {
      state.capturedTaskState = event.status.state as ChatMessage['taskState'];
    }

    // Update message with taskId and state (don't add content blocks for metadata events)
    const updatedMessage = buildMessageWithContentBlocks({
      baseMessage: assistantMessage,
      contentBlocks: state.contentBlocks,
      taskId: state.capturedTaskId,
      taskState: state.capturedTaskState,
      taskStartIndex: state.taskIdCapturedAtBlockIndex,
    });
    onMessageUpdate(updatedMessage);
  }
};

/**
 * Parse llm_message metadata to extract tool calls
 */
const parseToolCallFromMetadata = (metadata: {
  llm_message?: string;
}): {
  toolCallData?: {
    id: string;
    name: string;
    input?: unknown;
    output?: unknown;
    isRequest: boolean;
    isResponse: boolean;
  };
} => {
  if (!metadata?.llm_message) {
    return {};
  }

  try {
    const llmMessage = JSON.parse(metadata.llm_message);
    const content = llmMessage.content?.[0];

    if (!content) {
      return {};
    }

    // Tool request (kind: 1)
    if (content.kind === 1 && content.tool_request) {
      return {
        toolCallData: {
          id: content.tool_request.id,
          name: content.tool_request.name,
          input: content.tool_request.arguments,
          isRequest: true,
          isResponse: false,
        },
      };
    }

    // Tool response (kind: 2)
    if (content.kind === 2 && content.tool_response) {
      return {
        toolCallData: {
          id: content.tool_response.id,
          name: content.tool_response.name,
          output: content.tool_response.result,
          isRequest: false,
          isResponse: true,
        },
      };
    }
  } catch (parseToolCallFromMetadataError) {
    toast.error(
      formatToastErrorMessageGRPC({
        error: ConnectError.from(parseToolCallFromMetadataError),
        action: 'parse',
        entity: 'tool call',
      })
    );
  }

  return {};
};

/**
 * Handle status-update event to capture/update task state, tool calls, and message text
 * NEW: Updates tool blocks in-place (request → response state transition)
 * FIXED: Now extracts and displays text messages from status.message.parts
 */
export const handleStatusUpdateEvent = (
  event: RawStatusUpdateEvent,
  state: StreamingState,
  assistantMessage: ChatMessage,
  onMessageUpdate: (message: ChatMessage) => void
): void => {
  // Capture taskId if not already captured
  if (event.taskId && !state.capturedTaskId) {
    state.capturedTaskId = event.taskId;
    // Record the block index where taskId was captured
    state.taskIdCapturedAtBlockIndex = state.contentBlocks.length;
  }

  // Parse tool calls from message metadata
  const message = event.status?.message;
  const timestamp = event.status?.timestamp; // Timestamp is at status level, not message level

  if (message?.messageId && message?.metadata && timestamp) {
    const { toolCallData } = parseToolCallFromMetadata(message.metadata);

    if (toolCallData) {
      const eventTimestamp = new Date(timestamp);
      state.lastEventTimestamp = eventTimestamp;

      if (toolCallData.isRequest) {
        // Close active text block before adding tool
        closeActiveTextBlock(state.contentBlocks, state.activeTextBlock);
        state.activeTextBlock = null;

        // Add new tool block with 'input-available' state
        const toolBlock: ContentBlock = {
          type: 'tool',
          toolCallId: toolCallData.id,
          toolName: toolCallData.name,
          state: 'input-available',
          input: toolCallData.input,
          timestamp: eventTimestamp,
          messageId: message.messageId,
        };
        state.contentBlocks.push(toolBlock);
      } else if (toolCallData.isResponse) {
        // Find existing tool block and update it in-place
        const existingToolBlock = state.contentBlocks.find(
          (block) => block.type === 'tool' && block.toolCallId === toolCallData.id
        );

        if (existingToolBlock && existingToolBlock.type === 'tool') {
          // Update existing tool block to show output
          existingToolBlock.state = 'output-available';
          existingToolBlock.output = toolCallData.output;
          existingToolBlock.errorText = undefined;
        }
        // Note: If tool block doesn't exist, we don't create it here (should have been created on request)
      }
    }
  }

  // FIXED: Extract text messages from status.message.parts (messages between artifacts and completion)
  // These are important messages like "Your bar chart has been created..." that were being lost
  // BUT: Skip tool request/response messages (already shown in ToolBlock), duplicates, and user-role messages
  if (message?.parts && message?.role === 'agent' && timestamp) {
    // IMPORTANT: Only process agent-role messages. User-role messages are task descriptions (internal use only)
    const eventTimestamp = new Date(timestamp);
    state.lastEventTimestamp = eventTimestamp;

    // Extract text from message parts, but skip tool-related messages
    const textParts = message.parts
      .filter((part) => part.kind === 'text' && part.text)
      .map((part) => part.text)
      .filter((text): text is string => !!text);

    if (textParts.length > 0) {
      const combinedText = textParts.join('');

      // Skip tool request/response messages - they're already displayed by ToolBlock
      const isToolMessage = combinedText.startsWith('Tool request:') || combinedText.startsWith('Tool response:');

      // Check for exact duplicates to avoid re-adding the same text
      const textAlreadyExists = state.contentBlocks.some(
        (block) => block.type === 'text' && block.text === combinedText
      );

      if (!(isToolMessage || textAlreadyExists) && combinedText.trim().length > 0) {
        // Close active text block before adding new text from status message
        closeActiveTextBlock(state.contentBlocks, state.activeTextBlock);
        state.activeTextBlock = null;

        // Add new text block
        const textBlock: ContentBlock = {
          type: 'text',
          text: combinedText,
          timestamp: eventTimestamp,
        };
        state.contentBlocks.push(textBlock);
      }
    }
  }

  // Always capture the latest task state from status-update events
  if (event.status?.state) {
    state.capturedTaskState = event.status.state as ChatMessage['taskState'];

    const updatedMessage = buildMessageWithContentBlocks({
      baseMessage: assistantMessage,
      contentBlocks: state.contentBlocks,
      taskId: state.capturedTaskId,
      taskState: state.capturedTaskState,
      taskStartIndex: state.taskIdCapturedAtBlockIndex,
    });
    onMessageUpdate(updatedMessage);
  }
};

/**
 * Handle artifact-update event to capture and process artifacts
 * NEW: Creates artifact content blocks (updates existing if streaming)
 * Supports text and file parts (e.g., images)
 */
export const handleArtifactUpdateEvent = (
  event: RawArtifactUpdateEvent,
  state: StreamingState,
  assistantMessage: ChatMessage,
  onMessageUpdate: (message: ChatMessage) => void
): void => {
  if (!event.artifact) {
    return;
  }

  // Capture taskId if not already captured
  if (event.taskId && !state.capturedTaskId) {
    state.capturedTaskId = event.taskId;
    // Record the block index where taskId was captured
    state.taskIdCapturedAtBlockIndex = state.contentBlocks.length;
  }

  const artifact = event.artifact;
  const eventTimestamp = new Date();
  state.lastEventTimestamp = eventTimestamp;

  // Close active text block before adding/updating artifact
  closeActiveTextBlock(state.contentBlocks, state.activeTextBlock);
  state.activeTextBlock = null;

  // Convert artifact parts from raw event to ContentBlock format
  const parts = artifact.parts.map((part) => {
    if (part.kind === 'text') {
      return { kind: 'text' as const, text: part.text || '' };
    }
    // Handle file parts (e.g., images, plots)
    if (part.kind === 'file' && part.file) {
      return {
        kind: 'file' as const,
        file: {
          name: part.file.name,
          mimeType: part.file.mimeType || 'application/octet-stream',
          bytes: part.file.bytes || '',
        },
      };
    }
    // Fallback for unknown part types - treat as empty text
    return { kind: 'text' as const, text: '' };
  });

  // Check if artifact block already exists (for streaming updates)
  const existingIndex = state.contentBlocks.findIndex(
    (block) => block.type === 'artifact' && block.artifactId === artifact.artifactId
  );

  if (existingIndex >= 0) {
    // Update existing artifact block (append parts for streaming)
    const existingBlock = state.contentBlocks[existingIndex];
    if (existingBlock.type === 'artifact') {
      existingBlock.parts.push(...parts);
      existingBlock.name = artifact.name || existingBlock.name;
      existingBlock.description = artifact.description || existingBlock.description;
    }
  } else {
    // Add new artifact block
    const artifactBlock: ContentBlock = {
      type: 'artifact',
      artifactId: artifact.artifactId,
      name: artifact.name,
      description: artifact.description,
      parts,
      timestamp: eventTimestamp,
    };
    state.contentBlocks.push(artifactBlock);
  }

  const updatedMessage = buildMessageWithContentBlocks({
    baseMessage: assistantMessage,
    contentBlocks: state.contentBlocks,
    taskId: state.capturedTaskId,
    taskState: state.capturedTaskState,
    taskStartIndex: state.taskIdCapturedAtBlockIndex,
  });
  onMessageUpdate(updatedMessage);
};

/**
 * Handle text-delta event to accumulate streaming text
 * NEW: Accumulates text in activeTextBlock (closed when non-text event arrives)
 */
export const handleTextDeltaEvent = (
  textDelta: string,
  state: StreamingState,
  assistantMessage: ChatMessage,
  onMessageUpdate: (message: ChatMessage) => void
): void => {
  const eventTimestamp = new Date();
  state.lastEventTimestamp = eventTimestamp;

  // If no active text block, create one
  if (!state.activeTextBlock || state.activeTextBlock.type !== 'text') {
    state.activeTextBlock = {
      type: 'text',
      text: textDelta,
      timestamp: eventTimestamp,
    };
  } else {
    // Append to existing active text block
    state.activeTextBlock.text += textDelta;
  }

  // Build message with current content blocks + active text block
  const currentBlocks = [...state.contentBlocks];
  if (state.activeTextBlock && state.activeTextBlock.text.length > 0) {
    currentBlocks.push(state.activeTextBlock);
  }

  const updatedMessage = buildMessageWithContentBlocks({
    baseMessage: assistantMessage,
    contentBlocks: currentBlocks,
    taskId: state.capturedTaskId,
    taskState: state.capturedTaskState,
    taskStartIndex: state.taskIdCapturedAtBlockIndex,
  });
  onMessageUpdate(updatedMessage);
};
