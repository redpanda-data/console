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

import type { TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { describe, expect, it, vi } from 'vitest';

import { handleStatusUpdateEvent } from './event-handlers';
import type { StreamingState } from './streaming-types';
import type { ChatMessage } from '../types';

describe('artifact duplication bug', () => {
  const createMockState = (): StreamingState => ({
    contentBlocks: [],
    activeTextBlock: null,
    lastEventTimestamp: new Date(),
    capturedTaskId: undefined,
    capturedTaskState: undefined,
    previousTaskState: undefined,
    taskIdCapturedAtBlockIndex: undefined,
  });

  const createMockMessage = (): ChatMessage => ({
    id: 'test-msg-1',
    role: 'assistant',
    content: '',
    contextId: 'test-context',
    timestamp: new Date(),
    contentBlocks: [],
  });

  it('should allow normal agent messages through', () => {
    const state = createMockState();
    const assistantMessage = createMockMessage();
    const onMessageUpdate = vi.fn();

    const event: TaskStatusUpdateEvent = {
      kind: 'status-update',
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
              text: 'Artifact created successfully.\n\n- Name: Test Markdown Artifact\n- Description: A concise markdown sample\n- Artifact ID: artifact-d3trg0tuui6c73cprmj0',
            },
          ],
        },
      },
    };

    handleStatusUpdateEvent(event, state, assistantMessage, onMessageUpdate);

    // SHOULD create task-status-update block (normal message, not tool-related)
    const statusBlocks = state.contentBlocks.filter((b) => b.type === 'task-status-update');
    expect(statusBlocks).toHaveLength(1);
    expect(statusBlocks[0].text).toContain('Artifact created successfully');
  });
});
