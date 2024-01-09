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
// import { embeddedAvailableRoutes } from './components/routes';
import { api } from './state/backendApi';
import { uiState } from './state/uiState';
import { AppFeatures, getBasePath, IsDev } from './utils/env';
import memoizeOne from 'memoize-one';
import { DEFAULT_API_BASE, DEFAULT_HOST } from './components/constants';
import { APP_ROUTES } from './components/routes';
import 'whatwg-fetch';

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
    isServerless?: boolean;
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
    isServerless: boolean;
}

export const config: Config = observable({
    websocketBasePath: getWebsocketBasePath(),
    restBasePath: getRestBasePath(),
    fetch: typeof window !== 'undefined' ? window.fetch.bind(window) : fetch,
    assetsPath: getBasePath(),
    clusterId: 'default',
    setSidebarItems: () => {},
    setBreadcrumbs: () => { },
    isServerless: false,
});

export const setConfig = ({ fetch, urlOverride, jwt, isServerless, ...args }: SetConfigArguments) => {
    const assetsUrl = urlOverride?.assets === 'WEBPACK' ? String(__webpack_public_path__).removeSuffix('/') : urlOverride?.assets;

    // We need to wait to make sure that we have the right Authorization headers set so that fetch can succeed.
    if (typeof window !== 'undefined') {
        Object.assign(config, {
            jwt,
            isServerless,
            websocketBasePath: getWebsocketBasePath(urlOverride?.ws),
            restBasePath: getRestBasePath(urlOverride?.rest),
            fetch: fetch ?? window.fetch.bind(window),
            assetsPath: assetsUrl ?? getBasePath(),
            ...args,
        });
    }

    return config;
};

setTimeout(() => {

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


        const sidebarItems = embeddedAvailableRoutesObservable.routes.map(
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

}, 50);


export function isEmbedded() {
    return config.jwt != null;
}

export function isServerless() {
    return config.isServerless;
}

const routesIgnoredInEmbedded = [
    '/overview',
    '/quotas',
    '/reassign-partitions',
    '/admin',
];

const routesIgnoredInServerless = [
    '/overview',
    '/schema-registry',
    '/quotas',
    '/reassign-partitions',
    '/admin',
    '/connect-clusters',
];

export const embeddedAvailableRoutesObservable = observable({

    get routes() {
        return APP_ROUTES
            .filter((x) => x.icon != null) // routes without icon are "nested", so they shouldn't be visible directly
            .filter((x) => !routesIgnoredInEmbedded.includes(x.path)) // things that should not be visible in embedded/cloud mode
            .filter(x => {
                if (isServerless())
                    if (routesIgnoredInServerless.includes(x.path))
                        return false; // remove entry
                return true;
            });
    }
});

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

