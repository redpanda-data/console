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

import { Spinner } from '@redpanda-data/ui';
import { useParams } from '@tanstack/react-router';
import { Component } from 'react';

import { appGlobal } from '../../state/app-global';
import { api } from '../../state/backend-api';
import type { ApiError, UserData } from '../../state/rest-interfaces';
import { uiState } from '../../state/ui-state';
import { getBasePath } from '../../utils/env';
import fetchWithTimeout from '../../utils/fetch-with-timeout';

class LoginCompletePage extends Component<{ provider: string }> {
  componentDidMount() {
    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    this.completeLogin(this.props.provider, window.location).catch(console.error);
  }

  async completeLogin(provider: string, location: Location) {
    const query = location.search;

    const searchParams = new URLSearchParams(query);
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    if (error || errorDescription) {
      let errorString = '';
      if (error) {
        errorString += `Error: ${error}\n`;
      }
      if (errorDescription) {
        errorString += `Description: ${errorDescription}\n`;
      }
      uiState.loginError = errorString.trim();
      appGlobal.historyReplace(`${getBasePath()}/login`);
      return;
    }

    const url = `./auth/callbacks/${provider}${query}`;

    try {
      const response = await fetchWithTimeout(url, 10 * 1000, {
        method: 'GET',
        cache: 'no-cache',
        mode: 'no-cors',
      });
      const text = await response.text();
      const obj = JSON.parse(text);
      // console.log('complete login response: ' + text);
      if (response.ok) {
        api.userData = obj as UserData;
      } else {
        // try to read as error object
        const err = obj as ApiError;
        throw err.message;
      }
    } catch (err) {
      uiState.loginError = String(err);
      appGlobal.historyPush(`${getBasePath()}/login`);
      return;
    }

    // console.log('login complete, user: ' + JSON.stringify(api.userData));

    // const targetUrl = store.urlBeforeLogin;
    // store.urlBeforeLogin = null;
    // if(targetUrl){
    //     navigate(targetUrl);
    // } else{
    //     navigate({ to: '/' });
    // }
    window.location.assign(getBasePath() || '/');
  }

  render() {
    return (
      <div style={{ height: '100vh', display: 'flex', placeContent: 'center', background: '#f3f3f3' }}>
        <div style={{ display: 'flex', placeContent: 'center', placeItems: 'center', flexFlow: 'column' }}>
          <span style={{ fontSize: '1.5em', color: 'rgba(0,0,0,0.75)' }}>Completing login...</span>
          <br />
          <Spinner size="lg" />
        </div>
      </div>
    );
  }
}

export default () => {
  const { provider } = useParams({ from: '/login/callbacks/$provider' });
  return <LoginCompletePage provider={provider} />;
};
