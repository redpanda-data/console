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

import type { Location, NavigateFunction } from 'react-router-dom';
import { api } from './backendApi';
import { uiState } from './uiState';

class AppGlobal {
  private _navigate = null as unknown as NavigateFunction;
  private _location = null as unknown as Location;

  historyPush(path: string) {
    uiState.pathName = path;
    api.errors = [];
    return this._navigate(path);
  }
  historyReplace(path: string) {
    uiState.pathName = path;
    api.errors = [];
    return this._navigate(path, { replace: true });
  }
  historyLocation() {
    return this._location;
  }

  set navigate(n: NavigateFunction) {
    if (this._navigate === n || !n) return;

    this._navigate = n;
  }

  get location(): Location {
    if (!this._location) {
      throw new Error('Location is not initialized. Make sure HistorySetter is mounted.');
    }
    return this._location;
  }

  set location(l: Location) {
    if (this._location === l || !l) return;

    this._location = l;
  }

  onRefresh: () => void = () => {
    // intended for pages to set
  };

  searchMessagesFunc?: (source: 'auto' | 'manual') => void = undefined;
}
export const appGlobal = new AppGlobal();
