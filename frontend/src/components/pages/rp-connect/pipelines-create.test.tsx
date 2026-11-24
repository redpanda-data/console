import { createClient, createRouterTransport } from '@connectrpc/connect';
import { expect, onTestFinished, test } from '@rstest/core';
import { userEvent } from '@testing-library/user-event';
import { PipelineService } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { SecretService } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { PipelineService as DataplanePipelineService } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { renderWithFileRoutes, screen } from 'test-utils';

import RpConnectPipelinesCreate from './pipelines-create';
import { MAX_TASKS, MIN_TASKS } from './tasks';
import { config } from '../../../config';
import { appGlobal } from '../../../state/app-global';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../state/backend-api';

const COMPUTE_UNITS_LABEL = /Compute units/u;

const transport = createRouterTransport(({ rpc }) => {
  rpc(PipelineService.method.listPipelines, () => ({ response: {} }));
  rpc(PipelineService.method.getPipelinesBySecrets, () => ({ response: {} }));
  rpc(SecretService.method.listSecrets, () => ({ response: {} }));
  rpc(DataplanePipelineService.method.listComponents, () => ({ components: {} }));
});

const renderCreatePage = () => {
  const clients = { pipelinesClient: config.pipelinesClient, rpcnSecretsClient: config.rpcnSecretsClient };
  const { pipelines, pipelinesError } = pipelinesApi;
  const { secrets, secretsByPipeline } = rpcnSecretManagerApi;
  const { onRefresh } = appGlobal;
  pipelinesApi.pipelines = undefined;
  rpcnSecretManagerApi.secrets = undefined;
  Object.assign(config, {
    pipelinesClient: createClient(PipelineService, transport),
    rpcnSecretsClient: createClient(SecretService, transport),
  });

  onTestFinished(() => {
    Object.assign(config, clients);
    Object.assign(pipelinesApi, { pipelines, pipelinesError });
    Object.assign(rpcnSecretManagerApi, { secrets, secretsByPipeline });
    appGlobal.onRefresh = onRefresh;
  });

  renderWithFileRoutes(<RpConnectPipelinesCreate matchedPath="/rp-connect/create" />, { transport });
  return screen.findByLabelText(COMPUTE_UNITS_LABEL);
};

test('clearing the compute units then typing replaces the value rather than appending to it', async () => {
  const user = userEvent.setup();
  const field = await renderCreatePage();

  await user.clear(field);
  expect(field).toHaveValue(null);

  await user.type(field, '5');
  expect(field).toHaveValue(5);
});

test('pulls a typed value above the maximum back to the bound on blur', async () => {
  const user = userEvent.setup();
  const field = await renderCreatePage();

  await user.clear(field);
  await user.type(field, '999');
  expect(field).toHaveValue(999);

  await user.tab();
  expect(field).toHaveValue(MAX_TASKS);
});

test('starts at the minimum and restores it when an empty field loses focus', async () => {
  const user = userEvent.setup();
  const field = await renderCreatePage();
  expect(field).toHaveValue(MIN_TASKS);

  await user.clear(field);
  await user.tab();

  expect(field).toHaveValue(MIN_TASKS);
});
