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

import type { JSX, ReactNode } from 'react';

import { ConnectionErrorUI } from './misc/connection-error-ui';
import { config as appConfig } from '../config';
import { api, useApiStoreHook } from '../state/backend-api';
import { useSupportedFeaturesStore } from '../state/supported-features';
import { uiState } from '../state/ui-state';
import { AppFeatures, getBasePath, IsDev } from '../utils/env';

function loginHandling() {
  if (!AppFeatures.SINGLE_SIGN_ON) {
    return null;
  }

  const path = window.location.pathname.removePrefix(getBasePath() ?? '');

  if (path.startsWith('/login')) {
    return null;
  }

  // WARNING: Let license recovery routes render before identity resolves; expired licenses can make the identity request fail.
  if (path.startsWith('/trial-expired') || path.startsWith('/upload-license')) {
    return null;
  }

  return renderAuthenticatedState(path);
}

function renderAuthenticatedState(path: string) {
  const preLogin = <div style={{ background: 'var(--color-page)', height: '100vh' }} />;
  if (api.userData === null && !path.startsWith('/login')) {
    logLoginState(path, 'known not logged in, hard redirect');
    window.location.pathname = `${getBasePath()}/login`;
    return preLogin;
  }

  if (api.userData === undefined) {
    return renderInitialLoginState(path, preLogin);
  }
  if (!uiState.isUsingDebugUserLogin) {
    logLoginState(path, `user is set: ${JSON.stringify(api.userData)}`);
  }
  return null;
}

const RequireAuth = ({ children }: { children: ReactNode }) => {
  useApiStoreHook((s) => s.userData);
  useApiStoreHook((s) => s.userDataError);

  const r = loginHandling();
  if (r) {
    return r;
  }

  return (
    <>
      {children}
      <FeatureErrorCheck />
    </>
  );
};

const FeatureErrorCheck = () => {
  const { featureErrors } = useSupportedFeaturesStore();
  if (featureErrors.length > 0) {
    const allErrors = featureErrors.join(' ');
    throw new Error(allErrors);
  }
  return null;
};

/**
 * Don't interrupt login already in progress. Once signed-out status is known, redirect to the login URL and preserve the requested path.
 */
export default RequireAuth;

function logLoginState(path: string, message: string) {
  if (IsDev) {
    // biome-ignore lint/suspicious/noConsole: dev logging
    console.log(`loginHandling (${path}): ${message}`);
  }
}

function requestInitialUserData() {
  const client = appConfig.authenticationClient;
  if (!client) {
    throw new Error('security client is not initialized');
  }

  // WARNING: Do not start a second profile request; duplicate requests can cause a redirect loop.
  if (!api.isUserDataFetchInProgress) {
    api.refreshUserData().catch(() => {
      // WARNING: The initial-login UI reads the API error state so it can offer Retry.
    });
  }
}

function renderInitialLoginState(path: string, preLogin: JSX.Element) {
  logLoginState(path, 'user is undefined (probably a fresh page load)');

  if (api.userDataError) {
    logLoginState(path, `user data error: ${api.userDataError.message}`);
    return <ConnectionErrorUI error={api.userDataError} onRetry={() => api.refreshUserData()} />;
  }

  requestInitialUserData();

  return preLogin;
}
