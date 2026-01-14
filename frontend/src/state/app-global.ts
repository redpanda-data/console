/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { ParsedLocation, Router } from '@tanstack/react-router';

import { api } from './backend-api';
import { uiState } from './ui-state';

type NavigateFn = (to: string, options?: { replace?: boolean }) => void;

// Regex for normalizing paths by removing trailing slashes
const TRAILING_SLASH_REGEX = /\/+$/;

class AppGlobal {
  private _navigate: NavigateFn | null = null;
  private _location: ParsedLocation | null = null;
  // biome-ignore lint/suspicious/noExplicitAny: Router type is complex and varies based on route tree
  private _router: Router<any, any, any> | null = null;

  /**
   * Normalizes a path by removing trailing slashes for consistent comparison.
   * This prevents duplicate navigations when paths differ only by trailing slash.
   */
  private normalizePath(path: string | undefined): string {
    if (!path) {
      return '/';
    }
    return path.replace(TRAILING_SLASH_REGEX, '') || '/';
  }

  historyPush(path: string) {
    // Skip navigation if already at this path to prevent navigation loops
    // This is critical for embedded mode where shell and console routers can conflict
    if (this.normalizePath(this._location?.pathname) === this.normalizePath(path)) {
      return;
    }
    uiState.pathName = path;
    api.errors = [];
    this._navigate?.(path);
  }

  historyReplace(path: string) {
    // Skip navigation if already at this path to prevent navigation loops
    if (this.normalizePath(this._location?.pathname) === this.normalizePath(path)) {
      return;
    }
    uiState.pathName = path;
    api.errors = [];
    this._navigate?.(path, { replace: true });
  }

  historyLocation() {
    return this._location;
  }

  setNavigate(fn: NavigateFn) {
    if (this._navigate === fn || !fn) {
      return;
    }
    this._navigate = fn;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Router type is complex and varies based on route tree
  setRouter(router: Router<any, any, any>) {
    if (this._router === router || !router) {
      return;
    }
    this._router = router;
  }

  setLocation(location: ParsedLocation) {
    if (this._location === location || !location) {
      return;
    }
    this._location = location;
  }

  get location(): ParsedLocation {
    if (!this._location) {
      throw new Error('Location is not initialized. Make sure RouterSync is mounted.');
    }
    return this._location;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Router type is complex and varies based on route tree
  get router(): Router<any, any, any> {
    if (!this._router) {
      throw new Error('Router is not initialized. Make sure RouterSync is mounted.');
    }
    return this._router;
  }

  onRefresh: () => void = () => {
    // intended for pages to set
  };

  searchMessagesFunc?: (source: 'auto' | 'manual') => void;
}
export const appGlobal = new AppGlobal();
