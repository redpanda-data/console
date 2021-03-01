
import { Menu, Tooltip } from "antd";
import { Link, Switch } from "react-router-dom";
import React, { Component } from "react";
import { Section } from "./misc/common";
import { Route, Redirect } from "react-router";
import { queryToObj } from "../utils/queryHelper";
import { PageComponentType, PageProps } from "./pages/Page";
import { uiSettings } from "../state/ui";
import TopicList from "./pages/topics/Topic.List";
import TopicDetails from "./pages/topics/Topic.Details";
import { observer } from "mobx-react";
import GroupList from "./pages/consumers/Group.List";
import GroupDetails from "./pages/consumers/Group.Details";
import BrokerList from "./pages/brokers/Broker.List";
import { AnimatePresence } from "framer-motion";
import { uiState } from "../state/uiState";
import { SettingsPage } from "./pages/Settings";
import AdminPage from "./pages/admin/AdminPage";
import { api } from "../state/backendApi";
import { DebugTimerStore, toJson } from "../utils/utils";
import Icon, { HddOutlined, ProfileOutlined, FunnelPlotOutlined, ToolOutlined, PartitionOutlined, UnorderedListOutlined, FileProtectOutlined, QuestionCircleFilled } from '@ant-design/icons';
import SchemaList from "./pages/schemas/Schema.List";
import SchemaDetailsView, { SchemaDetailsProps } from "./pages/schemas/Schema.Details";
import AclList from "./pages/acls/Acl.List";
import { observable } from "mobx";
import ReassignPartitions from "./pages/brokers/ReassignPartitions";
import { IsDev } from "../utils/env";
import { CommentDiscussionIcon, DatabaseIcon, FileCodeIcon, GitCompareIcon, RepoIcon, ShieldLockIcon, ToolsIcon } from "@primer/octicons-v2-react";


//
//	Route Types
//
export type IRouteEntry = PageDefinition<any> | PageGroup | SeparatorEntry;

export interface PageGroup {
    title: string
    children: IRouteEntry[]
}

export interface PageDefinition<TRouteParams = {}> {
    title: string
    path: string
    pageType: PageComponentType<TRouteParams>
    routeJsx: JSX.Element
    icon?: JSX.Element
    menuItemKey?: string, // set by 'CreateRouteMenuItems'
    showCallback?: () => MenuItemState,
}
export interface SeparatorEntry { isSeparator: boolean; }

export function isPageDefinition(x: IRouteEntry): x is PageDefinition<any> { return (x as PageDefinition<any>).path !== undefined; }
export function isSeparator(x: IRouteEntry): x is SeparatorEntry { return (x as SeparatorEntry).isSeparator !== undefined; }

const MenuGroupTitle = observer((p: { title: string }) =>
    <div className={uiSettings.sideBarOpen ? '' : 'menu-divider-group-title'}>{p.title}</div>
);

export const RouteMenu = observer((p: {}) =>
    <Menu mode="inline"
        theme='dark'
        selectedKeys={uiState.selectedMenuKeys}
        style={{ border: 0, background: 'none' }}
    >
        {CreateRouteMenuItems(APP_ROUTES)}
    </Menu>
)

