import { DEFAULT_TABLE_PAGE_SIZE } from 'components/constants';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useMemo } from 'react';

/**
 * Custom hook for parsing pagination parameters from the URL search query.
 *
 * This hook extracts 'pageSize' and 'pageIndex' parameters from the URL search query
 * using nuqs for type-safe URL state management.
 * If these parameters are not present in the URL, it falls back to default values.
 * 'pageSize' defaults to the value passed as an argument, or DEFAULT_TABLE_PAGE_SIZE if not provided.
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
  const [pageSize] = useQueryState('pageSize', parseAsInteger.withDefault(defaultPageSize));
  const [pageIndex] = useQueryState('page', parseAsInteger.withDefault(0));

  return useMemo(() => {
    const totalPages = Math.ceil(totalDataLength / pageSize);
    const boundedPageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));

    return {
      pageSize,
      pageIndex: boundedPageIndex,
    };
  }, [pageSize, pageIndex, totalDataLength]);
};

export default usePaginationParams;
