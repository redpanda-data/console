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

import { Menu, Tooltip } from 'antd';
import { Link, Switch } from 'react-router-dom';
import React from 'react';
import { Section } from './misc/common';
import { Route, Redirect } from 'react-router';
import { queryToObj } from '../utils/queryHelper';
import { PageComponentType, PageProps } from './pages/Page';
import TopicList from './pages/topics/Topic.List';
import TopicDetails from './pages/topics/Topic.Details';
import { observer } from 'mobx-react';
import GroupList from './pages/consumers/Group.List';
import GroupDetails from './pages/consumers/Group.Details';
import BrokerList from './pages/brokers/Broker.List';
import { AnimatePresence } from 'framer-motion';
import { uiState } from '../state/uiState';
import AdminPage from './pages/admin/AdminPage';
import { api } from '../state/backendApi';
import SchemaList from './pages/schemas/Schema.List';
import SchemaDetailsView, { SchemaDetailsProps } from './pages/schemas/Schema.Details';
import AclList from './pages/acls/Acl.List';
import { ChipIcon, CogIcon, CollectionIcon, CubeTransparentIcon, FilterIcon, ShieldCheckIcon, LinkIcon, ScaleIcon, BeakerIcon } from '@heroicons/react/outline';
import ReassignPartitions from './pages/reassign-partitions/ReassignPartitions';
import { Feature, FeatureEntry, isSupported } from '../state/supportedFeatures';
import { UserPermissions } from '../state/restInterfaces';
import KafkaConnectOverview from './pages/connect/Overview';
import KafkaConnectorDetails from './pages/connect/Connector.Details';
import KafkaClusterDetails from './pages/connect/Cluster.Details';
import CreateConnector from './pages/connect/CreateConnector';
import QuotasList from './pages/quotas/Quotas.List';
import { AppFeature, AppFeatures } from '../utils/env';
import { ItemType } from 'antd/lib/menu/hooks/useItems';

//
//	Route Types
//
type IRouteEntry = PageDefinition<any>;

export interface PageDefinition<TRouteParams = {}> {
    title: string;
    path: string;
    pageType: PageComponentType<TRouteParams>;
    routeJsx: JSX.Element;
    icon?: JSX.Element;
    menuItemKey?: string; // set by 'CreateRouteMenuItems'
    visibilityCheck?: () => MenuItemState;
}


export const RouteMenu = observer(() =>
    <Menu mode="inline"
        theme="dark"
        selectedKeys={uiState.selectedMenuKeys}
        style={{ border: 0, background: 'none' }}
        items={CreateRouteMenuItems(APP_ROUTES)}
    >
    </Menu>
)

// Generate content for <Menu> from all routes
export function CreateRouteMenuItems(entries: IRouteEntry[]): ItemType[] {
    const routeItems = entries.map((entry) => {
        // Menu entry for Page
        if (entry.path.includes(':'))
            return null; // only root-routes (no param) can be in menu

        let isEnabled = true;
        let disabledText: JSX.Element = <></>;
        if (entry.visibilityCheck) {
            const visibility = entry.visibilityCheck();
            if (!visibility.visible) return null;

            isEnabled = visibility.disabledReasons.length == 0;
            if (!isEnabled)
                disabledText = disabledReasonText[visibility.disabledReasons[0]];
        }
        const isDisabled = !isEnabled;

        return {
            key: entry.path,
            icon: entry.icon,
            label: (
                <Tooltip
                    overlayClassName="menu-permission-tooltip"
                    overlay={disabledText}
                    align={{ points: ['cc', 'cc'], offset: [-20, 0] }}
                    trigger={isDisabled ? 'hover' : 'none'}
                    mouseEnterDelay={0.05}
                >
                    <div style={{ display: isDisabled ? 'block' : 'contents', width: '100%' }}>
                        <Link to={entry.path} style={{ pointerEvents: isEnabled ? 'all' : 'none' }}>
                            {entry.title}
                        </Link>
                    </div>
                </Tooltip>
            ),
            disabled: isDisabled,
        } as ItemType;
    }).filter(x => x != null && x != undefined);
    return routeItems as ItemType[];
}

// Convert routes to <Route/> JSX declarations
function EmitRouteViews(entries: IRouteEntry[]): JSX.Element[] {
    return entries.map(e => e.routeJsx);
}

export const RouteView = (() =>
    <AnimatePresence exitBeforeEnter>
        <Switch>
            {/* Index */}
            {/* <Route exact path='/' component={IndexPage} /> */}
            <Route exact path="/" render={() => <Redirect to="/topics" />} />

            {/* Emit all <Route/> elements */}
            {EmitRouteViews(APP_ROUTES)}

            <Route render={rp => {
                uiState.pageTitle = '404';
                return (
                    <Section title="404">
                        <div><h4>Path:</h4> <span>{rp.location.pathname}</span></div>
                        <div><h4>Query:</h4> <pre>{JSON.stringify(rp.location.search, null, 4)}</pre></div>
                    </Section>
                )
            }} />

        </Switch>
    </AnimatePresence>
)

enum DisabledReasons {
    'notSupported', // kafka cluster version too low
    'noPermission', // user doesn't have permissions to use the feature
    'enterpriseFeature'
}

const disabledReasonText: { [key in DisabledReasons]: JSX.Element } = {
    [DisabledReasons.noPermission]:
        <span>You don't have premissions<br />to view this page.</span>,
    [DisabledReasons.notSupported]:
        <span>The Kafka cluster does not<br />support this feature.</span>,
    [DisabledReasons.enterpriseFeature]:
        <span>This feature requires an enterprise license.</span>,
} as const;

