import { afterEach, expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import RpConnectSecretCreate from './secrets-create';
import { rpcnSecretManagerApi } from '../../../../state/backend-api';

/**
 * The rp-connect secrets form has no Playwright coverage: the OSS test variant configures no
 * `SecretService`, so `/rp-connect/secrets/create` cannot be exercised live in any variant.
 *
 * What the Registry swap can break here is invisible to the type checker, so this covers the
 * three contracts that changed shape:
 *   - Chakra's `FormField` generated an id and wired the label; the Registry `Field` does not,
 *     so both inputs are resolved by their label text.
 *   - Chakra's `isRequired` stamped `required` on the control; `FieldLabel required` only paints
 *     an asterisk, so `required` is passed explicitly.
 *   - the submit button stays disabled until both fields are valid.
 */
const existingSecret = { id: 'EXISTING_SECRET' };

afterEach(() => {
  rpcnSecretManagerApi.secrets = undefined;
  rs.restoreAllMocks();
});

const renderCreatePage = () => {
  // Seeded so the page renders its form rather than the loading skeleton.
  rpcnSecretManagerApi.secrets = [existingSecret] as never;
  rs.spyOn(RpConnectSecretCreate.prototype, 'refreshData').mockImplementation(() => undefined);
  render(<RpConnectSecretCreate matchedPath="/rp-connect/secrets/create" />);
};

test('labels both fields and marks them required', () => {
  renderCreatePage();

  const name = screen.getByLabelText(/Secret name/);
  const value = screen.getByLabelText(/Secret value/);

  expect(name).toBeRequired();
  expect(value).toBeRequired();
  // The reveal toggle the Registry Input adds only exists for a password field.
  expect(value).toHaveAttribute('type', 'password');
});

test('keeps submit disabled until a valid name and a value are present', async () => {
  const user = userEvent.setup();
  renderCreatePage();

  const submit = screen.getByTestId('submit-create-rpcn-secret');
  expect(submit).toBeDisabled();

  await user.type(screen.getByLabelText(/Secret name/), 'NEW_SECRET');
  // Still no value, so still disabled.
  expect(submit).toBeDisabled();

  await user.type(screen.getByLabelText(/Secret value/), 'hunter2');
  expect(submit).toBeEnabled();
});

test('reports a name already in use and blocks submit', async () => {
  const user = userEvent.setup();
  renderCreatePage();

  await user.type(screen.getByLabelText(/Secret name/), existingSecret.id);
  await user.type(screen.getByLabelText(/Secret value/), 'hunter2');

  expect(screen.getByRole('alert')).toHaveTextContent('Secret name is already in use');
  expect(screen.getByTestId('submit-create-rpcn-secret')).toBeDisabled();
});

test('reports an invalid name', async () => {
  const user = userEvent.setup();
  renderCreatePage();

  await user.type(screen.getByLabelText(/Secret name/), '1_LEADING_DIGIT');

  expect(screen.getByRole('alert')).toHaveTextContent('The name you entered is invalid');
});
