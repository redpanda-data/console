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

import { create } from '@bufbuild/protobuf';
import type { Duration } from '@bufbuild/protobuf/wkt';
import { DurationSchema, TimestampSchema } from '@bufbuild/protobuf/wkt';
import { createRouterTransport } from '@connectrpc/connect';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import {
  GetTraceResponseSchema,
  ListTracesResponseSchema,
  TraceSchema,
  TraceSummarySchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import { getTrace, listTraces } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing-TracingService_connectquery';
import { SpanSchema } from 'protogen/redpanda/otel/v1/trace_pb';
import { renderWithFileRoutes } from 'test-utils';
import { vi } from 'vitest';

import { TranscriptListPage } from './transcript-list-page';

// Regex constants for test assertions (performance optimization)
export const REGEX_COMPLETED_TRANSCRIPT = /\d+ completed|completed transcript/i;
export const REGEX_SERVICE = /service/i;
export const REGEX_STATUS = /status/i;
export const REGEX_NO_TRANSCRIPTS_FOUND = /no transcripts found/i;
export const REGEX_NO_TRANSCRIPTS_RECORDED = /no transcripts have been recorded/i;
export const REGEX_ERROR = /error/i;

// Helper function to create transport with mocks
export function setupTransport(options?: {
  listTracesResponse?: ReturnType<typeof create<typeof ListTracesResponseSchema>>;
  getTraceResponse?: ReturnType<typeof create<typeof GetTraceResponseSchema>>;
}) {
  const listTracesMock = vi.fn().mockReturnValue(
    options?.listTracesResponse ||
      create(ListTracesResponseSchema, {
        traces: [],
        nextPageToken: '',
      })
  );

  const getTraceMock = vi.fn().mockReturnValue(
    options?.getTraceResponse ||
      create(GetTraceResponseSchema, {
        trace: undefined,
      })
  );

  const transport = createRouterTransport(({ rpc }) => {
    rpc(listTraces, listTracesMock);
    rpc(getTrace, getTraceMock);
  });

  return { transport, listTracesMock, getTraceMock };
}

// Helper function to render with required providers
export function renderTranscriptListPage(
  transport: ReturnType<typeof createRouterTransport>,
  initialLocation = '/transcripts?timeRange=1h'
) {
  // Note: TranscriptListPage renders TranscriptsTable internally.
  // For performance optimization in tests, TranscriptsTable supports disableFaceting prop
  // to skip expensive getFacetedRowModel and getFacetedUniqueValues operations.
  // This is particularly useful when testing basic rendering/filtering without faceted filters.
  return renderWithFileRoutes(
    <NuqsTestingAdapter>
      <TranscriptListPage disableFaceting={true} />
    </NuqsTestingAdapter>,
    { transport, initialLocation }
  );
}

// Helper function to create mock TranscriptSummary
export function createMockTranscriptSummary(overrides?: {
  traceId?: string;
  rootSpanName?: string;
  rootServiceName?: string;
  duration?: Duration;
  spanCount?: number;
  errorCount?: number;
}) {
  return create(TraceSummarySchema, {
    traceId: overrides?.traceId || 'a1b2c3d4e5f6g7h8',
    rootSpanName: overrides?.rootSpanName || 'chat.completions.create',
    rootServiceName: overrides?.rootServiceName || 'ai-agent',
    startTime: create(TimestampSchema, {
      seconds: BigInt(Math.floor(Date.now() / 1000)),
      nanos: 0,
    }),
    duration: overrides?.duration || create(DurationSchema, { seconds: BigInt(1), nanos: 250_000_000 }),
    spanCount: overrides?.spanCount ?? 5,
    errorCount: overrides?.errorCount ?? 0,
  });
}

// Helper function to create mock Transcript with spans
export function createMockTranscript(transcriptId: string, rootSpanName: string) {
  const rootSpanId = '0123456789abcdef';
  const child1SpanId = '1111111111111111';
  const child2SpanId = '2222222222222222';

  return create(TraceSchema, {
    traceId: transcriptId,
    spans: [
      // Root span
      create(SpanSchema, {
        traceId: Uint8Array.from(Buffer.from(transcriptId, 'hex')),
        spanId: Uint8Array.from(Buffer.from(rootSpanId, 'hex')),
        name: rootSpanName,
        startTimeUnixNano: BigInt(Date.now() * 1_000_000),
        endTimeUnixNano: BigInt((Date.now() + 1250) * 1_000_000),
        parentSpanId: new Uint8Array(0), // Empty = root span
      }),
      // Child span 1
      create(SpanSchema, {
        traceId: Uint8Array.from(Buffer.from(transcriptId, 'hex')),
        spanId: Uint8Array.from(Buffer.from(child1SpanId, 'hex')),
        parentSpanId: Uint8Array.from(Buffer.from(rootSpanId, 'hex')),
        name: 'llm.chat',
        startTimeUnixNano: BigInt(Date.now() * 1_000_000),
        endTimeUnixNano: BigInt((Date.now() + 1000) * 1_000_000),
      }),
      // Child span 2
      create(SpanSchema, {
        traceId: Uint8Array.from(Buffer.from(transcriptId, 'hex')),
        spanId: Uint8Array.from(Buffer.from(child2SpanId, 'hex')),
        parentSpanId: Uint8Array.from(Buffer.from(rootSpanId, 'hex')),
        name: 'tool.execute',
        startTimeUnixNano: BigInt((Date.now() + 1000) * 1_000_000),
        endTimeUnixNano: BigInt((Date.now() + 1250) * 1_000_000),
      }),
    ],
    summary: createMockTranscriptSummary({ traceId: transcriptId, rootSpanName }),
  });
}