interface MenuItemState {
    visible: boolean;
    disabledReasons: DisabledReasons[];
}

function MakeRoute<TRouteParams>(path: string, page: PageComponentType<TRouteParams>, title: string, icon?: JSX.Element, exact: boolean = true, showCallback?: () => MenuItemState): PageDefinition<TRouteParams> {

    const route: PageDefinition<TRouteParams> = {
        title,
        path,
        pageType: page,
        routeJsx: (null as unknown as JSX.Element), // will be set below
        icon,
        visibilityCheck: showCallback,
    }

    // todo: verify that path and route params match
    route.routeJsx = <Route path={route.path} key={route.title} exact={exact ? true : undefined} render={rp => {
        const matchedPath = rp.match.url;
        const query = queryToObj(rp.location.search);
        const { ...params } = rp.match.params;

        if (uiState.currentRoute && uiState.currentRoute.path != route.path) {
            //console.log('switching route: ' + routeStr(ui.currentRoute) + " -> " + routeStr(route));
        }

        const pageProps: PageProps<TRouteParams> = {
            matchedPath,
            query,
            ...params,
        } as PageProps<TRouteParams>;

        uiState.currentRoute = route;
        return <route.pageType {...pageProps} />
    }} />;

    return route;
}

function routeVisibility(
    visible: boolean | (() => boolean),
    requiredFeatures?: FeatureEntry[],
    requiredPermissions?: UserPermissions[],
    requiredAppFeatures?: AppFeature[],
): () => MenuItemState {
    return () => {
        const v = typeof visible === 'boolean'
            ? visible
            : visible();

        const disabledReasons: DisabledReasons[] = [];
        if (requiredFeatures)
            for (const f of requiredFeatures) {
                if (!isSupported(f)) {
                    disabledReasons.push(DisabledReasons.notSupported);
                    break;
                }
            }

        if (requiredPermissions && api.userData)
            for (const p of requiredPermissions) {
                const hasPermission = api.userData[p];
                if (!hasPermission) {
                    disabledReasons.push(DisabledReasons.noPermission);
                    break;
                }
            }

        if (requiredAppFeatures) {
            for (const f of requiredAppFeatures)
                if (AppFeatures[f] == false) {
                    disabledReasons.push(DisabledReasons.enterpriseFeature);
                    break;
                }
        }

        return {
            visible: v,
            disabledReasons: disabledReasons
        }
    }
}

//
// Route Definitions
// If a route has one or more parameters it will not be shown in the main menu (obviously, since the parameter would have to be known!)
//
export const APP_ROUTES: IRouteEntry[] = [

    MakeRoute<{}>('/brokers', BrokerList, 'Brokers', <span className="menuIcon anticon"><ChipIcon /></span>),

    MakeRoute<{}>('/topics', TopicList, 'Topics', <span className="menuIcon anticon"><CollectionIcon /></span>),
    MakeRoute<{ topicName: string }>('/topics/:topicName', TopicDetails, 'Topics'),

    MakeRoute<{}>('/schema-registry', SchemaList, 'Schema Registry', <span className="menuIcon anticon"><CubeTransparentIcon /></span>),
    MakeRoute<SchemaDetailsProps>('/schema-registry/:subjectName', SchemaDetailsView, 'Schema Registry'),

    MakeRoute<{}>('/groups', GroupList, 'Consumer Groups', <span className="menuIcon anticon"><FilterIcon /></span>, undefined,
        routeVisibility(true, [Feature.ConsumerGroups])
    ),
    MakeRoute<{ groupId: string }>('/groups/:groupId/', GroupDetails, 'Consumer Groups'),

    MakeRoute<{}>('/acls', AclList, 'Access Control List', <span className="menuIcon anticon"><ShieldCheckIcon /></span>, true,
        routeVisibility(true, [], ['canListAcls'])
    ),

    MakeRoute<{}>('/quotas', QuotasList, 'Quotas', <span className="menuIcon anticon"><ScaleIcon /></span>, true,
        routeVisibility(true, [Feature.GetQuotas], ['canListQuotas'])
    ),

    MakeRoute<{}>('/kafka-connect', KafkaConnectOverview, 'Kafka Connect', <span className="menuIcon anticon"><LinkIcon /></span>, true),
    MakeRoute<{ clusterName: string }>('/kafka-connect/:clusterName', KafkaClusterDetails, 'Connect Cluster'),
    MakeRoute<{ clusterName: string, connector: string }>('/kafka-connect/:clusterName/:connector', KafkaConnectorDetails, 'Connector Details'),
    MakeRoute<{}>('/create-connector', CreateConnector, 'Create Connector', undefined, undefined, routeVisibility(false)),

    MakeRoute<{}>('/reassign-partitions', ReassignPartitions, 'Reassign Partitions', <span className="menuIcon anticon"><BeakerIcon /></span>, false,
        routeVisibility(true,
            [Feature.GetReassignments, Feature.PatchReassignments],
            ['canPatchConfigs', 'canReassignPartitions'],
            ['REASSIGN_PARTITIONS']
        )
    ),

    MakeRoute<{}>('/admin', AdminPage, 'Admin', <span className="menuIcon anticon"><CogIcon /></span>, false,
        routeVisibility(() => api.userData?.canViewConsoleUsers ?? false)
    ),


].filterNull();
