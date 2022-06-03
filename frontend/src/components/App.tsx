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

import React, { Component, ReactNode } from 'react';
import { observer } from "mobx-react";
import { Layout, Menu, PageHeader, Button, Tooltip, Popover, Dropdown } from 'antd';
import { uiSettings } from '../state/ui';
import { CreateRouteMenuItems, RouteView, RouteMenu, } from './routes';
import { RenderTrap, UpdatePopup } from './misc/common';
import { prettyMilliseconds } from '../utils/utils';
import { toJson } from "../utils/jsonUtils";
import { api, REST_CACHE_DURATION_SEC } from '../state/backendApi';
import { NavLink, Switch, Route, Link } from 'react-router-dom';
import { Route as AntBreadcrumbRoute } from 'antd/lib/breadcrumb/Breadcrumb';
import { MotionDiv } from '../utils/animationProps';
import { ErrorDisplay } from './misc/ErrorDisplay';
import { uiState } from '../state/uiState';
import { appGlobal } from '../state/appGlobal';
import PandaFaceOpen from '../assets/redpanda/PandaFaceOpen.png';
import RedpandaConsoleLogo from '../assets/redpanda/redpandaConsole.svg';
import VSymbolLogo from '../assets/redpanda/v_symbol.svg';
import { ErrorBoundary } from './misc/ErrorBoundary';
import { IsDev, AppName, IsBusiness, basePathS } from '../utils/env';
import env, { getBuildDate } from '../utils/env';
import { MenuFoldOutlined, MenuUnfoldOutlined, GithubFilled, TwitterOutlined, LinkedinFilled, SlackSquareOutlined } from '@ant-design/icons';
import { LayoutBypass, } from '../utils/tsxUtils';
import { UserPreferencesButton } from './misc/UserPreferences';
import { featureErrors } from '../state/supportedFeatures';
import { renderErrorModals } from './misc/ErrorModal';
import { SyncIcon, ChevronRightIcon } from '@primer/octicons-react';

const { Content, Footer, Sider } = Layout;


const siderCollapsedWidth = 80;


const VersionInfo = () => {
    // Local Development Mode
    //   Kowl - DEV
    if (IsDev) return <>
        <div className='versionTitle'>{AppName} DEV</div>
        <div className='versionDate'>Built {new Date().toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })}</div>
        <div className='versionGitData'>{"abcdef0"}/{"0fedcba"}</div>
    </>;

    // Continuous Delivery Mode
    //   Kowl Business - CI
    //   b27c2a3f f3acf4b7
    if (env.REACT_APP_BUILT_FROM_PUSH) return <>
        <div className='versionTitle'>{AppName} CI</div>
        <div>
            <span>{env.REACT_APP_CONSOLE_GIT_REF != 'master' && env.REACT_APP_CONSOLE_GIT_REF + "-"}</span>
            <span>{env.REACT_APP_CONSOLE_GIT_SHA.slice(0, 7)}</span>
        </div>

        <div className='versionDate'>
            (built {getBuildDate()?.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })})
        </div>

        {IsBusiness && <div className='versionGitData'>
            <span>{env.REACT_APP_CONSOLE_BUSINESS_GIT_REF != 'master' &&
                env.REACT_APP_CONSOLE_BUSINESS_GIT_REF + "-"}</span>
            <span>{env.REACT_APP_CONSOLE_BUSINESS_GIT_SHA.slice(0, 7)}</span>
        </div>}
    </>;

    // Release
    //   Kowl Business v1.2.3
    //   b27c2a3f f3acf4b7
    return <>
        <div className='versionTitle'>{AppName} - {IsBusiness ? env.REACT_APP_CONSOLE_BUSINESS_GIT_REF : env.REACT_APP_CONSOLE_GIT_REF}</div>
        <div className='versionDate'>
            (built {getBuildDate()?.toDateString()})
        </div>
        <div className='versionGitData'>{env.REACT_APP_CONSOLE_GIT_SHA.slice(0, 7)}</div>
        {IsBusiness && <div className='versionGitData'>{env.REACT_APP_CONSOLE_BUSINESS_GIT_SHA.slice(0, 7)}</div>}
    </>;

};
const SideBar = observer(() =>
    <Layout className='sideBar' >
        {/* Logo */}
        <div>
            <Link to='/'>
                {/* Logo Image */}
                {uiSettings.sideBarOpen
                    ? <img src={RedpandaConsoleLogo} alt="logo" />
                    : <img src={VSymbolLogo} alt="logo" />
                }
            </Link>
        </div>

        {/* Menu */}
        <Content className="scroll-on-hover-y">
            <RouteMenu />
        </Content>

        {/* Profile */}


        {/* Toggle */}
        <Footer className='sideBarToggle' onClick={() => { uiSettings.sideBarOpen = !uiSettings.sideBarOpen; }}>
            {uiSettings.sideBarOpen
                ? <MenuFoldOutlined className='icon' />
                : <MenuUnfoldOutlined className='icon' />}
        </Footer>
    </Layout>
);

const sideBarWidthDefault = '230px';
const AppSide = observer(() => (
    <Sider
        collapsible
        collapsed={!uiSettings.sideBarOpen} collapsedWidth={siderCollapsedWidth}
        trigger={null}
        width={sideBarWidthDefault}
        className='sider'
        style={{ cursor: 'default' }}
    >
        <SideBar />
    </Sider>
));


