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

import type { TaskState, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { parseA2AError, streamMessage } from './use-message-streaming';
import type { ContentBlock } from '../types';
import { updateMessage } from '../utils/database-operations';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('config', () => ({
  config: { jwt: 'test-jwt' },
}));

vi.mock('../../a2a-provider', () => ({
  a2a: vi.fn(() => ({ modelId: 'mock-model', provider: 'a2a' })),
}));

vi.mock('../utils/database-operations', () => ({
  saveMessage: vi.fn(async () => undefined),
  updateMessage: vi.fn(async () => undefined),
}));

// We need fine-grained control over streamText per test, so we use a
// module-level factory that each test can override.
let streamTextImpl: (...args: unknown[]) => unknown;

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => streamTextImpl(...args),
}));

let createA2AClientImpl: (...args: unknown[]) => unknown;

vi.mock('../utils/a2a-client', () => ({
  createA2AClient: (...args: unknown[]) => createA2AClientImpl(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a realistic fullStream async iterable that emits A2A SDK events
 * wrapped in the AI SDK's streaming protocol, then optionally throws.
 */
function buildFullStream(events: Array<{ type: string; [k: string]: unknown }>, crashAfter?: { error: Error }) {
  // biome-ignore lint/suspicious/useAwait: async required for AsyncGenerator return type
  return (async function* () {
    for (const event of events) {
      yield event;
    }
    if (crashAfter) {
      throw crashAfter.error;
    }
  })();
}

/**
 * Build a mock streamText result object that looks like the AI SDK return.
 */
function buildStreamTextResult(fullStream: AsyncGenerator, opts?: { text?: string; responseId?: string }) {
  return {
    fullStream,
    text: Promise.resolve(opts?.text ?? ''),
    response: Promise.resolve({ id: opts?.responseId }),
  };
}

/**
 * Create a status-update event in the A2A wire format.
 */
function statusUpdateEvent(
  taskId: string,
  state: TaskState,
  opts?: {
    text?: string;
    messageId?: string;
    final?: boolean;
    timestamp?: string;
  }
): TaskStatusUpdateEvent {
  const timestamp = opts?.timestamp ?? new Date().toISOString();
  return {
    kind: 'status-update',
    contextId: 'ctx-1',
    taskId,
    final: opts?.final ?? false,
    status: {
      state,
      timestamp,
      ...(opts?.text && {
        message: {
          kind: 'message' as const,
          messageId: opts?.messageId ?? 'msg-1',
          role: 'agent' as const,
          parts: [{ kind: 'text' as const, text: opts.text }],
        },
      }),
    },
  };
}

/**
 * Build a mock A2A client whose resubscribeTask returns an async generator.
 *
 * Yields all events, then throws crashError if provided.
 * This means:
 * - No events + crashError = throws immediately (simulates connection refused)
 * - Events + crashError = yields events then throws (simulates mid-stream drop)
 * - Events + no crash = yields events and returns normally (success)
 */
function buildMockClient(events: unknown[], crashError?: Error) {
  return {
    resubscribeTask: vi.fn(() =>
      // biome-ignore lint/suspicious/useAwait: async required for AsyncGenerator return type
      (async function* () {
        for (const event of events) {
          yield event;
        }
        if (crashError) {
          throw crashError;
        }
      })()
    ),
  };
}

/**
 * Standard initial stream events that establish a working task.
 *
 * Real A2A streams follow this sequence:
 * 1. response-metadata (AI SDK wrapper, captures taskId early)
 * 2. task event (A2A protocol, carries initial task state)
 * 3. status-update events (A2A protocol, carry state transitions + messages)
 *
 * When response-metadata fires first, handleTaskEvent skips because taskId is
 * already captured. The status-update handler is what actually sets
 * capturedTaskState. This helper produces a realistic initial sequence.
 */
function initialWorkingTaskEvents(taskId: string, text?: string) {
  return [
    { type: 'response-metadata' as const, id: taskId },
    {
      type: 'raw' as const,
      rawValue: {
        kind: 'task',
        id: taskId,
        status: { state: 'working' as TaskState },
      },
    },
    {
      type: 'raw' as const,
      rawValue: statusUpdateEvent(taskId, 'working', {
        text: text ?? 'Working on your request...',
        messageId: 'msg-initial',
      }),
    },
  ];
}

/**
 * Extract connection-status blocks from a message's contentBlocks.
 */
function connectionStatuses(blocks: ContentBlock[]) {
  return blocks.filter((b) => b.type === 'connection-status');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('streamMessage - SSE reconnection via tasks/resubscribe', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const baseParams = {
    prompt: 'hello agent',
    agentId: 'agent-1',
    agentCardUrl: 'http://localhost:8080/.well-known/agent-card.json',
    model: 'test-model',
    contextId: 'ctx-1',
  };

  // -------------------------------------------------------------------
  // Scenario 1: SSE drops mid-stream, single resubscribe recovers
  // -------------------------------------------------------------------
  test('reconnects after SSE drop and recovers to completed state', async () => {
    const TASK_ID = 'task-abc-123';
    const onMessageUpdate = vi.fn();

    // Phase 1: Initial stream establishes task, emits some work, then crashes.
    streamTextImpl = () =>
      buildStreamTextResult(
        buildFullStream(initialWorkingTaskEvents(TASK_ID, 'Analyzing your request...'), {
          error: new Error('Error during streaming for task-abc-123: network error'),
        }),
        { responseId: TASK_ID }
      );

    // Phase 2: Resubscribe stream picks up where we left off and completes.
    const mockClient = buildMockClient([
      statusUpdateEvent(TASK_ID, 'working', {
        text: 'Still working on it...',
        messageId: 'msg-2',
      }),
      statusUpdateEvent(TASK_ID, 'completed', {
        text: 'Here is your answer.',
        messageId: 'msg-3',
        final: true,
      }),
    ]);
    createA2AClientImpl = vi.fn(async () => mockClient);

    // Execute
    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    // Assertions
    expect(result.success).toBe(true);
    expect(result.assistantMessage.taskId).toBe(TASK_ID);
    expect(result.assistantMessage.taskState).toBe('completed');

    // Verify resubscribeTask was called with correct task ID
    expect(mockClient.resubscribeTask).toHaveBeenCalledWith({ id: TASK_ID });

    // Verify connection status blocks were emitted
    const finalBlocks = result.assistantMessage.contentBlocks;
    const connBlocks = connectionStatuses(finalBlocks);

    // The reconnecting block replaces disconnected, then reconnected replaces reconnecting
    // So the final state should have exactly one connection-status block: 'reconnected'
    expect(connBlocks.length).toBeGreaterThanOrEqual(1);
    expect(connBlocks.some((b) => b.type === 'connection-status' && b.status === 'reconnected')).toBe(true);

    // Verify the task-status-update blocks from both initial and resubscribe streams
    const statusBlocks = finalBlocks.filter((b) => b.type === 'task-status-update');
    const statusTexts = statusBlocks.map((b) => (b.type === 'task-status-update' ? b.text : ''));
    expect(statusTexts).toContain('Analyzing your request...');
    expect(statusTexts).toContain('Still working on it...');
    expect(statusTexts).toContain('Here is your answer.');
  });

  // -------------------------------------------------------------------
  // Scenario 2: Task already completed when SSE drops - no resubscribe
  // -------------------------------------------------------------------
  test('does not resubscribe when task reached terminal state before disconnect', async () => {
    const TASK_ID = 'task-terminal';
    const onMessageUpdate = vi.fn();

    const initialEvents = [
      ...initialWorkingTaskEvents(TASK_ID),
      {
        type: 'raw' as const,
        rawValue: statusUpdateEvent(TASK_ID, 'completed', {
          text: 'Done!',
          messageId: 'msg-final',
          final: true,
        }),
      },
    ];

    streamTextImpl = () =>
      buildStreamTextResult(
        buildFullStream(initialEvents, {
          error: new Error('SSE event contained an error: Connection reset (Code: -1) Data: {}'),
        }),
        { responseId: TASK_ID }
      );

    createA2AClientImpl = vi.fn(async () => buildMockClient([]));

    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    // Task completed before crash, so no resubscribe attempt
    expect(result.success).toBe(false); // The error is still thrown
    expect(vi.mocked(createA2AClientImpl)).not.toHaveBeenCalled();

    // Error should be an a2a-error block, but content before crash is preserved
    const allBlocks = result.assistantMessage.contentBlocks;
    expect(allBlocks.some((b) => b.type === 'a2a-error')).toBe(true);
    // The "Done!" status block from before the crash should be preserved
    expect(allBlocks.some((b) => b.type === 'task-status-update' && b.text === 'Done!')).toBe(true);
  });

  // -------------------------------------------------------------------
  // Scenario 3: No task ID captured - can't resubscribe
  // -------------------------------------------------------------------
  test('does not resubscribe when no task ID was captured', async () => {
    const onMessageUpdate = vi.fn();

    // Stream that crashes before any task event
    streamTextImpl = () =>
      buildStreamTextResult(
        buildFullStream([], {
          error: new Error('SSE event contained an error: Server error (Code: -32000) Data: {}'),
        })
      );

    createA2AClientImpl = vi.fn(async () => buildMockClient([]));

    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    expect(result.success).toBe(false);
    expect(vi.mocked(createA2AClientImpl)).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // Scenario 4: Resubscribe stream also drops, retry succeeds on 2nd attempt
  // -------------------------------------------------------------------
  test('retries resubscribe with exponential backoff after first resubscribe fails', async () => {
    const TASK_ID = 'task-retry';
    const onMessageUpdate = vi.fn();

    streamTextImpl = () =>
      buildStreamTextResult(buildFullStream(initialWorkingTaskEvents(TASK_ID), { error: new Error('network error') }), {
        responseId: TASK_ID,
      });

    // First resubscribe: crashes immediately (empty events + crashError)
    // Second resubscribe: succeeds with completed event
    let callCount = 0;
    createA2AClientImpl = vi.fn(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve(buildMockClient([], new Error('resubscribe also failed')));
      }
      return Promise.resolve(
        buildMockClient([
          statusUpdateEvent(TASK_ID, 'completed', {
            text: 'Finally done.',
            messageId: 'msg-final',
            final: true,
          }),
        ])
      );
    });

    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    expect(result.success).toBe(true);
    expect(result.assistantMessage.taskState).toBe('completed');

    // Should have called createA2AClient twice (first attempt failed, second succeeded)
    expect(vi.mocked(createA2AClientImpl)).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------
  // Scenario 5: All resubscribe attempts fail - gave-up
  // -------------------------------------------------------------------
  test('gives up after max resubscribe attempts and reports error', async () => {
    const TASK_ID = 'task-hopeless';
    const onMessageUpdate = vi.fn();

    streamTextImpl = () =>
      buildStreamTextResult(
        buildFullStream(initialWorkingTaskEvents(TASK_ID, 'Starting...'), { error: new Error('network severed') }),
        { responseId: TASK_ID }
      );

    // Every resubscribe attempt crashes immediately
    createA2AClientImpl = vi.fn(async () => buildMockClient([], new Error('still down')));

    // Total backoff: 1s + 2s + 4s + 8s + 16s = 31s. Use advanceTimersByTimeAsync
    // to skip the delays without hitting the 30s test timeout.
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: false });

    const resultPromise = streamMessage({ ...baseParams, onMessageUpdate });

    // Advance past all 5 backoff delays (31s total with some margin)
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(2 ** i * 1000 + 100);
    }

    const result = await resultPromise;

    // Gave up - should be a failure
    expect(result.success).toBe(false);

    // Should have attempted 5 times
    expect(vi.mocked(createA2AClientImpl)).toHaveBeenCalledTimes(5);

    // Final blocks should contain a gave-up status
    const allBlocks = result.assistantMessage.contentBlocks;
    const gaveUp = allBlocks.find((b) => b.type === 'connection-status' && b.status === 'gave-up');
    expect(gaveUp).toBeDefined();
    if (gaveUp?.type === 'connection-status') {
      expect(gaveUp.maxAttempts).toBe(5);
    }

    // Should also have the original a2a-error
    expect(allBlocks.some((b) => b.type === 'a2a-error')).toBe(true);

    // Content from before the crash should be preserved
    expect(allBlocks.some((b) => b.type === 'task-status-update' && b.text === 'Starting...')).toBe(true);
  });

  // -------------------------------------------------------------------
  // Scenario 6: Task reaches terminal state during a failed resubscribe
  // -------------------------------------------------------------------
  test('stops retrying if task reaches terminal state during a resubscribe attempt', async () => {
    const TASK_ID = 'task-terminates-mid-resub';
    const onMessageUpdate = vi.fn();

    streamTextImpl = () =>
      buildStreamTextResult(buildFullStream(initialWorkingTaskEvents(TASK_ID), { error: new Error('network error') }), {
        responseId: TASK_ID,
      });

    // Resubscribe: yields completion event, then connection dies.
    // The event handler updates state to 'completed' before the crash.
    const partialClient = {
      resubscribeTask: vi.fn(() =>
        // biome-ignore lint/suspicious/useAwait: async required for AsyncGenerator return type
        (async function* () {
          yield statusUpdateEvent(TASK_ID, 'completed', {
            text: 'Task completed just in time.',
            messageId: 'msg-done',
            final: true,
          });
          // Connection drops after delivering the completion event
          throw new Error('connection reset after completion');
        })()
      ),
    };

    createA2AClientImpl = vi.fn(async () => partialClient);

    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    // Should recover because the task reached terminal state during the attempt
    expect(result.success).toBe(true);
    expect(result.assistantMessage.taskState).toBe('completed');

    // Only one createA2AClient call needed
    expect(vi.mocked(createA2AClientImpl)).toHaveBeenCalledTimes(1);

    const statusBlocks = result.assistantMessage.contentBlocks.filter((b) => b.type === 'task-status-update');
    expect(statusBlocks.some((b) => b.type === 'task-status-update' && b.text === 'Task completed just in time.')).toBe(
      true
    );
  });

  // -------------------------------------------------------------------
  // Scenario 7: Happy path - no disconnect at all
  // -------------------------------------------------------------------
  test('completes normally without resubscribe when stream does not drop', async () => {
    const TASK_ID = 'task-happy';
    const onMessageUpdate = vi.fn();

    const events = [
      ...initialWorkingTaskEvents(TASK_ID, 'Processing...'),
      {
        type: 'raw' as const,
        rawValue: statusUpdateEvent(TASK_ID, 'completed', {
          text: 'All done!',
          messageId: 'msg-2',
          final: true,
        }),
      },
    ];

    streamTextImpl = () =>
      buildStreamTextResult(buildFullStream(events), {
        text: 'All done!',
        responseId: TASK_ID,
      });

    createA2AClientImpl = vi.fn(async () => buildMockClient([]));

    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    expect(result.success).toBe(true);
    expect(result.assistantMessage.taskState).toBe('completed');
    expect(vi.mocked(createA2AClientImpl)).not.toHaveBeenCalled();

    // No connection-status blocks in the happy path
    const connBlocks = connectionStatuses(result.assistantMessage.contentBlocks);
    expect(connBlocks).toHaveLength(0);
  });

  // -------------------------------------------------------------------
  // Scenario 8: Connection status block replacement behavior
  // -------------------------------------------------------------------
  test('replaces connection-status blocks so UI shows only latest status', async () => {
    const TASK_ID = 'task-ui-blocks';
    const onMessageUpdate = vi.fn();

    streamTextImpl = () =>
      buildStreamTextResult(buildFullStream(initialWorkingTaskEvents(TASK_ID), { error: new Error('disconnect') }), {
        responseId: TASK_ID,
      });

    // Resubscribe succeeds on first try
    const mockClient = buildMockClient([
      statusUpdateEvent(TASK_ID, 'completed', {
        text: 'Done.',
        messageId: 'msg-done',
        final: true,
      }),
    ]);
    createA2AClientImpl = vi.fn(async () => mockClient);

    const result = await streamMessage({ ...baseParams, onMessageUpdate });
    expect(result.success).toBe(true);

    // Track the connection-status progression through onMessageUpdate calls
    const allUpdates = onMessageUpdate.mock.calls.map((args: unknown[]) => {
      const msg = args[0] as { contentBlocks: ContentBlock[] };
      return msg.contentBlocks
        .filter((b) => b.type === 'connection-status')
        .map((b) => (b.type === 'connection-status' ? b.status : null));
    });

    // At some point we should have seen:
    // 1. ['disconnected']
    // 2. ['reconnecting'] (replaced disconnected)
    // 3. ['reconnected'] (replaced reconnecting)
    const flatStatuses = allUpdates.flat();
    expect(flatStatuses).toContain('disconnected');
    expect(flatStatuses).toContain('reconnecting');
    expect(flatStatuses).toContain('reconnected');
  });

  // -------------------------------------------------------------------
  // Scenario 9: Does not resubscribe when taskId captured but no taskState
  // -------------------------------------------------------------------
  test('does not resubscribe when taskId is captured but no task state was received', async () => {
    const TASK_ID = 'task-no-state';
    const onMessageUpdate = vi.fn();

    // Only emit response-metadata (sets capturedTaskId) but crash before any
    // status-update (so capturedTaskState remains undefined).
    streamTextImpl = () =>
      buildStreamTextResult(
        buildFullStream([{ type: 'response-metadata' as const, id: TASK_ID }], {
          error: new Error('network error'),
        }),
        { responseId: TASK_ID }
      );

    createA2AClientImpl = vi.fn(async () => buildMockClient([]));

    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    expect(result.success).toBe(false);
    // isResubscribable requires both capturedTaskId AND capturedTaskState
    expect(vi.mocked(createA2AClientImpl)).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // Scenario 10: Captures taskId from response.id fallback
  // -------------------------------------------------------------------
  test('captures taskId from response metadata when no task events were emitted', async () => {
    const TASK_ID = 'task-fallback-123';
    const onMessageUpdate = vi.fn();

    // Stream with no raw task/status-update events, just text
    streamTextImpl = () =>
      buildStreamTextResult(buildFullStream([{ type: 'text-delta', text: 'Hello world' }]), {
        text: 'Hello world',
        responseId: TASK_ID,
      });

    createA2AClientImpl = vi.fn(async () => buildMockClient([]));

    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    expect(result.success).toBe(true);
    expect(result.assistantMessage.taskId).toBe(TASK_ID);
    expect(vi.mocked(createA2AClientImpl)).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // Scenario 11: Does NOT capture taskId from response.id when it starts with "msg-"
  // -------------------------------------------------------------------
  test('does not capture taskId from response metadata when id starts with msg-', async () => {
    const onMessageUpdate = vi.fn();

    streamTextImpl = () =>
      buildStreamTextResult(buildFullStream([{ type: 'text-delta', text: 'Hello' }]), {
        text: 'Hello',
        responseId: 'msg-12345',
      });

    createA2AClientImpl = vi.fn(async () => buildMockClient([]));

    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    expect(result.success).toBe(true);
    expect(result.assistantMessage.taskId).toBeUndefined();
  });

  // -------------------------------------------------------------------
  // Scenario 12: Does not resubscribe when task state was "failed" before disconnect
  // -------------------------------------------------------------------
  test('does not resubscribe when task state was "failed" before disconnect', async () => {
    const TASK_ID = 'task-failed-before-crash';
    const onMessageUpdate = vi.fn();

    const initialEvents = [
      ...initialWorkingTaskEvents(TASK_ID),
      {
        type: 'raw' as const,
        rawValue: statusUpdateEvent(TASK_ID, 'failed', {
          text: 'Agent error',
          messageId: 'msg-fail',
          final: true,
        }),
      },
    ];

    streamTextImpl = () =>
      buildStreamTextResult(buildFullStream(initialEvents, { error: new Error('connection lost') }), {
        responseId: TASK_ID,
      });

    createA2AClientImpl = vi.fn(async () => buildMockClient([]));

    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    // "failed" is a terminal state -- no resubscribe
    expect(result.success).toBe(false);
    expect(vi.mocked(createA2AClientImpl)).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // Scenario 13: Resubscribe stream ends cleanly but task not terminal -- retries
  // -------------------------------------------------------------------
  test('retries when resubscribe stream ends cleanly but task is not terminal', async () => {
    const TASK_ID = 'task-not-done-yet';
    const onMessageUpdate = vi.fn();

    streamTextImpl = () =>
      buildStreamTextResult(buildFullStream(initialWorkingTaskEvents(TASK_ID), { error: new Error('dropped') }), {
        responseId: TASK_ID,
      });

    // First resubscribe: stream ends cleanly but only has a "working" update (not terminal)
    // Second resubscribe: delivers "completed"
    let callCount = 0;
    createA2AClientImpl = vi.fn(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve(
          buildMockClient([
            statusUpdateEvent(TASK_ID, 'working', {
              text: 'Still going...',
              messageId: 'msg-still',
            }),
          ])
        );
      }
      return Promise.resolve(
        buildMockClient([
          statusUpdateEvent(TASK_ID, 'completed', {
            text: 'Now done.',
            messageId: 'msg-done',
            final: true,
          }),
        ])
      );
    });

    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    expect(result.success).toBe(true);
    expect(result.assistantMessage.taskState).toBe('completed');
    // First resubscribe ended cleanly but task wasn't terminal, so it retried
    expect(vi.mocked(createA2AClientImpl)).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------
  // Scenario 13b: Attempt counter resets when resubscribe makes progress
  // -------------------------------------------------------------------
  test('resets attempt counter when resubscribe delivers events, allowing unlimited retries with progress', async () => {
    const TASK_ID = 'task-reset-attempts';
    const onMessageUpdate = vi.fn();

    streamTextImpl = () =>
      buildStreamTextResult(buildFullStream(initialWorkingTaskEvents(TASK_ID), { error: new Error('dropped') }), {
        responseId: TASK_ID,
      });

    // Each resubscribe delivers a "working" event (progress) but task never completes,
    // then the stream drops. After 3 such cycles, the task finally completes.
    let callCount = 0;
    createA2AClientImpl = vi.fn(() => {
      callCount += 1;
      if (callCount <= 3) {
        return Promise.resolve(
          buildMockClient([
            statusUpdateEvent(TASK_ID, 'working', {
              text: `Progress update ${callCount}`,
              messageId: `msg-progress-${callCount}`,
            }),
          ])
        );
      }
      return Promise.resolve(
        buildMockClient([
          statusUpdateEvent(TASK_ID, 'completed', {
            text: 'Finally done after many reconnects.',
            messageId: 'msg-final',
            final: true,
          }),
        ])
      );
    });

    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    expect(result.success).toBe(true);
    expect(result.assistantMessage.taskState).toBe('completed');

    // Should have called createA2AClient 4 times total (3 progress + 1 completion).
    // Without attempt reset, it would have given up after 5 consecutive failures.
    expect(vi.mocked(createA2AClientImpl)).toHaveBeenCalledTimes(4);

    // All progress updates should be preserved
    const statusBlocks = result.assistantMessage.contentBlocks.filter((b) => b.type === 'task-status-update');
    const statusTexts = statusBlocks.map((b) => (b.type === 'task-status-update' ? b.text : ''));
    expect(statusTexts).toContain('Progress update 1');
    expect(statusTexts).toContain('Progress update 2');
    expect(statusTexts).toContain('Progress update 3');
    expect(statusTexts).toContain('Finally done after many reconnects.');
  });

  // -------------------------------------------------------------------
  // Scenario 13c: processResubscribeStream pushes "reconnected" on first event
  // -------------------------------------------------------------------
  test('shows reconnected status as soon as resubscribe delivers first event', async () => {
    const TASK_ID = 'task-reconnected-early';
    const onMessageUpdate = vi.fn();

    streamTextImpl = () =>
      buildStreamTextResult(buildFullStream(initialWorkingTaskEvents(TASK_ID), { error: new Error('disconnect') }), {
        responseId: TASK_ID,
      });

    const mockClient = buildMockClient([
      statusUpdateEvent(TASK_ID, 'working', {
        text: 'Resumed work...',
        messageId: 'msg-resumed',
      }),
      statusUpdateEvent(TASK_ID, 'completed', {
        text: 'Done.',
        messageId: 'msg-done',
        final: true,
      }),
    ]);
    createA2AClientImpl = vi.fn(async () => mockClient);

    const result = await streamMessage({ ...baseParams, onMessageUpdate });
    expect(result.success).toBe(true);

    // Track the connection-status progression through onMessageUpdate calls
    const statusProgression: string[] = [];
    for (const call of onMessageUpdate.mock.calls) {
      const msg = call[0] as { contentBlocks: ContentBlock[] };
      const connBlocks = msg.contentBlocks.filter((b) => b.type === 'connection-status');
      for (const b of connBlocks) {
        if (b.type === 'connection-status') {
          const last = statusProgression.at(-1);
          // Only track transitions
          if (b.status !== last) {
            statusProgression.push(b.status);
          }
        }
      }
    }

    // Should see: disconnected → reconnecting → reconnected (before content events)
    expect(statusProgression).toContain('disconnected');
    expect(statusProgression).toContain('reconnecting');
    expect(statusProgression).toContain('reconnected');

    // "reconnected" should appear before the "Resumed work..." content block
    const idx = statusProgression.indexOf('reconnected');
    expect(idx).toBeLessThan(statusProgression.length);
  });

  // -------------------------------------------------------------------
  // Scenario 14: updateMessage called with correct args after recovery
  // -------------------------------------------------------------------
  test('persists correct state to database after successful recovery', async () => {
    const TASK_ID = 'task-db-check';
    const onMessageUpdate = vi.fn();

    streamTextImpl = () =>
      buildStreamTextResult(buildFullStream(initialWorkingTaskEvents(TASK_ID), { error: new Error('dropped') }), {
        responseId: TASK_ID,
      });

    const mockClient = buildMockClient([
      statusUpdateEvent(TASK_ID, 'completed', {
        text: 'Final answer.',
        messageId: 'msg-final',
        final: true,
      }),
    ]);
    createA2AClientImpl = vi.fn(async () => mockClient);

    const result = await streamMessage({ ...baseParams, onMessageUpdate });
    expect(result.success).toBe(true);

    // updateMessage is called during finalizeMessage after recovery
    const mockedUpdate = vi.mocked(updateMessage);
    const lastCall = mockedUpdate.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    if (!lastCall) {
      return;
    }

    const [messageId, updates] = lastCall;
    expect(messageId).toBe(result.assistantMessage.id);
    expect(updates.isStreaming).toBe(false);
    expect(updates.taskId).toBe(TASK_ID);
    expect(updates.taskState).toBe('completed');

    // Success path no longer stores contentBlocks in DB (fetched via tasks/get on reload)
    expect(updates.contentBlocks).toBeUndefined();
  });

  // -------------------------------------------------------------------
  // Scenario 15: TypeError in resubscribe rethrown immediately, no retry
  // -------------------------------------------------------------------
  test('rethrows TypeError from resubscribe instead of retrying', async () => {
    const TASK_ID = 'task-typeerror';
    const onMessageUpdate = vi.fn();

    streamTextImpl = () =>
      buildStreamTextResult(buildFullStream(initialWorkingTaskEvents(TASK_ID), { error: new Error('dropped') }), {
        responseId: TASK_ID,
      });

    // Resubscribe throws a TypeError (programming bug, not network)
    createA2AClientImpl = vi.fn(async () => ({
      resubscribeTask: () => {
        throw new TypeError('Cannot read properties of null');
      },
    }));

    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    // Should fail and NOT retry
    expect(result.success).toBe(false);
    expect(vi.mocked(createA2AClientImpl)).toHaveBeenCalledTimes(1);

    // The error block should contain the TypeError message
    const errorBlock = result.assistantMessage.contentBlocks.find((b) => b.type === 'a2a-error');
    expect(errorBlock).toBeDefined();
  });

  // -------------------------------------------------------------------
  // Scenario 16: finalizeMessage failure after recovery falls through to error path
  // -------------------------------------------------------------------
  test('falls through to error path when finalizeMessage fails after recovery', async () => {
    const TASK_ID = 'task-finalize-fail';
    const onMessageUpdate = vi.fn();

    streamTextImpl = () =>
      buildStreamTextResult(buildFullStream(initialWorkingTaskEvents(TASK_ID), { error: new Error('dropped') }), {
        responseId: TASK_ID,
      });

    const mockClient = buildMockClient([
      statusUpdateEvent(TASK_ID, 'completed', {
        text: 'Done.',
        messageId: 'msg-done',
        final: true,
      }),
    ]);
    createA2AClientImpl = vi.fn(async () => mockClient);

    // Make updateMessage reject on the finalizeMessage call (after recovery)
    const mockedUpdate = vi.mocked(updateMessage);
    mockedUpdate.mockRejectedValueOnce(new Error('DB write failed'));

    const result = await streamMessage({ ...baseParams, onMessageUpdate });

    // Recovery succeeded but finalizeMessage failed -- falls through to error path
    expect(result.success).toBe(false);

    // Task state should be preserved from recovery, not hardcoded to 'failed'
    expect(result.assistantMessage.taskState).toBe('completed');

    // Should have an a2a-error block from the fallthrough
    const errorBlock = result.assistantMessage.contentBlocks.find((b) => b.type === 'a2a-error');
    expect(errorBlock).toBeDefined();
  });

  // -------------------------------------------------------------------
  // Scenario 17: gave-up replaces stale reconnecting block (not appended)
  // -------------------------------------------------------------------
  test('gave-up replaces the last reconnecting block instead of stacking', async () => {
    const TASK_ID = 'task-gaveup-replace';
    const onMessageUpdate = vi.fn();

    streamTextImpl = () =>
      buildStreamTextResult(
        buildFullStream(initialWorkingTaskEvents(TASK_ID, 'Starting...'), { error: new Error('dropped') }),
        { responseId: TASK_ID }
      );

    createA2AClientImpl = vi.fn(async () => buildMockClient([], new Error('still down')));

    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: false });

    const resultPromise = streamMessage({ ...baseParams, onMessageUpdate });

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(2 ** i * 1000 + 100);
    }

    const result = await resultPromise;
    expect(result.success).toBe(false);

    // There should be exactly ONE connection-status block in the final message
    // (gave-up replaced the last reconnecting), not two stacked.
    const connBlocks = result.assistantMessage.contentBlocks.filter((b) => b.type === 'connection-status');
    expect(connBlocks).toHaveLength(1);
    expect(connBlocks[0].type === 'connection-status' && connBlocks[0].status).toBe('gave-up');
  });
});

// ---------------------------------------------------------------------------
// parseA2AError unit tests
// ---------------------------------------------------------------------------

describe('parseA2AError', () => {
  test('extracts code, message, and data from SSE error format', () => {
    const error = new Error('SSE event contained an error: Connection reset (Code: -1) Data: {}');
    const result = parseA2AError(error);

    expect(result.code).toBe(-1);
    expect(result.message).toBe('Connection reset');
    expect(result.data).toEqual({});
  });

  test('extracts code and data from streaming error format', () => {
    const error = new Error(
      'Error during streaming for task-abc: network timeout (Code: 500) Data: {"detail":"timeout"}'
    );
    const result = parseA2AError(error);

    expect(result.code).toBe(500);
    expect(result.data).toEqual({ detail: 'timeout' });
  });

  test('returns code -1 and raw message for unstructured errors', () => {
    const result = parseA2AError('something completely unexpected');

    expect(result.code).toBe(-1);
    expect(result.message).toBe('something completely unexpected');
    expect(result.data).toBeUndefined();
  });

  test('handles invalid JSON in Data field gracefully', () => {
    const error = new Error('SSE event contained an error: Bad (Code: -1) Data: {not-json}');
    const result = parseA2AError(error);

    expect(result.code).toBe(-1);
    expect(result.data).toBeUndefined();
  });

  test('returns "Unknown error" for empty string input', () => {
    const result = parseA2AError('');

    expect(result.code).toBe(-1);
    expect(result.message).toBe('Unknown error');
  });

  test('handles non-Error objects', () => {
    const result = parseA2AError(42);

    expect(result.code).toBe(-1);
    expect(result.message).toBe('42');
  });

  test('strips streaming prefix from error without code', () => {
    const result = parseA2AError(new Error('Error during streaming for task-xyz: connection refused'));

    expect(result.code).toBe(-1);
    expect(result.message).toBe('connection refused');
  });

  test('strips SSE prefix from error without code', () => {
    const result = parseA2AError(new Error('SSE event contained an error: Connection refused'));

    expect(result.code).toBe(-1);
    expect(result.message).toBe('Connection refused');
  });
});
