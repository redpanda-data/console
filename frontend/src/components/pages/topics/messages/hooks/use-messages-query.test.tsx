import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, renderHook } from '@testing-library/react';
import { PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import { appGlobal } from 'state/app-global';
import { PartitionOffsetOrigin } from 'state/ui';

import type { MessageSearchParams, MessageSearchResult } from './use-message-search';
import { isContinuousPagingActive, useAutoSearch, useSearchRunner } from './use-messages-query';

const baseParams: MessageSearchParams = {
  startOffset: PartitionOffsetOrigin.EndMinusResults,
  startTimestamp: -1,
  partitionId: -1,
  maxResults: 50,
  filterInterpreterCode: '',
};

/** Hoisted so `start`/`stop` keep one identity across renders, like the real search hook's. */
const start = rs.fn<MessageSearchResult['start']>();
const stop = rs.fn<MessageSearchResult['stop']>();

const advance = (ms: number) =>
  act(async () => {
    await rs.advanceTimersByTimeAsync(ms);
  });

type AutoSearchProps = { searchParams: MessageSearchParams; refreshCounter?: number; liveTail?: boolean };

const renderAutoSearch = (initialProps: AutoSearchProps) =>
  renderHook(
    ({ searchParams, refreshCounter = 0, liveTail = false }: AutoSearchProps) =>
      useAutoSearch({ search: { start, stop }, searchParams, refreshCounter, liveTail }),
    { initialProps }
  );

describe('isContinuousPagingActive', () => {
  test.each([
    ['newest', false, true],
    ['oldest', false, true],
    ['offset', false, false],
    ['timestamp', false, false],
    ['newest', true, false],
  ] as const)('%s scope with live tail %s → %s', (readScopeMode, liveTail, expected) => {
    expect(isContinuousPagingActive({ continuousMode: true, readScopeMode, liveTail })).toBe(expected);
  });

  test('is off whenever the toggle is off', () => {
    expect(isContinuousPagingActive({ continuousMode: false, readScopeMode: 'newest', liveTail: false })).toBe(false);
  });
});

describe('search runner hooks', () => {
  beforeEach(() => {
    rs.useFakeTimers();
    start.mockReset();
    start.mockResolvedValue(undefined);
    stop.mockReset();
  });

  afterEach(() => {
    rs.useRealTimers();
  });

  describe('useAutoSearch', () => {
    test('starts one debounced search per distinct set of params', async () => {
      const { rerender } = renderAutoSearch({ searchParams: baseParams });
      expect(start).not.toHaveBeenCalled();

      await advance(100);
      expect(start).toHaveBeenCalledWith(baseParams);

      // A new but equal params object must not restart an identical stream
      rerender({ searchParams: { ...baseParams } });
      await advance(100);
      expect(start).toHaveBeenCalledTimes(1);
    });

    test('changing params stops the running search and starts the new one', async () => {
      const { rerender } = renderAutoSearch({ searchParams: baseParams });
      await advance(100);

      rerender({ searchParams: { ...baseParams, partitionId: 2 } });
      expect(stop).toHaveBeenCalled();
      await advance(100);
      expect(start).toHaveBeenLastCalledWith({ ...baseParams, partitionId: 2 });
    });

    test('a refresh re-runs the same params', async () => {
      const { rerender } = renderAutoSearch({ searchParams: baseParams });
      await advance(100);

      rerender({ searchParams: baseParams, refreshCounter: 1 });
      await advance(100);
      expect(start).toHaveBeenCalledTimes(2);
    });

    test('stays inert while live tail owns the stream', async () => {
      renderAutoSearch({ searchParams: baseParams, liveTail: true });
      await advance(100);
      expect(start).not.toHaveBeenCalled();
    });

    test('waits out the unset timestamp sentinel instead of searching with it', async () => {
      renderAutoSearch({ searchParams: { ...baseParams, startOffset: PartitionOffsetOrigin.Timestamp } });
      await advance(100);
      expect(start).not.toHaveBeenCalled();
    });
  });

  describe('useSearchRunner', () => {
    const renderRunner = (liveTail = false) =>
      renderHook(() =>
        useSearchRunner({
          search: { start, stop },
          searchParams: baseParams,
          filterInterpreterCode: '',
          liveTail,
          partitionId: -1,
        })
      );

    test('refresh re-runs the paged search', async () => {
      const { result } = renderRunner();
      await advance(100);

      act(() => result.current.handleRefresh());
      await advance(100);
      expect(start).toHaveBeenCalledTimes(2);
    });

    test('page-level actions re-trigger the search through the global, which is cleared on unmount', async () => {
      const { unmount } = renderRunner();
      await advance(100);

      act(() => appGlobal.searchMessagesFunc?.('manual'));
      await advance(100);
      expect(start).toHaveBeenCalledTimes(2);

      unmount();
      expect(appGlobal.searchMessagesFunc).toBeUndefined();
    });

    test('live tail starts streaming from the end of the log', async () => {
      // A stream that stays open; one that resolved at once would restart in a tight loop
      start.mockReturnValue(
        new Promise<void>(() => {
          // never settles
        })
      );
      renderRunner(true);
      await advance(0);
      expect(start).toHaveBeenCalledWith(
        { ...baseParams, startOffset: PartitionOffsetOrigin.End, pageSize: undefined },
        { live: true, append: false }
      );
    });
  });

  describe('live tail params', () => {
    // A tail that stays open, so only a param change or a restart starts another one.
    beforeEach(() => {
      start.mockReturnValue(
        new Promise<void>(() => {
          // never settles
        })
      );
    });

    const renderLiveRunner = (searchParams: MessageSearchParams) =>
      renderHook(
        (props: { searchParams: MessageSearchParams }) =>
          useSearchRunner({
            search: { start, stop },
            searchParams: props.searchParams,
            filterInterpreterCode: props.searchParams.filterInterpreterCode,
            liveTail: true,
            partitionId: props.searchParams.partitionId,
          }),
        { initialProps: { searchParams } }
      );

    const freshTailOf = (params: MessageSearchParams) =>
      [
        { ...params, startOffset: PartitionOffsetOrigin.End, pageSize: undefined },
        { live: true, append: false },
      ] as const;

    test('restarts the tail with a newly committed JS filter', async () => {
      const { rerender } = renderLiveRunner(baseParams);
      await advance(0);

      const filtered = { ...baseParams, filterInterpreterCode: 'cmV0dXJuIHRydWU7' };
      rerender({ searchParams: filtered });
      await advance(0);

      expect(stop).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenLastCalledWith(...freshTailOf(filtered));
    });

    test('keeps the running tail when only a deserializer changes', async () => {
      const { rerender } = renderLiveRunner(baseParams);
      await advance(0);

      rerender({ searchParams: { ...baseParams, keyDeserializer: PayloadEncoding.JSON } });
      await advance(0);

      expect(start).toHaveBeenCalledTimes(1);
      expect(stop).not.toHaveBeenCalled();
    });

    test('a restart applies the deserializer changed while live', async () => {
      const { result, rerender } = renderLiveRunner(baseParams);
      await advance(0);

      const jsonKeys = { ...baseParams, keyDeserializer: PayloadEncoding.JSON };
      rerender({ searchParams: jsonKeys });
      act(() => result.current.handleRefresh());
      await advance(0);

      expect(start).toHaveBeenLastCalledWith(...freshTailOf(jsonKeys));
    });
  });
});
