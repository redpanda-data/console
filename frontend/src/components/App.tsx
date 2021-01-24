import React, { Component, ReactNode } from 'react';
import { observer } from "mobx-react"
import { Layout, Menu, PageHeader, Button, Tooltip, Popover, Dropdown } from 'antd';
import { uiSettings } from '../state/ui';
import { CreateRouteMenuItems, RouteView, RouteMenu, } from './routes';
import { RenderTrap, DebugDisplay, UpdatePopup } from './misc/common';
import { DebugTimerStore, prettyMilliseconds, toJson } from '../utils/utils';
import { api, REST_CACHE_DURATION_SEC } from '../state/backendApi';
import { NavLink, Switch, Route } from 'react-router-dom';
import { Route as AntBreadcrumbRoute } from 'antd/lib/breadcrumb/Breadcrumb';
import { MotionDiv, MotionDivInvertedScale } from '../utils/animationProps';
import { ErrorDisplay } from './misc/ErrorDisplay';
import { uiState } from '../state/uiState';
import { appGlobal } from '../state/appGlobal';

import logo2 from '../assets/logo2.png';
import { ErrorBoundary } from './misc/ErrorBoundary';
import { IsDev, AppName, IsBusiness, basePathS } from '../utils/env';
import { UserButton } from './misc/UserButton';
import fetchWithTimeout from '../utils/fetchWithTimeout';
import { UserData } from '../state/restInterfaces';
import Login from './misc/login';
import LoginCompletePage from './misc/login-complete';
import env, { getBuildDate } from '../utils/env';
import { MenuFoldOutlined, MenuUnfoldOutlined, ReloadOutlined, GithubFilled, UserOutlined } from '@ant-design/icons';
import { observable } from 'mobx';
import { SyncIcon, ChevronRightIcon, ToolsIcon } from '@primer/octicons-v2-react';
import { LayoutBypass, toSafeString } from '../utils/tsxUtils';
import { UserPreferencesButton } from './misc/UserPreferences';

const { Content, Footer, Sider } = Layout;


let siderCollapsedWidth = 80;


const DebugUserInfoBar = () => (
    <div style={{ background: '#FFCD22', padding: '2rem', fontSize: '120%', fontWeight: 'bold', textAlign: 'center', display: 'flex', placeContent: 'center' }}>
        This frontend has been compiled for usage with Kowl-Business, but the backend server is the free version of Kowl. <br />
        You have been logged in as a locally created fake user to help debugging.
    </div>
)

