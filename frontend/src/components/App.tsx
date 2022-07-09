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

import { Component, ReactNode } from 'react';
import { observer } from 'mobx-react';
import { Layout, PageHeader, Button, Popover } from 'antd';
import { uiSettings } from '../state/ui';
import { RouteView, RouteMenu, } from './routes';
import { RenderTrap } from './misc/common';
import { prettyMilliseconds } from '../utils/utils';
import { api, REST_CACHE_DURATION_SEC } from '../state/backendApi';
import { NavLink, Switch, Route, Link } from 'react-router-dom';
import { Route as AntBreadcrumbRoute } from 'antd/lib/breadcrumb/Breadcrumb';
import { animProps_logo, MotionDiv } from '../utils/animationProps';
import { ErrorDisplay } from './misc/ErrorDisplay';
import { uiState } from '../state/uiState';
import { appGlobal } from '../state/appGlobal';
import RedpandaLogo from '../assets/redpanda/redpanda-color.svg';
import RedpandaIcon from '../assets/redpanda/icon-color.svg';
import { ErrorBoundary } from './misc/ErrorBoundary';
import { IsDev, basePathS, IsCI, AppFeatures } from '../utils/env';
import { UserProfile } from './misc/UserButton';
import fetchWithTimeout from '../utils/fetchWithTimeout';
import { UserData } from '../state/restInterfaces';
import Login from './misc/login';
import LoginCompletePage from './misc/login-complete';
import env, { getBuildDate } from '../utils/env';
import { MenuFoldOutlined, MenuUnfoldOutlined, GithubFilled, TwitterOutlined, LinkedinFilled, SlackSquareOutlined } from '@ant-design/icons';
import { LayoutBypass, } from '../utils/tsxUtils';
import { UserPreferencesButton } from './misc/UserPreferences';
import { featureErrors } from '../state/supportedFeatures';
import { renderErrorModals } from './misc/ErrorModal';
import { SyncIcon, ChevronRightIcon } from '@primer/octicons-react';
import { AnimatePresence, motion } from 'framer-motion';

const { Content, Footer, Sider } = Layout;


const siderCollapsedWidth = 80;


const VersionInfo = () => {
    const appName = 'Redpanda Console';
    let mode = '';
    if (IsDev) mode = ' - DEV';
    if (IsCI) mode = ' - CI';

    let ref = env.REACT_APP_CONSOLE_GIT_REF;
    if (!ref || ref == 'master') ref = '';

    let sha = IsDev
        ? '<no git sha in dev>'
        : env.REACT_APP_CONSOLE_GIT_SHA.slice(0, 7);

    const buildDate = IsDev
        ? new Date()
        : getBuildDate();

    return <>
        <div className="versionTitle">{appName} {mode}</div>
        <div className="versionDate">(built {buildDate?.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })})</div>
        <div className="versionGitData">{ref} {sha}</div>
    </>;
};

