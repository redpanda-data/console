import React, { PureComponent } from 'react';
import { observer } from "mobx-react"
import { Layout, Menu, Icon, Select, PageHeader, Alert, Button, Avatar } from 'antd';
import { uiSettings } from '../state/ui';
import { CreateRouteMenuItems, APP_ROUTES, RouteView, } from './routes';
import { RenderTrap, Spacer } from './misc/common';
import { DebugTimerStore, hoursToMilliseconds } from '../utils/utils';
import { api } from '../state/backendApi';
import { NavLink } from 'react-router-dom';
import { Route as AntBreadcrumbRoute } from 'antd/lib/breadcrumb/Breadcrumb';
import { MotionAlways, MotionDiv } from '../utils/animationProps';
import { ErrorDisplay } from './misc/ErrorDisplay';
import prettyMilliseconds from 'pretty-ms';
import { uiState } from '../state/uiState';
import { appGlobal } from '../state/appGlobal';
import Title from 'antd/lib/typography/Title';

import logo from '../assets/logo.png';
import gitHubLogo from '../assets/GitHub-Mark-Light-32px.png';
import { ErrorBoundary } from './misc/ErrorBoundary';
import { IsDevelopment } from '../utils/isProd';
import { TopBar } from './misc/TopBar';

const { Content, Footer, Sider, Header } = Layout;
const { Option } = Select;

let siderCollapsedWidth = 80;


const SideBar = observer(() =>
    <Layout style={{ display: 'flex', flex: 1, height: '100vh', flexDirection: 'column', background: '#031d30' }}>
        <RenderTrap name='SideBarContent' />

        {/* Logo */}
        <div style={{ background: 'rgba(0,0,0, 0)', padding: '1px' }}>
            {/* <div style={{ background: 'none', borderRadius: 4, display: 'flex', placeItems: 'center', placeContent: 'center' }}>
                <span style={{ fontSize: '1.5em', color: 'white' }}>PLACEHOLDER</span>
            </div> */}
            <div>
                <img src={logo} style={{ width: '66%', height: 'auto', display: 'block', margin: 'auto', cursor: 'pointer' }}
                    onClick={() => { appGlobal.history.push('/'); }}
                />
                <div style={{ position: 'relative', borderTop: '1px solid #fff3', margin: '0 1em', marginBottom: '.5em' }} />
            </div>
        </div>

        {/* Menu */}
        <Content className="scroll-on-hover-y">
            <Menu mode="inline"
                theme='dark'
                selectedKeys={uiState.selectedMenuKeys}
                style={{ border: 0, background: 'none' }}
            >
                {CreateRouteMenuItems(APP_ROUTES)}
            </Menu>
        </Content>

        {/* Version */}
        <div className='version'>
            <div className='repo'><a title="Visit Kafka-Owl's GitHub repository" href="https://github.com/kafka-owl/kafka-owl"><img src={gitHubLogo} /></a></div>
            <div>KafkaOwl - {(window as any).VERSION}</div>
        </div>

        {/* Toggle */}
        <Footer style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            height: '40px', padding: 0, background: 'rgba(0,0,0, 0.25)', cursor: 'pointer'
        }} onClick={() => { uiSettings.sideBarOpen = !uiSettings.sideBarOpen }}>
            <Icon type={uiSettings.sideBarOpen ? 'menu-fold' : 'menu-unfold'} style={{ fontSize: '19px', color: '#eee9' }} />
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
    if (api.ActiveRequests.length == 0) return null;

    DebugTimerStore.Instance.useFrame();

    const maxFetchTime = api.ActiveRequests.map(r => r.requestTime).reduce((p, c) => Math.max(p, c));
    if (maxFetchTime < 0.1) return null;

    {/* <div style={{ marginTop: '0.2em', color: 'hsl(205, 100%, 50%)', cursor: 'pointer' }}>
            <span>Displayed data is <b>1 min</b> old</span>
        </div>
    */}

    // maybe we need to use the same 'no vertical expansion' trick:
    // <span style={{ display: 'inline-flex', alignItems: 'center', height: 0, marginLeft: '4px', transform: 'translateY(1px)' }}>
    return (
        <div style={{ marginLeft: '1em' }}>
            <div className='fadeIn' style={{ color: 'hsl(205, 100%, 50%)', display: 'flex', alignContent: 'center', transform: 'translateY(-1px)' }}>
                <span className='spinner' style={{ width: size, height: size }} />
                <span className='pulsating' style={{ paddingLeft: '.4em' }}>Fetching data...</span>
            </div>
        </div>
    )
})

const AppPageHeader = observer(() => {

    let breadcrumbs = uiState.pageBreadcrumbs.map(v => ({ path: v.linkTo, breadcrumbName: v.title }));

    const selectedClusterName = uiState.selectedClusterName;
    if (selectedClusterName) {
        const rootBreadcrumb: AntBreadcrumbRoute = { path: '', breadcrumbName: selectedClusterName };
        breadcrumbs.unshift(rootBreadcrumb);
    }


    const itemRender = (r: AntBreadcrumbRoute) => <NavLink to={r.path}>{r.breadcrumbName}</NavLink>;

    return <MotionDiv identityKey={uiState.pageTitle}>
        <PageHeader
            style={{ paddingLeft: 0, paddingRight: 0 }}
            breadcrumb={{ routes: breadcrumbs, itemRender: itemRender, separator: '>' }}
            // onBack={onBack}
            title={<><Title level={3}>{uiState.pageTitle}</Title></>}
            subTitle={<span style={{ display: 'flex', marginTop: '.2em' }}><DataAgeInfo /></span>}
            footer={<></>}
            extra={uiState.pageHeaderExtra()} // right sider
        />
    </MotionDiv>
});


const PreviewBanner = () => {

    const timeUntilNotification = uiSettings.previewNotificationHideUntil - new Date().getTime();
    if (timeUntilNotification > 0) {
        console.log('preview notification will show again in: ' + prettyMilliseconds(timeUntilNotification));
        return null;
    }

    const setHideTime = () => {
        const notificationDelay = hoursToMilliseconds(12);
        const nowMs = new Date().getTime();
        const showAgain = new Date(nowMs + notificationDelay).getTime();
        uiSettings.previewNotificationHideUntil = showAgain;
        console.log('preview notification closed. will show again at: ' + new Date(showAgain).toLocaleString());
    };

    return <>
        <Alert type="info" message='Preview Version' style={{ zIndex: 50 }}
            description={
                <>
                    This is an early <b>preview version</b> of KafkaOwl  -
                    expect some rough edges here and there. <Icon type="heart" theme="twoTone" twoToneColor='hsl(340, 100%, 66%)' />
                </>}
            banner closable
            afterClose={setHideTime}
        />
    </>
}

const AppContent = observer(() =>
    <Layout style={{ borderLeft: '1px solid #ddd', overflow: 'hidden' }}>

        <RenderTrap name='AppContentLayout' />

        <PreviewBanner />

        {/* Cluster, User */}
        <TopBar />

        {/* Page */}
        <Content style={{ display: 'flex', flexDirection: 'column', overflow: 'overlay', overflowX: 'hidden', background: 'white', padding: '1em 2em', zIndex: 1 }}>
            <AppPageHeader />
            <ErrorDisplay>
                <RouteView />
            </ErrorDisplay>
        </Content>

    </Layout>
);

class App extends PureComponent {
    render() {
        return (
            <ErrorBoundary>
                <Layout style={{ height: '100vh', background: 'transparent', overflow: 'hidden' }}>
                    <AppSide />
                    <AppContent />
                </Layout>
            </ErrorBoundary>
        );
    }
}
export default App;