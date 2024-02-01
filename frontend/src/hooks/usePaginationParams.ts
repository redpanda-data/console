import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Custom hook for parsing pagination parameters from the URL search query.
 *
 * This hook extracts 'pageSize' and 'pageIndex' parameters from the URL search query.
 * If these parameters are not present in the URL, it falls back to default values.
 * 'pageSize' defaults to the value passed as an argument, or 10 if not provided.
 * 'pageIndex' defaults to 0 if not present in the URL.
 *
 * @param {number} [defaultPageSize=10] - The default number of items per page if not specified in the URL.
 * @returns {{ pageSize: number; pageIndex: number }} An object containing the pageSize and pageIndex.
 *
 * @example
 * // In a component using react-router
 * const { pageSize, pageIndex } = usePaginationParams(20);
 */
const usePaginationParams = (defaultPageSize: number = 10): { pageSize: number; pageIndex: number } => {
    const { search} = useLocation();

    return useMemo(() => {
        const searchParams = new URLSearchParams(search)
        return {
            pageSize: searchParams.has('pageSize') ? Number(searchParams.get('pageSize')) : defaultPageSize,
            pageIndex: searchParams.has('page') ? Number(searchParams.get('page')) : 0,
        }
    }, [search, defaultPageSize])
};

export default usePaginationParams;
