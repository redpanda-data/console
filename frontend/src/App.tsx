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

import { BrowserRouter } from 'react-router-dom';
import { observer } from 'mobx-react';
import { Container, Grid, redpandaToastOptions, Sidebar } from '@redpanda-data/ui';
import { uiSettings } from './state/ui';
import { createVisibleSidebarItems } from './components/routes';
import { ErrorBoundary } from './components/misc/ErrorBoundary';
import { UserProfile } from './components/misc/UserButton';
import { ChakraProvider, redpandaTheme } from '@redpanda-data/ui';
import { APP_ROUTES } from './components/routes';
import AppContent from './components/layout/Content';
import RequireAuth from './components/RequireAuth';
import HistorySetter from './components/misc/HistorySetter';
import { isEmbedded, setup } from './config';
import { getBasePath } from './utils/env';
import { useEffect } from 'react';
import Head from 'next/head';

const AppSidebar = observer(() => {
    const sidebarItems = createVisibleSidebarItems(APP_ROUTES);
    return (
        <Sidebar items={sidebarItems} isCollapsed={!uiSettings.sideBarOpen}>
            <UserProfile />
        </Sidebar>
    )
});


const App = () => {
    useEffect(() => {
        setup({});
    }, [])

    return (
        <BrowserRouter basename={getBasePath()}>
            <Head>
                <title>Redpanda Console</title>
            </Head>
            <HistorySetter />
            <ChakraProvider theme={redpandaTheme} toastOptions={redpandaToastOptions}>
                <ErrorBoundary>
                    <RequireAuth>
                        {isEmbedded()
                            ? <AppContent />
                            : <Grid templateColumns="auto 1fr" minH="100vh">
                                <AppSidebar />
                                <Container width="full" maxWidth="1500px" as="main" pt="8" px="12">
                                    <AppContent />
                                </Container>
                            </Grid>
                        }
                    </RequireAuth>
                </ErrorBoundary>
            </ChakraProvider>
        </BrowserRouter>
    )

}

export default observer(App);