const VersionInfo = () => {
    // Local Development Mode
    //   Kowl - DEV
    if (IsDev) return <>
        <div className='versionTitle'>{AppName} DEV</div>
        <div className='versionGitData'>{"b27cxaf"} {"f3axxb7"}</div>
        <div className='versionDate'>Tue Dez 42 3920</div>
    </>

    // Continuous Delivery Mode
    //   Kowl Business - CI
    //   b27c2a3f f3acf4b7
    if (env.REACT_APP_BUILT_FROM_PUSH) return <>
        <div className='versionTitle'>{AppName} CI</div>
        <div>
            <span>{env.REACT_APP_KOWL_GIT_REF != 'master' && env.REACT_APP_KOWL_GIT_REF + "-"}</span>
            <span>{env.REACT_APP_KOWL_GIT_SHA.slice(0, 7)}</span>
        </div>

        {IsBusiness && <div className='versionGitData'>
            <span>{env.REACT_APP_KOWL_BUSINESS_GIT_REF != 'master' &&
                env.REACT_APP_KOWL_BUSINESS_GIT_REF + "-"}</span>
            <span>{env.REACT_APP_KOWL_BUSINESS_GIT_SHA.slice(0, 7)}</span>
        </div>}

        <div className='versionDate'>
            {getBuildDate()?.toDateString()}
        </div>
    </>

    // Release
    //   Kowl Business v1.2.3
    //   b27c2a3f f3acf4b7
    return <>
        <div className='versionTitle'>{AppName} - {IsBusiness ? env.REACT_APP_KOWL_BUSINESS_GIT_REF : env.REACT_APP_KOWL_GIT_REF}</div>
        <div className='versionGitData'>{env.REACT_APP_KOWL_GIT_SHA.slice(0, 7)}</div>
        {IsBusiness && <div className='versionGitData'>{env.REACT_APP_KOWL_BUSINESS_GIT_SHA.slice(0, 7)}</div>}
        <div className='versionDate'>
            {getBuildDate()?.toDateString()}
        </div>
    </>

}
const SideBar = observer(() =>
    <Layout style={{ display: 'flex', flex: 1, height: '100vh', flexDirection: 'column', background: 'linear-gradient(180deg, hsla(206, 60%, 17%, 0.95) 0%, #08273ef5 94.27%) no-repeat' }}>
        <RenderTrap name='SideBarContent' />

        {/* Logo */}
        <div style={{ background: 'rgba(0,0,0, 0)', padding: '1px' }}>
            {/* <div style={{ background: 'none', borderRadius: 4, display: 'flex', placeItems: 'center', placeContent: 'center' }}>
                <span style={{ fontSize: '1.5em', color: 'white' }}>PLACEHOLDER</span>
            </div> */}
            <div style={{ position: 'relative' }}>
                <img src={logo2} style={{
                    height: uiSettings.sideBarOpen ? '130px' : '65px',
                    transition: 'all 200ms',
                    width: 'auto', display: 'block', margin: 'auto', cursor: 'pointer',
                    opacity: 0.5, mixBlendMode: 'overlay',
                    marginTop: uiSettings.sideBarOpen ? '3em' : '.5em'
                }}
                    onClick={() => { appGlobal.history.push('/'); }}
                />
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
                    color: 'hsla(205, 47%, 36%, 1)',
                }}>
                    Kowl
                </div>
                <div style={{ position: 'relative', borderTop: '1px solid #fff3', margin: '.5em 1em', marginTop: '1em' }} />
            </div>
        </div>

        {/* Menu */}
        <Content className="scroll-on-hover-y">
            <RouteMenu />
        </Content>

        {/* Version */}
        <div className='version'>
            <div className='repo'><a title="Visit Kowl's GitHub repository" href="https://github.com/cloudhut/kowl">
                {/* <img src={gitHubLogo} /> */}
                <GithubFilled style={{ fontSize: '36px', color: 'hsl(209, 100%, 92%)' }} />
            </a></div>

            <VersionInfo />
        </div>

        {/* Toggle */}
        <Footer style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            height: '40px', padding: 0, background: 'rgba(0,0,0, 0.25)', cursor: 'pointer'
        }} onClick={() => { uiSettings.sideBarOpen = !uiSettings.sideBarOpen }}>
            {uiSettings.sideBarOpen ? <MenuFoldOutlined style={{ fontSize: '19px', color: '#1f6190' }} /> : <MenuUnfoldOutlined style={{ fontSize: '19px', color: '#1f6190' }} />}
        </Footer>
    </Layout>
)

const AppSide = observer(() => (
    <Sider collapsible collapsed={!uiSettings.sideBarOpen} collapsedWidth={siderCollapsedWidth} trigger={null} style={{ background: 'white', cursor: 'default' }}>
        <SideBar />
    </Sider>
))



const DataRefreshButton = observer(() => {

    const spinnerSize = '16px';
    const refreshTextFunc = (): ReactNode => {
        return <div style={{ maxWidth: '350px' }}>
            Click to force a refresh of the data shown in the current page.
            When switching pages, any data older than <span className='codeBox'>{prettyMilliseconds(REST_CACHE_DURATION_SEC * 1000)}</span> will be refreshed automatically.
        </div>
        // TODO: small table that shows what cached data we have and how old it is
    }

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
                    <span className='pulsating' style={{ padding: '0 10px', fontSize: '80%', userSelect: 'none' }}>Fetching data...</span>
                </>
        }
    </div>
})

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
        : <NavLink to={r.path}>{r.breadcrumbName}</NavLink>

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
            <UserButton />
        </div>
    </MotionDiv>
});

const AppContent = observer(() =>
    <Layout className='overflowYOverlay' style={{ borderLeft: '1px solid #ddd' }}>

        <RenderTrap name='AppContentLayout' />

        {/* Debug User */}
        {uiState.isUsingDebugUserLogin && <DebugUserInfoBar />}

        {/* Page */}
        <Content style={{ display: 'flex', flexDirection: 'column', padding: '8px 6px 8px 4px', zIndex: 1 }}>
            <AppPageHeader />

            <ErrorDisplay>
                <RouteView />
            </ErrorDisplay>
        </Content>

        <UpdatePopup />

    </Layout>
);

@observer
export default class App extends Component {

    render() {
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
            </ErrorBoundary>
        );
    }

    loginHandling(): JSX.Element | null {
        if (!IsBusiness)
            return null; // free version has no login handling

        const preLogin = <div style={{ background: 'rgb(233, 233, 233)', height: '100vh' }} />
        const path = window.location.pathname.removePrefix(basePathS ?? '');
        const devPrint = function (str: string) { if (IsDev) console.log(`loginHandling (${path}): ` + str); }

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
                    devPrint('frontend is configured as business-version, but backend is non-business-version -> will create a local fake user for debugging')
                    uiState.isUsingDebugUserLogin = true;
                    api.userData = {
                        canManageKowl: false,
                        canListAcls: true,
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
