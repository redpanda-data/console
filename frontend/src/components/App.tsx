import React, { Component } from 'react';
import { observer } from "mobx-react"
import { Layout, Menu, PageHeader, Button } from 'antd';
import { uiSettings } from '../state/ui';
import { CreateRouteMenuItems, RouteView, RouteMenu, } from './routes';
import { RenderTrap } from './misc/common';
import { DebugTimerStore } from '../utils/utils';
import { api } from '../state/backendApi';
import { NavLink, Switch, Route } from 'react-router-dom';
import { Route as AntBreadcrumbRoute } from 'antd/lib/breadcrumb/Breadcrumb';
import { MotionDiv } from '../utils/animationProps';
import { ErrorDisplay } from './misc/ErrorDisplay';
import { uiState } from '../state/uiState';
import { appGlobal } from '../state/appGlobal';
import Title from 'antd/lib/typography/Title';

import logo2 from '../assets/logo2.png';
import gitHubLogo from '../assets/GitHub-Mark-Light-32px.png';
import { ErrorBoundary } from './misc/ErrorBoundary';
import { IsProd, IsDev, AppName, IsBusiness } from '../utils/env';
import { TopBar } from './misc/TopBar';
import fetchWithTimeout from '../utils/fetchWithTimeout';
import { UserData } from '../state/restInterfaces';
import Login from './misc/login';
import LoginCompletePage from './misc/login-complete';
import env, { getBuildDate } from '../utils/env';
import { MenuFoldOutlined, MenuUnfoldOutlined, ReloadOutlined } from '@ant-design/icons';

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
    if (IsDev) return <div>{AppName} - DEV</div>

    // Continuous Delivery Mode
    //   Kowl Business - CI
    //   b27c2a3f f3acf4b7
    if (env.REACT_APP_BUILT_FROM_PUSH) return <>
        <div>{AppName} - CI</div>
        <div>
            <span>{env.REACT_APP_KOWL_GIT_REF != 'master' && env.REACT_APP_KOWL_GIT_REF + "-"}</span>
            <span>{env.REACT_APP_KOWL_GIT_SHA.slice(0, 8)}</span>
        </div>

        {IsBusiness && <div>
            <span>{env.REACT_APP_KOWL_BUSINESS_GIT_REF != 'master' &&
                env.REACT_APP_KOWL_BUSINESS_GIT_REF + "-"}</span>
            <span>{env.REACT_APP_KOWL_BUSINESS_GIT_SHA.slice(0, 8)}</span>
        </div>}

        <div>
            {getBuildDate(IsBusiness ? 'business' : 'free')?.toDateString()}
        </div>
    </>

    // Release
    //   Kowl Business v1.2.3
    //   b27c2a3f f3acf4b7
    return <>
        <div>{AppName} - {IsBusiness ? env.REACT_APP_KOWL_BUSINESS_GIT_REF : env.REACT_APP_KOWL_GIT_REF}</div>
        <div>{env.REACT_APP_KOWL_GIT_SHA.slice(0, 8)}</div>
        {IsBusiness && <div>{env.REACT_APP_KOWL_BUSINESS_GIT_SHA.slice(0, 8)}</div>}
        <div>
            {getBuildDate(IsBusiness ? 'business' : 'free')?.toDateString()}
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
                <img src={gitHubLogo} />
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



const DataAgeInfo = observer(() => {
    const size = '19px'

    DebugTimerStore.Instance.useFrame();

    const maxFetchTime = api.ActiveRequests.length == 0
        ? 0
        : api.ActiveRequests.map(r => r.requestTime).reduce((p, c) => Math.max(p, c));

    // maybe we need to use the same 'no vertical expansion' trick:
    // <span >
    return (
        <div style={{ color: 'hsl(205, 100%, 50%)', display: 'flex', height: '3em' }} className='fadeIn' >

            {maxFetchTime < 0.1
                ?
                <>
                    <Button icon={<ReloadOutlined />} shape='circle' className='hoverButton' style={{ color: 'hsl(205, 100%, 50%)', background: 'transparent' }} onClick={() => appGlobal.onRefresh()} />
                    {/* <span style={{ paddingLeft: '.2em', fontSize: '80%' }}>fetched <b>1 min</b> ago</span> */}
                </>
                :
                <>
                    <span className='spinner' style={{ marginLeft: '.5em', width: size, height: size }} />
                    <span className='pulsating' style={{ paddingLeft: '0.8em', fontSize: '80%', userSelect: 'none' }}>Fetching data...</span>
                </>
            } </div>
    )
})

