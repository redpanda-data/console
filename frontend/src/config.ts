import {
  Code,
  ConnectError,
  type Interceptor as ConnectRpcInterceptor,
  type PromiseClient,
  type StreamRequest,
  type UnaryRequest,
  createPromiseClient,
} from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { type Monaco, loader } from '@monaco-editor/react';
import memoizeOne from 'memoize-one';
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
import * as monaco from 'monaco-editor';

import { DEFAULT_API_BASE } from './components/constants';
import { APP_ROUTES } from './components/routes';
import { ConsoleService } from './protogen/redpanda/api/console/v1alpha1/console_service_connect';
import { DebugBundleService } from './protogen/redpanda/api/console/v1alpha1/debug_bundle_connect';
import { LicenseService } from './protogen/redpanda/api/console/v1alpha1/license_connect';
import { PipelineService } from './protogen/redpanda/api/console/v1alpha1/pipeline_connect';
import { SecurityService } from './protogen/redpanda/api/console/v1alpha1/security_connect';
import { TransformService } from './protogen/redpanda/api/console/v1alpha1/transform_connect';
import { PipelineService as PipelineServiceV2 } from './protogen/redpanda/api/dataplane/v1alpha2/pipeline_connect';
import { SecretService as RPCNSecretService } from './protogen/redpanda/api/dataplane/v1alpha2/secret_connect';
import { appGlobal } from './state/appGlobal';
import { api } from './state/backendApi';
import { uiState } from './state/uiState';
import { AppFeatures, getBasePath } from './utils/env';

declare const __webpack_public_path__: string;

const getRestBasePath = (overrideUrl?: string) => overrideUrl ?? DEFAULT_API_BASE;

const getGrpcBasePath = (overrideUrl?: string) => overrideUrl ?? getBasePath();

const addBearerTokenInterceptor: ConnectRpcInterceptor = (next) => async (req: UnaryRequest | StreamRequest) => {
  if (config.jwt) req.header.append('Authorization', `Bearer ${config.jwt}`);
  return await next(req);
};

/**
 * Interceptor to handle license expiration errors in gRPC responses.
 *
 * This interceptor checks if the error is of type `ConnectError` with the
 * code `FailedPrecondition` and inspects the `details` array for an entry
 * with type `google.rpc.ErrorInfo` and a reason of `REASON_ENTERPRISE_LICENSE_EXPIRED`.
 * If such an error is detected, it redirects the user to the `/trial-expired` page.
 *
 */
const checkExpiredLicenseInterceptor: ConnectRpcInterceptor = (next) => async (req: UnaryRequest | StreamRequest) => {
  try {
    return await next(req);
  } catch (error) {
    if (error instanceof ConnectError) {
      if (error.code === Code.FailedPrecondition) {
        for (const detail of error.details) {
          // @ts-ignore - TODO fix type checks for IncomingDetail, BE should provide types for debug field
          if (detail?.type && detail?.debug) {
            if (
              // @ts-ignore - TODO fix type checks for IncomingDetail, BE should provide types for debug field
              detail.type === 'google.rpc.ErrorInfo' &&
              // @ts-ignore - TODO fix type checks for IncomingDetail, BE should provide types for debug field
              detail.debug.reason === 'REASON_ENTERPRISE_LICENSE_EXPIRED'
            ) {
              appGlobal.history.replace('/trial-expired');
            }
          }
        }
      }
    }
    // Re-throw the error to ensure it's handled by other interceptors or the calling code
    throw error;
  }
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
  debugBundleClient?: PromiseClient<typeof DebugBundleService>;
  securityClient?: PromiseClient<typeof SecurityService>;
  pipelinesClient?: PromiseClient<typeof PipelineService>;
  pipelinesClientV2?: PromiseClient<typeof PipelineServiceV2>;
  rpcnSecretsClient?: PromiseClient<typeof RPCNSecretService>;
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
  setSidebarItems: () => {},
  setBreadcrumbs: () => {},
  isServerless: false,
});

const setConfig = ({ fetch, urlOverride, jwt, isServerless, ...args }: SetConfigArguments) => {
  const assetsUrl =
    urlOverride?.assets === 'WEBPACK' ? String(__webpack_public_path__).removeSuffix('/') : urlOverride?.assets;

  // instantiate the client once, if we need to add more clients you can add them in here, ideally only one transport is necessary
  const transport = createConnectTransport({
    baseUrl: getGrpcBasePath(urlOverride?.grpc),
    interceptors: [addBearerTokenInterceptor, checkExpiredLicenseInterceptor],
  });

  const licenseGrpcClient = createPromiseClient(LicenseService, transport);
  const consoleGrpcClient = createPromiseClient(ConsoleService, transport);
  const debugBundleGrpcClient = createPromiseClient(DebugBundleService, transport);
  const securityGrpcClient = createPromiseClient(SecurityService, transport);
  const pipelinesGrpcClient = createPromiseClient(PipelineService, transport);
  const pipelinesV2GrpcClient = createPromiseClient(PipelineServiceV2, transport);
  const secretGrpcClient = createPromiseClient(RPCNSecretService, transport);
  const transformClient = createPromiseClient(TransformService, transport);
  Object.assign(config, {
    jwt,
    isServerless,
    restBasePath: getRestBasePath(urlOverride?.rest),
    fetch: fetch ?? window.fetch.bind(window),
    assetsPath: assetsUrl ?? getBasePath(),
    licenseClient: licenseGrpcClient,
    consoleClient: consoleGrpcClient,
    debugBundleClient: debugBundleGrpcClient,
    securityClient: securityGrpcClient,
    pipelinesClient: pipelinesGrpcClient,
    pipelinesClientV2: pipelinesV2GrpcClient,
    transformsClient: transformClient,
    rpcnSecretsClient: secretGrpcClient,
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
    rules: [],
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
        }) as SidebarItem,
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

const routesIgnoredInEmbedded = ['/overview', '/quotas', '/reassign-partitions', '/admin'];

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
    return APP_ROUTES.filter((x) => x.icon != null) // routes without icon are "nested", so they shouldn't be visible directly
      .filter((x) => !routesIgnoredInEmbedded.includes(x.path)) // things that should not be visible in embedded/cloud mode
      .filter((x) => {
        if (x.visibilityCheck) {
          const state = x.visibilityCheck();
          return state.visible;
        }
        return true;
      })
      .filter((x) => {
        if (isServerless() && routesIgnoredInServerless.includes(x.path)) return false;
        return true;
      });
  },
});

export const setup = memoizeOne((setupArgs: SetConfigArguments) => {
  setConfig(setupArgs);

  // Tell monaco editor where to load dependencies from
  loader.config({ monaco });

  // Ensure yaml workers are being loaded locally as well
  loader.init().then(async () => {
    window.MonacoEnvironment = {
      getWorkerUrl(_, label: string): string {
        switch (label) {
          case 'editorWorkerService': {
            return `${window.location.origin}/static/js/editor.worker.js`;
          }
          case 'typescript': {
            return `${window.location.origin}/static/js/ts.worker.js`;
          }
          default: {
            return `${window.location.origin}/static/js/${label}.worker.js`;
          }
        }
      },
    };
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
    api.listLicenses();
  } else {
    when(
      () => Boolean(api.userData),
      () => {
        setTimeout(() => {
          api.refreshSupportedEndpoints();
          api.listLicenses();
        });
      },
    );
  }
});
