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


import { History } from 'history';
import { api } from './backendApi';
import { uiState } from './uiState';

class AppGlobal {
    private _history = (null as unknown as History<any>);
    get history() { return this._history }

    set history(h: History<any>) {
        if (this._history === h || !h) return;
        if (this._history) throw new Error('_history should not be overwritten');

        this._history = h;

        h.listen((location, action) => {
            api.errors = [];
            uiState.pathName = location.pathname;
        });
        uiState.pathName = h.location.pathname;
    }

    onRefresh: (() => void) = () => {
        // intended for pages to set
    }
}
export const appGlobal = new AppGlobal();
