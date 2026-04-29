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
import type { LanguageModelV2FinishReason } from '@ai-sdk/provider';
import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { describe, expect, test } from 'vitest';

import {
  a2aEventToV2StreamParts,
  finalizeStream,
  initialStreamMapperState,
  isKnownA2AEvent,
} from './a2a-stream-mapper';

// ---------------------------------------------------------------------------
// These tests lock down the pure reducer that drives the A2A doStream
// TransformStream. The reducer is the seam we use to make the AI SDK v6
// stream contract testable without standing up a full streaming pipeline — so
// every TaskState branch that `mapFinishReason` recognises gets a dedicated
// test here.
// ---------------------------------------------------------------------------

const mkStatusUpdate = (state: TaskState, final = true): TaskStatusUpdateEvent => ({
  kind: 'status-update',
  contextId: 'ctx-1',
  taskId: 'task-1',
  final,
  status: { state },
});

const mkTask = (id = 'task-1'): Task => ({
  kind: 'task',
  id,
  contextId: 'ctx-1',
  status: { state: 'working' },
});

const mkArtifactUpdate = (): TaskArtifactUpdateEvent => ({
  kind: 'artifact-update',
  contextId: 'ctx-1',
  taskId: 'task-1',
  artifact: {
    artifactId: 'a-1',
    parts: [{ kind: 'text', text: 'artifact body' }],
  },
});

const mkMessage = (): Message => ({
  kind: 'message',
  messageId: 'msg-1',
  role: 'agent',
  parts: [{ kind: 'text', text: 'hi' }],
});

describe('a2aEventToV2StreamParts — first chunk', () => {
  test('emits response-metadata part on the first event', () => {
    const { parts, state } = a2aEventToV2StreamParts(mkTask(), initialStreamMapperState(), {});

    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: 'response-metadata', id: 'task-1' });
    expect(state.isFirstChunk).toBe(false);
  });

  test('does not re-emit response-metadata on subsequent events', () => {
    const first = a2aEventToV2StreamParts(mkTask(), initialStreamMapperState(), {});
    const second = a2aEventToV2StreamParts(mkArtifactUpdate(), first.state, {});

    expect(second.parts.some((p) => p.type === 'response-metadata')).toBe(false);
  });
});

describe('a2aEventToV2StreamParts — includeRawChunks', () => {
  test('prepends a raw part when includeRawChunks is true', () => {
    const event = mkTask();
    const { parts } = a2aEventToV2StreamParts(event, initialStreamMapperState(), {
      includeRawChunks: true,
    });

    expect(parts[0]).toEqual({ type: 'raw', rawValue: event });
    // response-metadata still comes right after on the first chunk
    expect(parts[1]).toMatchObject({ type: 'response-metadata' });
  });

  test('omits the raw part when includeRawChunks is false', () => {
    const { parts } = a2aEventToV2StreamParts(mkTask(), initialStreamMapperState(), {
      includeRawChunks: false,
    });

    expect(parts.some((p) => p.type === 'raw')).toBe(false);
  });

  test('omits the raw part when includeRawChunks is omitted', () => {
    const { parts } = a2aEventToV2StreamParts(mkTask(), initialStreamMapperState(), {});

    expect(parts.some((p) => p.type === 'raw')).toBe(false);
  });
});

describe('a2aEventToV2StreamParts — status-update → finishReason', () => {
  // After the first-chunk response-metadata path is out of the way, each
  // terminal status-update should translate to the expected finish reason.
  // We prime the state as `isFirstChunk: false` so the table focuses on the
  // finish-reason mapping rather than the metadata emission.
  const primedState = (): ReturnType<typeof initialStreamMapperState> => ({
    isFirstChunk: false,
    finishReason: 'unknown',
  });

  const cases: [TaskState, LanguageModelV2FinishReason][] = [
    ['submitted', 'stop'],
    ['working', 'unknown'],
    ['input-required', 'stop'],
    ['completed', 'stop'],
    ['canceled', 'other'],
    ['failed', 'error'],
    ['rejected', 'error'],
    ['auth-required', 'error'],
  ];

  test.each(cases)('terminal %s maps to finishReason %s', (taskState, expected) => {
    const { state } = a2aEventToV2StreamParts(mkStatusUpdate(taskState), primedState(), {});
    expect(state.finishReason).toBe(expected);
  });

  test('non-final status-update does not change finishReason', () => {
    const start = primedState();
    const { state } = a2aEventToV2StreamParts(mkStatusUpdate('completed', false), start, {});
    expect(state.finishReason).toBe('unknown');
  });
});

