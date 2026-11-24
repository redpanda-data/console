import { createClient, createRouterTransport } from '@connectrpc/connect';
import { expect, onTestFinished, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { PipelineService } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { SecretService } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';

import RpConnectSecretCreate from './secrets-create';
import { config } from '../../../../config';
import { appGlobal } from '../../../../state/app-global';
import { rpcnSecretManagerApi } from '../../../../state/backend-api';

const existingSecret = { id: 'EXISTING_SECRET' };
const SECRET_NAME_LABEL = /Secret name/u;
const SECRET_VALUE_LABEL = /Secret value/u;

const renderCreatePage = () => {
  const clients = { pipelinesClient: config.pipelinesClient, rpcnSecretsClient: config.rpcnSecretsClient };
  const { secrets, secretsByPipeline } = rpcnSecretManagerApi;
  const { onRefresh } = appGlobal;
  const transport = createRouterTransport(({ rpc }) => {
    rpc(PipelineService.method.getPipelinesBySecrets, () => ({ response: {} }));
    rpc(SecretService.method.listSecrets, () => ({ response: { secrets: [existingSecret] } }));
  });
  rpcnSecretManagerApi.secrets = undefined;
  Object.assign(config, {
    pipelinesClient: createClient(PipelineService, transport),
    rpcnSecretsClient: createClient(SecretService, transport),
  });

  onTestFinished(() => {
    Object.assign(config, clients);
    Object.assign(rpcnSecretManagerApi, { secrets, secretsByPipeline });
    appGlobal.onRefresh = onRefresh;
  });

  render(<RpConnectSecretCreate matchedPath="/rp-connect/secrets/create" />);
  return screen.findByLabelText(SECRET_NAME_LABEL);
};

function expectRequiredCredentials(name: HTMLElement, value: HTMLElement) {
  expect(name).toBeRequired();
  expect(value).toBeRequired();
  expect(value).toHaveAttribute('type', 'password');
}

test('requires a name and a masked value before enabling submit', async () => {
  const user = userEvent.setup();
  const name = await renderCreatePage();
  const value = screen.getByLabelText(SECRET_VALUE_LABEL);
  const submit = screen.getByTestId('submit-create-rpcn-secret');
  expectRequiredCredentials(name, value);
  expect(submit).toBeDisabled();

  await user.type(name, 'NEW_SECRET');
  expect(submit).toBeDisabled();

  await user.type(value, 'hunter2');
  expect(submit).toBeEnabled();
});

test('reports a name already in use and blocks submit', async () => {
  const user = userEvent.setup();
  const name = await renderCreatePage();

  await user.type(name, existingSecret.id);
  await user.type(screen.getByLabelText(SECRET_VALUE_LABEL), 'hunter2');

  expect(screen.getByRole('alert')).toHaveTextContent('Secret name is already in use');
  expect(screen.getByTestId('submit-create-rpcn-secret')).toBeDisabled();
});

test('reports an invalid name', async () => {
  const user = userEvent.setup();
  const name = await renderCreatePage();

  await user.type(name, '1_LEADING_DIGIT');

  expect(screen.getByRole('alert')).toHaveTextContent('The name you entered is invalid');
});
