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
import { autorun, configure, observable, when } from 'mobx';
import { api } from './state/backendApi';
import { uiState } from './state/uiState';
import { AppFeatures, getBasePath } from './utils/env';
import memoizeOne from 'memoize-one';
import { DEFAULT_API_BASE } from './components/constants';
import { APP_ROUTES } from './components/routes';
import { Interceptor as ConnectRpcInterceptor, StreamRequest, UnaryRequest, createPromiseClient, PromiseClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { ConsoleService } from './protogen/redpanda/api/console/v1alpha1/console_service_connect';

declare const __webpack_public_path__: string;

const getRestBasePath = (overrideUrl?: string) => overrideUrl ?? DEFAULT_API_BASE;

const getGrpcBasePath = (overrideUrl?: string) => overrideUrl ?? getBasePath();


const addBearerTokenInterceptor: ConnectRpcInterceptor = (next) => async (req: UnaryRequest | StreamRequest) => {
    if (config.jwt)
        req.header.append('Authorization', 'Bearer ' + config.jwt);
    return await next(req);
};

export interface SetConfigArguments {
    fetch?: WindowOrWorkerGlobalScope['fetch'];
    jwt?: string;
    clusterId?: string;
    urlOverride?: {
        rest?: string;
        ws?: string;
        assets?: string;
        grpc?: string;
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
    restBasePath: string;
    consoleClient?: PromiseClient<typeof ConsoleService>;
    fetch: WindowOrWorkerGlobalScope['fetch'];
    assetsPath: string;
    jwt?: string;
    clusterId?: string;
    setSidebarItems: (items: SidebarItem[]) => void;
    setBreadcrumbs: (items: Breadcrumb[]) => void;
    isServerless: boolean;
}

// Config object is an mobx observable, always make sure you call it from
// inside a componenet, don't be tempted to used it as singleton you might find
// unexpected behaviour
export const config: Config = observable({
    restBasePath: getRestBasePath(),
    fetch: window.fetch,
    assetsPath: getBasePath(),
    clusterId: 'default',
    setSidebarItems: () => {},
    setBreadcrumbs: () => { },
    isServerless: false,
});

const setConfig = ({ fetch, urlOverride, jwt, isServerless, ...args }: SetConfigArguments) => {
    const assetsUrl = urlOverride?.assets === 'WEBPACK' ? String(__webpack_public_path__).removeSuffix('/') : urlOverride?.assets;

    // instantiate the client once, if we need to add more clients you can add them in here, ideally only one transport is necessary
    const transport = createConnectTransport({
        baseUrl: getGrpcBasePath(urlOverride?.grpc),
        interceptors: [addBearerTokenInterceptor]
    });

    const grpcClient = createPromiseClient(ConsoleService, transport);
    Object.assign(config, {
        jwt,
        isServerless,
        restBasePath: getRestBasePath(urlOverride?.rest),
        fetch: fetch ?? window.fetch.bind(window),
        assetsPath: assetsUrl ?? getBasePath(),
        consoleClient: grpcClient,
        ...args,
    });
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

