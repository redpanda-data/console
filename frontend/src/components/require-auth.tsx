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

import { observer } from 'mobx-react';
import { Component, type ReactNode } from 'react';

import { ConnectionErrorUI } from './misc/connection-error-ui';
import { config as appConfig } from '../config';
import { api } from '../state/backend-api';
import { featureErrors } from '../state/supported-features';
import { uiState } from '../state/ui-state';
import { AppFeatures, getBasePath, IsDev } from '../utils/env';

@observer
export default class RequireAuth extends Component<{ children: ReactNode }> {
  render() {
    const r = this.loginHandling(); // Complete login, or fetch user if needed
    if (r) {
      return r;
    }

    return (
      <>
        {this.props.children}
        <FeatureErrorCheck />
      </>
    );
  }

  loginHandling(): JSX.Element | null {
    if (!AppFeatures.SINGLE_SIGN_ON) {
      return null;
    }

    const preLogin = <div style={{ background: 'rgb(233, 233, 233)', height: '100vh' }} />;
    const path = window.location.pathname.removePrefix(getBasePath() ?? '');
    const devPrint = (str: string) => {
      if (IsDev) {
        // biome-ignore lint/suspicious/noConsole: dev logging
        console.log(`loginHandling (${path}): ${str}`);
      }
    };

    if (path.startsWith('/login')) {
      return null; // already in login process, don't interrupt!
    }

    if (api.userData === null && !path.startsWith('/login')) {
      devPrint('known not logged in, hard redirect');
      window.location.pathname = `${getBasePath()}/login`; // definitely not logged in, and in wrong url: hard redirect!
      return preLogin;
    }

    if (api.userData === undefined) {
      devPrint('user is undefined (probably a fresh page load)');

      // Check if there was a transient server error (5xx)
      // Show error UI instead of loading or redirecting to prevent infinite loops
      if (api.userDataError) {
        devPrint(`user data error: ${api.userDataError.message}`);
        return <ConnectionErrorUI error={api.userDataError} onRetry={() => api.refreshUserData()} />;
      }

      const client = appConfig.authenticationClient;
      if (!client) {
        throw new Error('security client is not initialized');
      }

      // Only fetch if not already fetching to prevent redirect loops
      if (!api.isUserDataFetchInProgress) {
        api.refreshUserData().catch(() => {
          // Intentionally ignore errors during initial load
        });
      }

      return preLogin;
    }
    if (!uiState.isUsingDebugUserLogin) {
      devPrint(`user is set: ${JSON.stringify(api.userData)}`);
    }
    return null;
  }
}

@observer
class FeatureErrorCheck extends Component {
  render() {
    if (featureErrors.length > 0) {
      const allErrors = featureErrors.join(' ');
      throw new Error(allErrors);
    }
    return null;
  }
}
