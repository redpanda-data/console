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
/** biome-ignore-all lint/suspicious/useAwait: required for compatibility with A2A SDK streaming API */

import type { Message, MessageSendParams, Task } from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import { config } from 'config';
import type { ChatMessage } from 'database/chat-db';
import { getAgentCardUrl } from 'utils/ai-agent.utils';
import { v4 as uuidv4 } from 'uuid';

type A2AApiResponse = {
  message: string;
  success: boolean;
  error?: string;
  taskId?: string;
  contextId?: string;
  reasoning?: string;
  completionMessage?: string; // Separate completion message for tasks
};

// Limit chat history to last 15 messages (30 total including responses)
export const A2A_CHAT_HISTORY_MESSAGE_LIMIT = 15;

type SendMessageViaA2AProps = {
  message: string;
  chatHistory: ChatMessage[]; // Reserved for future use with conversation context
  agentUrl: string;
  contextId?: string; // Context ID for grouping related interactions
  taskId?: string; // Task ID if continuing an existing task
  onStreamUpdate?: (partialContent: string) => void | Promise<void>;
};

/**
 * Extracts text from a task status message
 */
function extractTaskStatusText(task: Task): string {
  // Check if task has artifacts first (final output)
  if (task.artifacts && task.artifacts.length > 0) {
    const artifact = task.artifacts[0];
    if (artifact.parts && artifact.parts.length > 0) {
      const part = artifact.parts[0];
      if (part.kind === 'text') {
        return part.text || '';
      }
    }
  }

  // Extract text from status message
  if (task.status.message) {
    const statusMessage = task.status.message as { parts?: { kind: string; text?: string }[] };
    if (statusMessage.parts && statusMessage.parts.length > 0) {
      const part = statusMessage.parts[0];
      if (part.kind === 'text' && part.text) {
        return part.text;
      }
    }
  }

  // Fallback to basic status
  return `Task ${task.status.state}`;
}

/**
 * Extracts text content from a Message or Task result
 */
function extractTextFromResult(result: Message | Task): string {
  if (result.kind === 'task') {
    const task = result as Task;
    return extractTaskStatusText(task);
  }

  // Handle direct message response
  const message = result as Message;
  if (message.parts && message.parts.length > 0) {
    const part = message.parts[0];
    if (part.kind === 'text') {
      return part.text || '';
    }
  }

  return 'No response content available';
}

type StreamEvent = {
  kind: string;
  id?: string;
  taskId?: string;
  contextId?: string;
  parts?: { kind: string; text?: string }[];
  status?: {
    state?: string;
    message?: {
      parts?: { kind: string; text?: string }[];
      kind?: string;
      messageId?: string;
    };
  };
  artifact?: { parts?: { kind: string; text?: string }[] };
  artifacts?: Array<{ parts?: { kind: string; text?: string }[] }>;
  final?: boolean;
};

/**
 * Checks if a message is a tool request or response
 */
function isToolMessage(text: string): boolean {
  return text.startsWith('Tool request:') || text.startsWith('Tool response:');
}

/**
 * Extracts text from a status update event
 */
function extractStatusText(evt: StreamEvent): string | null {
  const statusMessage = evt.status?.message?.parts?.[0];
  if (statusMessage?.kind === 'text' && statusMessage.text) {
    return statusMessage.text;
  }
  return null;
}

/**
 * Extracts text from a message event
 */
function extractMessageText(evt: StreamEvent): string | null {
  if (evt.parts?.[0]?.kind === 'text') {
    return evt.parts[0].text || '';
  }
  return null;
}

/**
 * Extracts text from an artifact update event
 */
function extractArtifactText(evt: StreamEvent): string | null {
  if (evt.artifact?.parts?.[0]?.kind === 'text') {
    return evt.artifact.parts[0].text || '';
  }
  return null;
}

/**
 * Extracts text from a task event
 */
function extractTaskText(evt: StreamEvent): string | null {
  // Check if task has artifacts (final output)
  if (evt.artifacts && evt.artifacts.length > 0) {
    const artifact = evt.artifacts[0];
    if (artifact.parts && artifact.parts.length > 0) {
      const part = artifact.parts[0];
      if (part.kind === 'text' && part.text) {
        return part.text;
      }
    }
  }

  // Extract text from status message
  if (evt.status?.message?.parts?.[0]?.kind === 'text') {
    return evt.status.message.parts[0].text || null;
  }

  return null;
}

type StreamingResult = {
  message: string;
  taskId?: string;
  contextId?: string;
  reasoning?: string;
  completionMessage?: string;
};

