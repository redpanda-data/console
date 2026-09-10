import { afterEach, expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import RpConnectSecretCreate from './secrets-create';
import { rpcnSecretManagerApi } from '../../../../state/backend-api';

// No Playwright coverage is possible: the OSS test variant configures no `SecretService`.
// Registry `Field` wires neither the label nor `required`, so both are asserted here.
const existingSecret = { id: 'EXISTING_SECRET' };
const SECRET_NAME_LABEL = /Secret name/;
const SECRET_VALUE_LABEL = /Secret value/;

afterEach(() => {
  rpcnSecretManagerApi.secrets = undefined;
  rs.restoreAllMocks();
});

const renderCreatePage = () => {
  rpcnSecretManagerApi.secrets = [existingSecret] as never;
  rs.spyOn(RpConnectSecretCreate.prototype, 'refreshData').mockImplementation(() => undefined);
  render(<RpConnectSecretCreate matchedPath="/rp-connect/secrets/create" />);
};

test('labels both fields and marks them required', () => {
  renderCreatePage();

  const name = screen.getByLabelText(SECRET_NAME_LABEL);
  const value = screen.getByLabelText(SECRET_VALUE_LABEL);

  expect(name).toBeRequired();
  expect(value).toBeRequired();
  expect(value).toHaveAttribute('type', 'password');
});

test('keeps submit disabled until a valid name and a value are present', async () => {
  const user = userEvent.setup();
  renderCreatePage();

  const submit = screen.getByTestId('submit-create-rpcn-secret');
  expect(submit).toBeDisabled();

  await user.type(screen.getByLabelText(SECRET_NAME_LABEL), 'NEW_SECRET');
  expect(submit).toBeDisabled();

  await user.type(screen.getByLabelText(SECRET_VALUE_LABEL), 'hunter2');
  expect(submit).toBeEnabled();
});

test('reports a name already in use and blocks submit', async () => {
  const user = userEvent.setup();
  renderCreatePage();

  await user.type(screen.getByLabelText(SECRET_NAME_LABEL), existingSecret.id);
  await user.type(screen.getByLabelText(SECRET_VALUE_LABEL), 'hunter2');

  expect(screen.getByRole('alert')).toHaveTextContent('Secret name is already in use');
  expect(screen.getByTestId('submit-create-rpcn-secret')).toBeDisabled();
});

test('reports an invalid name', async () => {
  const user = userEvent.setup();
  renderCreatePage();

  await user.type(screen.getByLabelText(SECRET_NAME_LABEL), '1_LEADING_DIGIT');

  expect(screen.getByRole('alert')).toHaveTextContent('The name you entered is invalid');
});
