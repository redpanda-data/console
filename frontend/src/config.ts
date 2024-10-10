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
import { SecurityService } from './protogen/redpanda/api/console/v1alpha1/security_connect';
// import { RedpandaConnectService } from './protogen/redpanda/api/console/v1alpha1/rp_connect_connect';
import { PipelineService } from './protogen/redpanda/api/console/v1alpha1/pipeline_connect';
import { TransformService } from './protogen/redpanda/api/console/v1alpha1/transform_connect';
import { LicenseService } from './protogen/redpanda/api/console/v1alpha1/license_connect';

// Monaco
import { configureMonacoYaml } from 'monaco-yaml';
import { monacoYamlOptions } from './components/misc/PipelinesYamlEditor';
import * as monaco from 'monaco-editor';
import { loader, Monaco } from '@monaco-editor/react';

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
    licenseClient?: PromiseClient<typeof LicenseService>;
    consoleClient?: PromiseClient<typeof ConsoleService>;
    securityClient?: PromiseClient<typeof SecurityService>;
    pipelinesClient?: PromiseClient<typeof PipelineService>;
    transformsClient?: PromiseClient<typeof TransformService>;
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
    setSidebarItems: () => { },
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

    const licenseGrpcClient = createPromiseClient(LicenseService, transport);
    const consoleGrpcClient = createPromiseClient(ConsoleService, transport);
    const securityGrpcClient = createPromiseClient(SecurityService, transport);
    const pipelinesGrpcClient = createPromiseClient(PipelineService, transport);
    const transformClient = createPromiseClient(TransformService, transport);
    Object.assign(config, {
        jwt,
        isServerless,
        restBasePath: getRestBasePath(urlOverride?.rest),
        fetch: fetch ?? window.fetch.bind(window),
        assetsPath: assetsUrl ?? getBasePath(),
        licenseClient: licenseGrpcClient,
        consoleClient: consoleGrpcClient,
        securityClient: securityGrpcClient,
        pipelinesClient: pipelinesGrpcClient,
        transformsClient: transformClient,
        ...args,
    });
    return config;
};

export const setMonacoTheme = (_editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    monaco.editor.defineTheme('kowl', {
        base: 'vs',
        inherit: false,
        colors: {
            'editor.background': '#fcfcfc',
            'editorGutter.background': '#00000018',
            'editor.lineHighlightBackground': '#aaaaaa20',
            'editor.lineHighlightBorder': '#00000000',
            'editorLineNumber.foreground': '#8c98a8',            
            'editorOverviewRuler.background': '#606060',
        },
        rules: []
    });

    monaco.editor.setTheme('kowl');
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
    '/transforms',
];

export const embeddedAvailableRoutesObservable = observable({
    get routes() {
        return APP_ROUTES
            .filter((x) => x.icon != null) // routes without icon are "nested", so they shouldn't be visible directly
            .filter((x) => !routesIgnoredInEmbedded.includes(x.path)) // things that should not be visible in embedded/cloud mode
            .filter(x => {
                if (x.visibilityCheck) {
                    const state = x.visibilityCheck();
                    return state.visible;
                }
                return true;
            })
            .filter(x => {
                if (isServerless() && routesIgnoredInServerless.includes(x.path))
                    return false;
                return true;
            });
    }
});

export const setup = memoizeOne((setupArgs: SetConfigArguments) => {
    setConfig(setupArgs);

    // Configure Monaco
    loader.config({
        monaco // Point @monaco-editor/react to monaco-editor instance
    })
    loader.init().then(async (monaco) => {
        window.MonacoEnvironment = {
            getWorker: function (_moduleId: string, label: string) {
                console.log('label: ', label);
                switch(label) {
                    case 'editorWorkerService': {
                        return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker', import.meta.url));
                    }
                    case 'json': {
                        return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker', import.meta.url));
                    }
                    case 'css':
                    case 'scss':
                    case 'less': {
                        return new Worker(new URL('monaco-editor/esm/vs/language/css/css.worker', import.meta.url));
                    }
                    case 'html':
                    case 'handlebars':
                    case 'razor': {
                        return new Worker(new URL('monaco-editor/esm/vs/language/html/html.worker', import.meta.url));
                    }
                    case 'typescript':
                    case 'javascript': {
                        return new Worker(
                            new URL('monaco-editor/esm/vs/language/typescript/ts.worker', import.meta.url),
                        );
                    }
                    case 'yaml':
                    case 'yml': {
                        return new Worker(new URL('monaco-yaml/yaml.worker', import.meta.url));
                    }
                    default: {
                        throw new Error(`Unknown label ${label}`);
                    }
                }
            },
        };

        configureMonacoYaml(monaco, monacoYamlOptions);
    })


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
        api.listLicenses();
    } else {
        when(
            () => Boolean(api.userData),
            () => {
                setTimeout(() => {
                    api.refreshSupportedEndpoints();
                    api.listLicenses();
                });
            }
        );
    }
});

