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
import { AppFeatures, basePathS } from './utils/env';
import { api } from './state/backendApi';
import { ConfigProvider } from 'antd';

import './assets/fonts/open-sans.css';
import './assets/fonts/poppins.css';
import './assets/fonts/quicksand.css';
import './assets/fonts/kumbh-sans.css';

import colors from './colors';

const HistorySetter = withRouter((p: RouteComponentProps) => {
    appGlobal.history = p.history;
    return <></>;
});

export type EmbeddedProps = {
    // This will be used as the 'Authorization' header in every api request
    bearerToken: string;

    // This is the base url that is used:
    //   - when making api requests
    //   - to setup the 'basename' in react-router
    //
    // In the simplest case this would be the exact url where the host is running,
    // for example "http://localhost:3001/"
    //
    // When running in cloud-ui the base most likely need to include a few more
    // things like cluster id, etc...
    // So the base would probably be "https://cloud.redpanda.com/NAMESPACE/CLUSTER/"
    //
    basePath: string;
};

let setupCount = 0;
function setup(p: EmbeddedProps) {
    setupCount++;

    // Set theme color for ant-design
    ConfigProvider.config({
        theme: {
            primaryColor: colors.brandOrange,

            infoColor: colors.brandBlue,
            successColor: colors.brandSuccess,
            // processingColor: colors.debugRed,
            errorColor: colors.brandError,
            warningColor: colors.brandWarning,
        },
    });

    // Tell monaco editor where to load dependencies from
    loader.config({ paths: { vs: (p.basePath ?? basePathS) + '/static/js/vendor/monaco/package/min/vs' } });

    // Configure MobX
    configure({
        enforceActions: 'never',
        safeDescriptors: true,
    });

    // Get supported endpoints / kafka cluster version
    // In the business version, that endpoint (like any other api endpoint) is
    // protected, so we need to delay the call until the user is logged in.
    if (!AppFeatures.SINGLE_SIGN_ON) {
        api.refreshSupportedEndpoints();
    } else {
        when(
            () => Boolean(api.userData),
            () => {
                setTimeout(() => {
                    api.refreshSupportedEndpoints();
                });
            }
        );
    }
}

export default function EmbeddedApp(p: EmbeddedProps) {
    if (setupCount == 0)
        setup(p);

    return (
        <BrowserRouter basename={p.basePath ?? basePathS}>
            <HistorySetter />
            <App />
        </BrowserRouter>
    );
}
