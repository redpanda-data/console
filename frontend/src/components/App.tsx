import React, { PureComponent } from 'react';
import { observer } from "mobx-react"
import { Layout, Menu, Icon, Select, PageHeader, Alert } from 'antd';
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
import logo from '../assets/logo.png';
import { uiState } from '../state/uiState';
import { appGlobal } from '../state/appGlobal';
import Title from 'antd/lib/typography/Title';

const { Content, Footer, Sider } = Layout;
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

        <span className='version'>{(window as any).VERSION} ({(window as any).COMMIT_SHA})</span>

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



const ClusterSelect = observer(() =>
    <Select<number>
        value={uiSettings.selectedClusterIndex >= 0 ? uiSettings.selectedClusterIndex : undefined}
        placeholder='Select Cluster'
        style={{ width: 200 }}
        onChange={(v) => { uiSettings.selectedClusterIndex = v }}
    >
        {api.Clusters.map((v, i) =>
            <Option key={v} value={i}>{v}</Option>
        )}
    </Select>
)


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
            title={<Title level={3}>{uiState.pageTitle}</Title>}
            subTitle={<></>}
            footer={<DataAgeInfo />}
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

        {/* Cluster, User */}    {/* zIndex is needed for the boxShadow to show */}
        {/* <Header style={{ height: 'auto', padding: '1em 1em', background: 'white', lineHeight: '2em', boxShadow: 'rgba(0, 0, 0, 0.2) 0em 0em 8px', zIndex: 10 }}>
            <TitleBarContent />
        </Header> */}

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
            <Layout style={{ height: '100vh', background: 'transparent', overflow: 'hidden' }}>
                <AppSide />
                <AppContent />
            </Layout>
        );
    }
}
export default App;