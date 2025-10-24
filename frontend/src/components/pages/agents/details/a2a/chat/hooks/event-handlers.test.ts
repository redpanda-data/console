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

import { describe, expect, it, vi } from 'vitest';

import { handleStatusUpdateEvent } from './event-handlers';
import type { RawStatusUpdateEvent, StreamingState } from './streaming-types';
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

  it('should filter out tool request messages from status updates', () => {
    const state = createMockState();
    const assistantMessage = createMockMessage();
    const onMessageUpdate = vi.fn();

    const event: RawStatusUpdateEvent = {
      kind: 'status-update',
      taskId: 'task-123',
      status: {
        state: 'working',
        timestamp: '2025-10-24T17:31:47Z',
        message: {
          kind: 'message',
          messageId: 'msg-1',
          role: 'agent',
          parts: [
            {
              kind: 'text',
              text: 'Tool request: artifact_emit with arguments: {"description":"A concise markdown sample","name":"Test Markdown Artifact","text":"# Test Markdown Artifact\\n\\n## Subheading..."}',
            },
          ],
        },
      },
    };

    handleStatusUpdateEvent(event, state, assistantMessage, onMessageUpdate);

    // Should NOT create text block (filtered by startsWith('Tool request:'))
    const textBlocks = state.contentBlocks.filter((b) => b.type === 'text');
    expect(textBlocks).toHaveLength(0);
  });

  it('should filter out tool response messages from status updates', () => {
    const state = createMockState();
    const assistantMessage = createMockMessage();
    const onMessageUpdate = vi.fn();

    const event: RawStatusUpdateEvent = {
      kind: 'status-update',
      taskId: 'task-123',
      status: {
        state: 'working',
        timestamp: '2025-10-24T17:31:47Z',
        message: {
          kind: 'message',
          messageId: 'msg-2',
          role: 'agent',
          parts: [
            {
              kind: 'text',
              text: 'Tool response: {"artifactId":"artifact-d3trg0tuui6c73cprmj0"}',
            },
          ],
        },
      },
    };

    handleStatusUpdateEvent(event, state, assistantMessage, onMessageUpdate);

    // Should NOT create text block (filtered by startsWith('Tool response:'))
    const textBlocks = state.contentBlocks.filter((b) => b.type === 'text');
    expect(textBlocks).toHaveLength(0);
  });

  it('should allow normal agent messages through', () => {
    const state = createMockState();
    const assistantMessage = createMockMessage();
    const onMessageUpdate = vi.fn();

    const event: RawStatusUpdateEvent = {
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

    // SHOULD create text block (normal message, not tool-related)
    const textBlocks = state.contentBlocks.filter((b) => b.type === 'text');
    expect(textBlocks).toHaveLength(1);
    expect(textBlocks[0].text).toContain('Artifact created successfully');
  });

  it('should skip artifact-update messages from status updates', () => {
    const state = createMockState();
    const assistantMessage = createMockMessage();
    const onMessageUpdate = vi.fn();

    const event: RawStatusUpdateEvent = {
      kind: 'status-update',
      taskId: 'task-123',
      status: {
        state: 'working',
        timestamp: '2025-10-24T17:31:47Z',
        message: {
          kind: 'artifact-update', // <-- This should be filtered
          messageId: 'msg-4',
          role: 'agent',
          parts: [
            {
              kind: 'text',
              text: '# Test Markdown Artifact\n\n## Subheading\nThis is the actual markdown content...',
            },
          ],
        },
      },
    };

    handleStatusUpdateEvent(event, state, assistantMessage, onMessageUpdate);

    // Should NOT create text block (filtered by kind === 'artifact-update')
    const textBlocks = state.contentBlocks.filter((b) => b.type === 'text');
    expect(textBlocks).toHaveLength(0);
  });
});

