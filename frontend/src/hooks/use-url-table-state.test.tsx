import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type UrlUpdateEvent, withNuqsTestingAdapter } from 'nuqs/adapters/testing';

import { useUrlTableState } from './use-url-table-state';
import { reportActionError } from '../utils/toast.utils';

const searchParams = '?itemPage=2&itemPageSize=10&itemSortId=name&itemSortDesc=true';
rs.mock('@tanstack/react-router', () => ({ useLocation: () => ({ searchStr: searchParams }) }));
rs.mock('../utils/toast.utils', () => ({ reportActionError: rs.fn() }));

beforeEach(() => rs.mocked(reportActionError).mockClear());

function renderTable(onUrlUpdate = rs.fn<(event: UrlUpdateEvent) => void>()) {
  const settings = { pageSize: 10, sortId: 'name', sortDesc: true };
  const hook = renderHook(() => useUrlTableState({ keyPrefix: 'item', settings, rowCount: 100 }), {
    wrapper: withNuqsTestingAdapter({ searchParams, hasMemory: true, onUrlUpdate }),
  });
  return { ...hook, settings, onUrlUpdate };
}

describe('url table changes', () => {
  test('sorts and resets paging in the same URL commit while mirroring preferences', async () => {
    const { result, settings, onUrlUpdate } = renderTable();
    act(() => result.current.onSortingChange([{ id: 'size', desc: false }]));
    await waitFor(() =>
      expect(onUrlUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ queryString: '?itemSortId=size&itemSortDesc=false' })
      )
    );
    const committed = onUrlUpdate.mock.calls.at(-1)?.[0].searchParams;
    expect(committed?.get('itemSortId')).toBe('size');
    expect(committed?.get('itemSortDesc')).toBe('false');
    expect(committed?.get('itemPage')).toBeNull();
    expect(settings).toEqual({ pageSize: 10, sortId: 'size', sortDesc: false });
    expect(reportActionError).not.toHaveBeenCalled();
  });

  test('reports a rejected pagination commit once instead of leaking detached rejections', async () => {
    const onUrlUpdate = rs.fn<(event: UrlUpdateEvent) => void>((event) => {
      if (event.searchParams.get('itemPage') === '3') {
        throw new Error('History write rejected');
      }
    });
    const { result, settings } = renderTable(onUrlUpdate);
    // Let initial preference hydration finish before rejecting the user's next URL transaction.
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(1));
    act(() => result.current.onPaginationChange({ pageIndex: 3, pageSize: 20 }));
    await waitFor(() => expect(reportActionError).toHaveBeenCalledTimes(1));
    expect(settings.pageSize).toBe(20);
  });
});
