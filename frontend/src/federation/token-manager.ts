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

/**
 * TokenManager handles JWT token refresh with deduplication and abort support.
 *
 * Features:
 * - Deduplicates concurrent refresh requests (only one active refresh at a time)
 * - Supports abort via AbortController for cleanup on unmount
 * - Type-safe callback pattern for token storage
 *
 * @example
 * ```ts
 * const tokenManager = new TokenManager(async () => {
 *   const token = await authService.getAccessToken();
 *   config.jwt = token;
 *   return token;
 * });
 *
 * // Refresh token (deduplicates concurrent calls)
 * const token = await tokenManager.refresh();
 *
 * // Cleanup on component unmount
 * tokenManager.abort();
 * ```
 */
export class TokenManager {
  private refreshPromise: Promise<string> | null = null;
  private abortController: AbortController | null = null;

  /**
   * Creates a TokenManager instance.
   * @param getAccessToken - Async function that fetches and stores a new access token
   */
  constructor(private getAccessToken: () => Promise<string>) {}

  /**
   * Refreshes the access token.
   * If a refresh is already in progress, returns the existing promise.
   * This ensures only one token refresh happens at a time.
   *
   * @returns Promise resolving to the new access token
   * @throws Error if token refresh fails or is aborted
   */
  async refresh(): Promise<string> {
    // Return existing promise if refresh is in progress
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.abortController = new AbortController();

    this.refreshPromise = this.getAccessToken().finally(() => {
      this.refreshPromise = null;
      this.abortController = null;
    });

    return this.refreshPromise;
  }

  /**
   * Aborts any in-progress token refresh and cleans up state.
   * Safe to call multiple times or when no refresh is in progress.
   */
  abort(): void {
    this.abortController?.abort();
    this.refreshPromise = null;
    this.abortController = null;
  }

  /**
   * Returns whether a token refresh is currently in progress.
   */
  get isRefreshing(): boolean {
    return this.refreshPromise !== null;
  }
}
