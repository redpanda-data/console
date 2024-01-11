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

import React from 'react';
import { BrowserRouter } from 'react-router-dom';

/**
 * NextJS can only import App Router CSS using _app or CSS modules.
 * Only exception is importing from packages such as antd.
 * TODO: We should eliminate using CSS files as much as possible and rely on Chakra instead.
 */
import 'antd/dist/antd.variable.min.css';



import { appGlobal } from './state/appGlobal';

import { SetConfigArguments, setup, embeddedAvailableRoutesObservable } from './config';
import HistorySetter from './components/misc/HistorySetter';
import AppContent from './components/layout/Content';
import { observer } from 'mobx-react';
import { ChakraProvider, redpandaTheme, redpandaToastOptions } from '@redpanda-data/ui';

export interface EmbeddedProps extends SetConfigArguments {
    /**
     * This is the base url that is used:
     * - when making api requests
     * - to setup the 'basename' in react-router
     *
     * In the simplest case this would be the exact url where the host is running,
     * for example "http://localhost:3001/"
     *
     * When running in cloud-ui the base most likely need to include a few more
     * things like cluster id, etc...
     * So the base would probably be "https://cloud.redpanda.com/NAMESPACE/CLUSTER/"
     */
    basePath?: string;
    /**
     * We want to get explicit confirmation from the Cloud UI (our parent) so that
     * we don't prematurely render console if the higher-order-component Console.tsx might rerender.
     * In the future we might decide to use memo() as well
     */
    isConsoleReadyToMount?: boolean;
}

function EmbeddedApp({ basePath, ...p }: EmbeddedProps) {
    React.useEffect(() => {
        const shellNavigationHandler = (event: Event) => {
            const pathname = (event as CustomEvent<string>).detail;
            const { pathname: currentPathname } = appGlobal.history.location;
            if (currentPathname === pathname || !embeddedAvailableRoutesObservable.routes.some((r) => r.path === pathname)) {
                return;
            }

            appGlobal.history.push(pathname);
        };

        window.addEventListener('[shell] navigated', shellNavigationHandler);

        return () => {
            window.removeEventListener('[shell] navigated', shellNavigationHandler);
        };
    }, []);

    setup(p);

    if (!p.isConsoleReadyToMount) {
        return null;
    }

    return (
        <BrowserRouter basename={basePath}>
            <HistorySetter />
            <ChakraProvider theme={redpandaTheme} toastOptions={redpandaToastOptions}>
                <AppContent />
            </ChakraProvider>
        </BrowserRouter>
    );
}

export default observer(EmbeddedApp);
