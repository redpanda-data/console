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
import userEvent from '@testing-library/user-event';
import { ListTracesResponseSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import { screen } from 'test-utils';

import { REGEX_COMPLETED_TRACE, createMockTraceSummary, renderTraceListPage, setupTransport } from './trace-list-page.test-helpers';

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

describe('TraceListPage - Basic Rendering & Filtering (Part 1/3)', () => {
  describe('Basic Rendering', () => {
    test('should render trace list with basic data', async () => {
      const trace1 = createMockTraceSummary({
        traceId: 'a1b2c3d4e5f6g7h8',
        rootSpanName: 'chat.completions.create',
        serviceName: 'ai-agent',
        spanCount: 5,
        errorCount: 0,
      });

      const trace2 = createMockTraceSummary({
        traceId: 'b2c3d4e5f6g7h8i9',
        rootSpanName: 'data.process',
        serviceName: 'data-service',
        spanCount: 3,
        errorCount: 2,
      });

      const { transport, listTracesMock } = setupTransport({
        listTracesResponse: create(ListTracesResponseSchema, {
          traces: [trace1, trace2],
          nextPageToken: '',
        }),
      });

      renderTraceListPage(transport);

      // Use findBy instead of waitFor(getBy...)
      expect(await screen.findByText('chat.completions.create')).toBeVisible();
      expect(await screen.findByText('data.process')).toBeVisible();

      // Verify service names
      expect(screen.getByText('ai-agent')).toBeVisible();
      expect(screen.getByText('data-service')).toBeVisible();

      // Verify stats summary (more flexible regex)
      expect(screen.getByText(REGEX_COMPLETED_TRACE)).toBeVisible();

      // Verify API was called
      expect(listTracesMock).toHaveBeenCalled();
      expect(listTracesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSize: 500,
        }),
        expect.anything()
      );
    });
  });

  describe('Filtering and Search', () => {
    test('should filter traces by text search', async () => {
      const user = userEvent.setup();

      const trace1 = createMockTraceSummary({
        traceId: 'a1b2c3d4e5f6g7h8',
        rootSpanName: 'ai-agent-operation',
        serviceName: 'ai-agent',
      });

      const trace2 = createMockTraceSummary({
        traceId: 'b2c3d4e5f6g7h8i9',
        rootSpanName: 'data-operation',
        serviceName: 'data-service',
      });

      const { transport } = setupTransport({
        listTracesResponse: create(ListTracesResponseSchema, {
          traces: [trace1, trace2],
          nextPageToken: '',
        }),
      });

      renderTraceListPage(transport);

      expect(await screen.findByText('ai-agent-operation')).toBeVisible();
      expect(await screen.findByText('data-operation')).toBeVisible();

      // Type in search input
      const searchInput = screen.getByPlaceholderText('Search traces...');
      await user.type(searchInput, 'ai-agent');

      // Only ai-agent trace should be visible
      expect(await screen.findByText('ai-agent-operation')).toBeVisible();
      expect(screen.queryByText('data-operation')).not.toBeInTheDocument();
    });
  });
});
