/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { TokenManager } from './token-manager';

describe('TokenManager', () => {
  describe('refresh', () => {
    test('calls getAccessToken and returns the token', async () => {
      const mockGetToken = vi.fn().mockResolvedValue('test-token-123');
      const tokenManager = new TokenManager(mockGetToken);

      const result = await tokenManager.refresh();

      expect(mockGetToken).toHaveBeenCalledTimes(1);
      expect(result).toBe('test-token-123');
    });

    test('deduplicates concurrent refresh calls', async () => {
      let resolveToken: (value: string) => void;
      const tokenPromise = new Promise<string>((resolve) => {
        resolveToken = resolve;
      });
      const mockGetToken = vi.fn().mockReturnValue(tokenPromise);
      const tokenManager = new TokenManager(mockGetToken);

      // Start multiple refresh calls concurrently
      const promise1 = tokenManager.refresh();
      const promise2 = tokenManager.refresh();
      const promise3 = tokenManager.refresh();

      // getAccessToken should only be called once
      expect(mockGetToken).toHaveBeenCalledTimes(1);

      // Resolve the token
      resolveToken!('deduplicated-token');

      // All promises should resolve to the same value
      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);
      expect(result1).toBe('deduplicated-token');
      expect(result2).toBe('deduplicated-token');
      expect(result3).toBe('deduplicated-token');
    });

    test('allows new refresh after previous completes', async () => {
      const mockGetToken = vi.fn().mockResolvedValueOnce('token-1').mockResolvedValueOnce('token-2');
      const tokenManager = new TokenManager(mockGetToken);

      const result1 = await tokenManager.refresh();
      const result2 = await tokenManager.refresh();

      expect(mockGetToken).toHaveBeenCalledTimes(2);
      expect(result1).toBe('token-1');
      expect(result2).toBe('token-2');
    });

    test('propagates errors from getAccessToken', async () => {
      const mockError = new Error('Token fetch failed');
      const mockGetToken = vi.fn().mockRejectedValue(mockError);
      const tokenManager = new TokenManager(mockGetToken);

      await expect(tokenManager.refresh()).rejects.toThrow('Token fetch failed');
    });

    test('clears state after error allowing retry', async () => {
      const mockGetToken = vi
        .fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce('retry-token');
      const tokenManager = new TokenManager(mockGetToken);

      // First call fails
      await expect(tokenManager.refresh()).rejects.toThrow('First attempt failed');

      // Second call should work
      const result = await tokenManager.refresh();
      expect(result).toBe('retry-token');
      expect(mockGetToken).toHaveBeenCalledTimes(2);
    });
  });

  describe('abort', () => {
    test('clears refresh state when called', async () => {
      let resolveToken: (value: string) => void;
      const tokenPromise = new Promise<string>((resolve) => {
        resolveToken = resolve;
      });
      const mockGetToken = vi.fn().mockReturnValue(tokenPromise);
      const tokenManager = new TokenManager(mockGetToken);

      // Start a refresh
      tokenManager.refresh();
      expect(tokenManager.isRefreshing).toBe(true);

      // Abort
      tokenManager.abort();
      expect(tokenManager.isRefreshing).toBe(false);

      // Resolve the original promise (cleanup)
      resolveToken!('token');
    });

    test('is safe to call when no refresh is in progress', () => {
      const mockGetToken = vi.fn();
      const tokenManager = new TokenManager(mockGetToken);

      // Should not throw
      expect(() => tokenManager.abort()).not.toThrow();
    });

    test('is safe to call multiple times', () => {
      const mockGetToken = vi.fn();
      const tokenManager = new TokenManager(mockGetToken);

      // Should not throw
      expect(() => {
        tokenManager.abort();
        tokenManager.abort();
        tokenManager.abort();
      }).not.toThrow();
    });
  });

  describe('isRefreshing', () => {
    test('returns false when no refresh is in progress', () => {
      const mockGetToken = vi.fn();
      const tokenManager = new TokenManager(mockGetToken);

      expect(tokenManager.isRefreshing).toBe(false);
    });

    test('returns true during refresh', async () => {
      let resolveToken: (value: string) => void;
      const tokenPromise = new Promise<string>((resolve) => {
        resolveToken = resolve;
      });
      const mockGetToken = vi.fn().mockReturnValue(tokenPromise);
      const tokenManager = new TokenManager(mockGetToken);

      tokenManager.refresh();
      expect(tokenManager.isRefreshing).toBe(true);

      resolveToken!('token');
      await tokenManager.refresh();
      expect(tokenManager.isRefreshing).toBe(false);
    });

    test('returns false after refresh completes', async () => {
      const mockGetToken = vi.fn().mockResolvedValue('token');
      const tokenManager = new TokenManager(mockGetToken);

      await tokenManager.refresh();
      expect(tokenManager.isRefreshing).toBe(false);
    });

    test('returns false after refresh fails', async () => {
      const mockGetToken = vi.fn().mockRejectedValue(new Error('Failed'));
      const tokenManager = new TokenManager(mockGetToken);

      try {
        await tokenManager.refresh();
      } catch {
        // Expected
      }
      expect(tokenManager.isRefreshing).toBe(false);
    });
  });
});
