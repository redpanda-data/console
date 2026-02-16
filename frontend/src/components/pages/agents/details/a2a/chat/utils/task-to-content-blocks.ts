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

import type { Artifact, Message1, Part, Task, TaskState } from '@a2a-js/sdk';

import type { ArtifactPart, ContentBlock, MessageUsageMetadata } from '../types';

/**
 * Extract text content from a message's parts (agent messages only).
 * Also builds a tool call summary string for display.
 */
const extractAgentMessageText = (parts: Part[]): string => {
  const textParts = parts
    .filter((part): part is Extract<Part, { kind: 'text' }> => part.kind === 'text')
    .map((part) => part.text);

  const toolRequests = parts.filter((part): part is Extract<Part, { kind: 'data' }> => {
    if (part.kind !== 'data') {
      return false;
    }
    const metadata = part.metadata as Record<string, unknown> | undefined;
    const data = part.data as Record<string, unknown> | undefined;
    return metadata?.data_type === 'tool_request' && !!data?.name;
  });

  const toolNames = toolRequests.map((part) => (part.data as Record<string, unknown>).name as string);

  let toolSummary = '';
  if (toolNames.length === 1) {
    toolSummary = `Calling tool: ${toolNames[0]}`;
  } else if (toolNames.length > 1) {
    const toolCounts = toolNames.reduce(
      (acc, tool) => {
        acc[tool] = (acc[tool] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    const toolList = Object.entries(toolCounts)
      .map(([tool, count]) => (count > 1 ? `${tool} (${count}×)` : tool))
      .join(', ');
    toolSummary = `Calling ${toolNames.length} tools: ${toolList}`;
  }

  const text = textParts.join('');
  if (text && toolSummary) {
    return `${text}\n\n${toolSummary}`;
  }
  return toolSummary || text;
};

/**
 * Extract tool request and tool response blocks from a message's data parts.
 */
const extractToolBlocks = (parts: Part[], messageId: string, timestamp: Date): ContentBlock[] => {
  const blocks: ContentBlock[] = [];

  for (const part of parts) {
    if (part.kind !== 'data' || !part.metadata?.data_type) {
      continue;
    }

    const dataType = part.metadata.data_type as string;
    const data = part.data as Record<string, unknown>;

    if (dataType === 'tool_request' && data?.id && data?.name) {
      blocks.push({
        type: 'tool',
        toolCallId: data.id as string,
        toolName: data.name as string,
        state: 'input-available',
        input: 'arguments' in data ? data.arguments : undefined,
        timestamp,
        messageId,
      });
    }
  }

  return blocks;
};

/**
 * Apply tool responses to existing tool blocks (mutates blocks in place).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: tool response matching logic
const applyToolResponses = (blocks: ContentBlock[], parts: Part[], timestamp: Date): void => {
  for (const part of parts) {
    if (part.kind !== 'data' || !part.metadata?.data_type) {
      continue;
    }

    const dataType = part.metadata.data_type as string;
    const data = part.data as Record<string, unknown>;

    if (dataType === 'tool_response' && data?.id) {
      const existing = blocks.find((b) => b.type === 'tool' && b.toolCallId === (data.id as string));
      if (existing && existing.type === 'tool') {
        const hasError = 'error' in data && data.error;
        existing.state = hasError ? 'output-error' : 'output-available';
        if (hasError) {
          existing.errorText = data.error as string;
        } else {
          existing.output = 'result' in data ? data.result : undefined;
        }
        existing.endTimestamp = timestamp;
      }
    }
  }
};

/**
 * Convert a Task's history messages into ContentBlock array for rendering.
 * Only processes agent messages -- user messages are stored locally in IndexedDB.
 */
const processHistory = (history: Message1[]): ContentBlock[] => {
  const blocks: ContentBlock[] = [];

  for (const message of history) {
    if (message.role !== 'agent' || !message.parts?.length) {
      continue;
    }

    const timestamp = new Date();
    const text = extractAgentMessageText(message.parts);

    // Create status-update block for text content
    if (text.trim()) {
      blocks.push({
        type: 'task-status-update',
        text,
        messageId: message.messageId,
        final: false,
        timestamp,
        usage: message.metadata?.usage as MessageUsageMetadata | undefined,
      });
    }

    // Extract tool request blocks
    const toolBlocks = extractToolBlocks(message.parts, message.messageId, timestamp);
    blocks.push(...toolBlocks);

    // Apply tool responses to existing tool blocks
    applyToolResponses(blocks, message.parts, timestamp);
  }

  return blocks;
};

const TERMINAL_TASK_STATES = new Set(['completed', 'failed', 'canceled', 'rejected']);

/**
 * Resolve tool blocks still in 'input-available' state when the task is terminal.
 * Many A2A agents never send tool_response data parts, so tool blocks would show
 * a "Working" spinner forever. When the task has finished, we infer tool outcome
 * from the task state (mutates blocks in place):
 * - completed → output-available (tools succeeded)
 * - failed/canceled/rejected → output-error (task didn't succeed)
 */
export const resolveStaleToolBlocks = (blocks: ContentBlock[], taskState: string | undefined): void => {
  if (!(taskState && TERMINAL_TASK_STATES.has(taskState))) {
    return;
  }
  const resolvedState = taskState === 'completed' ? 'output-available' : 'output-error';
  for (const block of blocks) {
    if (block.type === 'tool' && block.state === 'input-available') {
      block.state = resolvedState;
    }
  }
};

/**
 * Merge consecutive text parts into a single text part.
 * Non-text parts are preserved in order. This prevents the reload problem
 * where tasks/get returns many individual text parts (one per streamed chunk)
 * that would each render as a separate Response component.
 */
export const consolidateTextParts = (parts: ArtifactPart[]): ArtifactPart[] => {
  const result: ArtifactPart[] = [];
  for (const part of parts) {
    if (part.kind === 'text') {
      const prev = result.at(-1);
      if (prev?.kind === 'text') {
        prev.text += part.text;
        continue;
      }
    }
    // Clone the part so the caller's array isn't mutated
    result.push(part.kind === 'text' ? { kind: 'text', text: part.text } : part);
  }
  return result;
};

/**
 * Convert Task artifacts to ContentBlock array.
 */
const processArtifacts = (artifacts: Artifact[]): ContentBlock[] =>
  artifacts
    .filter((artifact) => artifact.parts?.length > 0)
    .map((artifact) => ({
      type: 'artifact' as const,
      artifactId: artifact.artifactId,
      name: artifact.name,
      description: artifact.description,
      parts: consolidateTextParts(
        artifact.parts.map((part): ArtifactPart => {
          if (part.kind === 'text') {
            return { kind: 'text', text: part.text };
          }
          if (part.kind === 'file') {
            return {
              kind: 'file',
              file: {
                name: part.file.name,
                mimeType: part.file.mimeType ?? 'application/octet-stream',
                ...('bytes' in part.file ? { bytes: part.file.bytes } : {}),
                ...('uri' in part.file ? { uri: part.file.uri } : {}),
              },
            };
          }
          // DataPart
          return { kind: 'data', data: part.data };
        })
      ),
      timestamp: new Date(),
    }));

/**
 * Convert a Task object (from tasks/get) to the ContentBlock[] format
 * that the chat UI renders.
 *
 * The mapping:
 * - task.history (agent messages) -> task-status-update + tool blocks
 * - task.artifacts -> artifact blocks
 * - task.status -> final task-status-update block
 */
export const taskToContentBlocks = (task: Task): ContentBlock[] => {
  const blocks: ContentBlock[] = [];

  // Process history messages
  if (task.history?.length) {
    blocks.push(...processHistory(task.history));
  }

  // Process artifacts
  if (task.artifacts?.length) {
    blocks.push(...processArtifacts(task.artifacts));
  }

  // Add final status block
  blocks.push({
    type: 'task-status-update',
    taskState: task.status.state as TaskState,
    text: task.status.message?.parts
      ?.filter((p): p is Extract<Part, { kind: 'text' }> => p.kind === 'text')
      .map((p) => p.text)
      .join(''),
    final: true,
    timestamp: task.status.timestamp ? new Date(task.status.timestamp) : new Date(),
  });

  // Resolve tool blocks that never received a tool_response
  resolveStaleToolBlocks(blocks, task.status.state);

  return blocks;
};
