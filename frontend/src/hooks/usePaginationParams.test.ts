import { renderHook } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import usePaginationParams from './usePaginationParams';

// Mock useLocation
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useLocation: jest.fn(),
}));

describe('usePaginationParams', () => {
    it('returns default values when URL parameters are absent', () => {
        (useLocation as jest.Mock).mockReturnValue({ search: '' });
        const { result } = renderHook(() => usePaginationParams());
        expect(result.current.pageSize).toBe(10);
        expect(result.current.pageIndex).toBe(0);
    });

    it('parses pageSize and pageIndex from URL parameters', () => {
        (useLocation as jest.Mock).mockReturnValue({ search: '?pageSize=5&page=2' });
        const { result } = renderHook(() => usePaginationParams());
        expect(result.current.pageSize).toBe(5);
        expect(result.current.pageIndex).toBe(2);
    });

    it('uses defaultPageSize when pageSize is not in URL', () => {
        (useLocation as jest.Mock).mockReturnValue({ search: '?page=3' });
        const { result } = renderHook(() => usePaginationParams(15));
        expect(result.current.pageSize).toBe(15);
        expect(result.current.pageIndex).toBe(3);
    });
});