describe('artifact duplication - wider integration test', () => {
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

  it('should not create duplicate text when artifact content arrives via text-delta then artifact-update', async () => {
    const { handleTextDeltaEvent, handleArtifactUpdateEvent } = await import('./event-handlers');

    const state = createMockState();
    const assistantMessage = createMockMessage();
    const onMessageUpdate = vi.fn();

    const artifactContent = '# Test Markdown Artifact\n\n## Subheading\nThis is a concise markdown sample.';

    // Simulate text-delta events streaming the artifact content
    handleTextDeltaEvent(artifactContent, state, assistantMessage, onMessageUpdate);

    // Artifact-update arrives (will handle closing/discarding activeTextBlock)
    handleArtifactUpdateEvent(
      {
        kind: 'artifact-update',
        taskId: 'task-123',
        artifact: {
          artifactId: 'artifact-123',
          name: 'Test Markdown Artifact',
          description: 'A test',
          parts: [{ kind: 'text', text: artifactContent }],
        },
      },
      state,
      assistantMessage,
      onMessageUpdate
    );

    // Count blocks
    const textBlocks = state.contentBlocks.filter((b) => b.type === 'text');
    const artifactBlocks = state.contentBlocks.filter((b) => b.type === 'artifact');

    console.log('Final state:', {
      textBlocks: textBlocks.length,
      artifactBlocks: artifactBlocks.length,
      textContent: textBlocks.map((b) => b.text.substring(0, 50)),
    });

    // Should have: 1 artifact block, 0 text blocks with duplicate content
    expect(artifactBlocks).toHaveLength(1);
    // No text blocks should contain artifact content (it was discarded as duplicate)
    const hasArtifactContentInText = textBlocks.some((b) => b.text.includes('# Test Markdown Artifact'));
    expect(hasArtifactContentInText).toBe(false);
  });

  it('should preserve legitimate text before artifact but discard duplicate artifact content', async () => {
    const { handleTextDeltaEvent, handleArtifactUpdateEvent } = await import('./event-handlers');

    const state = createMockState();
    const assistantMessage = createMockMessage();
    const onMessageUpdate = vi.fn();

    const legitimateText = 'Creating your markdown artifact now...';
    const artifactContent = '# Test Markdown Artifact\n\n## Subheading\nThis is a concise markdown sample.';

    // Simulate legitimate pre-artifact text
    handleTextDeltaEvent(legitimateText, state, assistantMessage, onMessageUpdate);

    // Simulate artifact content streaming (this will append to activeTextBlock)
    handleTextDeltaEvent('\n\n' + artifactContent, state, assistantMessage, onMessageUpdate);

    // Artifact-update arrives
    handleArtifactUpdateEvent(
      {
        kind: 'artifact-update',
        taskId: 'task-123',
        artifact: {
          artifactId: 'artifact-123',
          name: 'Test Markdown Artifact',
          description: 'A test',
          parts: [{ kind: 'text', text: artifactContent }],
        },
      },
      state,
      assistantMessage,
      onMessageUpdate
    );

    const textBlocks = state.contentBlocks.filter((b) => b.type === 'text');
    const artifactBlocks = state.contentBlocks.filter((b) => b.type === 'artifact');

    console.log('Final state (with legitimate text):', {
      textBlocks: textBlocks.length,
      artifactBlocks: artifactBlocks.length,
      textContent: textBlocks.map((b) => b.text.substring(0, 50)),
    });

    // Should have: 1 artifact block + legitimate text preserved
    expect(artifactBlocks).toHaveLength(1);

    // Legitimate text should be preserved
    const hasLegitimateText = textBlocks.some((b) => b.text.includes('Creating your markdown artifact'));
    expect(hasLegitimateText).toBe(true);

    // BUT artifact markdown should NOT be duplicated in text
    const hasArtifactDuplicate = textBlocks.some((b) => b.text.includes('# Test Markdown Artifact'));
    expect(hasArtifactDuplicate).toBe(false); // Should NOT have duplicate artifact content
  });
});
