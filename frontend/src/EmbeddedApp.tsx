/* Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useEffect } from 'react';
import { loader } from '@monaco-editor/react';
import { unstable_HistoryRouter as ReactRouter, useNavigate } from 'react-router-dom';
import { configure, when } from 'mobx';

// import "antd/dist/antd.css";
import 'antd/dist/antd.variable.min.css';
import './index.scss';

// see https://github.com/remix-run/react-router/issues/8264
import { history } from './providers/history.provider';

import App from './components/App';
import { AppFeatures, IsDev } from './utils/env';
import { api } from './state/backendApi';
import { ConfigProvider } from 'antd';

import './assets/fonts/open-sans.css';
import './assets/fonts/poppins.css';
import './assets/fonts/quicksand.css';
import './assets/fonts/kumbh-sans.css';

import colors from './colors';
import { setConfig, SetConfigArguments } from './config';

export interface EmbeddedProps extends SetConfigArguments {
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
    basePath?: string;
};



let setupDone = false;
function setup(setupArgs: SetConfigArguments) {
    const config = setConfig(setupArgs);

    // Tell monaco editor where to load dependencies from
    loader.config({ paths: { vs: `${config.assetsPath}/static/js/vendor/monaco/package/min/vs` } });

    if (setupDone) {
        if (IsDev)
            console.error('setup was already called');
        return;
    }
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
    setupDone = true;
}

export default function EmbeddedApp({basePath, ...p}: EmbeddedProps) {
    const navigate = useNavigate();

    useEffect(
        () => {
            const shellNavigationHandler = (event: Event) => {
                const pathname = (event as CustomEvent<string>).detail;
                const { pathname: currentPathname } = history.location;
                if (currentPathname === pathname) {
                    return;
                }
                navigate(pathname);
            };

            window.addEventListener(
                '[shell] navigated',
                shellNavigationHandler
            );

            return () => {
                window.removeEventListener(
                    '[shell] navigated',
                    shellNavigationHandler
                );
            };
    }, [navigate]);


    setup(p);

    return (
        <ReactRouter history={history} basename={basePath}>
            <App />
        </ReactRouter>
    );
}
