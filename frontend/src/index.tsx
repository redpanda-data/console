import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter, withRouter, RouteComponentProps } from 'react-router-dom';
import * as serviceWorker from './serviceWorker';

import 'antd/dist/antd.css';
import './index.css';

import { History } from 'history';

import App from './components/App';
import { api } from './state/backendApi';
import { uiState } from './state/uiState';


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


const HistorySetter = withRouter((p: RouteComponentProps) => { appGlobal.history = p.history; return <></>; });

ReactDOM.render(
    (
        <BrowserRouter>
            <HistorySetter />
            <App />
        </BrowserRouter>
    ), document.getElementById('root'));


serviceWorker.unregister();