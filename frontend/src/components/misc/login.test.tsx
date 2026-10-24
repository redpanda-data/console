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
import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { AuthenticationMethod, SASLMechanism } from 'protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { act, renderWithFileRoutes, screen } from 'test-utils';

import LoginPage from './login';
import { config as appConfig } from '../../config';

describe('the LoginPage', () => {
  const initialAuthClient = appConfig.authenticationClient;
  const loginSaslScram = rs.fn();

  beforeEach(() => {
    loginSaslScram.mockReset();
    appConfig.authenticationClient = {
      listAuthenticationMethods: () => Promise.resolve({ methods: [AuthenticationMethod.BASIC] }),
      loginSaslScram,
    } as unknown as typeof appConfig.authenticationClient;
  });

  afterEach(() => {
    appConfig.authenticationClient = initialAuthClient;
  });

  test('shows a rejected password inline and re-enables the form', async () => {
    const reject = rejectNextLogin(loginSaslScram);
    const user = userEvent.setup();

    renderWithFileRoutes(<LoginPage />, { initialLocation: '/login' });

    const submit = await submitCredentials(user, 'e2euser', 'not-the-password');

    expectSingleLoginRequest(loginSaslScram, submit);

    act(() => {
      reject(new ConnectError('invalid credentials', Code.Unauthenticated));
    });

    const alert = await screen.findByTestId('auth-error');
    expect(alert).toHaveTextContent('invalid credentials');
    expect(submit).toBeEnabled();
    expect(screen.getByTestId('auth-password-input')).toBeEnabled();
  });
});

function rejectNextLogin(login: ReturnType<typeof rs.fn>) {
  let reject!: (reason: unknown) => void;
  login.mockImplementation(
    () =>
      new Promise((_, rejectPromise) => {
        reject = rejectPromise;
      })
  );
  return (reason: unknown) => reject(reason);
}

async function submitCredentials(user: ReturnType<typeof userEvent.setup>, username: string, password: string) {
  await user.type(await screen.findByTestId('auth-username-input'), username);
  await user.type(screen.getByTestId('auth-password-input'), password);
  const submit = screen.getByTestId('auth-submit');
  await user.click(submit);
  return submit;
}

function expectSingleLoginRequest(login: ReturnType<typeof rs.fn>, submit: HTMLElement) {
  // In flight: one request went out and the button cannot fire a second one.
  expect(login).toHaveBeenCalledTimes(1);
  expect(login).toHaveBeenCalledWith(
    expect.objectContaining({
      username: 'e2euser',
      password: 'not-the-password',
      mechanism: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
    })
  );
  expect(submit).toBeDisabled();
}
