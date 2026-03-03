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

import type { Trace, TraceSummary } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import { describe, expect, it } from 'vitest';

import {
  calculateTranscriptStatistics,
  calculateVisibleWindow,
  groupTranscriptsByDate,
  isIncompleteTranscript,
  isRootSpan,
} from './transcript-statistics';

// Helper to create mock TraceSummary objects for testing
const createMockTranscript = (data: { transcriptId: string; startTimeMs?: number }): TraceSummary =>
  ({
    traceId: data.transcriptId,
    startTime: data.startTimeMs
      ? { seconds: BigInt(Math.floor(data.startTimeMs / 1000)), nanos: (data.startTimeMs % 1000) * 1_000_000 }
      : undefined,
    rootSpanName: '',
    rootServiceName: '',
    spanCount: 0,
    errorCount: 0,
  }) as TraceSummary;

/**
 * Helper to create a mock Span with the given attributes.
 * Attributes use stringValue by default (matching real OTel JSON transport).
 */
const createMockSpan = (
  name: string,
  attributes: Array<{ key: string; value: string }>,
): Span =>
  ({
    spanId: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    parentSpanId: new Uint8Array(8),
    traceId: new Uint8Array(16),
    name,
    startTimeUnixNano: BigInt(0),
    endTimeUnixNano: BigInt(0),
    attributes: attributes.map((a) => ({
      key: a.key,
      value: { value: { case: 'stringValue' as const, value: a.value } },
    })),
    status: undefined,
  }) as Span;

const createMockTrace = (spans: Span[]): Trace => ({ spans, summary: undefined }) as unknown as Trace;