/**
 * Processes streaming events from the A2A agent with progressive updates
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This function handles multiple distinct event types from the A2A protocol (task, status-update, message, artifact-update) and is already well-structured with helper functions
async function processStreamingResponse(
  stream: AsyncIterable<unknown>,
  onStreamUpdate?: (partialContent: string, reasoning?: string) => void | Promise<void>
): Promise<StreamingResult> {
  let taskPlan = '';
  let taskId = '';
  let contextId = '';
  const reasoningSteps: string[] = [];
  let lastAgentMessage = '';
  let hasSeenFinalStatus = false;

  for await (const event of stream) {
    const evt = event as StreamEvent;

    // Extract contextId from any event that has it
    if (evt.contextId) {
      contextId = evt.contextId;
    }

    // Handle task creation
    if (evt.kind === 'task') {
      taskId = evt.id || '';

      // Extract and display task description/plan
      const taskText = extractTaskText(evt);
      if (taskText) {
        taskPlan = taskText;
        if (onStreamUpdate) {
          await onStreamUpdate(taskPlan);
        }
      }
      continue;
    }

    // Handle status updates
    if (evt.kind === 'status-update') {
      // Extract taskId from status updates as well
      if (evt.taskId) {
        taskId = evt.taskId;
      }

      const statusText = extractStatusText(evt);

      if (statusText) {
        // Check if this is a tool message (reasoning) or agent message
        if (isToolMessage(statusText)) {
          // Accumulate reasoning
          reasoningSteps.push(statusText);
          if (onStreamUpdate && taskPlan) {
            // Update with task plan + reasoning
            await onStreamUpdate(taskPlan, reasoningSteps.join('\n\n'));
          }
        } else {
          // This might be the final agent message
          lastAgentMessage = statusText;
          if (onStreamUpdate && taskPlan) {
            // Update with task plan + reasoning
            await onStreamUpdate(taskPlan, reasoningSteps.join('\n\n'));
          }
        }
      }

      if (evt.final) {
        // biome-ignore lint/suspicious/noConsole: debug logging
        console.log('Stream completed');
        hasSeenFinalStatus = true;
        break;
      }
      continue;
    }

    // Handle message events (for simple streaming responses without tasks)
    if (evt.kind === 'message') {
      // Extract taskId from message events as well
      if (evt.taskId) {
        taskId = evt.taskId;
      }

      const messageText = extractMessageText(evt);
      if (messageText && !taskId) {
        // For non-task messages, just concatenate
        taskPlan += messageText;
        if (onStreamUpdate) {
          await onStreamUpdate(taskPlan);
        }
      }
      continue;
    }

    // Handle artifact updates
    if (evt.kind === 'artifact-update') {
      // Extract taskId from artifact updates as well
      if (evt.taskId) {
        taskId = evt.taskId;
      }

      const artifactText = extractArtifactText(evt);
      if (artifactText) {
        lastAgentMessage = artifactText;
        if (onStreamUpdate && taskPlan) {
          await onStreamUpdate(taskPlan, reasoningSteps.join('\n\n'));
        }
      }
    }
  }

  // Return the result with metadata
  const result: StreamingResult = {
    message: taskPlan || lastAgentMessage || 'Agent completed task successfully',
  };

  if (taskId) {
    result.taskId = taskId;
  }

  if (contextId) {
    result.contextId = contextId;
  }

  if (reasoningSteps.length > 0) {
    result.reasoning = reasoningSteps.join('\n\n');
  }

  // If we have a final agent message that's different from the task plan and we saw final status,
  // include it as a separate completion message
  if (hasSeenFinalStatus && lastAgentMessage && lastAgentMessage !== taskPlan && !isToolMessage(lastAgentMessage)) {
    result.completionMessage = lastAgentMessage;
  }

  return result;
}

/**
 * Sends a non-streaming message and returns the response
 */
async function sendNonStreamingMessage(client: A2AClient, sendParams: MessageSendParams): Promise<A2AApiResponse> {
  const response = await client.sendMessage(sendParams);

  if ('error' in response) {
    const errorMessage = response.error?.message || 'Unknown error from agent';
    return {
      success: false,
      message: errorMessage,
      error: errorMessage,
    };
  }

  const responseText = extractTextFromResult(response.result);
  const result = response.result as Task | Message;

  // Extract taskId and contextId from the result
  const taskId = result.kind === 'task' ? (result as Task).id : (result as Message).taskId;
  const contextId = result.kind === 'task' ? (result as Task).contextId : (result as Message).contextId;

  return {
    message: responseText,
    success: true,
    taskId,
    contextId,
  };
}

const fetchWithCustomHeader: typeof fetch = async (url, init) => {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${config.jwt}`);

  const newInit = { ...init, headers };

  return fetch(url, newInit);
};

/**
 * Sends a message to an AI agent via the A2A (Agent-to-Agent) protocol.
 * Uses the official @a2a-js/sdk for proper A2A protocol communication.
 * Supports streaming responses from agents.
 *
 * @see https://github.com/a2aproject/a2a-js for SDK documentation
 */
export const sendMessageViaA2A = async ({
  message,
  agentUrl,
  contextId,
  taskId,
  onStreamUpdate,
}: SendMessageViaA2AProps): Promise<A2AApiResponse> => {
  try {
    // Resolve the full agent card URL from the provided agent URL
    const agentCardUrl = getAgentCardUrl({ agentUrl });

    // Create A2A client from the agent card URL
    const client = await A2AClient.fromCardUrl(agentCardUrl, { fetchImpl: fetchWithCustomHeader });

    const sendParams: MessageSendParams = {
      message: {
        messageId: uuidv4(),
        contextId,
        taskId,
        role: 'user',
        parts: [{ kind: 'text', text: message }],
        kind: 'message',
      },
    };

    // Try streaming first for better UX
    try {
      const stream = client.sendMessageStream(sendParams);
      const result = await processStreamingResponse(stream, onStreamUpdate);
      return {
        message: result.message,
        success: true,
        taskId: result.taskId,
        contextId: result.contextId,
        reasoning: result.reasoning,
        completionMessage: result.completionMessage,
      };
    } catch {
      // Fall back to non-streaming if streaming is not supported
      return await sendNonStreamingMessage(client, sendParams);
    }
  } catch (error) {
    let errorMessage = 'Failed to send message to agent. Please try again later.';

    if (error instanceof Error) {
      if (error.message.includes('fetch') || error.message.includes('network')) {
        errorMessage = 'Cannot connect to agent. Please check that the agent is running and accessible.';
      } else if (error.message.includes('agent-card') || error.message.includes('card')) {
        errorMessage = 'Unable to load agent card. The agent may not be configured correctly.';
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      message: errorMessage,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
