import { afterEach, expect, rs, test } from '@rstest/core';
import { userEvent } from '@testing-library/user-event';
import { renderWithFileRoutes, screen } from 'test-utils';

import RpConnectPipelinesCreate from './pipelines-create';
import { MAX_TASKS, MIN_TASKS } from './tasks';
import { config } from '../../../config';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../state/backend-api';

/**
 * Chakra's `NumberInput` enforced `min`/`max` and let the field hold a transient empty or
 * out-of-range value, clamping it on blur. The Registry `Input` enforces neither and its steppers
 * write through the native value setter, so the page keeps a draft string and clamps on blur.
 *
 * Clamping in `onChange` instead type-checks and looks correct, but makes the field unclearable:
 * the cleared value snaps straight back to the minimum and the next digit appends to it. That is
 * invisible to `clampTasks`'s own unit tests, so it is pinned here against the real component.
 */
const COMPUTE_UNITS_LABEL = /Compute units/;

afterEach(() => {
  pipelinesApi.pipelines = undefined;
  rpcnSecretManagerApi.secrets = undefined;
  config.rpcnSecretsClient = undefined;
  rs.restoreAllMocks();
});

const renderCreatePage = () => {
  // Seeded so the page renders its form rather than the loading skeleton.
  pipelinesApi.pipelines = [] as never;
  rpcnSecretManagerApi.secrets = [] as never;
  // initPage refreshes secrets, which throws outright without a client.
  config.rpcnSecretsClient = {
    listSecrets: () => Promise.resolve({ response: { secrets: [], nextPageToken: '' } }),
  } as never;
  rs.spyOn(RpConnectPipelinesCreate.prototype, 'refreshData').mockImplementation(() => undefined);
  // The Cancel link needs a router context.
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
  // An empty field has to survive until blur; snapping back to MIN_TASKS here is what appends.
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
