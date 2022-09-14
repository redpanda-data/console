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
import { autorun, observable } from 'mobx';
import { APP_ROUTES } from './components/routes';
import { uiState } from './state/uiState';
import { getBasePath, IsDev } from './utils/env';

declare const __webpack_public_path__: string;

const DEFAULT_HOST = 'localhost:9090';
const DEFAULT_API_BASE = './api';

const getWebsocketBasePath = (overrideUrl?: string): string => {
    if (overrideUrl) return overrideUrl;
    const isHttps = window.location.protocol.startsWith('https');
    const protocol = isHttps ? 'wss://' : 'ws://';
    const host = IsDev ? DEFAULT_HOST : window.location.host;
    return `${protocol + host + getBasePath()}/api`;
}

const getRestBasePath = (overrideUrl?: string) => overrideUrl ?? DEFAULT_API_BASE;


export interface SetConfigArguments {
    fetch?: WindowOrWorkerGlobalScope['fetch'];
    jwt?: string;
    urlOverride?: {
        rest?: string;
        ws?: string;
        assets?: string;
    }
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
    assetsPath: string,
    jwt?: string,

    setSidebarItems: (items: SidebarItem[]) => void,
    setBreadcrumbs: (items: Breadcrumb[]) => void,
}

export const config: Config = observable({
    websocketBasePath: getWebsocketBasePath(),
    restBasePath: getRestBasePath(),
    fetch: window.fetch,
    assetsPath: getBasePath(),

    setSidebarItems: () => { },
    setBreadcrumbs: () => { },
});

export const setConfig = ({
    fetch,
    urlOverride,
    jwt,
}: SetConfigArguments) => {

    const assetsUrl = urlOverride?.assets === 'WEBPACK' ? String(__webpack_public_path__).removeSuffix('/') : urlOverride?.assets;
    Object.assign(config, {
        jwt,
        websocketBasePath: getWebsocketBasePath(urlOverride?.ws),
        restBasePath: getRestBasePath(urlOverride?.rest),
        fetch: fetch ?? window.fetch.bind(window),
        assetsPath: assetsUrl ?? getBasePath(),
    });

    return config;
};

autorun(() => {
    const setBreadcrumbs = config.setBreadcrumbs;
    if (!setBreadcrumbs) return;

    let breadcrumbs = uiState.pageBreadcrumbs.map(v => ({
        title: v.title,
        to: v.linkTo
    }));

    // remove first ("Cluster") and last ("Page Title") entries
    breadcrumbs = breadcrumbs.slice(1, -1);

    setBreadcrumbs(breadcrumbs);
});

autorun(() => {
    const setSidebarItems = config.setSidebarItems;
    if (!setSidebarItems) return;

    const sidebarItems = APP_ROUTES.map((r, i) => ({
        title: r.title,
        to: r.path,
        icon: r.icon,
        order: i,
    } as SidebarItem));

    setSidebarItems(sidebarItems);
});

export function isEmbedded() {
    return config.jwt != null;

}
