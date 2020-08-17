import React from "react";
import ReactDOM from "react-dom";
import {
    BrowserRouter,
    withRouter,
    RouteComponentProps
} from "react-router-dom";
import * as serviceWorker from "./serviceWorker";

import "antd/dist/antd.css";
import "./index.scss";
import 'mobx-react-lite/batchingForReactDom'

import App from "./components/App";
import { appGlobal } from "./state/appGlobal";
import { basePathS } from "./utils/env";

const HistorySetter = withRouter((p: RouteComponentProps) => {
    appGlobal.history = p.history;
    return <></>;
});


// > A properly formatted basename should have a leading slash, but no trailing slash.
// https://reactrouter.com/web/api/BrowserRouter

ReactDOM.render(
    <BrowserRouter basename={basePathS}>
        <HistorySetter />
        <App />
    </BrowserRouter>,
    document.getElementById("root")
);

serviceWorker.unregister();
