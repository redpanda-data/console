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
import { streamText } from 'ai';
import { config } from 'config';

import {
  handleArtifactUpdateEvent,
  handleResponseMetadataEvent,
  handleStatusUpdateEvent,
  handleTaskEvent,
} from './event-handlers';
import { buildMessageWithContentBlocks, closeActiveTextBlock } from './message-builder';
import type { ResponseMetadataEvent, StreamChunk, StreamingState } from './streaming-types';
import { a2a } from '../../a2a-provider';
import type { ChatMessage, ContentBlock } from '../types';
import { createA2AClient } from '../utils/a2a-client';
import { saveMessage, updateMessage } from '../utils/database-operations';
import { createAssistantMessage } from '../utils/message-converter';
import { parseA2AError } from '../utils/parse-a2a-error';
import { resolveStaleToolBlocks } from '../utils/task-to-content-blocks';

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

const TERMINAL_TASK_STATES = new Set(['completed', 'failed', 'canceled', 'rejected']);

/**
 * Maximum consecutive reconnection attempts before giving up.
 * With exponential backoff (1s, 2s, 4s, 8s, 16s), total wait is ~31s.
 * The counter resets on progress, so tasks making incremental progress
 * can reconnect indefinitely.
 */
const MAX_RESUBSCRIBE_ATTEMPTS = 5;

/**
 * Check whether the current streaming state is eligible for resubscription.
 * We can only resubscribe if we have a task ID and the task was still in-flight.
 */
const isResubscribable = (state: StreamingState): boolean =>
  !!state.capturedTaskId && !!state.capturedTaskState && !TERMINAL_TASK_STATES.has(state.capturedTaskState);

/**
 * Finalize a streaming message: close active blocks, persist to DB, and return the result.
 */
const finalizeMessage = async (state: StreamingState, assistantMessage: ChatMessage): Promise<StreamMessageResult> => {
  closeActiveTextBlock(state.contentBlocks, state.activeTextBlock);
  state.activeTextBlock = null;

  // Resolve tool blocks that never received a tool_response
  resolveStaleToolBlocks(state.contentBlocks, state.capturedTaskState);

  const finalMessage = buildMessageWithContentBlocks({
    baseMessage: assistantMessage,
    contentBlocks: state.contentBlocks,
    taskId: state.capturedTaskId,
    taskState: state.capturedTaskState,
    taskStartIndex: state.taskIdCapturedAtBlockIndex,
    usage: state.latestUsage,
  });

  // Only store minimal stub in DB -- full task content fetched via tasks/get on reload
  await updateMessage(assistantMessage.id, {
    isStreaming: false,
    taskId: state.capturedTaskId,
    taskState: state.capturedTaskState,
    taskStartIndex: state.taskIdCapturedAtBlockIndex,
    usage: state.latestUsage,
  });

  return { assistantMessage: finalMessage, success: true };
};

/**
 * Process events from an A2A resubscribe stream using the same handlers as the initial stream.
 * Returns true if at least one event was successfully processed.
 */
const processResubscribeStream = async (
  stream: AsyncIterable<{ kind?: string }>,
  state: StreamingState,
  assistantMessage: ChatMessage,
  onMessageUpdate: (message: ChatMessage) => void
): Promise<boolean> => {
  let receivedEvents = false;
  for await (const event of stream) {
    if (!event?.kind) {
      continue;
    }

    // On first real event, mark as reconnected so the spinner is replaced
    // before event handlers push new content blocks after it.
    if (!receivedEvents) {
      receivedEvents = true;
      pushConnectionStatus({ status: 'reconnected', state, assistantMessage, onMessageUpdate });
    }

    if (event.kind === 'task') {
      handleTaskEvent(event as Task, state, assistantMessage, onMessageUpdate);
    } else if (event.kind === 'status-update') {
      handleStatusUpdateEvent(event as TaskStatusUpdateEvent, state, assistantMessage, onMessageUpdate);
    } else if (event.kind === 'artifact-update') {
      handleArtifactUpdateEvent(event as TaskArtifactUpdateEvent, state, assistantMessage, onMessageUpdate);
    }
  }
  return receivedEvents;
};

