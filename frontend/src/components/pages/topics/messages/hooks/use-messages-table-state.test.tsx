import { create } from '@bufbuild/protobuf';
import { createClient, createRouterTransport } from '@connectrpc/connect';
import { createAsyncIterable } from '@connectrpc/connect/protocol';
import { describe, expect, onTestFinished, rs, test } from '@rstest/core';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { config } from 'config';
import { PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import { ConsoleService } from 'protogen/redpanda/api/console/v1alpha1/console_service_pb';
import {
  type ListMessagesRequest,
  ListMessagesResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { CompressionType, type TopicMessage } from 'state/rest-interfaces';
import { PartitionOffsetOrigin } from 'state/ui';

import { type MessageSearchPhase, useMessageSearch } from './use-message-search';
import { type MessagesTableStateOptions, useMessagesTableState } from './use-messages-table-state';
import type { MessagesUrlState } from './use-messages-url-state';

const payload = (json: string) =>
  ({
    payload: JSON.parse(json),
    isPayloadNull: false,
    encoding: 'json',
    schemaId: 0,
    size: json.length,
  }) satisfies TopicMessage['key'];

const message = (offset: number, status: string) => ({
  partitionID: 0,
  offset,
  timestamp: offset,
  compression: CompressionType.Uncompressed,
  isTransactional: false,
  headers: [],
  key: payload(`"key-${offset}"`),
  value: payload(JSON.stringify({ status })),
  keyJson: `"key-${offset}"`,
  valueJson: JSON.stringify({ status }),
  keyBinHexPreview: '',
  valueBinHexPreview: '',
});

const messages = [message(1, 'created'), message(2, 'shipped'), message(3, 'created')];

const urlStateWith = (overrides: Partial<MessagesUrlState> = {}) =>
  ({
    partitionId: -1,
    setPartitionId: rs.fn(),
    maxResults: 50,
    setMaxResults: rs.fn(),
    startOffset: PartitionOffsetOrigin.EndMinusResults,
    setStartOffset: rs.fn(),
    startTimestamp: -1,
    setStartTimestamp: rs.fn(),
    quickSearch: '',
    setQuickSearch: rs.fn(),
    fieldTokens: [],
    setFieldTokens: rs.fn(),
    keyDeserializer: PayloadEncoding.UNSPECIFIED,
    setKeyDeserializer: rs.fn(),
    valueDeserializer: PayloadEncoding.UNSPECIFIED,
    setValueDeserializer: rs.fn(),
    schemaContext: '',
    setSchemaContext: rs.fn(),
    pageIndex: 0,
    setPageIndex: rs.fn(),
    pageSize: 50,
    setPageSize: rs.fn(),
    sorting: [],
    setSortingState: rs.fn(),
    continuousMode: false,
    setContinuousMode: rs.fn(),
    liveTail: false,
    setLiveTail: rs.fn(),
    selectedKey: null,
    setSelectedKey: rs.fn(),
    readScopeMode: 'newest',
    setReadScopeMode: rs.fn(),
    ...overrides,
  }) satisfies MessagesUrlState;

function renderTableState(
  overrides: Partial<Omit<MessagesTableStateOptions, 'search'>> = {},
  { phase = 'done', fromStream = false }: { phase?: MessageSearchPhase; fromStream?: boolean } = {}
) {
  const options = {
    urlState: urlStateWith(),
    partitionCount: 1,
    continuousActive: false,
    setViewSettingsOpen: rs.fn(),
    keyboardNavEnabled: false,
    ...overrides,
  };
  const rendered = renderHook(
    (currentPhase: MessageSearchPhase) => {
      const search = useMessageSearch('orders');
      const table = useMessagesTableState({
        ...options,
        search: fromStream ? search : { ...search, messages, phase: currentPhase },
      });
      return { table, start: search.start };
    },
    { initialProps: phase }
  );
  return { options, ...rendered };
}

function frame(partitionId: number, status: string) {
  const json = JSON.stringify({ status });
  return create(ListMessagesResponseSchema, {
    controlMessage: {
      case: 'data',
      value: {
        partitionId,
        offset: 2n,
        value: {
          encoding: PayloadEncoding.JSON,
          normalizedPayload: new TextEncoder().encode(json),
          payloadSize: json.length,
        },
      },
    },
  });
}

function serveMessageSearch() {
  const reads: ListMessagesRequest[] = [];
  const { consoleClient } = config;
  const transport = createRouterTransport(({ service }) => {
    service(ConsoleService, {
      listMessages(request) {
        reads.push(request);
        return createAsyncIterable(
          request.ignoreMaxSizeLimit
            ? [frame(1, 'reloaded')]
            : [
                frame(0, 'other partition'),
                frame(1, 'selected'),
                create(ListMessagesResponseSchema, { controlMessage: { case: 'done', value: {} } }),
              ]
        );
      },
    });
  });
  config.consoleClient = createClient(ConsoleService, transport);
  onTestFinished(() => {
    config.consoleClient = consoleClient;
  });
  return reads;
}

describe('useMessagesTableState', () => {
  describe('rows and paging', () => {
    test('filters the loaded rows by the typed quick search', () => {
      const { result } = renderTableState({ urlState: urlStateWith({ quickSearch: 'shipped' }) });

      expect(result.current.table.filteredMessages.map((m) => m.offset)).toEqual([2]);
      expect(result.current.table.tableData.map((m) => m.offset)).toEqual([2]);
    });

    test('continuous paging puts every windowed row on one page', () => {
      const { result } = renderTableState({ continuousActive: true });

      expect(result.current.table.pagination).toEqual({ pageIndex: 0, pageSize: 3 });
    });

    test('only clamps a page beyond the final result set once streaming has settled', () => {
      const urlState = urlStateWith({ pageIndex: 5 });
      const { rerender } = renderTableState({ urlState }, { phase: 'streaming' });
      expect(urlState.setPageIndex).not.toHaveBeenCalled();

      rerender('done');
      expect(urlState.setPageIndex).toHaveBeenCalledWith(0);
    });
  });

  describe('selection', () => {
    test('selecting a row closes view settings and stores its key', () => {
      const { result, options } = renderTableState();

      act(() => result.current.table.handleRowClick(messages[1]));

      expect(options.setViewSettingsOpen).toHaveBeenCalledWith(false);
      expect(options.urlState.setSelectedKey).toHaveBeenCalledWith('0-2');
    });

    test('reloads the selected partition when two records have the same offset', async () => {
      const reads = serveMessageSearch();
      const { result } = renderTableState({ urlState: urlStateWith({ selectedKey: '1-2' }) }, { fromStream: true });

      await act(() =>
        result.current.start({
          startOffset: -1,
          startTimestamp: -1,
          partitionId: -1,
          maxResults: 50,
          filterInterpreterCode: '',
        })
      );
      expect(result.current.table.selectedMessage?.value.payload).toEqual({ status: 'selected' });
      await act(() => result.current.table.handleLoadLargeMessage());

      expect(reads).toHaveLength(2);
      expect(reads[1]).toMatchObject({ topic: 'orders', partitionId: 1, startOffset: 2n, ignoreMaxSizeLimit: true });
      expect(result.current.table.selectedMessage?.value.payload).toEqual({ status: 'reloaded' });
    });

    test('keyboard navigation selects the first on-screen row when enabled', () => {
      const { options } = renderTableState({ keyboardNavEnabled: true });

      fireEvent.keyDown(window, { key: 'j' });

      expect(options.urlState.setSelectedKey).toHaveBeenCalledWith('0-1');
    });
  });
});
