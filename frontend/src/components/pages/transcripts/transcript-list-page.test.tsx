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
import { createRouterTransport } from '@connectrpc/connect';
import userEvent from '@testing-library/user-event';
import { GetTraceResponseSchema, ListTracesResponseSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import { getTrace, listTraces } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing-TracingService_connectquery';
import { screen, waitFor } from 'test-utils';

import {
  createMockTranscript,
  createMockTranscriptSummary,
  REGEX_COMPLETED_TRANSCRIPT,
  REGEX_ERROR,
  REGEX_NO_TRANSCRIPTS_FOUND,
  REGEX_NO_TRANSCRIPTS_RECORDED,
  REGEX_SERVICE,
  REGEX_STATUS,
  renderTranscriptListPage,
  setupTransport,
} from './transcript-list-page.test-helpers';

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
  },
}));

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

vi.mock('state/app-global', () => ({
  appGlobal: {
    onRefresh: vi.fn(),
  },
}));

global.ResizeObserver = class ResizeObserver {
  observe() {
    // Mock implementation
  }
  unobserve() {
    // Mock implementation
  }
  disconnect() {
    // Mock implementation
  }
};

Element.prototype.scrollIntoView = vi.fn();

describe('TranscriptListPage', () => {
  describe('Basic Rendering', () => {
    test('should render transcript list with basic data', async () => {
      const transcript1 = createMockTranscriptSummary({
        traceId: 'a1b2c3d4e5f6g7h8',
        rootSpanName: 'chat.completions.create',
        rootServiceName: 'ai-agent',
        spanCount: 5,
        errorCount: 0,
      });

      const transcript2 = createMockTranscriptSummary({
        traceId: 'b2c3d4e5f6g7h8i9',
        rootSpanName: 'data.process',
        rootServiceName: 'data-service',
        spanCount: 3,
        errorCount: 2,
      });

      const { transport, listTracesMock } = setupTransport({
        listTracesResponse: create(ListTracesResponseSchema, {
          traces: [transcript1, transcript2],
          nextPageToken: '',
        }),
      });

      renderTranscriptListPage(transport);

      // Use findBy instead of waitFor(getBy...)
      expect(await screen.findByText('chat.completions.create')).toBeVisible();
      expect(await screen.findByText('data.process')).toBeVisible();

      // Verify service names
      expect(screen.getByText('ai-agent')).toBeVisible();
      expect(screen.getByText('data-service')).toBeVisible();

      // Verify stats summary (more flexible regex)
      expect(screen.getByText(REGEX_COMPLETED_TRANSCRIPT)).toBeVisible();

      // Verify API was called
      expect(listTracesMock).toHaveBeenCalled();
      expect(listTracesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSize: 100,
        }),
        expect.anything()
      );
    });
  });

  describe('Filtering and Search', () => {
    test('should filter transcripts by text search', async () => {
      const user = userEvent.setup();

      const transcript1 = createMockTranscriptSummary({
        traceId: 'a1b2c3d4e5f6g7h8',
        rootSpanName: 'ai-agent-operation',
        rootServiceName: 'ai-agent',
      });

      const transcript2 = createMockTranscriptSummary({
        traceId: 'b2c3d4e5f6g7h8i9',
        rootSpanName: 'data-operation',
        rootServiceName: 'data-service',
      });

      const { transport } = setupTransport({
        listTracesResponse: create(ListTracesResponseSchema, {
          traces: [transcript1, transcript2],
          nextPageToken: '',
        }),
      });

      renderTranscriptListPage(transport);

      expect(await screen.findByText('ai-agent-operation')).toBeVisible();
      expect(await screen.findByText('data-operation')).toBeVisible();

      // Type in search input
      const searchInput = screen.getByPlaceholderText('Search transcripts...');
      await user.type(searchInput, 'ai-agent');

      // Only ai-agent transcript should be visible
      expect(await screen.findByText('ai-agent-operation')).toBeVisible();
      expect(screen.queryByText('data-operation')).not.toBeInTheDocument();
    });

    test('should render service filter when multiple services exist', async () => {
      const transcript1 = createMockTranscriptSummary({
        traceId: 'transcript1',
        rootSpanName: 'operation-1',
        rootServiceName: 'ai-agent',
      });

      const transcript2 = createMockTranscriptSummary({
        traceId: 'transcript2',
        rootSpanName: 'operation-2',
        rootServiceName: 'data-service',
      });

      const listTracesResponse = create(ListTracesResponseSchema, {
        traces: [transcript1, transcript2],
        nextPageToken: '',
      });

      const listTracesMock = vi.fn().mockReturnValue(listTracesResponse);
      const getTraceMock = vi.fn();

      const transport = createRouterTransport(({ rpc }) => {
        rpc(listTraces, listTracesMock);
        rpc(getTrace, getTraceMock);
      });

      renderTranscriptListPage(transport);

      await waitFor(() => {
        expect(screen.getByText('operation-1')).toBeVisible();
        expect(screen.getByText('operation-2')).toBeVisible();
      });

      // Verify service filter appears (look for the Filter button specifically)
      const filterButtons = screen.getAllByRole('button', { name: REGEX_SERVICE });
      expect(filterButtons.length).toBeGreaterThan(0);
    });

    test('should render status filter', async () => {
      const completedTranscript = createMockTranscriptSummary({
        traceId: 'transcript1',
        rootSpanName: 'completed-operation',
        errorCount: 0,
        spanCount: 5,
      });

      const errorTranscript = createMockTranscriptSummary({
        traceId: 'transcript2',
        rootSpanName: 'error-operation',
        errorCount: 2,
        spanCount: 5,
      });

      const listTracesResponse = create(ListTracesResponseSchema, {
        traces: [completedTranscript, errorTranscript],
        nextPageToken: '',
      });

      const listTracesMock = vi.fn().mockReturnValue(listTracesResponse);
      const getTraceMock = vi.fn();

      const transport = createRouterTransport(({ rpc }) => {
        rpc(listTraces, listTracesMock);
        rpc(getTrace, getTraceMock);
      });

      renderTranscriptListPage(transport);

      await waitFor(() => {
        expect(screen.getByText('completed-operation')).toBeVisible();
        expect(screen.getByText('error-operation')).toBeVisible();
      });

      // Verify status filter appears
      const statusButtons = screen.getAllByRole('button', { name: REGEX_STATUS });
      expect(statusButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Time Range Selection', () => {
    test('should load transcripts with default time range', async () => {
      const transcript1 = createMockTranscriptSummary({
        traceId: 'transcript1',
        rootSpanName: 'operation-1',
      });

      const listTracesResponse = create(ListTracesResponseSchema, {
        traces: [transcript1],
        nextPageToken: '',
      });

      const listTracesMock = vi.fn().mockReturnValue(listTracesResponse);
      const getTraceMock = vi.fn();

      const transport = createRouterTransport(({ rpc }) => {
        rpc(listTraces, listTracesMock);
        rpc(getTrace, getTraceMock);
      });

      renderTranscriptListPage(transport, '/transcripts?timeRange=1h');

      await waitFor(() => {
        expect(screen.getByText('operation-1')).toBeVisible();
      });

      // Verify API was called (may be called multiple times due to component effects)
      expect(listTracesMock).toHaveBeenCalled();
      const call = listTracesMock.mock.calls[0][0];
      const startSecs = Number(call.startTime.seconds);
      const endSecs = Number(call.endTime.seconds);
      const diffMinutes = (endSecs - startSecs) / 60;
      expect(diffMinutes).toBeCloseTo(60, 0);

      // Verify time range selector is present
      expect(screen.getByRole('combobox')).toBeVisible();
    });

    test('should call API with correct timestamp range', async () => {
      const transcript1 = createMockTranscriptSummary({
        traceId: 'a1b2c3d4e5f6g7h8',
        rootSpanName: 'operation-1',
      });

      const { transport, listTracesMock } = setupTransport({
        listTracesResponse: create(ListTracesResponseSchema, {
          traces: [transcript1],
          nextPageToken: '',
        }),
      });

      renderTranscriptListPage(transport, '/transcripts?timeRange=1h');

      expect(await screen.findByText('operation-1')).toBeVisible();

      // Verify API was called with 1 hour range
      expect(listTracesMock).toHaveBeenCalled();
      const call = listTracesMock.mock.calls[0][0];
      const startSecs = Number(call.startTime.seconds);
      const endSecs = Number(call.endTime.seconds);
      const diffMinutes = (endSecs - startSecs) / 60;

      // Should be approximately 60 minutes (allow small variance for test execution time)
      expect(diffMinutes).toBeGreaterThanOrEqual(59);
      expect(diffMinutes).toBeLessThanOrEqual(61);

      // Verify time range selector is present
      expect(screen.getByRole('combobox')).toBeVisible();
    });
  });

  describe('Transcript Expansion', () => {
    test('should expand transcript to show spans', async () => {
      const user = userEvent.setup();

      const transcript1 = createMockTranscriptSummary({
        traceId: 'a1b2c3d4e5f6g7h8',
        rootSpanName: 'chat.completions.create',
        rootServiceName: 'ai-agent',
        spanCount: 3,
      });

      const listTracesResponse = create(ListTracesResponseSchema, {
        traces: [transcript1],
        nextPageToken: '',
      });

      const mockTranscript = createMockTranscript('a1b2c3d4e5f6g7h8', 'chat.completions.create');

      const getTraceResponse = create(GetTraceResponseSchema, {
        trace: mockTranscript,
      });

      const listTracesMock = vi.fn().mockReturnValue(listTracesResponse);
      const getTraceMock = vi.fn().mockReturnValue(getTraceResponse);

      const transport = createRouterTransport(({ rpc }) => {
        rpc(listTraces, listTracesMock);
        rpc(getTrace, getTraceMock);
      });

      renderTranscriptListPage(transport);

      await waitFor(() => {
        expect(screen.getByText('chat.completions.create')).toBeVisible();
      });

      // Click the transcript row to expand
      const transcriptButton = screen.getByText('chat.completions.create').closest('button');
      expect(transcriptButton).toBeInTheDocument();
      if (!transcriptButton) {
        throw new Error('Expected transcript button to be in document');
      }
      await user.click(transcriptButton);

      // Wait for getTrace API to be called
      await waitFor(() => {
        expect(getTraceMock).toHaveBeenCalledTimes(1);
        expect(getTraceMock).toHaveBeenCalledWith(
          expect.objectContaining({
            traceId: 'a1b2c3d4e5f6g7h8',
          }),
          expect.anything()
        );
      });

      // Verify child spans appear
      await waitFor(() => {
        expect(screen.getByText('llm.chat')).toBeVisible();
        expect(screen.getByText('tool.execute')).toBeVisible();
      });
    });
  });

  describe('Error States', () => {
    test('should display empty state when no transcripts exist', async () => {
      const listTracesResponse = create(ListTracesResponseSchema, {
        traces: [],
        nextPageToken: '',
      });

      const listTracesMock = vi.fn().mockReturnValue(listTracesResponse);
      const getTraceMock = vi.fn();

      const transport = createRouterTransport(({ rpc }) => {
        rpc(listTraces, listTracesMock);
        rpc(getTrace, getTraceMock);
      });

      renderTranscriptListPage(transport);

      await waitFor(() => {
        expect(screen.getByText(REGEX_NO_TRANSCRIPTS_FOUND)).toBeVisible();
      });

      // Verify the message about no transcripts recorded
      expect(screen.getByText(REGEX_NO_TRANSCRIPTS_RECORDED)).toBeVisible();
    });

    test('should display error state when RPC fails', async () => {
      const { transport, listTracesMock } = setupTransport();

      // Make the RPC throw an error
      listTracesMock.mockImplementation(() => {
        throw new Error('Failed to fetch transcripts');
      });

      renderTranscriptListPage(transport);

      // Wait for error state to appear
      await waitFor(() => {
        expect(listTracesMock).toHaveBeenCalled();
      });

      // The component should display an error message
      expect(await screen.findByText(REGEX_ERROR)).toBeVisible();
    });
  });
});