type ConnectionStatusParams = {
  status: 'disconnected' | 'reconnecting' | 'reconnected' | 'gave-up';
  state: StreamingState;
  assistantMessage: ChatMessage;
  onMessageUpdate: (message: ChatMessage) => void;
  attempt?: number;
};

/**
 * Insert a connection-status content block and push a UI update.
 */
const pushConnectionStatus = ({
  status,
  state,
  assistantMessage,
  onMessageUpdate,
  attempt,
}: ConnectionStatusParams): void => {
  const block: ContentBlock = {
    type: 'connection-status',
    status,
    attempt,
    maxAttempts: MAX_RESUBSCRIBE_ATTEMPTS,
    timestamp: new Date(),
  };

  // For transient/final statuses, replace the last connection-status block
  // so the UI doesn't accumulate stale status lines.
  if (status === 'reconnecting' || status === 'reconnected' || status === 'gave-up') {
    const lastIdx = state.contentBlocks.length - 1;
    if (lastIdx >= 0 && state.contentBlocks[lastIdx].type === 'connection-status') {
      state.contentBlocks[lastIdx] = block;
      onMessageUpdate(
        buildMessageWithContentBlocks({
          baseMessage: assistantMessage,
          contentBlocks: state.contentBlocks,
          taskId: state.capturedTaskId,
          taskState: state.capturedTaskState,
          taskStartIndex: state.taskIdCapturedAtBlockIndex,
          usage: state.latestUsage,
        })
      );
      return;
    }
  }

  state.contentBlocks.push(block);
  onMessageUpdate(
    buildMessageWithContentBlocks({
      baseMessage: assistantMessage,
      contentBlocks: state.contentBlocks,
      taskId: state.capturedTaskId,
      taskState: state.capturedTaskState,
      taskStartIndex: state.taskIdCapturedAtBlockIndex,
      usage: state.latestUsage,
    })
  );
};

/**
 * Attempt to resubscribe to a running task after an SSE connection drop.
 * Returns true if resubscription succeeded and the task reached a terminal state.
 *
 * The attempt counter resets whenever a resubscribe makes progress (delivers
 * events), so the loop effectively retries indefinitely as long as the server
 * is responsive. It only gives up after MAX_RESUBSCRIBE_ATTEMPTS consecutive
 * failures with no progress.
 */
