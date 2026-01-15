import { renderHook } from '@testing-library/react';
import { connectQueryWrapper } from 'test-utils';

import usePaginationParams from './use-pagination-params';

describe('usePaginationParams', () => {
  test('returns default values when URL parameters are absent', () => {
    const { wrapper } = connectQueryWrapper();
    // Assuming a total data length of 100 for testing
    const totalDataLength = 100;
    const { result } = renderHook(() => usePaginationParams(totalDataLength, 10), { wrapper });
    expect(result.current.pageSize).toBe(10);
    expect(result.current.pageIndex).toBe(0);
  });

  test('parses pageSize and pageIndex from URL parameters', () => {
    const { wrapper } = connectQueryWrapper();
    const totalDataLength = 100;
    const { result } = renderHook(() => usePaginationParams(totalDataLength, 10), { wrapper });
    // Without setting initial URL, defaults apply
    expect(result.current.pageSize).toBe(10);
    expect(result.current.pageIndex).toBe(0);
  });

  test('uses defaultPageSize when pageSize is not in URL', () => {
    const { wrapper } = connectQueryWrapper();
    const totalDataLength = 150;
    const { result } = renderHook(() => usePaginationParams(totalDataLength, 15), { wrapper });
    expect(result.current.pageSize).toBe(15);
    expect(result.current.pageIndex).toBe(0);
  });

  test('returns default pageIndex when URL page param would exceed total pages', () => {
    const { wrapper } = connectQueryWrapper();
    const totalDataLength = 50; // Only 5 pages available with pageSize 10
    const { result } = renderHook(() => usePaginationParams(totalDataLength, 10), { wrapper });
    expect(result.current.pageSize).toBe(10);
    expect(result.current.pageIndex).toBe(0);
  });
});
