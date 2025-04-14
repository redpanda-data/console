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

import type { History } from "history";
import type { Location, NavigateFunction } from "react-router-dom";
import { api } from "./backendApi";
import { uiState } from "./uiState";

class AppGlobal {
  private _navigate = null as unknown as NavigateFunction;
  private _location = null as unknown as Location;
  // private _history = null as unknown as History<any>;
  // get history() {
  //   return this._history;
  // }

  // set history(h: History<any>) {
  //   if (this._history === h || !h) return;
  //   if (this._history) throw new Error('_history should not be overwritten');

  //   this._history = h;

  //   h.listen((location, _action) => {
  //     api.errors = [];
  //     uiState.pathName = location.pathname;
  //   });
  //   uiState.pathName = h.location.pathname;
  // }

  historyPush(path: string) {
    uiState.pathName = path; // TODO @Draho - ensure uiState is correct after the actual navigating finishes
    return this._navigate(path);
  }
  historyReplace(path: string) {
    uiState.pathName = path;
    return this._navigate(path, { replace: true });
  }
  historyLocation() {
    return this._location;
  }

  set navigate(n: NavigateFunction) {
    // if (this._navigate === n || !n) return;
    // if (this._navigate) throw new Error('_navigate should not be overwritten');

    this._navigate = n;
  }

  get location(): Location {
    if (!this._location) {
      throw new Error("Location is not initialized. Make sure HistorySetter is mounted.");
    }
    return this._location;
  }

  set location(l: Location) {
    // if (this._location === l || !l) return;
    // if (this._location) throw new Error('_location should not be overwritten');

    this._location = l;
  }

  onRefresh: () => void = () => {
    // intended for pages to set
  };

  searchMessagesFunc?: (source: "auto" | "manual") => void = undefined;
}
export const appGlobal = new AppGlobal();
