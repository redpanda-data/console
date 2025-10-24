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

import type { ChatMessage, ContentBlock } from '../types';
import type { TaskStateProps } from 'components/ai-elements/task';

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
 * Raw task event
 */
export type RawTaskEvent = {
  kind: 'task';
  id: string;
  taskId?: string;
  status?: {
    state?: string;
  };
};

/**
 * Raw status-update event
 */
export type RawStatusUpdateEvent = {
  kind: 'status-update';
  taskId?: string;
  status?: {
    state?: string;
    timestamp?: string; // Timestamp is at status level
    message?: {
      kind: string;
      messageId: string;
      metadata?: {
        llm_message?: string;
      };
      parts?: Array<{ kind: string; text?: string }>;
      role: string;
    };
  };
};

/**
 * Raw artifact-update event
 */
export type RawArtifactUpdateEvent = {
  kind: 'artifact-update';
  taskId?: string;
  artifact?: {
    artifactId: string;
    name?: string;
    description?: string;
    parts: Array<{
      kind: string;
      text?: string;
      file?: {
        name?: string;
        mimeType?: string;
        bytes?: string;
      };
    }>;
  };
};

/**
 * Union of all raw event types
 */
export type RawEvent = RawTaskEvent | RawStatusUpdateEvent | RawArtifactUpdateEvent;

/**
 * Raw chunk wrapper
 */
export type RawChunk = {
  type: 'raw';
  rawValue: RawEvent;
};

/**
 * Stream chunk union type
 */
export type StreamChunk = ResponseMetadataEvent | TextDeltaEvent | RawChunk | { type: string };

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
  previousTaskState: TaskStateProps['state'] | undefined;
  /**
   * Index in contentBlocks where taskId was first captured
   * Used to split pre-task content from task-related content
   */
  taskIdCapturedAtBlockIndex: number | undefined;
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
