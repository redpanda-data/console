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

import { Code, ConnectError, createClient, createRouterTransport } from '@connectrpc/connect';
import { expect, onTestFinished, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import {
  AuthenticationMethod,
  AuthenticationService,
  type LoginSaslScramRequest,
  SASLMechanism,
} from 'protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import LoginPage from './login';
import { config } from '../../config';

function serveRejectedLogin() {
  const requests: LoginSaslScramRequest[] = [];
  const reply = Promise.withResolvers<void>();
  const initialAuthClient = config.authenticationClient;
  const transport = createRouterTransport(({ rpc }) => {
    rpc(AuthenticationService.method.listAuthenticationMethods, () => ({ methods: [AuthenticationMethod.BASIC] }));
    rpc(AuthenticationService.method.loginSaslScram, async (request) => {
      requests.push(request);
      await reply.promise;
      throw new ConnectError('invalid credentials', Code.Unauthenticated);
    });
  });
  config.authenticationClient = createClient(AuthenticationService, transport);
  onTestFinished(() => {
    reply.resolve();
    config.authenticationClient = initialAuthClient;
  });

  return { requests, rejectLogin: () => reply.resolve() };
}

async function submitCredentials() {
  const user = userEvent.setup();
  await user.type(await screen.findByTestId('auth-username-input'), 'e2euser');
  await user.type(screen.getByTestId('auth-password-input'), 'not-the-password');
  const submit = screen.getByTestId('auth-submit');
  await user.click(submit);
  return submit;
}

test('shows a rejected password inline and re-enables the form', async () => {
  const { requests, rejectLogin } = serveRejectedLogin();
  renderWithFileRoutes(<LoginPage />, { initialLocation: '/login' });
  const submit = await submitCredentials();

  await waitFor(() =>
    expect(requests).toEqual([
      expect.objectContaining({
        username: 'e2euser',
        password: 'not-the-password',
        mechanism: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
      }),
    ])
  );
  expect(submit).toBeDisabled();

  rejectLogin();
  expect(await screen.findByTestId('auth-error')).toHaveTextContent('invalid credentials');
  expect(submit).toBeEnabled();
  expect(screen.getByTestId('auth-password-input')).toBeEnabled();
});
