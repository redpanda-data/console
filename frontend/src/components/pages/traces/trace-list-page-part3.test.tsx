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
import { ListTracesResponseSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import { getTrace, listTraces } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing-TracingService_connectquery';
import { screen, waitFor } from 'test-utils';

import { REGEX_ERROR, REGEX_NO_TRACES_FOUND, REGEX_NO_TRACES_RECORDED, createMockTraceSummary, renderTraceListPage, setupTransport } from './trace-list-page.test-helpers';

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

describe('TraceListPage - Error States & Time Range (Part 3/3)', () => {
  describe('Error States', () => {
    test('should display empty state when no traces exist', async () => {
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

      renderTraceListPage(transport);

      await waitFor(() => {
        expect(screen.getByText(REGEX_NO_TRACES_FOUND)).toBeVisible();
      });

      // Verify the message about no traces recorded
      expect(screen.getByText(REGEX_NO_TRACES_RECORDED)).toBeVisible();
    });

    test('should display error state when RPC fails', async () => {
      const { transport, listTracesMock } = setupTransport();

      // Make the RPC throw an error
      listTracesMock.mockImplementation(() => {
        throw new Error('Failed to fetch traces');
      });

      renderTraceListPage(transport);

      // Wait for error state to appear
      await waitFor(() => {
        expect(listTracesMock).toHaveBeenCalled();
      });

      // The component should display an error message
      expect(await screen.findByText(REGEX_ERROR)).toBeVisible();
    });
  });

  describe('Time Range Selection', () => {
    test('should call API with correct timestamp range', async () => {
      const trace1 = createMockTraceSummary({
        traceId: 'a1b2c3d4e5f6g7h8',
        rootSpanName: 'operation-1',
      });

      const { transport, listTracesMock } = setupTransport({
        listTracesResponse: create(ListTracesResponseSchema, {
          traces: [trace1],
          nextPageToken: '',
        }),
      });

      renderTraceListPage(transport, '/traces?timeRange=1h');

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
});
