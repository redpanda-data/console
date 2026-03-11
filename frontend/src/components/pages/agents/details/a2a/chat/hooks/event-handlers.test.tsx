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

import type { TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { describe, expect, vi } from 'vitest';

import { handleArtifactUpdateEvent, handleStatusUpdateEvent } from './event-handlers';
import type { StreamingState } from './streaming-types';
import type { ChatMessage } from '../types';

const createMockState = (overrides?: Partial<StreamingState>): StreamingState => ({
  contentBlocks: [],
  activeTextBlock: null,
  lastEventTimestamp: new Date(),
  capturedTaskId: undefined,
  capturedTaskState: undefined,
  previousTaskState: undefined,
  taskIdCapturedAtBlockIndex: undefined,
  latestUsage: undefined,
  ...overrides,
});

const createMockMessage = (): ChatMessage => ({
  id: 'test-msg-1',
  role: 'assistant',
  contextId: 'test-context',
  timestamp: new Date(),
  contentBlocks: [],
});

const makeArtifactEvent = (
  text: string,
  opts: { append?: boolean; lastChunk?: boolean } = {}
): TaskArtifactUpdateEvent => ({
  kind: 'artifact-update',
  contextId: 'test-context',
  taskId: 'task-123',
  append: opts.append,
  lastChunk: opts.lastChunk,
  artifact: {
    artifactId: 'artifact-1',
    parts: text ? [{ kind: 'text', text }] : [],
  },
});

describe('handleStatusUpdateEvent', () => {
  test('should allow normal agent messages through', () => {
    const state = createMockState();
    const assistantMessage = createMockMessage();
    const onMessageUpdate = vi.fn();

    const event: TaskStatusUpdateEvent = {
      kind: 'status-update',
      contextId: 'test-context',
      final: false,
      taskId: 'task-123',
      status: {
        state: 'working',
        timestamp: '2025-10-24T17:31:51Z',
        message: {
          kind: 'message',
          messageId: 'msg-3',
          role: 'agent',
          parts: [
            {
              kind: 'text',
              text: 'Artifact created successfully.\n\n- Name: Test Markdown Artifact',
            },
          ],
        },
      },
    };

    handleStatusUpdateEvent(event, state, assistantMessage, onMessageUpdate);

    const statusBlocks = state.contentBlocks.filter((b) => b.type === 'task-status-update');
    expect(statusBlocks).toHaveLength(1);
    expect(statusBlocks[0].type === 'task-status-update' && statusBlocks[0].text).toContain(
      'Artifact created successfully'
    );
  });
});

describe('handleArtifactUpdateEvent', () => {
  /**
   * Regression test for React Compiler memoization bug.
   *
   * The handler mutated activeTextBlock in place and passed the same reference
   * to onMessageUpdate. React Compiler's auto-memoization detected the unchanged
   * reference and skipped re-renders, so only the first chunk was displayed.
   *
   * The fix clones the artifact block for each UI update so React sees a new
   * object on every call.
   */
  test('each streaming chunk must produce a new artifact block reference', () => {
    const state = createMockState({ capturedTaskId: 'task-123' });
    const assistantMessage = createMockMessage();
    const onMessageUpdate = vi.fn();

    // Simulate 3 streaming chunks
    handleArtifactUpdateEvent(makeArtifactEvent('Hello'), state, assistantMessage, onMessageUpdate);
    handleArtifactUpdateEvent(makeArtifactEvent(' world', { append: true }), state, assistantMessage, onMessageUpdate);
    handleArtifactUpdateEvent(makeArtifactEvent('!', { append: true }), state, assistantMessage, onMessageUpdate);

    expect(onMessageUpdate).toHaveBeenCalledTimes(3);

    const getArtifactBlock = (callIndex: number) => {
      const msg = onMessageUpdate.mock.calls[callIndex][0] as ChatMessage;
      return msg.contentBlocks.find((b) => b.type === 'artifact');
    };

    const block1 = getArtifactBlock(0);
    const block2 = getArtifactBlock(1);
    const block3 = getArtifactBlock(2);

    // References must differ so React detects the change
    expect(block1).not.toBe(block2);
    expect(block2).not.toBe(block3);

    // Text must accumulate
    expect(block1?.type === 'artifact' && block1.parts[0]?.kind === 'text' && block1.parts[0].text).toBe('Hello');
    expect(block2?.type === 'artifact' && block2.parts[0]?.kind === 'text' && block2.parts[0].text).toBe('Hello world');
    expect(block3?.type === 'artifact' && block3.parts[0]?.kind === 'text' && block3.parts[0].text).toBe(
      'Hello world!'
    );
  });

  test('lastChunk finalizes the artifact into contentBlocks', () => {
    const state = createMockState({ capturedTaskId: 'task-123' });
    const assistantMessage = createMockMessage();
    const onMessageUpdate = vi.fn();

    handleArtifactUpdateEvent(makeArtifactEvent('Hello'), state, assistantMessage, onMessageUpdate);
    handleArtifactUpdateEvent(makeArtifactEvent(' world', { append: true }), state, assistantMessage, onMessageUpdate);
    // lastChunk with empty parts (matches real backend behavior)
    handleArtifactUpdateEvent(
      makeArtifactEvent('', { append: true, lastChunk: true }),
      state,
      assistantMessage,
      onMessageUpdate
    );

    // activeTextBlock should be cleared
    expect(state.activeTextBlock).toBeNull();

    // Artifact should be persisted in contentBlocks with accumulated text
    const artifacts = state.contentBlocks.filter((b) => b.type === 'artifact');
    expect(artifacts).toHaveLength(1);
    expect(
      artifacts[0].type === 'artifact' && artifacts[0].parts[0]?.kind === 'text' && artifacts[0].parts[0].text
    ).toBe('Hello world');
  });
});
