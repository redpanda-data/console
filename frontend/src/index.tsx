import React from "react";
import ReactDOM from "react-dom";
import {
    BrowserRouter,
    withRouter,
    RouteComponentProps
} from "react-router-dom";
import * as serviceWorker from "./serviceWorker";
import { configure } from "mobx";

import "antd/dist/antd.css";
import "./index.scss";

import App from "./components/App";
import { appGlobal } from "./state/appGlobal";
import { basePathS } from "./utils/env";
import { api } from "./state/backendApi";

const HistorySetter = withRouter((p: RouteComponentProps) => {
    appGlobal.history = p.history;
    return <></>;
});


configure({
    enforceActions: 'never',
    safeDescriptors: true,
})

// > A properly formatted basename should have a leading slash, but no trailing slash.
// https://reactrouter.com/web/api/BrowserRouter

api.refreshSupportedEndpoints(true);

ReactDOM.render(
    <BrowserRouter basename={basePathS}>
        <HistorySetter />
        <App />
    </BrowserRouter>,
    document.getElementById("root")
);

serviceWorker.unregister();
