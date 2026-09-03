/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Code, ConnectError } from '@connectrpc/connect';
import { afterEach, beforeEach, describe, expect, test } from '@rstest/core';
import { act, screen } from '@testing-library/react';

import RequireAuth from './require-auth';
import { config as appConfig } from '../config';
import { useApiStore } from '../state/backend-api';
import { render } from '../test-utils';
import { AppFeatures } from '../utils/env';

const LICENSE_EXPIRED_ERROR = new ConnectError('enterprise license expired', Code.FailedPrecondition);

function setPath(path: string) {
  window.history.pushState({}, '', path);
}

describe('RequireAuth', () => {
  const initialSingleSignOn = AppFeatures.SINGLE_SIGN_ON;
  const initialAuthClient = appConfig.authenticationClient;

  beforeEach(() => {
    AppFeatures.SINGLE_SIGN_ON = true;
    // getIdentity() never settles - tests drive userData/userDataError directly
    // instead of racing a real fetch.
    appConfig.authenticationClient = {
      getIdentity: () => new Promise(() => {}),
    } as unknown as typeof appConfig.authenticationClient;
    act(() => {
      useApiStore.setState({ userData: undefined, userDataError: null, isUserDataFetchInProgress: false });
    });
    setPath('/');
  });

  afterEach(() => {
    AppFeatures.SINGLE_SIGN_ON = initialSingleSignOn;
    appConfig.authenticationClient = initialAuthClient;
    // The previous test's tree is unmounted by the global `cleanup()` afterEach,
    // which runs after this one - the component may still be mounted here, so
    // this reset must be wrapped in act() too.
    act(() => {
      useApiStore.setState({ userData: undefined, userDataError: null, isUserDataFetchInProgress: false });
    });
    setPath('/');
  });

  test('renders /trial-expired instead of a blank screen when the redirect leaves userData unresolved', () => {
    setPath('/trial-expired');
    useApiStore.setState({ userData: undefined, userDataError: LICENSE_EXPIRED_ERROR });

    render(
      <RequireAuth>
        <div data-testid="trial-expired-content">license expired page</div>
      </RequireAuth>
    );

    expect(screen.getByTestId('trial-expired-content')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  test('renders /upload-license under the same conditions', () => {
    setPath('/upload-license');
    useApiStore.setState({ userData: undefined, userDataError: LICENSE_EXPIRED_ERROR });

    render(
      <RequireAuth>
        <div data-testid="upload-license-content">upload license page</div>
      </RequireAuth>
    );

    expect(screen.getByTestId('upload-license-content')).toBeInTheDocument();
  });

  test('does not bypass the auth gate for unrelated routes', () => {
    setPath('/topics');
    useApiStore.setState({ userData: undefined, userDataError: LICENSE_EXPIRED_ERROR });

    render(
      <RequireAuth>
        <div data-testid="topics-content">topics page</div>
      </RequireAuth>
    );

    expect(screen.queryByTestId('topics-content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  test('recovers once userDataError is set after mount, instead of staying on the blank placeholder forever', () => {
    setPath('/topics');
    useApiStore.setState({ userData: undefined, userDataError: null });

    render(
      <RequireAuth>
        <div data-testid="topics-content">topics page</div>
      </RequireAuth>
    );

    // Neither the gated content nor an error UI has shown up yet - the
    // (fetch never resolves) placeholder is up.
    expect(screen.queryByTestId('topics-content')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();

    // Simulates refreshUserData()'s catch branch: userData stays undefined,
    // only userDataError changes. Before the fix, RequireAuth only
    // subscribed to `userData`, so this update never re-rendered the
    // component and it stayed on the blank placeholder forever.
    act(() => {
      useApiStore.setState({ userDataError: LICENSE_EXPIRED_ERROR });
    });

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
