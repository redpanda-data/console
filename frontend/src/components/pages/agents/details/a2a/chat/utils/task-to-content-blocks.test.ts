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

import { describe, expect, test } from 'vitest';

import { consolidateTextParts, resolveStaleToolBlocks, taskToContentBlocks } from './task-to-content-blocks';
import type { ArtifactPart, ContentBlock } from '../types';

// ---------------------------------------------------------------------------
// consolidateTextParts
// ---------------------------------------------------------------------------

describe('consolidateTextParts', () => {
  test('merges consecutive text parts into one', () => {
    const parts: ArtifactPart[] = [
      { kind: 'text', text: 'Hello' },
      { kind: 'text', text: ' ' },
      { kind: 'text', text: 'world' },
    ];

    const result = consolidateTextParts(parts);

    expect(result).toEqual([{ kind: 'text', text: 'Hello world' }]);
  });

  test('preserves non-text parts in order', () => {
    const parts: ArtifactPart[] = [
      { kind: 'text', text: 'before' },
      { kind: 'file', file: { name: 'img.png', mimeType: 'image/png', bytes: 'abc' } },
      { kind: 'text', text: 'after' },
    ];

    const result = consolidateTextParts(parts);

    expect(result).toEqual([
      { kind: 'text', text: 'before' },
      { kind: 'file', file: { name: 'img.png', mimeType: 'image/png', bytes: 'abc' } },
      { kind: 'text', text: 'after' },
    ]);
  });

  test('merges text parts around non-text parts', () => {
    const parts: ArtifactPart[] = [
      { kind: 'text', text: 'a' },
      { kind: 'text', text: 'b' },
      { kind: 'data', data: { key: 'value' } },
      { kind: 'text', text: 'c' },
      { kind: 'text', text: 'd' },
    ];

    const result = consolidateTextParts(parts);

    expect(result).toEqual([
      { kind: 'text', text: 'ab' },
      { kind: 'data', data: { key: 'value' } },
      { kind: 'text', text: 'cd' },
    ]);
  });

  test('returns empty array for empty input', () => {
    expect(consolidateTextParts([])).toEqual([]);
  });

  test('returns single text part unchanged', () => {
    const parts: ArtifactPart[] = [{ kind: 'text', text: 'only' }];
    const result = consolidateTextParts(parts);
    expect(result).toEqual([{ kind: 'text', text: 'only' }]);
  });

  test('does not mutate the input array', () => {
    const parts: ArtifactPart[] = [
      { kind: 'text', text: 'a' },
      { kind: 'text', text: 'b' },
    ];
    const original = JSON.parse(JSON.stringify(parts));
    consolidateTextParts(parts);
    expect(parts).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// resolveStaleToolBlocks
// ---------------------------------------------------------------------------

describe('resolveStaleToolBlocks', () => {
  const makeToolBlock = (state: 'input-available' | 'output-available' | 'output-error'): ContentBlock => ({
    type: 'tool',
    toolCallId: `tool-${Math.random()}`,
    toolName: 'search',
    state,
    input: {},
    timestamp: new Date(),
  });

  test('resolves input-available tools to output-available when task is completed', () => {
    const blocks: ContentBlock[] = [makeToolBlock('input-available'), makeToolBlock('input-available')];
    resolveStaleToolBlocks(blocks, 'completed');

    for (const block of blocks) {
      if (block.type === 'tool') {
        expect(block.state).toBe('output-available');
      }
    }
  });

  test('resolves tools to output-error when task failed', () => {
    for (const state of ['failed', 'canceled', 'rejected']) {
      const blocks: ContentBlock[] = [makeToolBlock('input-available')];
      resolveStaleToolBlocks(blocks, state);
      expect(blocks[0].type === 'tool' && blocks[0].state).toBe('output-error');
    }
  });

  test('does not resolve tools when task is still working', () => {
    const blocks: ContentBlock[] = [makeToolBlock('input-available')];
    resolveStaleToolBlocks(blocks, 'working');
    expect(blocks[0].type === 'tool' && blocks[0].state).toBe('input-available');
  });

  test('does not change tools already in output-available or output-error', () => {
    const blocks: ContentBlock[] = [makeToolBlock('output-available'), makeToolBlock('output-error')];
    resolveStaleToolBlocks(blocks, 'completed');

    expect(blocks[0].type === 'tool' && blocks[0].state).toBe('output-available');
    expect(blocks[1].type === 'tool' && blocks[1].state).toBe('output-error');
  });

  test('does nothing when taskState is undefined', () => {
    const blocks: ContentBlock[] = [makeToolBlock('input-available')];
    resolveStaleToolBlocks(blocks, undefined);
    expect(blocks[0].type === 'tool' && blocks[0].state).toBe('input-available');
  });
});

// ---------------------------------------------------------------------------
// taskToContentBlocks – artifact text consolidation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// taskToContentBlocks – stale tool resolution
// ---------------------------------------------------------------------------

describe('taskToContentBlocks – stale tool blocks', () => {
  test('resolves tool blocks without tool_response to output-available on completed task', () => {
    const task = {
      id: 'task-1',
      contextId: 'ctx-1',
      status: {
        state: 'completed' as const,
        timestamp: new Date().toISOString(),
        message: {
          kind: 'message' as const,
          messageId: 'msg-final',
          role: 'agent' as const,
          parts: [{ kind: 'text' as const, text: 'Done' }],
        },
      },
      history: [
        {
          kind: 'message' as const,
          messageId: 'msg-1',
          role: 'agent' as const,
          parts: [
            {
              kind: 'data' as const,
              data: { id: 'call-1', name: 'search', arguments: { q: 'test' } },
              metadata: { data_type: 'tool_request' },
            },
          ],
        },
        {
          kind: 'message' as const,
          messageId: 'msg-2',
          role: 'agent' as const,
          parts: [{ kind: 'text' as const, text: 'Here are the results.' }],
        },
      ],
    };

    const blocks = taskToContentBlocks(task);
    const toolBlock = blocks.find((b) => b.type === 'tool');

    expect(toolBlock).toBeDefined();
    if (toolBlock?.type === 'tool') {
      expect(toolBlock.state).toBe('output-available');
      expect(toolBlock.toolName).toBe('search');
    }
  });
});

// ---------------------------------------------------------------------------
// taskToContentBlocks – artifact text consolidation
// ---------------------------------------------------------------------------

describe('taskToContentBlocks – artifact text consolidation', () => {
  test('consolidates many text parts from tasks/get into a single text part', () => {
    const task = {
      id: 'task-1',
      contextId: 'ctx-1',
      status: {
        state: 'completed' as const,
        timestamp: new Date().toISOString(),
        message: {
          kind: 'message' as const,
          messageId: 'msg-1',
          role: 'agent' as const,
          parts: [{ kind: 'text' as const, text: 'Done' }],
        },
      },
      artifacts: [
        {
          artifactId: 'art-1',
          parts: [
            { kind: 'text' as const, text: '# Title\n\n' },
            { kind: 'text' as const, text: 'Some ' },
            { kind: 'text' as const, text: 'content ' },
            { kind: 'text' as const, text: 'here.' },
          ],
        },
      ],
    };

    const blocks = taskToContentBlocks(task);
    const artifactBlock = blocks.find((b) => b.type === 'artifact');

    expect(artifactBlock).toBeDefined();
    if (artifactBlock?.type === 'artifact') {
      // All four text parts should be consolidated into one
      expect(artifactBlock.parts).toHaveLength(1);
      expect(artifactBlock.parts[0]).toEqual({
        kind: 'text',
        text: '# Title\n\nSome content here.',
      });
    }
  });
});
