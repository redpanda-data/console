import { expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConfirmModal } from './helper';

function renderRejectedConfirmation(error: unknown) {
  render(
    <ConfirmModal
      clearTarget={rs.fn<() => void>()}
      content={() => <span>Confirm the connector action</span>}
      onOk={rs.fn<() => Promise<void>>().mockRejectedValue(error)}
      successMessage={() => <span>Complete</span>}
      target={() => 'connector'}
    />
  );
}

test('shows structured API error text and permits retry', async () => {
  const user = userEvent.setup();
  renderRejectedConfirmation(new Error(JSON.stringify({ statusCode: 409, message: 'Connector already exists' })));
  await user.click(screen.getByRole('button', { name: 'Yes' }));
  expect(await screen.findByText('Connector already exists')).toBeVisible();
  expect(screen.getByText('409')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
});

test('keeps malformed structured errors as text rather than rendering an object', async () => {
  const user = userEvent.setup();
  const text = JSON.stringify({ statusCode: 500, message: { detail: 'Proxy failure' } });
  renderRejectedConfirmation(new Error(text));
  await user.click(screen.getByRole('button', { name: 'Yes' }));
  expect(await screen.findByText(text)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
});

test('reports a non-Error rejection and permits retry', async () => {
  const user = userEvent.setup();
  renderRejectedConfirmation(null);
  await user.click(screen.getByRole('button', { name: 'Yes' }));
  expect(await screen.findByText('An unexpected error occurred.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
});
