
import { History } from 'history';
import { api } from './backendApi';
import { uiState } from './uiState';


class AppGlobal {
    private _history = (null as unknown as History<any>);

    get history() { return this._history };

    set history(h: History<any>) {
        if (this._history === h || !h) return;
        if (this._history) throw new Error('_history should not be overwritten');

        this._history = h;

        h.listen((location, action) => {
            api.Errors = [];
            uiState.pathName = location.pathname;
        });
        uiState.pathName = h.location.pathname;
    };
}
export const appGlobal = new AppGlobal();