import { describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import { CompressionType, type Payload, type TopicMessage } from 'state/rest-interfaces';
import { PartitionOffsetOrigin } from 'state/ui';

import type { MessageSearchPhase } from './use-message-search';
import { type MessagesTableStateOptions, useMessagesTableState } from './use-messages-table-state';
import type { MessagesUrlState } from './use-messages-url-state';

const payload = (json: string): Payload => ({
  payload: JSON.parse(json),
  isPayloadNull: false,
  encoding: 'json',
  schemaId: 0,
  size: json.length,
});

const message = (offset: number, status: string): TopicMessage => ({
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

const urlStateWith = (overrides: Partial<MessagesUrlState> = {}): MessagesUrlState => ({
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
});

const renderTableState = (
  overrides: Partial<Omit<MessagesTableStateOptions, 'search'>> & { phase?: MessageSearchPhase } = {}
) => {
  const options: MessagesTableStateOptions = {
    search: { messages, phase: overrides.phase ?? 'done', loadLargeMessage: rs.fn().mockResolvedValue(undefined) },
    urlState: urlStateWith(),
    partitionCount: 1,
    continuousActive: false,
    setViewSettingsOpen: rs.fn(),
    keyboardNavEnabled: false,
    ...overrides,
  };
  return { options, ...renderHook(() => useMessagesTableState(options)) };
};

describe('useMessagesTableState', () => {
  describe('rows and paging', () => {
    test('filters the loaded rows by the typed quick search', () => {
      const { result } = renderTableState({ urlState: urlStateWith({ quickSearch: 'shipped' }) });

      expect(result.current.filteredMessages.map((m) => m.offset)).toEqual([2]);
      expect(result.current.tableData.map((m) => m.offset)).toEqual([2]);
    });

    test('continuous paging puts every windowed row on one page', () => {
      const { result } = renderTableState({ continuousActive: true });

      expect(result.current.pagination).toEqual({ pageIndex: 0, pageSize: 3 });
    });

    test('a page index past the last page is clamped once the search is done', () => {
      const urlState = urlStateWith({ pageIndex: 5 });
      renderTableState({ urlState });

      expect(urlState.setPageIndex).toHaveBeenCalledWith(0);
    });

    test('the page index is left alone while the search is still loading', () => {
      const urlState = urlStateWith({ pageIndex: 5 });
      renderTableState({ urlState, phase: 'streaming' });

      expect(urlState.setPageIndex).not.toHaveBeenCalled();
    });
  });

  describe('selection', () => {
    test('selecting a row closes view settings and stores its key', () => {
      const { result, options } = renderTableState();

      act(() => result.current.handleRowClick(messages[1]));

      expect(options.setViewSettingsOpen).toHaveBeenCalledWith(false);
      expect(options.urlState.setSelectedKey).toHaveBeenCalledWith('0-2');
    });

    test('resolves the selected message and reloads its large payload', async () => {
      const { result, options } = renderTableState({ urlState: urlStateWith({ selectedKey: '0-2' }) });

      expect(result.current.selectedMessage?.offset).toBe(2);
      await result.current.handleLoadLargeMessage();
      expect(options.search.loadLargeMessage).toHaveBeenCalledWith(0, 2);
    });

    test('keyboard navigation selects the first on-screen row when enabled', () => {
      const { options } = renderTableState({ keyboardNavEnabled: true });

      fireEvent.keyDown(window, { key: 'j' });

      expect(options.urlState.setSelectedKey).toHaveBeenCalledWith('0-1');
    });
  });
});
