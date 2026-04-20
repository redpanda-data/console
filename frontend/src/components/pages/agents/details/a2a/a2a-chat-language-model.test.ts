/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { Message, Task, TaskArtifactUpdateEvent, TaskState, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { describe, expect, test } from 'vitest';

import { getResponseMetadata, mapFinishReason } from './a2a-chat-language-model';

// ---------------------------------------------------------------------------
// Regression guards for the A2A → AI SDK v6 adapter. We assert on the pure
// helpers that shape the `LanguageModel` contract — `mapFinishReason` decides
// which finish reason the v6 stream emits when the task terminates, and
// `getResponseMetadata` fills the `response-metadata` stream part. Both are
// load-bearing for `useChat` downstream, which inspects finish reason to
// decide whether to surface errors vs normal completion.
// ---------------------------------------------------------------------------

const mkStatusUpdate = (state: TaskState, timestamp?: string): TaskStatusUpdateEvent => ({
  kind: 'status-update',
  contextId: 'ctx-1',
  taskId: 'task-1',
  final: true,
  status: {
    state,
    timestamp,
  },
});

describe('mapFinishReason', () => {
  test('maps completed → stop', () => {
    expect(mapFinishReason(mkStatusUpdate('completed'))).toBe('stop');
  });

  test('maps input-required → stop (awaiting further user input, not an error)', () => {
    expect(mapFinishReason(mkStatusUpdate('input-required'))).toBe('stop');
  });

  test('maps submitted → stop', () => {
    expect(mapFinishReason(mkStatusUpdate('submitted'))).toBe('stop');
  });

  test('maps failed → error', () => {
    expect(mapFinishReason(mkStatusUpdate('failed'))).toBe('error');
  });

  test('maps rejected → error', () => {
    // Rejected by upstream policy / guard — surfaces as an error so the
    // UI can render the reason.
    expect(mapFinishReason(mkStatusUpdate('rejected'))).toBe('error');
  });

  test('maps auth-required → error', () => {
    // Auth-required is treated as an error path by the adapter so the caller
    // can prompt re-authentication rather than silently finishing.
    expect(mapFinishReason(mkStatusUpdate('auth-required'))).toBe('error');
  });

  test('maps canceled → other', () => {
    expect(mapFinishReason(mkStatusUpdate('canceled'))).toBe('other');
  });

  test('maps working → unknown', () => {
    // `working` should never actually arrive as a final status, but if it
    // does the adapter falls back to `unknown` rather than pretending the
    // run completed.
    expect(mapFinishReason(mkStatusUpdate('working'))).toBe('unknown');
  });

  test('maps unknown → unknown', () => {
    expect(mapFinishReason(mkStatusUpdate('unknown'))).toBe('unknown');
  });
});

describe('getResponseMetadata', () => {
  test('derives id, timestamp from a Task event', () => {
    const task: Task = {
      kind: 'task',
      id: 'task-42',
      contextId: 'ctx-1',
      status: {
        state: 'completed',
        timestamp: '2025-04-18T12:00:00.000Z',
      },
    };
    const meta = getResponseMetadata(task);
    expect(meta).toMatchObject({
      id: 'task-42',
      modelId: undefined,
    });
    expect(meta.timestamp).toBeInstanceOf(Date);
    expect((meta.timestamp as Date).toISOString()).toBe('2025-04-18T12:00:00.000Z');
  });

  test('uses messageId for a Message event', () => {
    const message: Message = {
      kind: 'message',
      messageId: 'msg-9',
      role: 'agent',
      parts: [{ kind: 'text', text: 'hi' }],
    };
    expect(getResponseMetadata(message)).toEqual({
      id: 'msg-9',
      modelId: undefined,
      timestamp: undefined,
    });
  });

  test('uses taskId for status-update events', () => {
    const event = mkStatusUpdate('working', '2025-04-18T12:30:00.000Z');
    const meta = getResponseMetadata(event);
    expect(meta.id).toBe('task-1');
    expect(meta.timestamp).toBeInstanceOf(Date);
  });

  test('uses taskId for artifact-update events (timestamp always undefined)', () => {
    const event: TaskArtifactUpdateEvent = {
      kind: 'artifact-update',
      contextId: 'ctx-1',
      taskId: 'task-7',
      artifact: {
        artifactId: 'a-1',
        parts: [{ kind: 'text', text: 'x' }],
      },
    };
    expect(getResponseMetadata(event)).toEqual({
      id: 'task-7',
      modelId: undefined,
      timestamp: undefined,
    });
  });

  test('status-update without a timestamp yields timestamp undefined', () => {
    // If the agent omits a timestamp, adapter must not crash (new Date(undefined)
    // would produce an invalid Date). Instead `undefined` should propagate.
    const event = mkStatusUpdate('working');
    expect(getResponseMetadata(event).timestamp).toBeUndefined();
  });
});
