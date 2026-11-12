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

import type { AnyRouter, ParsedLocation } from '@tanstack/react-router';

import { uiState } from './ui-state';
import { isPresent } from '../utils/type-guards';

type NavigateFn = (to: string, options?: { replace?: boolean }) => void;

// Regex for normalizing paths by removing trailing slashes
const TRAILING_SLASH_REGEX = /\/+$/;

class AppGlobal {
  private _navigate: NavigateFn | null = null;
  private _location: ParsedLocation | null = null;
  private clearApiErrors = () => {
    // There is no API error cache before its owner registers this callback.
  };

  setClearApiErrors(clear: () => void) {
    this.clearApiErrors = clear;
  }
  private _router: AnyRouter | null = null;

  /**
   * Normalizes a path by removing trailing slashes for consistent comparison.
   * This prevents duplicate navigations when paths differ only by trailing slash.
   */
  private normalizePath(path: string | undefined): string {
    if (!(path !== null && path !== undefined && path !== '')) {
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
    this.clearApiErrors();
    this._navigate?.(path);
  }

  historyReplace(path: string) {
    // Skip navigation if already at this path to prevent navigation loops
    if (this.normalizePath(this._location?.pathname) === this.normalizePath(path)) {
      return;
    }
    uiState.pathName = path;
    this.clearApiErrors();
    this._navigate?.(path, { replace: true });
  }

  historyLocation() {
    return this._location;
  }

  setNavigate(fn: NavigateFn) {
    if (this._navigate === fn || !isPresent(fn)) {
      return;
    }
    this._navigate = fn;
  }

  setRouter(router: AnyRouter) {
    if (this._router === router || !isPresent(router)) {
      return;
    }
    this._router = router;
  }

  setLocation(location: ParsedLocation) {
    if (this._location === location || !isPresent(location)) {
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

  get router(): AnyRouter {
    if (!this._router) {
      throw new Error('Router is not initialized. Make sure RouterSync is mounted.');
    }
    return this._router;
  }

  onRefresh: (() => void) | (() => Promise<unknown>) = () => {
    // intended for pages to set
  };

  searchMessagesFunc?: (source: 'auto' | 'manual') => void;
}
export const appGlobal = new AppGlobal();
