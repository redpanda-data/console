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
import { loader } from '@monaco-editor/react';
import ReactDOM from 'react-dom';
import {
    BrowserRouter,
    withRouter,
    RouteComponentProps
} from 'react-router-dom';
import { configure, when } from 'mobx';

// import "antd/dist/antd.css";
import 'antd/dist/antd.variable.min.css';
import './index.scss';

import App from './components/App';
import { appGlobal } from './state/appGlobal';
import { basePathS, IsBusiness } from './utils/env';
import { api } from './state/backendApi';
import { ConfigProvider } from 'antd';

import './assets/fonts/open-sans.css';
import './assets/fonts/poppins.css';
import './assets/fonts/quicksand.css';
import './assets/fonts/kumbh-sans.css';


const exampleColors = {
    antdDefaultBlue: '#1890FF',
    green: '#25B864', // chosen to make it really obvious when changing the theme-color works.
    debugRed: '#FF0000',
} as const;


// Set theme color for ant-design
ConfigProvider.config({
    theme: {
        primaryColor: exampleColors.green,

        infoColor: exampleColors.debugRed,
        successColor: exampleColors.debugRed,
        processingColor: exampleColors.debugRed,
        // errorColor: exampleColors.debugRed,
        warningColor: exampleColors.debugRed,
    },
});

// Tell monaco editor where to load dependencies from
loader.config({ paths: { vs: '/static/js/vendor/monaco/package/min/vs' } });

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
    when(
        () => Boolean(api.userData),
        () => {
            setImmediate(() => {
                api.refreshSupportedEndpoints(true);
            });
        }
    );
}

ReactDOM.render(
    <BrowserRouter basename={basePathS}>
        <HistorySetter />
        <App />
    </BrowserRouter>,
    document.getElementById('root')
);