describe('calculateTranscriptStatistics', () => {
  it('returns zeros for undefined trace', () => {
    expect(calculateTranscriptStatistics(undefined)).toEqual({
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      llmCallCount: 0,
      toolCallCount: 0,
    });
  });

  it('returns zeros for trace with no spans', () => {
    expect(calculateTranscriptStatistics(createMockTrace([]))).toEqual({
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      llmCallCount: 0,
      toolCallCount: 0,
    });
  });

  it('counts LLM span identified by gen_ai.operation.name=chat', () => {
    const llmSpan = createMockSpan('chat gemini-3-flash-preview', [
      { key: 'gen_ai.operation.name', value: 'chat' },
      { key: 'gen_ai.request.model', value: 'gemini-3-flash-preview' },
      { key: 'gen_ai.usage.input_tokens', value: '407' },
      { key: 'gen_ai.usage.output_tokens', value: '198' },
    ]);
    const result = calculateTranscriptStatistics(createMockTrace([llmSpan]));
    expect(result.llmCallCount).toBe(1);
    expect(result.toolCallCount).toBe(0);
  });

  it('does not count agent span as LLM call even with gen_ai.request.model', () => {
    // This is the exact scenario from trace 0c69890c65e3933fc5d4b86cd3f5a2ea:
    // The agent span has gen_ai.request.model but should NOT be counted as an LLM call.
    const agentSpan = createMockSpan('invoke_agent Johannes test', [
      { key: 'gen_ai.operation.name', value: 'invoke_agent' },
      { key: 'gen_ai.agent.name', value: 'Johannes test' },
      { key: 'gen_ai.request.model', value: 'gemini-3-flash-preview' },
      { key: 'gen_ai.provider.name', value: 'google' },
      { key: 'gen_ai.usage.input_tokens', value: '407' },
      { key: 'gen_ai.usage.output_tokens', value: '198' },
    ]);
    const result = calculateTranscriptStatistics(createMockTrace([agentSpan]));
    expect(result.llmCallCount).toBe(0);
    expect(result.toolCallCount).toBe(0);
  });

  it('counts correctly for real-world trace with agent + LLM + HTTP spans', () => {
    // Reconstructed from trace 0c69890c65e3933fc5d4b86cd3f5a2ea
    const httpClientSpan = createMockSpan('HTTP POST', [
      { key: 'http.request.method', value: 'POST' },
      { key: 'http.response.status_code', value: '200' },
    ]);
    const gatewayServerSpan = createMockSpan('POST /v1beta/models/gemini-3-flash-preview:streamGenerateContent', [
      { key: 'aigw.backend.id', value: 'gateways/abc/backend-pools/def' },
      { key: 'http.response.status_code', value: '200' },
    ]);
    const httpClientSpan2 = createMockSpan('HTTP POST', [
      { key: 'http.request.method', value: 'POST' },
      { key: 'http.response.status_code', value: '200' },
    ]);
    const llmSpan = createMockSpan('chat gemini-3-flash-preview', [
      { key: 'gen_ai.operation.name', value: 'chat' },
      { key: 'gen_ai.request.model', value: 'gemini-3-flash-preview' },
      { key: 'gen_ai.provider.name', value: 'google' },
      { key: 'gen_ai.input.messages', value: '[{"role":"user","parts":[{"type":"text","content":"hi"}]}]' },
      { key: 'gen_ai.usage.input_tokens', value: '407' },
      { key: 'gen_ai.usage.output_tokens', value: '198' },
    ]);
    const agentSpan = createMockSpan('invoke_agent Johannes test', [
      { key: 'gen_ai.operation.name', value: 'invoke_agent' },
      { key: 'gen_ai.agent.name', value: 'Johannes test' },
      { key: 'gen_ai.request.model', value: 'gemini-3-flash-preview' },
      { key: 'gen_ai.provider.name', value: 'google' },
      { key: 'gen_ai.usage.input_tokens', value: '407' },
      { key: 'gen_ai.usage.output_tokens', value: '198' },
    ]);
    const rootServerSpan = createMockSpan('ai-agent-http-server', [
      { key: 'http.request.method', value: 'POST' },
      { key: 'http.response.status_code', value: '200' },
    ]);

    const trace = createMockTrace([
      httpClientSpan,
      gatewayServerSpan,
      httpClientSpan2,
      llmSpan,
      agentSpan,
      rootServerSpan,
    ]);
    const result = calculateTranscriptStatistics(trace);

    expect(result.llmCallCount).toBe(1);
    expect(result.toolCallCount).toBe(0);
  });

  it('counts tool spans correctly', () => {
    const toolSpan = createMockSpan('execute_tool search', [
      { key: 'gen_ai.operation.name', value: 'execute_tool' },
      { key: 'gen_ai.tool.name', value: 'search' },
      { key: 'gen_ai.tool.call.id', value: 'call_123' },
    ]);
    const result = calculateTranscriptStatistics(createMockTrace([toolSpan]));
    expect(result.llmCallCount).toBe(0);
    expect(result.toolCallCount).toBe(1);
  });

  it('counts multiple LLM and tool spans', () => {
    const llm1 = createMockSpan('chat gpt-4', [
      { key: 'gen_ai.operation.name', value: 'chat' },
      { key: 'gen_ai.request.model', value: 'gpt-4' },
    ]);
    const llm2 = createMockSpan('chat claude-3', [
      { key: 'gen_ai.operation.name', value: 'chat' },
      { key: 'gen_ai.request.model', value: 'claude-3' },
    ]);
    const tool1 = createMockSpan('execute_tool fetch', [
      { key: 'gen_ai.operation.name', value: 'execute_tool' },
      { key: 'gen_ai.tool.name', value: 'fetch' },
    ]);

    const result = calculateTranscriptStatistics(createMockTrace([llm1, tool1, llm2]));
    expect(result.llmCallCount).toBe(2);
    expect(result.toolCallCount).toBe(1);
  });

  it('does not count plain HTTP spans as LLM or tool', () => {
    const httpSpan = createMockSpan('HTTP GET /api/data', [
      { key: 'http.request.method', value: 'GET' },
      { key: 'http.response.status_code', value: '200' },
    ]);
    const result = calculateTranscriptStatistics(createMockTrace([httpSpan]));
    expect(result.llmCallCount).toBe(0);
    expect(result.toolCallCount).toBe(0);
  });

  it('classifies span with gen_ai.system but no operation.name as LLM only if it has prompt/completion attributes', () => {
    // A span with only gen_ai.system should NOT be counted as LLM
    // (it could be an agent or other gen_ai span)
    const spanWithSystemOnly = createMockSpan('some-span', [
      { key: 'gen_ai.system', value: 'openai' },
      { key: 'gen_ai.request.model', value: 'gpt-4' },
    ]);
    const result = calculateTranscriptStatistics(createMockTrace([spanWithSystemOnly]));
    expect(result.llmCallCount).toBe(0);

    // But if it also has gen_ai.prompt, it should be counted
    const spanWithPrompt = createMockSpan('some-span', [
      { key: 'gen_ai.system', value: 'openai' },
      { key: 'gen_ai.prompt', value: 'Hello' },
    ]);
    const resultWithPrompt = calculateTranscriptStatistics(createMockTrace([spanWithPrompt]));
    expect(resultWithPrompt.llmCallCount).toBe(1);
  });
});

describe('isIncompleteTranscript', () => {
  it('returns true for undefined rootSpanName', () => {
    expect(isIncompleteTranscript(undefined)).toBe(true);
  });

  it('returns true for empty rootSpanName', () => {
    expect(isIncompleteTranscript('')).toBe(true);
  });

  it('returns false for non-empty rootSpanName', () => {
    expect(isIncompleteTranscript('my-span')).toBe(false);
    expect(isIncompleteTranscript('root')).toBe(false);
  });
});

