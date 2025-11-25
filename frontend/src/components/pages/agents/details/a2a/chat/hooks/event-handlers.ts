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

import type { Task, TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk';

import { buildMessageWithContentBlocks, closeActiveTextBlock } from './message-builder';
import type { ResponseMetadataEvent, StreamingState } from './streaming-types';
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
export const handleTaskEvent = (
  event: Task,
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
      state.previousTaskState = state.capturedTaskState; // Initialize previousTaskState
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
 * Extract message text from parts (only agent role)
 * Also extracts tool request information to show in TaskStatusUpdateBlock
 */
const extractMessageText = (
  message: TaskStatusUpdateEvent['status']['message']
): { text: string; messageId?: string } => {
  if (!message?.parts || message.role !== 'agent') {
    return { text: '' };
  }

  // Extract text parts
  const text = message.parts
    .filter(
      (part): part is Extract<typeof part, { kind: 'text' }> =>
        part.kind === 'text' && 'text' in part && part.text !== undefined
    )
    .map((part) => part.text)
    .join('');

  // Extract tool requests from data parts
  const toolRequests = message.parts
    .filter((part): part is Extract<typeof part, { kind: 'data' }> => {
      if (part.kind !== 'data') {
        return false;
      }
      const metadata = part.metadata as Record<string, unknown> | undefined;
      const data = part.data as Record<string, unknown> | undefined;
      return metadata?.data_type === 'tool_request' && !!data?.name;
    })
    .map((part) => (part.data as Record<string, unknown>).name as string);

  // Build tool summary if tool requests exist
  let toolSummary = '';
  if (toolRequests.length === 1) {
    toolSummary = `Calling tool: ${toolRequests[0]}`;
  } else if (toolRequests.length > 1) {
    toolSummary = `Calling ${toolRequests.length} tools: ${toolRequests.join(', ')}`;
  }

  // Combine text and tool summary
  let combinedText = text;
  if (text && toolSummary) {
    combinedText = `${text}\n\n${toolSummary}`;
  } else if (!text && toolSummary) {
    combinedText = toolSummary;
  }

  return { text: combinedText, messageId: message.messageId };
};

/**
 * Create a status update block if conditions are met
 */
const createStatusUpdateBlock = (
  state: StreamingState,
  options: {
    newState: ChatMessage['taskState'] | undefined;
    hasStateChange: boolean;
    messageText: string;
    messageIdValue: string | undefined;
    timestamp: string | undefined;
    final: boolean;
    usage?: ChatMessage['usage'];
  }
): void => {
  const { newState, hasStateChange, messageText, messageIdValue, timestamp, final, usage } = options;

  // Create block if: state changed, has message text, or has usage data to display
  if (!hasStateChange && (!messageText || messageText.trim().length === 0) && !usage) {
    return;
  }

  closeActiveTextBlock(state.contentBlocks, state.activeTextBlock);
  state.activeTextBlock = null;

  const eventTimestamp = timestamp ? new Date(timestamp) : new Date();
  state.lastEventTimestamp = eventTimestamp;

  const statusUpdateBlock: ContentBlock = {
    type: 'task-status-update',
    taskState: newState,
    previousState: state.previousTaskState,
    text: messageText.trim().length > 0 ? messageText : undefined,
    messageId: messageIdValue,
    final,
    timestamp: eventTimestamp,
    usage: usage ? { ...usage } : undefined,
  };
  state.contentBlocks.push(statusUpdateBlock);
};

/**
 * Process tool request from data part
 */
const processToolRequest = (
  state: StreamingState,
  data: Record<string, unknown>,
  eventTimestamp: Date,
  messageId: string
): void => {
  closeActiveTextBlock(state.contentBlocks, state.activeTextBlock);
  state.activeTextBlock = null;

  const toolBlock: ContentBlock = {
    type: 'tool',
    toolCallId: data.id as string,
    toolName: data.name as string,
    state: 'input-available',
    input: 'arguments' in data ? data.arguments : undefined,
    timestamp: eventTimestamp,
    messageId,
  };
  state.contentBlocks.push(toolBlock);
};

/**
 * Process tool response from data part
 */
const processToolResponse = (state: StreamingState, data: Record<string, unknown>, endTimestamp: Date): void => {
  const existingToolBlock = state.contentBlocks.find(
    (block) => block.type === 'tool' && block.toolCallId === (data.id as string)
  );

  if (existingToolBlock && existingToolBlock.type === 'tool') {
    const hasError = 'error' in data && data.error;
    existingToolBlock.state = hasError ? 'output-error' : 'output-available';

    if (hasError) {
      existingToolBlock.output = undefined;
      existingToolBlock.errorText = data.error as string;
    } else {
      existingToolBlock.output = 'result' in data ? data.result : undefined;
      existingToolBlock.errorText = undefined;
    }

    existingToolBlock.endTimestamp = endTimestamp;
  }
};

/**
 * Process tool calls from message parts
 */
const processToolCalls = (
  state: StreamingState,
  message: TaskStatusUpdateEvent['status']['message'],
  timestamp: string
): void => {
  if (!message?.parts) {
    return;
  }

  const eventTimestamp = new Date(timestamp);
  for (const part of message.parts) {
    if (part.kind !== 'data' || !part.metadata?.data_type) {
      continue;
    }

    const dataType = part.metadata.data_type;
    const data = part.data;

    if (dataType === 'tool_request' && data?.id && data?.name) {
      processToolRequest(state, data, eventTimestamp, message.messageId);
    } else if (dataType === 'tool_response' && data?.id && data?.name) {
      processToolResponse(state, data, eventTimestamp);
    }
  }
};

/**
 * Handle status-update event to capture/update task state, tool calls, status updates, and message text
 */
export const handleStatusUpdateEvent = (
  event: TaskStatusUpdateEvent,
  state: StreamingState,
  assistantMessage: ChatMessage,
  onMessageUpdate: (message: ChatMessage) => void
): void => {
  // Capture taskId if not already captured
  if (event.taskId && !state.capturedTaskId) {
    state.capturedTaskId = event.taskId;
    state.taskIdCapturedAtBlockIndex = state.contentBlocks.length;
  }

  const message = event.status?.message;
  const timestamp = event.status?.timestamp;

  if (!(event.status?.state || message)) {
    return;
  }

  const newState = event.status?.state as ChatMessage['taskState'] | undefined;
  const hasStateChange = !!(newState && (!state.previousTaskState || state.previousTaskState !== newState));

  const { text: messageText, messageId: messageIdValue } = extractMessageText(message);

  // Capture per-message usage from message metadata (not event.metadata which is task-level)
  const currentUsage = message?.metadata?.usage as ChatMessage['usage'] | undefined;

  createStatusUpdateBlock(state, {
    newState,
    hasStateChange,
    messageText,
    messageIdValue,
    timestamp,
    final: event.final ?? false,
    usage: currentUsage,
  });

  if (timestamp) {
    processToolCalls(state, message, timestamp);
  }

  if (newState) {
    state.previousTaskState = newState;
    state.capturedTaskState = newState;
  }

  // Capture per-message usage from message metadata for context widget calculation
  // (event.metadata.usage will be task-level cumulative - we ignore that)
  if (message?.metadata?.usage) {
    state.latestUsage = message.metadata.usage as ChatMessage['usage'];
  }

  const updatedMessage = buildMessageWithContentBlocks({
    baseMessage: assistantMessage,
    contentBlocks: state.contentBlocks,
    taskId: state.capturedTaskId,
    taskState: state.capturedTaskState,
    taskStartIndex: state.taskIdCapturedAtBlockIndex,
    usage: state.latestUsage,
  });
  onMessageUpdate(updatedMessage);
};

/**
 * Handle artifact-update event to capture and process artifacts
 * NEW: Creates artifact content blocks (updates existing if streaming)
 * Supports text and file parts (e.g., images)
 */
export const handleArtifactUpdateEvent = (
  event: TaskArtifactUpdateEvent,
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
    state.taskIdCapturedAtBlockIndex = state.contentBlocks.length;
  }

  const artifact = event.artifact;
  const eventTimestamp = new Date();
  state.lastEventTimestamp = eventTimestamp;

  // Extract text from artifact parts
  const textChunk = (artifact.parts || [])
    .filter((part) => part.kind === 'text')
    .map((part) => part.text || '')
    .join('');

  // Stream into active artifact block (similar to activeTextBlock pattern)
  if (!state.activeTextBlock || state.activeTextBlock.type !== 'artifact') {
    // Create new active artifact block
    state.activeTextBlock = {
      type: 'artifact',
      artifactId: artifact.artifactId,
      name: artifact.name,
      description: artifact.description,
      parts: textChunk ? [{ kind: 'text' as const, text: textChunk }] : [],
      timestamp: eventTimestamp,
    };
  } else if (state.activeTextBlock.type === 'artifact' && state.activeTextBlock.artifactId === artifact.artifactId) {
    // Append to existing active artifact block
    const existingTextPart = state.activeTextBlock.parts.find((p) => p.kind === 'text');
    if (existingTextPart && existingTextPart.kind === 'text') {
      existingTextPart.text += textChunk;
    } else if (textChunk) {
      state.activeTextBlock.parts.push({ kind: 'text' as const, text: textChunk });
    }
    // Update metadata
    state.activeTextBlock.name = artifact.name || state.activeTextBlock.name;
    state.activeTextBlock.description = artifact.description || state.activeTextBlock.description;
  }

  // If this is the last chunk, close the active artifact block
  if (event.lastChunk && state.activeTextBlock?.type === 'artifact') {
    state.contentBlocks.push(state.activeTextBlock);
    state.activeTextBlock = null;
  }

  // Build message with current blocks + active artifact block (if streaming)
  const currentBlocks = [...state.contentBlocks];
  if (state.activeTextBlock && state.activeTextBlock.type === 'artifact') {
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

/**
 * Handle text-delta event to accumulate streaming text
 * NOTE: Text-delta is now only for artifacts (protocol compliant)
 * Regular messages come via status-update events with message.parts
 */
export const handleTextDeltaEvent = (
  _textDelta: string,
  _state: StreamingState,
  _assistantMessage: ChatMessage,
  _onMessageUpdate: (message: ChatMessage) => void
): void => {
  // Text-delta events are deprecated for regular messages
  // They are only used for artifact streaming now (handled separately)
  // If we receive text-delta, it's likely duplicate artifact content
  // Skip processing to avoid duplicate text blocks
};
