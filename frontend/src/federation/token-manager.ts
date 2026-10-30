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
 * JWT refresh with deduplication: concurrent `refresh()` calls share one in-flight request.
 * Call `reset()` on unmount.
 */
export class TokenManager {
  private refreshPromise: Promise<string> | null = null;
  private generation = 0;

  /**
   * Creates a TokenManager instance.
   * @param getAccessToken - Async function that fetches a new access token and
   *   returns the token string. onToken commits it only while this manager is current.
   */
  constructor(
    private getAccessToken: () => Promise<string>,
    private readonly onToken?: (token: string) => void
  ) {}

  /**
   * Refreshes the access token.
   * If a refresh is already in progress, returns the existing promise.
   * This ensures only one token refresh happens at a time.
   *
   * @returns Promise resolving to the new access token
   * @throws Error if token refresh fails
   */
  refresh(): Promise<string> {
    // Return existing promise if refresh is in progress
    if (this.refreshPromise !== null) {
      return this.refreshPromise;
    }

    const generation = this.generation;
    try {
      const refreshPromise: Promise<string> = this.getAccessToken()
        .then((token) => {
          if (generation !== this.generation) {
            throw new DOMException('Token refresh cancelled', 'AbortError');
          }
          this.onToken?.(token);
          return token;
        })
        .finally(() => {
          if (this.refreshPromise === refreshPromise) {
            this.refreshPromise = null;
          }
        });
      this.refreshPromise = refreshPromise;
    } catch (error) {
      return Promise.reject(error);
    }

    return this.refreshPromise;
  }

  /**
   * Invalidates pending refreshes so they cannot commit a token after teardown.
   * Use this for cleanup on component unmount.
   * Safe to call multiple times or when no refresh is in progress.
   */
  reset(): void {
    this.generation += 1;
    this.refreshPromise = null;
  }

  /**
   * Updates the getAccessToken callback.
   * Useful when the callback reference changes (e.g., from a React prop).
   */
  setGetAccessToken(fn: () => Promise<string>): void {
    this.getAccessToken = fn;
  }

  /**
   * Returns whether a token refresh is currently in progress.
   */
  get isRefreshing(): boolean {
    return this.refreshPromise !== null;
  }
}