describe('a2aEventToV2StreamParts — non-status events do not change finishReason', () => {
  const primedState = (): ReturnType<typeof initialStreamMapperState> => ({
    isFirstChunk: false,
    finishReason: 'unknown',
  });

  test('Task event (kind: task) leaves finishReason alone', () => {
    const { state } = a2aEventToV2StreamParts(mkTask(), primedState(), {});
    expect(state.finishReason).toBe('unknown');
  });

  test('TaskArtifactUpdateEvent leaves finishReason alone', () => {
    const { state } = a2aEventToV2StreamParts(mkArtifactUpdate(), primedState(), {});
    expect(state.finishReason).toBe('unknown');
  });

  test('Message event leaves finishReason alone', () => {
    const { state } = a2aEventToV2StreamParts(mkMessage(), primedState(), {});
    expect(state.finishReason).toBe('unknown');
  });
});

describe('finalizeStream', () => {
  test('emits a finish part carrying the current finishReason', () => {
    const part = finalizeStream({ isFirstChunk: false, finishReason: 'stop' });

    expect(part).toEqual({
      type: 'finish',
      finishReason: 'stop',
      usage: {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
      },
    });
  });

  test('emits undefined usage counts regardless of state', () => {
    const part = finalizeStream({ isFirstChunk: true, finishReason: 'unknown' });

    // Usage is always undefined — the A2A protocol surfaces token counts
    // through a separate metadata path, not through the v2 finish part.
    if (part.type !== 'finish') {
      throw new Error('expected finish part');
    }
    expect(part.usage.inputTokens).toBeUndefined();
    expect(part.usage.outputTokens).toBeUndefined();
    expect(part.usage.totalTokens).toBeUndefined();
  });
});

describe('a2aEventToV2StreamParts — initial state', () => {
  test('initialStreamMapperState starts with isFirstChunk=true and finishReason=unknown', () => {
    expect(initialStreamMapperState()).toEqual({
      isFirstChunk: true,
      finishReason: 'unknown',
    });
  });
});

// ---------------------------------------------------------------------------
// Defensive guards for backward compatibility with the previous AI agent
// backend. If a legacy or future server emits a stream event whose `kind` we
// don't understand, the adapter must fail loudly with an
// `UnsupportedFunctionalityError` rather than silently drop the event.
// Silent drops look like a stalled stream from the user's perspective.
// ---------------------------------------------------------------------------

describe('isKnownA2AEvent', () => {
  test.each([['task'], ['message'], ['status-update'], ['artifact-update']])('accepts known kind "%s"', (kind) => {
    expect(isKnownA2AEvent({ kind })).toBe(true);
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['string', 'task'],
    ['array', ['task']],
    ['object missing kind', {}],
    ['unknown kind string', { kind: 'mystery' }],
    ['empty-string kind', { kind: '' }],
    ['non-string kind', { kind: 42 }],
  ])('rejects %s', (_label, value) => {
    expect(isKnownA2AEvent(value)).toBe(false);
  });
});

describe('a2aEventToV2StreamParts — malformed input', () => {
  test('throws UnsupportedFunctionalityError for an unknown event kind', () => {
    const malformed = { kind: 'mystery-update', taskId: 'x' };
    expect(() =>
      a2aEventToV2StreamParts(
        // Bypass the compile-time guard — this is exactly the shape a
        // legacy/newer backend could emit at runtime.
        malformed as unknown as Parameters<typeof a2aEventToV2StreamParts>[0],
        initialStreamMapperState(),
        {}
      )
    ).toThrow(UnsupportedFunctionalityError);
  });

  test('throws UnsupportedFunctionalityError for a missing kind field', () => {
    expect(() =>
      a2aEventToV2StreamParts(
        { taskId: 'x' } as unknown as Parameters<typeof a2aEventToV2StreamParts>[0],
        initialStreamMapperState(),
        {}
      )
    ).toThrow(UnsupportedFunctionalityError);
  });

  test('error identifies the unknown kind for easier debugging', () => {
    const malformed = { kind: 'legacy-tool-event' };
    try {
      a2aEventToV2StreamParts(
        malformed as unknown as Parameters<typeof a2aEventToV2StreamParts>[0],
        initialStreamMapperState(),
        {}
      );
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedFunctionalityError);
      // `functionality` carries the offending kind so on-call engineers can
      // grep logs for the culprit event shape.
      const ufe = e as UnsupportedFunctionalityError;
      expect(ufe.functionality).toContain('legacy-tool-event');
    }
  });
});
