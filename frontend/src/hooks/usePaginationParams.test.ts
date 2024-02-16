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
        // Assuming a total data length of 100 for testing
        const totalDataLength = 100;
        const { result } = renderHook(() => usePaginationParams(10, totalDataLength));
        expect(result.current.pageSize).toBe(10);
        expect(result.current.pageIndex).toBe(0);
    });

    it('parses pageSize and pageIndex from URL parameters', () => {
        (useLocation as jest.Mock).mockReturnValue({ search: '?pageSize=20&page=2' });
        const totalDataLength = 100;
        const { result } = renderHook(() => usePaginationParams(10, totalDataLength));
        expect(result.current.pageSize).toBe(20);
        expect(result.current.pageIndex).toBe(2);
    });

    it('uses defaultPageSize when pageSize is not in URL', () => {
        (useLocation as jest.Mock).mockReturnValue({ search: '?page=3' });
        const totalDataLength = 150;
        const { result } = renderHook(() => usePaginationParams(15, totalDataLength));
        expect(result.current.pageSize).toBe(15);
        expect(result.current.pageIndex).toBe(3);
    });

    it('adjusts pageIndex if it exceeds calculated totalPages', () => {
        (useLocation as jest.Mock).mockReturnValue({ search: '?pageSize=10&page=20' }); // pageIndex is out of range
        const totalDataLength = 50; // Only 5 pages available
        const { result } = renderHook(() => usePaginationParams(10, totalDataLength));
        expect(result.current.pageSize).toBe(10);
        expect(result.current.pageIndex).toBe(4);
    });
});
