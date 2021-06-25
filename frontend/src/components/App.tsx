import React, { Component, ReactNode } from 'react';
import { observer } from "mobx-react";
import { Layout, Menu, PageHeader, Button, Tooltip, Popover, Dropdown } from 'antd';
import { uiSettings } from '../state/ui';
import { CreateRouteMenuItems, RouteView, RouteMenu, } from './routes';
import { RenderTrap, DebugDisplay, UpdatePopup } from './misc/common';
import { DebugTimerStore, prettyMilliseconds } from '../utils/utils';
import { toJson } from "../utils/jsonUtils";
import { api, REST_CACHE_DURATION_SEC } from '../state/backendApi';
import { NavLink, Switch, Route } from 'react-router-dom';
import { Route as AntBreadcrumbRoute } from 'antd/lib/breadcrumb/Breadcrumb';
import { MotionDiv } from '../utils/animationProps';
import { ErrorDisplay } from './misc/ErrorDisplay';
import { uiState } from '../state/uiState';
import { appGlobal } from '../state/appGlobal';

import logo2 from '../assets/logo2.png';
import { ErrorBoundary } from './misc/ErrorBoundary';
import { IsDev, AppName, IsBusiness, basePathS } from '../utils/env';
import { UserProfile } from './misc/UserButton';
import fetchWithTimeout from '../utils/fetchWithTimeout';
import { UserData } from '../state/restInterfaces';
import Login from './misc/login';
import LoginCompletePage from './misc/login-complete';
import env, { getBuildDate } from '../utils/env';
import { MenuFoldOutlined, MenuUnfoldOutlined, ReloadOutlined, GithubFilled, UserOutlined, TwitterOutlined, LinkedinFilled } from '@ant-design/icons';
import { makeObservable, observable } from 'mobx';
import { SyncIcon, ChevronRightIcon, ToolsIcon } from '@primer/octicons-v2-react';
import { LayoutBypass, RadioOptionGroup, toSafeString } from '../utils/tsxUtils';
import { UserPreferencesButton } from './misc/UserPreferences';
import { featureErrors } from '../state/supportedFeatures';
import { renderErrorModals } from './misc/ErrorModal';

const { Content, Footer, Sider } = Layout;


const siderCollapsedWidth = 80;


