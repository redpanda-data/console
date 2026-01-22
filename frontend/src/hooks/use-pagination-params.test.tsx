import { renderHook } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { PropsWithChildren } from 'react';

import usePaginationParams from './use-pagination-params';

const createWrapper =
  (searchParams?: Record<string, string>) =>
  ({ children }: PropsWithChildren) => <NuqsTestingAdapter searchParams={searchParams}>{children}</NuqsTestingAdapter>;

describe('usePaginationParams', () => {
  test('returns default values when URL parameters are absent', () => {
    const totalDataLength = 100;
    const { result } = renderHook(() => usePaginationParams(totalDataLength, 10), {
      wrapper: createWrapper(),
    });
    expect(result.current.pageSize).toBe(10);
    expect(result.current.pageIndex).toBe(0);
  });

  test('parses pageSize and pageIndex from URL parameters', () => {
    const totalDataLength = 100;
    const { result } = renderHook(() => usePaginationParams(totalDataLength, 10), {
      wrapper: createWrapper({ pageSize: '20', page: '2' }),
    });
    expect(result.current.pageSize).toBe(20);
    expect(result.current.pageIndex).toBe(2);
  });

  test('uses defaultPageSize when pageSize is not in URL', () => {
    const totalDataLength = 150;
    const { result } = renderHook(() => usePaginationParams(totalDataLength, 15), {
      wrapper: createWrapper(),
    });
    expect(result.current.pageSize).toBe(15);
    expect(result.current.pageIndex).toBe(0);
  });

  test('returns bounded pageIndex when URL page param would exceed total pages', () => {
    const totalDataLength = 50; // Only 5 pages available with pageSize 10
    const { result } = renderHook(() => usePaginationParams(totalDataLength, 10), {
      wrapper: createWrapper({ page: '10' }), // Page 10 exceeds available pages
    });
    expect(result.current.pageSize).toBe(10);
    expect(result.current.pageIndex).toBe(4); // Bounded to max valid page (5 pages = index 0-4)
  });
});
