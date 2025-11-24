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

import type { TaskState } from '@a2a-js/sdk';
import type { AIAgent } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';

/**
 * Artifact part types - supports text and file (e.g., images) content
 * Compatible with both streaming (bytes) and DB storage (uri)
 */
export type ArtifactPart =
  | { kind: 'text'; text: string }
  | { kind: 'file'; file: { name?: string; mimeType: string; bytes?: string; uri?: string } }
  | { kind: 'data'; data?: unknown };

/**
 * Content block types for Jupyter-style interleaved rendering
 * Each block represents a temporal event in the agent's response
 */
export type ContentBlock =
  | {
      type: 'tool';
      toolCallId: string;
      toolName: string;
      state: 'input-available' | 'output-available' | 'output-error';
      input: unknown;
      output?: unknown;
      errorText?: string;
      timestamp: Date;
      endTimestamp?: Date;
      messageId?: string;
    }
  | {
      type: 'artifact';
      artifactId: string;
      name?: string;
      description?: string;
      parts: ArtifactPart[];
      timestamp: Date;
    }
  | {
      type: 'task-status-update';
      taskState?: TaskState;
      previousState?: TaskState;
      text?: string;
      messageId?: string;
      final: boolean;
      timestamp: Date;
    };

export type UsageMetadata = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  max_input_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  /**
   * Content blocks in chronological order (Jupyter-style rendering)
   */
  contentBlocks: ContentBlock[];
  timestamp: Date;
  contextId?: string;
  taskId?: string;
  taskState?: TaskState;
  /**
   * Index in contentBlocks where task-related content starts
   * Content before this index should be rendered above the Task box
   */
  taskStartIndex?: number;
  /**
   * Usage metadata from the final status-update event
   */
  usage?: UsageMetadata;
};

export type AIAgentChatProps = {
  agent: AIAgent;
};