const SideBar = observer(() =>
    <Layout className="sideBar" >
        {/* Logo */}
        <div>
            <Link to="/">
                {/* Logo Image */}
                <AnimatePresence initial={false} presenceAffectsLayout >
                    {uiSettings.sideBarOpen
                        ? <motion.img alt="logo" key="logoExpanded" src={RedpandaLogo} {...animProps_logo} />
                        : <motion.img alt="logo" key="logoCollapsed" src={RedpandaIcon}   {...animProps_logo} />
                    }
                </AnimatePresence>
            </Link>
        </div>

        {/* Menu */}
        <Content className="scroll-on-hover-y">
            <RouteMenu />
        </Content>

        {/* Profile */}
        <UserProfile />


        {/* Toggle */}
        <Footer className="sideBarToggle" onClick={() => { uiSettings.sideBarOpen = !uiSettings.sideBarOpen; }}>
            {uiSettings.sideBarOpen
                ? <MenuFoldOutlined className="icon" />
                : <MenuUnfoldOutlined className="icon" />}
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
        className="sider"
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
            When switching pages, any data older than <span className="codeBox">{prettyMilliseconds(REST_CACHE_DURATION_SEC * 1000)}</span> will be refreshed automatically.
        </div>;
        // TODO: small table that shows what cached data we have and how old it is
    };

    // Track how many requests we've sent in total
    if (api.activeRequests.length == 0) lastRequestCount = 0;
    else lastRequestCount = Math.max(lastRequestCount, api.activeRequests.length);

    const countStr = lastRequestCount > 1
        ? `${lastRequestCount - api.activeRequests.length} / ${lastRequestCount}`
        : '';

    // maybe we need to use the same 'no vertical expansion' trick:
    return <div className="dataRefreshButton">
        {
            api.activeRequests.length == 0
                ?
                <>
                    <Popover title="Force Refresh" content={refreshTextFunc} placement="rightTop" overlayClassName="popoverSmall" >
                        <Button icon={< SyncIcon size={16} />} shape="circle" className="hoverButton" onClick={() => appGlobal.onRefresh()} />
                    </Popover>
                    {/* <span style={{ paddingLeft: '.2em', fontSize: '80%' }}>fetched <b>1 min</b> ago</span> */}
                </>
                :
                <>
                    <span className="spinner" style={{ marginLeft: '8px', width: spinnerSize, height: spinnerSize }} />
                    <span className="pulsating" style={{ padding: '0 10px', fontSize: '80%', userSelect: 'none' }}>Fetching data... {countStr}</span>
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
        ? <>
            <div className="breadcrumbLast">{r.breadcrumbName}</div>
            <LayoutBypass justifyContent="start">
                <DataRefreshButton />
            </LayoutBypass>
        </>
        : <NavLink to={r.path}>{r.breadcrumbName}</NavLink>;

    return <MotionDiv identityKey={uiState.pageTitle} className="pageTitle" style={{ display: 'flex', paddingRight: '16px', alignItems: 'center', marginBottom: '10px' }}>
        <PageHeader
            breadcrumb={{
                routes: breadcrumbs,
                separator: <LayoutBypass width="10px"><ChevronRightIcon size={14} verticalAlign="unset" /></LayoutBypass>,
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
            <a href="https://github.com/redpanda-data/console" title="Visit Redpanda Console's GitHub repository" target="_blank" rel="noopener noreferrer">
                <GithubFilled />
            </a>
            <a href="https://redpanda.com/slack" title="Slack" target="_blank" rel="noopener noreferrer">
                <SlackSquareOutlined />
            </a>
            <a href="https://twitter.com/redpandadata" title="Twitter" target="_blank" rel="noopener noreferrer">
                <TwitterOutlined />
            </a>
            <a href="https://www.linkedin.com/company/vectorized-io" title="LinkedIn" target="_blank" rel="noopener noreferrer">
                <LinkedinFilled />
            </a>
        </div>

        {/* Version Info */}
        <div className="versionText">
            <VersionInfo />
        </div>
    </Footer>;
};

const AppContent = observer(() =>
    <Layout className="overflowYOverlay" id="mainLayout">

        <RenderTrap name="AppContentLayout" />

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
        const r = this.loginHandling(); // Complete login, or fetch user if needed
        if (r) return r;

        return (
            <ErrorBoundary>
                {/* {IsDev && <DebugDisplay />} */}
                <Switch>
                    {/* Login (and callbacks) */}
                    <Route exact path="/login" component={Login} />
                    <Route path="/login/callbacks/:provider" render={p => <LoginCompletePage provider={p.match.params.provider} match={p.match} />}></Route>

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

    loginHandling(): JSX.Element | null {
        if (!AppFeatures.SINGLE_SIGN_ON)
            return null;

        const preLogin = <div style={{ background: 'rgb(233, 233, 233)', height: '100vh' }} />;
        const path = window.location.pathname.removePrefix(basePathS ?? '');
        const devPrint = function (str: string) { if (IsDev) console.log(`loginHandling (${path}): ` + str); };

        if (path.startsWith('/login'))
            return null; // already in login process, don't interrupt!

        if (api.userData === null && !path.startsWith('/login')) {
            devPrint('known not logged in, hard redirect');
            window.location.pathname = basePathS + '/login'; // definitely not logged in, and in wrong url: hard redirect!
            return preLogin;
        }

        if (api.userData === undefined) {
            devPrint('user is undefined (probably a fresh page load)');

            fetchWithTimeout('./api/users/me', 10 * 1000).then(async r => {
                if (r.ok) {
                    devPrint('user fetched');
                    api.userData = await r.json() as UserData;
                } else if (r.status == 401) { // unauthorized / not logged in
                    devPrint('not logged in');
                    api.userData = null;
                } else if (r.status == 404) { // not found: server must be non-business version
                    devPrint('frontend is configured as business-version, but backend is non-business-version -> will create a local fake user for debugging');
                    uiState.isUsingDebugUserLogin = true;
                    api.userData = {
                        canViewConsoleUsers: false,
                        canListAcls: true,
                        canListQuotas: true,
                        canPatchConfigs: true,
                        canReassignPartitions: true,
                        seat: null as any,
                        user: { providerID: -1, providerName: 'debug provider', id: 'debug', internalIdentifier: 'debug', meta: { avatarUrl: '', email: '', name: 'local fake user for debugging' } }
                    };
                }
            });

            return preLogin;
        } else {
            if (!uiState.isUsingDebugUserLogin)
                devPrint('user is set: ' + JSON.stringify(api.userData));
            return null;
        }
    }
}


@observer
class FeatureErrorCheck extends Component {

    render() {
        if (featureErrors.length > 0) {
            const allErrors = featureErrors.join(' ');
            throw new Error(allErrors);
        }
        return null;
    }
}
