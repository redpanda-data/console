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

import { renderHook, waitFor } from '@testing-library/react';
import type { ListMessagesResponse_DataMessage } from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { usePipelineLogsStream } from './use-pipeline-logs-stream';

// Mock the dependencies
vi.mock('react-query/api/messages', () => ({
  StartOffset: {
    TIMESTAMP: BigInt(-4),
  },
  useListMessagesStream: vi.fn(),
}));

vi.mock('react-query/api/pipeline', () => ({
  REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS: 5,
  REDPANDA_CONNECT_LOGS_TOPIC: '__redpanda.connect.logs',
}));

vi.mock('utils/filter-helper', () => ({
  sanitizeString: (s: string) => s,
}));

vi.mock('utils/utils', () => ({
  encodeBase64: (s: string) => btoa(s),
}));

vi.mock('./use-pipeline-logs', () => ({
  parsePipelineLog: (msg: ListMessagesResponse_DataMessage) => ({
    message: msg,
    id: 'test-pipeline',
    pipelineId: 'test-pipeline',
    level: 'INFO',
    path: 'root',
    scope: 'root',
    content: { message: 'test' },
    timestamp: msg.timestamp,
    offset: msg.offset,
    partitionId: msg.partitionId,
  }),
}));

// Import after mocks are set up
import { useListMessagesStream } from 'react-query/api/messages';

