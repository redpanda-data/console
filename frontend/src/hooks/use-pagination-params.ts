import { DEFAULT_TABLE_PAGE_SIZE } from 'components/constants';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useMemo } from 'react';

/**
 * Reads `pageSize` and `page` from the URL via nuqs, falling back to `defaultPageSize` and 0.
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