const resubscribeLoop = async (
  state: StreamingState,
  agentCardUrl: string,
  assistantMessage: ChatMessage,
  onMessageUpdate: (message: ChatMessage) => void
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: retry loop with backoff, progress detection, and error classification
): Promise<boolean> => {
  const taskId = state.capturedTaskId;
  if (!taskId) {
    return false;
  }

  const ctx = { state, assistantMessage, onMessageUpdate };
  pushConnectionStatus({ ...ctx, status: 'disconnected' });

  let attempt = 0;

  while (attempt < MAX_RESUBSCRIBE_ATTEMPTS) {
    attempt += 1;
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = 2 ** (attempt - 1) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    pushConnectionStatus({ ...ctx, status: 'reconnecting', attempt });

    try {
      const client = await createA2AClient(agentCardUrl);
      const stream = client.resubscribeTask({ id: taskId });
      const receivedEvents = await processResubscribeStream(stream, state, assistantMessage, onMessageUpdate);

      // Task reached a terminal state — done.
      if (state.capturedTaskState && TERMINAL_TASK_STATES.has(state.capturedTaskState)) {
        return true;
      }

      // Got data but task isn't terminal — stream dropped again.
      // Reset attempts since we made progress, and signal a new disconnect.
      if (receivedEvents) {
        attempt = 0;
        pushConnectionStatus({ ...ctx, status: 'disconnected' });
      }
    } catch (resubError) {
      // If task reached a terminal state during this attempt, we're done
      if (state.capturedTaskState && TERMINAL_TASK_STATES.has(state.capturedTaskState)) {
        return true;
      }
      // Programming errors (TypeError, ReferenceError) -- stop retrying immediately
      if (resubError instanceof TypeError || resubError instanceof ReferenceError) {
        break;
      }
      // Otherwise retry (network errors, SSE errors, etc.)
    }
  }

  // All retries exhausted with no progress
  pushConnectionStatus({ ...ctx, status: 'gave-up' });
  return false;
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

  // Initialize streaming state before try so it's accessible in catch for resubscription
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

  // Tracks whether the clean-close path already ran resubscribeLoop, so that
  // a post-reconnect failure in finalizeMessage doesn't cause the outer catch
  // to re-enter the loop a second time.
  let resubscribeAttempted = false;

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
      }
      // text-delta chunks are emitted as raw events routed above; no separate
      // handling is needed because the A2A protocol carries text through
      // status-update.message.parts and artifact-update.
    }

    // Close any active text block before finalizing
    closeActiveTextBlock(state.contentBlocks, state.activeTextBlock);
    state.activeTextBlock = null;

    // If we didn't capture taskId during streaming, try to get it from response metadata
    if (!state.capturedTaskId) {
      const responseMetadata = await streamResult.response;
      const potentialTaskId = responseMetadata?.id;
      // ONLY set taskId if it's a valid task (starts with "task-"), not a regular message (starts with "msg-")
      if (potentialTaskId?.startsWith('task-')) {
        state.capturedTaskId = potentialTaskId;
      }
    }

    // The stream ended without throwing, but the task may still be in-flight
    // server-side. This happens when a load balancer silently closes an idle
    // TCP connection (FIN) around its idle timeout — the AsyncIterable exits
    // cleanly rather than raising, so the catch-block reconnect never runs.
    // Route through the same resubscribe loop to avoid finalizing a task that
    // is still progressing on the server.
    if (isResubscribable(state)) {
      resubscribeAttempted = true;
      closeActiveTextBlock(state.contentBlocks, state.activeTextBlock);
      state.activeTextBlock = null;
      await resubscribeLoop(state, agentCardUrl, assistantMessage, onMessageUpdate);
    }

    return await finalizeMessage(state, assistantMessage);
  } catch (error) {
    // If the task is still in-flight, try to resubscribe before giving up.
    // Skip if the clean-close path already exhausted a resubscribe round —
    // otherwise a finalizeMessage failure after a gave-up reconnect would
    // trigger another full round of retries.
    if (!resubscribeAttempted && isResubscribable(state)) {
      closeActiveTextBlock(state.contentBlocks, state.activeTextBlock);
      state.activeTextBlock = null;

      const recovered = await resubscribeLoop(state, agentCardUrl, assistantMessage, onMessageUpdate);
      if (recovered) {
        try {
          const result = await finalizeMessage(state, assistantMessage);
          onMessageUpdate(result.assistantMessage);
          return result;
        } catch (finalizeError) {
          // biome-ignore lint/suspicious/noConsole: intentional error logging for production observability
          console.error('finalizeMessage failed after recovery:', finalizeError);
          // fall through to error path
        }
      }
    }

    // Parse JSON-RPC error details
    const a2aError = parseA2AError(error);

    // Create error content block
    const errorBlock: ContentBlock = {
      type: 'a2a-error',
      error: a2aError,
      timestamp: new Date(),
    };

    // Append error to existing blocks (preserve any content received before disconnect)
    const errorBlocks = [...state.contentBlocks, errorBlock];

    // Build message with error block
    const errorMessage = buildMessageWithContentBlocks({
      baseMessage: assistantMessage,
      contentBlocks: errorBlocks,
      taskId: state.capturedTaskId,
      taskState: state.capturedTaskState ?? 'failed',
      taskStartIndex: state.taskIdCapturedAtBlockIndex,
    });

    // Update database with error
    await updateMessage(assistantMessage.id, {
      isStreaming: false,
      taskId: state.capturedTaskId,
      taskState: state.capturedTaskState ?? 'failed',
      taskStartIndex: state.taskIdCapturedAtBlockIndex,
      contentBlocks: errorBlocks,
    });

    // Notify caller about error message
    onMessageUpdate(errorMessage);

    return {
      assistantMessage: errorMessage,
      success: false,
    };
  }
};
