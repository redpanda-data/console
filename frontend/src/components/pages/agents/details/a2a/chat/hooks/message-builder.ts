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

/**
 * Close the active text block and add it to content blocks if it has content
 */
export const closeActiveTextBlock = (contentBlocks: ContentBlock[], activeTextBlock: ContentBlock | null): void => {
  if (activeTextBlock && activeTextBlock.type === 'text' && activeTextBlock.text.length > 0) {
    console.log('[closeActiveTextBlock] ✅ PUSHING text block to contentBlocks:', activeTextBlock.text.substring(0, 100));
    contentBlocks.push(activeTextBlock);
  }
};

/**
 * Sort content blocks by timestamp for strict temporal ordering
 */
export const sortContentBlocksByTimestamp = (blocks: ContentBlock[]): ContentBlock[] =>
  [...blocks].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

/**
 * Parameters for building a message with content blocks
 */
export type BuildMessageParams = {
  baseMessage: ChatMessage;
  contentBlocks: ContentBlock[];
  taskId: string | undefined;
  taskState: ChatMessage['taskState'] | undefined;
  taskStartIndex?: number | undefined;
};

/**
 * Build a complete message with ordered content blocks
 * This is the new approach for Jupyter-style interleaved rendering
 */
export const buildMessageWithContentBlocks = ({
  baseMessage,
  contentBlocks,
  taskId,
  taskState,
  taskStartIndex,
}: BuildMessageParams): ChatMessage => {
  // Sort blocks by timestamp for strict temporal ordering
  const sortedBlocks = sortContentBlocksByTimestamp(contentBlocks);

  return {
    ...baseMessage,
    contentBlocks: sortedBlocks,
    taskId,
    taskState,
    taskStartIndex,
  };
};

// ============================================================================
// LEGACY FUNCTIONS - Kept for backward compatibility during migration
// ============================================================================
