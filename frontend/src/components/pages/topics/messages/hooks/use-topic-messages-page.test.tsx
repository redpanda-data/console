import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, renderHook } from '@testing-library/react';
import { createFilterEntry } from 'state/ui';
import { getTopicFilters, setTopicFilters } from 'utils/topic-filters-session';

import { useDetailPresentation, useJsFilters } from './use-topic-messages-page';
import { readDetailViewState } from '../detail/detail-view-state';

describe('useDetailPresentation', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('remembers the expanded preference for the next mount', () => {
    const first = renderHook(() => useDetailPresentation(rs.fn()));
    expect(first.result.current.detailExpanded).toBe(false);

    act(() => first.result.current.setDetailExpanded(true));
    expect(first.result.current.detailExpanded).toBe(true);
    expect(readDetailViewState().expanded).toBe(true);

    const second = renderHook(() => useDetailPresentation(rs.fn()));
    expect(second.result.current.detailExpanded).toBe(true);
  });

  test('persists the docked width without re-rendering', () => {
    const { result } = renderHook(() => useDetailPresentation(rs.fn()));

    act(() => result.current.handleDetailPanelResize({ asPercentage: 41, inPixels: 400 }));

    expect(result.current.detailPanelSizeRef.current).toBe(41);
    expect(readDetailViewState().panelSizePct).toBe(41);
  });

  test('closing clears the selected message', () => {
    const setSelectedKey = rs.fn();
    const { result } = renderHook(() => useDetailPresentation(setSelectedKey));

    act(() => result.current.handleDetailClose());

    expect(setSelectedKey).toHaveBeenCalledWith(null);
  });
});

describe('useJsFilters', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  test('restores the topic filters and persists edits for the session', () => {
    const saved = createFilterEntry({ id: 'saved', name: 'Saved filter' });
    setTopicFilters('orders', [saved]);
    const { result } = renderHook(() => useJsFilters('orders'));
    expect(result.current.jsFilters.map((f) => f.id)).toEqual(['saved']);

    const added = createFilterEntry({ id: 'added' });
    act(() => result.current.setJsFilters((prev) => [...prev, added]));

    expect(getTopicFilters('orders').map((f) => f.id)).toEqual(['saved', 'added']);
  });

  test('the editor dialog starts closed and opens seeded', () => {
    const { result } = renderHook(() => useJsFilters('orders'));
    expect(result.current.jsDialog).toBeNull();

    act(() => result.current.setJsDialog({ filter: null, seedCode: 'value.ok' }));

    expect(result.current.jsDialog).toEqual({ filter: null, seedCode: 'value.ok' });
  });
});
