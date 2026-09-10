import { afterEach, expect, rs, test } from '@rstest/core';
import { userEvent } from '@testing-library/user-event';
import { renderWithFileRoutes, screen } from 'test-utils';

import RpConnectPipelinesCreate from './pipelines-create';
import { MAX_TASKS, MIN_TASKS } from './tasks';
import { config } from '../../../config';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../state/backend-api';

// The compute-units field clamps on blur, not in onChange. `clampTasks`'s unit tests cannot see
// the difference; clamping per keystroke makes the field unclearable.
const COMPUTE_UNITS_LABEL = /Compute units/;

afterEach(() => {
  pipelinesApi.pipelines = undefined;
  rpcnSecretManagerApi.secrets = undefined;
  config.rpcnSecretsClient = undefined;
  rs.restoreAllMocks();
});

const renderCreatePage = () => {
  pipelinesApi.pipelines = [] as never;
  rpcnSecretManagerApi.secrets = [] as never;
  // initPage refreshes secrets, which throws without a client.
  config.rpcnSecretsClient = {
    listSecrets: () => Promise.resolve({ response: { secrets: [], nextPageToken: '' } }),
  } as never;
  rs.spyOn(RpConnectPipelinesCreate.prototype, 'refreshData').mockImplementation(() => undefined);
  renderWithFileRoutes(<RpConnectPipelinesCreate matchedPath="/rp-connect/create" />);
};

test('defaults the compute units to the minimum', () => {
  renderCreatePage();

  expect(screen.getByLabelText(COMPUTE_UNITS_LABEL)).toHaveValue(MIN_TASKS);
});

test('clearing the compute units then typing replaces the value rather than appending to it', async () => {
  const user = userEvent.setup();
  renderCreatePage();
  const field = screen.getByLabelText(COMPUTE_UNITS_LABEL);

  await user.clear(field);
  // The empty value has to survive until blur.
  expect(field).toHaveValue(null);

  await user.type(field, '5');
  expect(field).toHaveValue(5);
});

test('pulls a typed value above the maximum back to the bound on blur', async () => {
  const user = userEvent.setup();
  renderCreatePage();
  const field = screen.getByLabelText(COMPUTE_UNITS_LABEL);

  await user.clear(field);
  await user.type(field, '999');
  expect(field).toHaveValue(999);

  await user.tab();
  expect(field).toHaveValue(MAX_TASKS);
});

test('pulls a cleared field back to the minimum on blur', async () => {
  const user = userEvent.setup();
  renderCreatePage();
  const field = screen.getByLabelText(COMPUTE_UNITS_LABEL);

  await user.clear(field);
  await user.tab();

  expect(field).toHaveValue(MIN_TASKS);
});