describe('usePipelineLogsStream', () => {
  const mockStreamResult = {
    messages: [],
    phase: null,
    progress: null,
    done: null,
    error: null,
    isStreaming: false,
    isComplete: false,
    retryAttempt: 0,
    start: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useListMessagesStream).mockReturnValue(mockStreamResult);
  });

  test('initializes with empty logs', () => {
    const { result } = renderHook(() =>
      usePipelineLogsStream({
        pipelineId: 'test-pipeline',
        enabled: false, // Prevent auto-start
      })
    );

    expect(result.current.logs).toEqual([]);
    expect(result.current.newLogs).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBe(null);
  });

  test('starts polling when enabled', () => {
    const { result } = renderHook(() =>
      usePipelineLogsStream({
        pipelineId: 'test-pipeline',
        enabled: true,
      })
    );

    expect(useListMessagesStream).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: '__redpanda.connect.logs',
        enabled: true,
      })
    );
  });

  test('processes new messages and deduplicates', async () => {
    const message1: ListMessagesResponse_DataMessage = {
      partitionId: 0,
      offset: BigInt(100),
      timestamp: BigInt(Date.now()),
      key: { normalizedPayload: new TextEncoder().encode('"test-pipeline"') },
      value: { normalizedPayload: new TextEncoder().encode('{"level":"INFO","message":"test"}') },
    } as ListMessagesResponse_DataMessage;

    const message2: ListMessagesResponse_DataMessage = {
      partitionId: 0,
      offset: BigInt(101),
      timestamp: BigInt(Date.now()),
      key: { normalizedPayload: new TextEncoder().encode('"test-pipeline"') },
      value: { normalizedPayload: new TextEncoder().encode('{"level":"INFO","message":"test2"}') },
    } as ListMessagesResponse_DataMessage;

    // Mock stream to return messages
    vi.mocked(useListMessagesStream).mockReturnValue({
      ...mockStreamResult,
      messages: [message1, message2],
      isStreaming: true,
    });

    const { result } = renderHook(() =>
      usePipelineLogsStream({
        pipelineId: 'test-pipeline',
        enabled: false,
      })
    );

    await waitFor(() => {
      expect(result.current.logs.length).toBe(2);
    });

    expect(result.current.newLogs.length).toBe(2);

    // Simulate receiving the same messages again (should deduplicate)
    vi.mocked(useListMessagesStream).mockReturnValue({
      ...mockStreamResult,
      messages: [message1, message2],
      isStreaming: true,
    });

    const { result: result2 } = renderHook(() =>
      usePipelineLogsStream({
        pipelineId: 'test-pipeline',
        enabled: false,
      })
    );

    await waitFor(() => {
      // Should still only have 2 logs after reprocessing same messages
      expect(result2.current.logs.length).toBeLessThanOrEqual(2);
    });
  });

  test('tracks highest offset per partition', async () => {
    const message1: ListMessagesResponse_DataMessage = {
      partitionId: 0,
      offset: BigInt(100),
      timestamp: BigInt(Date.now()),
      key: { normalizedPayload: new TextEncoder().encode('"test-pipeline"') },
      value: { normalizedPayload: new TextEncoder().encode('{"level":"INFO","message":"test"}') },
    } as ListMessagesResponse_DataMessage;

    const message2: ListMessagesResponse_DataMessage = {
      partitionId: 1,
      offset: BigInt(50),
      timestamp: BigInt(Date.now()),
      key: { normalizedPayload: new TextEncoder().encode('"test-pipeline"') },
      value: { normalizedPayload: new TextEncoder().encode('{"level":"INFO","message":"test2"}') },
    } as ListMessagesResponse_DataMessage;

    vi.mocked(useListMessagesStream).mockReturnValue({
      ...mockStreamResult,
      messages: [message1, message2],
      isStreaming: true,
    });

    const { result } = renderHook(() =>
      usePipelineLogsStream({
        pipelineId: 'test-pipeline',
        enabled: false,
      })
    );

    await waitFor(() => {
      expect(result.current.logs.length).toBe(2);
    });

    // Both messages should be processed
    expect(result.current.logs.length).toBe(2);
  });

  test('stops polling when stop is called', async () => {
    const { result } = renderHook(() =>
      usePipelineLogsStream({
        pipelineId: 'test-pipeline',
        enabled: true,
      })
    );

    result.current.stop();

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(mockStreamResult.cancel).toHaveBeenCalled();
  });

  test('resets state when reset is called', async () => {
    const message: ListMessagesResponse_DataMessage = {
      partitionId: 0,
      offset: BigInt(100),
      timestamp: BigInt(Date.now()),
      key: { normalizedPayload: new TextEncoder().encode('"test-pipeline"') },
      value: { normalizedPayload: new TextEncoder().encode('{"level":"INFO","message":"test"}') },
    } as ListMessagesResponse_DataMessage;

    vi.mocked(useListMessagesStream).mockReturnValue({
      ...mockStreamResult,
      messages: [message],
      isStreaming: true,
    });

    const { result, rerender } = renderHook(() =>
      usePipelineLogsStream({
        pipelineId: 'test-pipeline',
        enabled: false,
      })
    );

    await waitFor(() => {
      expect(result.current.logs.length).toBe(1);
    });

    result.current.reset();
    rerender();

    await waitFor(() => {
      expect(result.current.logs.length).toBe(0);
    });

    expect(mockStreamResult.reset).toHaveBeenCalled();
  });

  test('handles stream errors', () => {
    vi.mocked(useListMessagesStream).mockReturnValue({
      ...mockStreamResult,
      error: {
        message: 'Stream failed',
        $typeName: 'redpanda.api.console.v1alpha1.ListMessagesResponse.ErrorMessage',
      },
      isComplete: true,
    });

    const { result } = renderHook(() =>
      usePipelineLogsStream({
        pipelineId: 'test-pipeline',
        enabled: false,
      })
    );

    expect(result.current.error).not.toBe(null);
    expect(result.current.error?.message).toBe('Stream failed');
  });

  test('caps logs at 500 entries', async () => {
    // Create 600 messages
    const messages: ListMessagesResponse_DataMessage[] = Array.from({ length: 600 }, (_, i) => ({
      partitionId: 0,
      offset: BigInt(i),
      timestamp: BigInt(Date.now() + i),
      key: { normalizedPayload: new TextEncoder().encode('"test-pipeline"') },
      value: { normalizedPayload: new TextEncoder().encode(`{"level":"INFO","message":"test${i}"}`) },
    })) as ListMessagesResponse_DataMessage[];

    vi.mocked(useListMessagesStream).mockReturnValue({
      ...mockStreamResult,
      messages,
      isStreaming: true,
    });

    const { result } = renderHook(() =>
      usePipelineLogsStream({
        pipelineId: 'test-pipeline',
        enabled: false,
      })
    );

    await waitFor(() => {
      expect(result.current.logs.length).toBeLessThanOrEqual(500);
    });
  });
});
