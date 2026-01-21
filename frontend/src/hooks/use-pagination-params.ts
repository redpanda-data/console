import { useLocation } from '@tanstack/react-router';
import { DEFAULT_TABLE_PAGE_SIZE } from 'components/constants';
import { useMemo } from 'react';

/**
 * Custom hook for parsing pagination parameters from the URL search query.
 *
 * This hook extracts 'pageSize' and 'pageIndex' parameters from the URL search query.
 * If these parameters are not present in the URL, it falls back to default values.
 * 'pageSize' defaults to the value passed as an argument, or 10 if not provided.
 * 'pageIndex' defaults to 0 if not present in the URL.
 *
 * @param {number} totalDataLength - The total length of the data to paginate over.
 * @param {number} [defaultPageSize=DEFAULT_TABLE_PAGE_SIZE] - The default number of items per page if not specified in the URL.
 * @returns {{ pageSize: number; pageIndex: number }} An object containing the pageSize and pageIndex.
 *
 * @example
 * // In a component using TanStack Router
 * const { pageSize, pageIndex } = usePaginationParams(20);
 */
const usePaginationParams = (
  totalDataLength: number,
  defaultPageSize: number = DEFAULT_TABLE_PAGE_SIZE
): { pageSize: number; pageIndex: number } => {
  const location = useLocation();
  const search = location.searchStr ?? '';

  return useMemo(() => {
    const searchParams = new URLSearchParams(search);
    const pageSize = searchParams.has('pageSize') ? Number(searchParams.get('pageSize')) : defaultPageSize;
    const pageIndex = searchParams.has('page') ? Number(searchParams.get('page')) : 0;
    const totalPages = Math.ceil(totalDataLength / pageSize);

    const boundedPageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));

    return {
      pageSize,
      pageIndex: boundedPageIndex,
    };
  }, [search, defaultPageSize, totalDataLength]);
};

export default usePaginationParams;