let lastRequestCount = 0;
const DataRefreshButton = observer(() => {

    const spinnerSize = '16px';
    const refreshTextFunc = (): ReactNode => {
        return <div style={{ maxWidth: '350px' }}>
            Click to force a refresh of the data shown in the current page.
            When switching pages, any data older than <span className='codeBox'>{prettyMilliseconds(REST_CACHE_DURATION_SEC * 1000)}</span> will be refreshed automatically.
        </div>;
        // TODO: small table that shows what cached data we have and how old it is
    };

    // Track how many requests we've sent in total
    if (api.activeRequests.length == 0) lastRequestCount = 0;
    else lastRequestCount = Math.max(lastRequestCount, api.activeRequests.length);

    const countStr = lastRequestCount > 1
        ? `${lastRequestCount - api.activeRequests.length} / ${lastRequestCount}`
        : "";

    // maybe we need to use the same 'no vertical expansion' trick:
    return <div className='dataRefreshButton'>
        {
            api.activeRequests.length == 0
                ?
                <>
                    <Popover title='Force Refresh' content={refreshTextFunc} placement='rightTop' overlayClassName='popoverSmall' >
                        <Button icon={< SyncIcon size={16} />} shape='circle' className='hoverButton' onClick={() => appGlobal.onRefresh()} />
                    </Popover>
                    {/* <span style={{ paddingLeft: '.2em', fontSize: '80%' }}>fetched <b>1 min</b> ago</span> */}
                </>
                :
                <>
                    <span className='spinner' style={{ marginLeft: '8px', width: spinnerSize, height: spinnerSize }} />
                    <span className='pulsating' style={{ padding: '0 10px', fontSize: '80%', userSelect: 'none' }}>Fetching data... {countStr}</span>
                </>
        }
    </div>;
});

const AppPageHeader = observer(() => {

    const breadcrumbs = uiState.pageBreadcrumbs.map(v => ({ path: v.linkTo, breadcrumbName: v.title }));

    const selectedClusterName = uiState.selectedClusterName;
    if (selectedClusterName) {
        //const rootBreadcrumb: AntBreadcrumbRoute = { path: '', breadcrumbName: selectedClusterName };
        const rootBreadcrumb: AntBreadcrumbRoute = { path: '', breadcrumbName: 'Cluster' };
        breadcrumbs.unshift(rootBreadcrumb);
    }

    const breadcrumbRender = (r: AntBreadcrumbRoute, params: any) => (r.breadcrumbName === params.breadcrumbName && r.path === params.path)
        ? <span>
            <div className='breadcrumbLast'>{r.breadcrumbName}</div>
            <LayoutBypass justifyContent='start'>
                <DataRefreshButton />
            </LayoutBypass>
        </span>
        : <NavLink to={r.path}>{r.breadcrumbName}</NavLink>;

    return <MotionDiv identityKey={uiState.pageTitle} className='pageTitle' style={{ display: 'flex', paddingRight: '16px', alignItems: 'center', marginBottom: '10px' }}>
        <PageHeader
            breadcrumb={{
                routes: breadcrumbs,
                separator: <LayoutBypass width='10px'><ChevronRightIcon size={14} verticalAlign='unset' /></LayoutBypass>,
                params: breadcrumbs.last(),
                itemRender: breadcrumbRender
            }}
            title={null}
        />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <UserPreferencesButton />
        </div>
    </MotionDiv>;
});

const AppFooter = () => {

    return <Footer className="footer">
        {/* Social Media Links */}
        <div className="links">
            <a href="https://github.com/redpanda-data/kowl" title="Visit Redpanda Console's GitHub repository" target='_blank' rel='noopener'>
                <GithubFilled />
            </a>
            <a href="https://redpanda.com/slack" title="Slack" target='_blank' rel='noopener'>
                <SlackSquareOutlined />
            </a>
            <a href="https://twitter.com/redpandadata" title="Twitter" target='_blank' rel='noopener'>
                <TwitterOutlined />
            </a>
            <a href="https://www.linkedin.com/company/vectorized-io" title="LinkedIn" target='_blank' rel='noopener'>
                <LinkedinFilled />
            </a>
        </div>

        {/* Version Info */}
        <div className='versionText'>
            <VersionInfo />
        </div>
    </Footer>;
};

const AppContent = observer(() =>
    <Layout className='overflowYOverlay' id="mainLayout">

        <RenderTrap name='AppContentLayout' />

        {/* Page */}
        <Content style={{ display: 'flex', flexDirection: 'column', padding: '8px 6px 0px 4px', zIndex: 1 }}>
            <AppPageHeader />

            <ErrorDisplay>
                <RouteView />
            </ErrorDisplay>

            <AppFooter />
        </Content>

        {/* Currently disabled, read todo comment on UpdatePopup */}
        {/* <UpdatePopup /> */}
        {renderErrorModals()}

    </Layout>
);

@observer
export default class App extends Component {
    render(): JSX.Element {

        return (
            <ErrorBoundary>
                {/* {IsDev && <DebugDisplay />} */}
                <Switch>
                    {/* Login (and callbacks) */}


                    {/* Default View */}
                    <Route path="*">
                        <Layout style={{ height: '100vh', background: 'transparent', overflow: 'hidden' }}>
                            <AppSide />
                            <AppContent />
                        </Layout>
                    </Route>
                </Switch>
                <FeatureErrorCheck />
            </ErrorBoundary>
        );
    }
}


@observer
class FeatureErrorCheck extends Component {

    render() {
        if (featureErrors.length > 0) {
            const allErrors = featureErrors.join(" ");
            throw new Error(allErrors);
        }
        return null;
    }
}