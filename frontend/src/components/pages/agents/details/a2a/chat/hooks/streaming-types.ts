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

import type { Message, Task, TaskArtifactUpdateEvent, TaskState, TaskStatusUpdateEvent } from '@a2a-js/sdk';

import type { ChatMessage, ContentBlock } from '../types';

/**
 * Artifact data structure from raw events
 * @deprecated Use ContentBlock directly instead
 */
export type ArtifactData = {
  artifactId: string;
  name?: string;
  description?: string;
  text: string;
};

/**
 * Tool call data structure tracked during streaming
 * @deprecated Use ContentBlock directly instead
 */
export type ToolCallData = {
  id: string;
  name: string;
  state: 'input-available' | 'output-available' | 'output-error';
  input?: unknown;
  output?: unknown;
  errorText?: string;
  messageId: string;
  timestamp: Date;
};

/**
 * Response metadata event from stream
 */
export type ResponseMetadataEvent = {
  type: 'response-metadata';
  id?: string;
};

/**
 * Text delta event from stream
 */
export type TextDeltaEvent = {
  type: 'text-delta';
  text: string;
};

/**
 * Raw event from A2A SDK wrapped in AI SDK's streaming protocol
 */
export type RawStreamEvent = {
  type: 'raw';
  rawValue: Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent | Message;
};

/**
 * Stream chunk union type - simplified, no Raw wrappers
 */
export type StreamChunk = ResponseMetadataEvent | TextDeltaEvent | RawStreamEvent;

/**
 * Streaming state that accumulates during stream consumption
 * New approach: build ordered content blocks instead of accumulating text + maps
 */
export type StreamingState = {
  /**
   * Ordered array of content blocks (text, tool calls, artifacts)
   */
  contentBlocks: ContentBlock[];
  /**
   * Active text block being accumulated from streaming text chunks
   * Closed when a non-text event arrives
   */
  activeTextBlock: ContentBlock | null;
  /**
   * Last event timestamp for ordering
   */
  lastEventTimestamp: Date;
  /**
   * Captured task ID from various event sources
   */
  capturedTaskId: string | undefined;
  /**
   * Latest task state from status updates
   */
  capturedTaskState: ChatMessage['taskState'] | undefined;
  /**
   * Previous task state for detecting state transitions
   */
  previousTaskState: TaskState | undefined;
  /**
   * Index in contentBlocks where taskId was first captured
   * Used to split pre-task content from task-related content
   */
  taskIdCapturedAtBlockIndex: number | undefined;
  /**
   * Latest usage metadata from status-update events
   */
  latestUsage: ChatMessage['usage'] | undefined;
  /**
   * @deprecated Legacy artifact accumulation - use contentBlocks instead
   */
  artifactsMap?: Map<string, ArtifactData>;
  /**
   * @deprecated Legacy tool call tracking - use contentBlocks instead
   */
  toolCallsMap?: Map<string, ToolCallData>;
  /**
   * @deprecated Legacy full content string - use contentBlocks instead
   */
  fullContent?: string;
};