describe('isRootSpan', () => {
  it('returns false for undefined span', () => {
    expect(isRootSpan(undefined)).toBe(false);
  });

  it('returns true when parentSpanId is undefined', () => {
    expect(isRootSpan({ parentSpanId: undefined } as never)).toBe(true);
  });

  it('returns true when parentSpanId is empty array', () => {
    expect(isRootSpan({ parentSpanId: new Uint8Array([]) } as never)).toBe(true);
  });

  it('returns true when parentSpanId is all zeros', () => {
    expect(isRootSpan({ parentSpanId: new Uint8Array([0, 0, 0, 0]) } as never)).toBe(true);
  });

  it('returns false when parentSpanId has non-zero values', () => {
    expect(isRootSpan({ parentSpanId: new Uint8Array([1, 2, 3, 4]) } as never)).toBe(false);
  });
});

describe('calculateVisibleWindow', () => {
  it('returns zeros for empty transcript list', () => {
    expect(calculateVisibleWindow([])).toEqual({ startMs: 0, endMs: 0 });
  });

  it('calculates correct window for single transcript', () => {
    const transcripts = [createMockTranscript({ transcriptId: '1', startTimeMs: 1000 })];
    const result = calculateVisibleWindow(transcripts);
    expect(result.startMs).toBe(1000);
    expect(result.endMs).toBe(1000);
  });

  it('calculates correct window for multiple transcripts', () => {
    const transcripts = [
      createMockTranscript({ transcriptId: '1', startTimeMs: 1000 }),
      createMockTranscript({ transcriptId: '2', startTimeMs: 3000 }),
      createMockTranscript({ transcriptId: '3', startTimeMs: 2000 }),
    ];
    const result = calculateVisibleWindow(transcripts);
    expect(result.startMs).toBe(1000);
    expect(result.endMs).toBe(3000);
  });

  it('ignores transcripts without startTime', () => {
    const transcripts = [
      createMockTranscript({ transcriptId: '1', startTimeMs: 1000 }),
      createMockTranscript({ transcriptId: '2' }), // no startTime
      createMockTranscript({ transcriptId: '3', startTimeMs: 2000 }),
    ];
    const result = calculateVisibleWindow(transcripts);
    expect(result.startMs).toBe(1000);
    expect(result.endMs).toBe(2000);
  });

  it('returns zeros when all transcripts lack startTime', () => {
    const transcripts = [createMockTranscript({ transcriptId: '1' }), createMockTranscript({ transcriptId: '2' })];
    expect(calculateVisibleWindow(transcripts)).toEqual({ startMs: 0, endMs: 0 });
  });
});

describe('groupTranscriptsByDate', () => {
  it('returns empty array for empty transcript list', () => {
    expect(groupTranscriptsByDate([])).toEqual([]);
  });

  it('groups transcripts by date', () => {
    // Jan 15, 2025 10:00 UTC
    const date1 = new Date('2025-01-15T10:00:00Z');
    // Jan 15, 2025 14:00 UTC (same day)
    const date2 = new Date('2025-01-15T14:00:00Z');
    // Jan 16, 2025 10:00 UTC (different day)
    const date3 = new Date('2025-01-16T10:00:00Z');

    const transcripts = [
      createMockTranscript({ transcriptId: '1', startTimeMs: date1.getTime() }),
      createMockTranscript({ transcriptId: '2', startTimeMs: date2.getTime() }),
      createMockTranscript({ transcriptId: '3', startTimeMs: date3.getTime() }),
    ];

    const result = groupTranscriptsByDate(transcripts);

    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('2025-01-15');
    expect(result[0][1].traces).toHaveLength(2);
    expect(result[1][0]).toBe('2025-01-16');
    expect(result[1][1].traces).toHaveLength(1);
  });

  it('excludes transcripts without startTime', () => {
    const transcripts = [
      createMockTranscript({ transcriptId: '1', startTimeMs: new Date('2025-01-15T10:00:00Z').getTime() }),
      createMockTranscript({ transcriptId: '2' }), // no startTime
    ];

    const result = groupTranscriptsByDate(transcripts);

    expect(result).toHaveLength(1);
    expect(result[0][1].traces).toHaveLength(1);
    expect(result[0][1].traces[0].traceId).toBe('1');
  });

  it('includes human-readable date labels', () => {
    const transcripts = [
      createMockTranscript({ transcriptId: '1', startTimeMs: new Date('2025-01-15T10:00:00Z').getTime() }),
    ];

    const result = groupTranscriptsByDate(transcripts);

    expect(result[0][1].label).toContain('2025');
    expect(result[0][1].label).toContain('Jan');
    expect(result[0][1].label).toContain('15');
  });
});