const DebugUserInfoBar = () => (
    <div style={{ background: '#FFCD22', padding: '2rem', fontSize: '120%', fontWeight: 'bold', textAlign: 'center', display: 'flex', placeContent: 'center' }}>
        This frontend has been compiled for usage with Kowl-Business, but the backend server is the free version of Kowl. <br />
        You have been logged in as a locally created fake user to help debugging.
    </div>
);

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
            <span>{env.REACT_APP_KOWL_GIT_REF != 'master' && env.REACT_APP_KOWL_GIT_REF + "-"}</span>
            <span>{env.REACT_APP_KOWL_GIT_SHA.slice(0, 7)}</span>
        </div>

        <div className='versionDate'>
            (built {getBuildDate()?.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })})
        </div>

        {IsBusiness && <div className='versionGitData'>
            <span>{env.REACT_APP_KOWL_BUSINESS_GIT_REF != 'master' &&
                env.REACT_APP_KOWL_BUSINESS_GIT_REF + "-"}</span>
            <span>{env.REACT_APP_KOWL_BUSINESS_GIT_SHA.slice(0, 7)}</span>
        </div>}
    </>;

    // Release
    //   Kowl Business v1.2.3
    //   b27c2a3f f3acf4b7
    return <>
        <div className='versionTitle'>{AppName} - {IsBusiness ? env.REACT_APP_KOWL_BUSINESS_GIT_REF : env.REACT_APP_KOWL_GIT_REF}</div>
        <div className='versionDate'>
            (built {getBuildDate()?.toDateString()})
        </div>
        <div className='versionGitData'>{env.REACT_APP_KOWL_GIT_SHA.slice(0, 7)}</div>
        {IsBusiness && <div className='versionGitData'>{env.REACT_APP_KOWL_BUSINESS_GIT_SHA.slice(0, 7)}</div>}
    </>;

};
const SideBar = observer(() =>
    <Layout style={{
        display: 'flex', flex: 1, flexDirection: 'column',
        height: '100vh',
        background: 'hsl(217deg, 27%, 20%)'
    }}>
        <RenderTrap name='SideBarContent' />

        {/* Logo */}
        <div style={{ background: 'rgba(0,0,0, 0)', padding: '1px' }}>

            <div style={{ position: 'relative' }}>

                {/* Logo Image */}
                <img src={logo2} alt="logo" style={{
                    height: uiSettings.sideBarOpen ? '130px' : '65px',
                    transition: 'all 200ms',
                    width: 'auto', display: 'block', margin: 'auto', cursor: 'pointer',
                    opacity: 0.8, mixBlendMode: 'overlay',
                    marginTop: uiSettings.sideBarOpen ? '3em' : '.5em'
                }}
                    onClick={() => { appGlobal.history.push('/'); }}
                />

                {/* Title Text */}
                <div style={{
                    position: 'absolute',
                    transition: 'all 200ms',
                    width: '100%',
                    top: uiSettings.sideBarOpen ? '-40px' : '-80px',
                    opacity: uiSettings.sideBarOpen ? 1 : 0,

                    fontFamily: "'Quicksand', sans-serif",
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '6px',
                    transform: 'translateX(4px)',
                    fontSize: '1.8rem',
                    textAlign: 'center',
                    color: 'hsl(217deg, 26%, 38%)',
                }}>
                    Kowl
                </div>

                {/* Separator Line */}
                <div style={{ position: 'relative', borderTop: '0px solid hsla(0deg, 0%, 100%, 0.13)', margin: '.5em 1em', marginTop: '1em' }} />
            </div>
        </div>

        {/* Menu */}
        <Content className="scroll-on-hover-y">
            <RouteMenu />
        </Content>

        {/* Profile */}
        <UserProfile />

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
    <Sider collapsible collapsed={!uiSettings.sideBarOpen} collapsedWidth={siderCollapsedWidth}
        trigger={null}
        width={sideBarWidthDefault}
        style={{ background: 'white', cursor: 'default' }}
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
    return <div style={{
        height: '32px',
        display: 'inline-flex',
        marginLeft: '10px',

        background: 'hsl(216, 66%, 92%)',
        color: 'hsl(205, 100%, 50%)',

        borderRadius: '30px',
        placeContent: 'center',
        placeItems: 'center',
        whiteSpace: 'nowrap',
    }}>
        {
            api.activeRequests.length == 0
                ?
                <>
                    <Popover title='Force Refresh' content={refreshTextFunc} placement='rightTop' overlayClassName='popoverSmall' >
                        <Button icon={< SyncIcon size={16} />} shape='circle' className='hoverButton' style={{ color: 'hsl(205, 100%, 50%)', background: 'transparent' }} onClick={() => appGlobal.onRefresh()} />
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
    const discordIcon = <svg viewBox="0 0 245 240" height="1em" fill="currentColor"><path d="M104.4 103.9c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1.1-6.1-4.5-11.1-10.2-11.1zM140.9 103.9c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1s-4.5-11.1-10.2-11.1z" /><path d="M189.5 20h-134C44.2 20 35 29.2 35 40.6v135.2c0 11.4 9.2 20.6 20.5 20.6h113.4l-5.3-18.5 12.8 11.9 12.1 11.2 21.5 19V40.6c0-11.4-9.2-20.6-20.5-20.6zm-38.6 130.6s-3.6-4.3-6.6-8.1c13.1-3.7 18.1-11.9 18.1-11.9-4.1 2.7-8 4.6-11.5 5.9-5 2.1-9.8 3.5-14.5 4.3-9.6 1.8-18.4 1.3-25.9-.1-5.7-1.1-10.6-2.7-14.7-4.3-2.3-.9-4.8-2-7.3-3.4-.3-.2-.6-.3-.9-.5-.2-.1-.3-.2-.4-.3-1.8-1-2.8-1.7-2.8-1.7s4.8 8 17.5 11.8c-3 3.8-6.7 8.3-6.7 8.3-22.1-.7-30.5-15.2-30.5-15.2 0-32.2 14.4-58.3 14.4-58.3 14.4-10.8 28.1-10.5 28.1-10.5l1 1.2c-18 5.2-26.3 13.1-26.3 13.1s2.2-1.2 5.9-2.9c10.7-4.7 19.2-6 22.7-6.3.6-.1 1.1-.2 1.7-.2 6.1-.8 13-1 20.2-.2 9.5 1.1 19.7 3.9 30.1 9.6 0 0-7.9-7.5-24.9-12.7l1.4-1.6s13.7-.3 28.1 10.5c0 0 14.4 26.1 14.4 58.3 0 0-8.5 14.5-30.6 15.2z" /></svg>;

    return <Footer className="footer">
        {/* Social Media Links */}
        <div className="links">
            <a href="https://github.com/cloudhut/kowl" title="Visit Kowl's GitHub repository" target='_blank' rel='noopener'>
                <GithubFilled />
            </a>
            <a href="https://discord.gg/KQj7P6v" target='_blank' rel='noopener'>
                <span role='img' className='anticon' style={{ fontSize: '120%' }}>
                    {discordIcon}
                </span>
            </a>
            <a href="https://twitter.com/cloudhut_kowl" target='_blank' rel='noopener'>
                <TwitterOutlined />
            </a>
            <a href="https://www.linkedin.com/company/kowl" target='_blank' rel='noopener'>
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
    <Layout className='overflowYOverlay' style={{ borderLeft: '1px solid #ddd' }} id="mainLayout">

        <RenderTrap name='AppContentLayout' />

        {/* Debug User */}
        {uiState.isUsingDebugUserLogin && <DebugUserInfoBar />}

        {/* Page */}
        <Content style={{ display: 'flex', flexDirection: 'column', padding: '8px 6px 0px 4px', zIndex: 1 }}>
            <AppPageHeader />

            <ErrorDisplay>
                <RouteView />
            </ErrorDisplay>

            <AppFooter />
        </Content>

        <UpdatePopup />
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
                    <Route exact path='/login' component={Login} />
                    <Route path='/login/callbacks/:provider' render={p => <LoginCompletePage provider={p.match.params.provider} match={p.match} />}></Route>

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
        if (!IsBusiness)
            return null; // free version has no login handling

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
                        canManageKowl: false,
                        canListAcls: true,
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
            const allErrors = featureErrors.join(" ");
            throw new Error(allErrors);
        }
        return null;
    }
}