const AppPageHeader = observer(() => {

    let breadcrumbs = uiState.pageBreadcrumbs.map(v => ({ path: v.linkTo, breadcrumbName: v.title }));

    const selectedClusterName = uiState.selectedClusterName;
    if (selectedClusterName) {
        //const rootBreadcrumb: AntBreadcrumbRoute = { path: '', breadcrumbName: selectedClusterName };
        const rootBreadcrumb: AntBreadcrumbRoute = { path: '', breadcrumbName: 'Cluster' };
        breadcrumbs.unshift(rootBreadcrumb);
    }

    const itemRender = (r: AntBreadcrumbRoute) => <NavLink to={r.path}>{r.breadcrumbName}</NavLink>;

    return <MotionDiv identityKey={uiState.pageTitle}>
        <PageHeader
            breadcrumb={{ routes: breadcrumbs, itemRender: itemRender, separator: '>' }}
            // onBack={onBack}
            title={<><Title level={3}>{uiState.pageTitle}</Title></>}
            subTitle={<DataAgeInfo />}
            footer={<></>}
        />
    </MotionDiv>
});

const AppContent = observer(() =>
    <Layout className='overflowYOverlay' style={{ borderLeft: '1px solid #ddd' }}>

        <RenderTrap name='AppContentLayout' />

        {/* Debug User */}
        {uiState.isUsingDebugUserLogin && <DebugUserInfoBar />}

        {/* Cluster, User */}
        {IsBusiness && <TopBar />}

        {/* Page */}
        <Content style={{ display: 'flex', flexDirection: 'column', padding: '8px 6px 8px 4px', zIndex: 1 }}>
            <AppPageHeader />

            <ErrorDisplay>
                <RouteView />
            </ErrorDisplay>
        </Content>

    </Layout>
);

@observer
class App extends Component {

    render() {
        const r = this.loginHandling(); // Complete login, or fetch user if needed
        if (r) return r;

        return (
            <ErrorBoundary>
                <Switch>
                    {/* Login (and callbacks) */}
                    <Route exact path='/login' component={Login} />
                    <Route exact path='/login/callbacks/google'><LoginCompletePage provider='google' /></Route>
                    <Route exact path='/login/callbacks/github'><LoginCompletePage provider='github' /></Route>

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
        const path = window.location.pathname;
        const devPrint = function (str: string) { if (IsDev) console.log(`loginHandling (${path}): ` + str); }

        if (path.startsWith('/login'))
            return null; // already in login process, don't interrupt!

        if (api.UserData === null && !path.startsWith('/login')) {
            devPrint('known not logged in, hard redirect');
            window.location.pathname = '/login'; // definitely not logged in, and in wrong url: hard redirect!
            return preLogin;
        }

        if (api.UserData === undefined) {
            devPrint('user is undefined (this is most likely a fresh page load)');

            fetchWithTimeout('/api/users/me', 10 * 1000).then(async r => {
                if (r.ok) {
                    api.UserData = await r.json() as UserData;
                    devPrint('user fetched, success');
                } else if (r.status == 401) { // unauthorized / not logged in
                    devPrint('not logged in');
                    api.UserData = null;
                } else if (r.status == 404) { // not found: server must be non-business version
                    devPrint('frontend is configured as business-version, but backend is non-business-version -> will create a local fake user for debugging')
                    uiState.isUsingDebugUserLogin = true;
                    api.UserData = {
                        canManageKowl: false,
                        seat: null as any,
                        user: { providerID: -1, providerName: 'debug provider', id: 'debug', internalIdentifier: 'debug', meta: { avatarUrl: '', email: '', name: 'local fake user for debugging' } }
                    };
                }
            });

            // don't render anything until we know if we're already logged in or not
            return preLogin;
        } else {
            if (!uiState.isUsingDebugUserLogin)
                devPrint('user is set: ' + JSON.stringify(api.UserData));
            return null;
        }
    }
}
export default App;