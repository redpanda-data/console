
import { Menu } from "antd";
import { Link, Switch } from "react-router-dom";
import React from "react";
import { Section } from "./misc/common";
import { Route, Redirect } from "react-router";
import { queryToObj } from "../utils/queryHelper";
import { PageComponentType, PageProps } from "./pages/Page";
import { uiSettings } from "../state/ui";
import TopicList from "./pages/topic/List";
import TopicDetails from "./pages/topic/Details";
import { observer } from "mobx-react";
import GroupList from "./pages/GroupList";
import GroupDetails from "./pages/GroupDetails";
import BrokerList from "./pages/BrokerList";
import { AnimatePresence } from "framer-motion";
import { uiState } from "../state/uiState";
import { SettingsPage } from "./pages/Settings";
import AdminPage from "./pages/admin/AdminPage";
import { api } from "../state/backendApi";
import { DebugTimerStore, ToJson } from "../utils/utils";
import Icon, { HddOutlined, ProfileOutlined, FunnelPlotOutlined, ToolOutlined } from '@ant-design/icons';

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
    showCondition?: () => boolean,
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
    </Menu>)

// Generate content for <Menu> from all routes
export function CreateRouteMenuItems(entries: IRouteEntry[]): React.ReactNodeArray {
    return entries.map((entry, index) => {

        if (isPageDefinition(entry)) {
            // Menu entry for Page
            if (entry.path.includes(':'))
                return null; // only root-routes (no param) can be in menu

            if (entry.showCondition)
                if (entry.showCondition() == false)
                    return null;

            return (
                <Menu.Item key={entry.path}>
                    <Link to={entry.path}>
                        {entry.icon}
                        <span>{entry.title}</span>
                    </Link>
                </Menu.Item>
            )
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

function MakeRoute<TRouteParams>(path: string, page: PageComponentType<TRouteParams>, title: string, icon?: JSX.Element, exact: boolean = true, showCondition?: () => boolean): PageDefinition<TRouteParams> {

    const route: PageDefinition<TRouteParams> = {
        title,
        path,
        pageType: page,
        routeJsx: (null as unknown as JSX.Element), // will be set below
        icon,
        showCondition,
    }

    // todo: verify that path and route params match
    route.routeJsx = <Route path={route.path} key={route.title} exact={exact ? true : undefined} render={rp => {
        const matchedPath = rp.match.url;
        const query = queryToObj(rp.location.search);
        const { ...params } = rp.match.params;

        // Reset some things on page change
        if (uiState.currentRoute && uiState.currentRoute.path != route.path) {
            //console.log('switching route: ' + routeStr(ui.currentRoute) + " -> " + routeStr(route));
            uiState.pageHeaderExtra = () => null;
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

    MakeRoute<{}>('/brokers', BrokerList, 'Brokers', <HddOutlined />),

    MakeRoute<{}>('/topics', TopicList, 'Topics', <ProfileOutlined />),
    MakeRoute<{ topicName: string }>('/topics/:topicName', TopicDetails, 'Topics', <ProfileOutlined />),

    MakeRoute<{}>('/groups', GroupList, 'Consumer Groups', <FunnelPlotOutlined />),
    MakeRoute<{ groupId: string }>('/groups/:groupId/', GroupDetails, 'Consumer Groups', <FunnelPlotOutlined />),


    MakeRoute<{}>('/admin', AdminPage, 'Admin', <ToolOutlined />, false, () => api.UserData?.canManageKowl ?? false),

    //MakeRoute<{}>('/settings', SettingsPage, 'Settings', 'tool'), // Tool Settings, UserSettings, Access, ...

    //MakeRoute<{}>('/users', UrlTestPage, 'Users', 'user'),
    //MakeRoute<{}>('/license', UrlTestPage, 'License', 'copyright'),
];
