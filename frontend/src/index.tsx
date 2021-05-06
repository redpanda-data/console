import React from "react";
import ReactDOM from "react-dom";
import {
    BrowserRouter,
    withRouter,
    RouteComponentProps
} from "react-router-dom";
import * as serviceWorker from "./serviceWorker";
import { configure, when } from "mobx";

import "antd/dist/antd.css";
import "./index.scss";

import App from "./components/App";
import { appGlobal } from "./state/appGlobal";
import { basePathS, IsBusiness } from "./utils/env";
import { api } from "./state/backendApi";

const HistorySetter = withRouter((p: RouteComponentProps) => {
    appGlobal.history = p.history;
    return <></>;
});

// Configure MobX
configure({
    enforceActions: 'never',
    safeDescriptors: true,
});

// Get supported endpoints / kafka cluster version
// In the business version, that endpoint (like any other api endpoint) is
// protected, so we need to delay the call until the user is logged in.
if (!IsBusiness) {
    api.refreshSupportedEndpoints(true);
} else {
    when(() => Boolean(api.userData), () => {
        setImmediate(() => {
            api.refreshSupportedEndpoints(true);
        });
    });
}

ReactDOM.render(
    <BrowserRouter basename={basePathS}>
        <HistorySetter />
        <App />
    </BrowserRouter>,
    document.getElementById("root")
);

serviceWorker.unregister();
