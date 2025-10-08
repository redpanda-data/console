import { observer } from 'mobx-react';
import { Component, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';

import HistorySetter from './misc/history-setter';
import LoginPage from './misc/login';
import LoginCompletePage from './misc/login-complete';
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
        <HistorySetter />
        <Routes>
          {/* Login (and callbacks) */}
          <Route element={<LoginPage />} path="/login" />
          <Route element={<LoginCompletePage />} path="/login/callbacks/:provider" />
          {/* Default View */}
          <Route element={this.props.children} path="*" />
        </Routes>
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

      const client = appConfig.authenticationClient;
      if (!client) {
        throw new Error('security client is not initialized');
      }

      api.refreshUserData().catch(() => {
        // Intentionally ignore errors during initial load
      });

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
