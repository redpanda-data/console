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
import { loader } from '@monaco-editor/react';
import { ConfigProvider } from 'antd';
import { autorun, configure, observable, when } from 'mobx';
import colors from './colors';
import { APP_ROUTES } from './components/routes';
import { api } from './state/backendApi';
import { uiState } from './state/uiState';
import { AppFeatures, getBasePath, IsDev } from './utils/env';
import memoizeOne from 'memoize-one';
import { DEFAULT_API_BASE, DEFAULT_HOST } from './components/constants';

declare const __webpack_public_path__: string;

const getWebsocketBasePath = (overrideUrl?: string): string => {
    if (overrideUrl) return overrideUrl;
    const isHttps = window.location.protocol.startsWith('https');
    const protocol = isHttps ? 'wss://' : 'ws://';
    const host = IsDev ? DEFAULT_HOST : window.location.host;
    return `${protocol + host + getBasePath()}/api`;
};

const getRestBasePath = (overrideUrl?: string) => overrideUrl ?? DEFAULT_API_BASE;

export interface SetConfigArguments {
    fetch?: WindowOrWorkerGlobalScope['fetch'];
    jwt?: string;
    clusterId?: string;
    urlOverride?: {
        rest?: string;
        ws?: string;
        assets?: string;
    };
    setSidebarItems?: (items: SidebarItem[]) => void;
    setBreadcrumbs?: (items: Breadcrumb[]) => void;
}

export interface SidebarItem {
    title: string; // "Topics"
    to: string; // '/topics'
    icon?: JSX.Element;
    order: number;
}

export interface Breadcrumb {
    title: string; // "Topics"
    to: string; // '/topics'
}

interface Config {
    websocketBasePath: string;
    restBasePath: string;
    fetch: WindowOrWorkerGlobalScope['fetch'];
    assetsPath: string;
    jwt?: string;
    clusterId?: string;
    setSidebarItems: (items: SidebarItem[]) => void;
    setBreadcrumbs: (items: Breadcrumb[]) => void;
}

export const config: Config = observable({
    websocketBasePath: getWebsocketBasePath(),
    restBasePath: getRestBasePath(),
    fetch: window.fetch,
    assetsPath: getBasePath(),
    clusterId: 'default',
    setSidebarItems: () => {},
    setBreadcrumbs: () => {},
});

export const setConfig = ({ fetch, urlOverride, jwt, ...args }: SetConfigArguments) => {
    const assetsUrl = urlOverride?.assets === 'WEBPACK' ? String(__webpack_public_path__).removeSuffix('/') : urlOverride?.assets;
    Object.assign(config, {
        jwt,
        websocketBasePath: getWebsocketBasePath(urlOverride?.ws),
        restBasePath: getRestBasePath(urlOverride?.rest),
        fetch: fetch ?? window.fetch.bind(window),
        assetsPath: assetsUrl ?? getBasePath(),
        ...args,
    });

    return config;
};



const ignoredRoutes = ['/quotas', '/reassign-partitions', '/admin', '/brokers'];

export const embeddedAvailableRoutes =  APP_ROUTES.filter((x) => x.icon != null)
        .filter((x) => !ignoredRoutes.includes(x.path))

autorun(() => {
    const setBreadcrumbs = config.setBreadcrumbs;
    if (!setBreadcrumbs) return;

    const breadcrumbs = uiState.pageBreadcrumbs.map((v) => ({
        title: v.title,
        to: v.linkTo,
    }));

    setBreadcrumbs(breadcrumbs);
});

autorun(() => {
    const setSidebarItems = config.setSidebarItems;
    if (!setSidebarItems) return;


    const sidebarItems = embeddedAvailableRoutes.map(
            (r, i) =>
                ({
                    title: r.title,
                    to: r.path,
                    icon: r.icon,
                    order: i,
                } as SidebarItem)
        );

    setSidebarItems(sidebarItems);
});

export function isEmbedded() {
    return config.jwt != null;
}

export const setup = memoizeOne((setupArgs: SetConfigArguments) => {
    const config = setConfig(setupArgs);

    // Tell monaco editor where to load dependencies from
    loader.config({ paths: { vs: `${config.assetsPath}/static/js/vendor/monaco/package/min/vs` } });

    // Set theme color for ant-design
    ConfigProvider.config({
        theme: {
            primaryColor: colors.brandOrange,

            infoColor: colors.brandBlue,
            successColor: colors.brandSuccess,
            // processingColor: colors.debugRed,
            errorColor: colors.brandError,
            warningColor: colors.brandWarning,
        },
    });


    // Configure MobX
    configure({
        enforceActions: 'never',
        safeDescriptors: true,
    });

    // Get supported endpoints / kafka cluster version
    // In the business version, that endpoint (like any other api endpoint) is
    // protected, so we need to delay the call until the user is logged in.
    if (!AppFeatures.SINGLE_SIGN_ON) {
        api.refreshSupportedEndpoints();
    } else {
        when(
            () => Boolean(api.userData),
            () => {
                setTimeout(() => {
                    api.refreshSupportedEndpoints();
                });
            }
        );
    }
});

