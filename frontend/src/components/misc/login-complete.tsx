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

import { useParams } from '@tanstack/react-router';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Component } from 'react';

import { appGlobal } from '../../state/app-global';
import { api } from '../../state/backend-api';
import type { ApiError, UserData } from '../../state/rest-interfaces';
import { uiState } from '../../state/ui-state';
import { getBasePath } from '../../utils/env';
import fetchWithTimeout from '../../utils/fetch-with-timeout';

function readOAuthError(searchParams: URLSearchParams): string {
  const error = searchParams.get('error');
  const description = searchParams.get('error_description');
  return [error ? `Error: ${error}` : '', description ? `Description: ${description}` : '']
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function fetchLoginCallback(provider: string, query: string): Promise<void> {
  const url = `./auth/callbacks/${provider}${query}`;

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
}

class LoginCompletePage extends Component<{ provider: string }> {
  componentDidMount() {
    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    this.completeLogin(this.props.provider, window.location).catch(console.error);
  }

  async completeLogin(provider: string, location: Location) {
    const errorString = readOAuthError(new URLSearchParams(location.search));
    if (errorString) {
      uiState.loginError = errorString;
      appGlobal.historyReplace(`${getBasePath()}/login`);
      return;
    }

    try {
      await fetchLoginCallback(provider, location.search);
      window.location.assign(getBasePath() || '/');
    } catch (err) {
      uiState.loginError = String(err);
      appGlobal.historyPush(`${getBasePath()}/login`);
    }
  }

  render() {
    return (
      <div className="flex h-screen place-content-center bg-page">
        <div className="flex flex-col place-content-center place-items-center">
          <span className="text-heading-xl text-foreground">Completing login...</span>
          <br />
          <Spinner className="size-8" />
        </div>
      </div>
    );
  }
}

export default () => {
  const { provider } = useParams({ from: '/login/callbacks/$provider' });
  return <LoginCompletePage provider={provider} />;
};