// Generate content for <Menu> from all routes
export function CreateRouteMenuItems(entries: IRouteEntry[]): React.ReactNodeArray {
    return entries.map((entry, index) => {

        if (isPageDefinition(entry)) {
            // Menu entry for Page
            if (entry.path.includes(':'))
                return null; // only root-routes (no param) can be in menu

            let isEnabled = true;
            if (entry.showCallback) {
                const visibility = entry.showCallback();
                if (!visibility.visible) return null;
                isEnabled = visibility.enabled;
            }
            const isDisabled = !isEnabled;

            // {/*  */}
            return <Menu.Item key={entry.path} disabled={isDisabled}>
                <Tooltip
                    overlayClassName='menu-permission-tooltip'
                    overlay={<span>You don't have premissions<br />to view this page</span>}
                    align={{ points: ['cc', 'cc'], offset: [0, 0] }}
                    trigger={isDisabled ? 'hover' : 'none'}
                    mouseEnterDelay={0.05}
                >
                    <div style={{ display: isDisabled ? 'block' : 'contents' }}>
                        <Link to={entry.path} style={{ pointerEvents: isEnabled ? 'all' : 'none' }}>
                            {entry.icon}
                            <span>{entry.title}</span>
                        </Link>
                    </div>
                </Tooltip>
            </Menu.Item>
        }
        else if (isSeparator(entry)) {
            return <div key={index} className='menu-divider' />
        }
        else {
            // Group
            return (
                <Menu.ItemGroup key={entry.title} title={entry.title}>
                    {CreateRouteMenuItems(entry.children)}
                </Menu.ItemGroup>
            );
        }
    }).filter(x => x != null && x != undefined);
}

// Convert routes to <Route/> JSX declarations
function EmitRouteViews(entries: IRouteEntry[]): JSX.Element[] {

    const elements: JSX.Element[] = [];

    for (let entry of entries) {
        if (isPageDefinition(entry)) {
            elements.push(entry.routeJsx);
        } else if (isSeparator(entry)) {
            // seperators are not routes
        } else {
            let childJsxElements = EmitRouteViews(entry.children);
            elements.push(...childJsxElements);
        }
    }
    return elements;
}



// const Route = (p: {} & RouteProps) => <ReactRouterRoute {...p} {...props}/>
let routeCounter = 0;
export function routeCount(): number { return routeCounter++; }

export const RouteView = (() =>
    <AnimatePresence exitBeforeEnter>
        <Switch>
            {/* Index */}
            {/* <Route exact path='/' component={IndexPage} /> */}
            <Route exact path='/' render={() => <Redirect to='/topics' />} />

            {/* Emit all <Route/> elements */}
            {EmitRouteViews(APP_ROUTES)}

            <Route render={rp => {
                uiState.pageTitle = '404';
                return (
                    <Section title='404'>
                        <div><h4>Path:</h4> <span>{rp.location.pathname}</span></div>
                        <div><h4>Query:</h4> <pre>{JSON.stringify(rp.location.search, null, 4)}</pre></div>
                    </Section>
                )
            }} />

        </Switch>
    </AnimatePresence>
)

interface MenuItemState {
    visible: boolean;
    enabled: boolean;
}

function MakeRoute<TRouteParams>(path: string, page: PageComponentType<TRouteParams>, title: string, icon?: JSX.Element, exact: boolean = true, showCallback?: () => MenuItemState): PageDefinition<TRouteParams> {

    const route: PageDefinition<TRouteParams> = {
        title,
        path,
        pageType: page,
        routeJsx: (null as unknown as JSX.Element), // will be set below
        icon,
        showCallback: showCallback,
    }

    // todo: verify that path and route params match
    route.routeJsx = <Route path={route.path} key={route.title} exact={exact ? true : undefined} render={rp => {
        const matchedPath = rp.match.url;
        const query = queryToObj(rp.location.search);
        const { ...params } = rp.match.params;

        if (uiState.currentRoute && uiState.currentRoute.path != route.path) {
            //console.log('switching route: ' + routeStr(ui.currentRoute) + " -> " + routeStr(route));
        }

        let pageProps: PageProps<TRouteParams> = {
            matchedPath,
            query,
            ...params,
        };

        uiState.currentRoute = route;
        return <route.pageType {...pageProps} />
    }} />;

    return route;
}

//
// Route Definitions
// If a route has one or more parameters it will not be shown in the main menu (obviously, since the parameter would have to be known!)
//
export const APP_ROUTES: IRouteEntry[] = [

    MakeRoute<{}>('/brokers', BrokerList, 'Brokers', <span role='img' className='anticon'><DatabaseIcon /></span>),
    IsDev
        ? MakeRoute<{}>('/reassign-partitions', ReassignPartitions, 'Reassign Partitions', <span role='img' className='anticon'><GitCompareIcon /></span>)
        : null as any as IRouteEntry,

    MakeRoute<{}>('/topics', TopicList, 'Topics', <span role='img' className='anticon'><RepoIcon /></span>),
    MakeRoute<{ topicName: string }>('/topics/:topicName', TopicDetails, 'Topics'),

    MakeRoute<{}>('/groups', GroupList, 'Consumer Groups', <span role='img' className='anticon'><CommentDiscussionIcon /></span>),
    MakeRoute<{ groupId: string }>('/groups/:groupId/', GroupDetails, 'Consumer Groups'),

    MakeRoute<{}>('/acls', AclList, 'ACLs', <span role='img' className='anticon'><ShieldLockIcon /></span>, true, () => ({ visible: true, enabled: api.userData?.canListAcls ?? true })),

    MakeRoute<{}>('/schema-registry', SchemaList, 'Schema Registry', <span role='img' className='anticon'><FileCodeIcon /></span>),
    MakeRoute<SchemaDetailsProps>('/schema-registry/:subjectName', SchemaDetailsView, 'Schema Registry'),

    MakeRoute<{}>('/admin', AdminPage, 'Admin', <span role='img' className='anticon'><ToolsIcon /></span>, false, () => ({ visible: api.userData?.canManageKowl ?? false, enabled: true })),

    //MakeRoute<{}>('/settings', SettingsPage, 'Settings', 'tool'), // Tool Settings, UserSettings, Access, ...

    //MakeRoute<{}>('/users', UrlTestPage, 'Users', 'user'),
    //MakeRoute<{}>('/license', UrlTestPage, 'License', 'copyright'),
].filter(x => x != null);
