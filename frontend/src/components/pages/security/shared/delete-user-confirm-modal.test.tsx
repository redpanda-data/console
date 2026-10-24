import { describe, expect, rs, test } from '@rstest/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DeleteUserConfirmModal } from './delete-user-confirm-modal';

async function renderConfirmedModal(onConfirm: () => Promise<void>) {
  const user = userEvent.setup();
  const onOpenChange = rs.fn();
  render(<DeleteUserConfirmModal onConfirm={onConfirm} onOpenChange={onOpenChange} open userName="alice" />);
  await user.click(screen.getByPlaceholderText('Type "alice" to confirm'));
  await user.paste('alice');
  return { user, onOpenChange };
}

describe('the DeleteUserConfirmModal', () => {
  test('ignores repeat confirms while the deletion is pending, then closes', async () => {
    const deletion = Promise.withResolvers<void>();
    const onConfirm = rs.fn(() => deletion.promise);
    const { user, onOpenChange } = await renderConfirmedModal(onConfirm);

    await user.dblClick(screen.getByTestId('test-delete-item'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('test-delete-item')).toBeDisabled();

    deletion.resolve();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  test('shows a delayed failure, stays open, and allows another attempt', async () => {
    const deletion = Promise.withResolvers<void>();
    const onConfirm = rs.fn(() => deletion.promise);
    const { user, onOpenChange } = await renderConfirmedModal(onConfirm);

    await user.dblClick(screen.getByTestId('test-delete-item'));
    deletion.reject(new Error('user is still referenced'));

    expect(await screen.findByRole('alert')).toHaveTextContent('user is still referenced');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('test-delete-item')).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  test('cannot be dismissed while a deletion is pending, so a late failure is still shown', async () => {
    const deletion = Promise.withResolvers<void>();
    const { user, onOpenChange } = await renderConfirmedModal(() => deletion.promise);

    await user.click(screen.getByTestId('test-delete-item'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');
    deletion.reject(new Error('user is still referenced'));

    expect(await screen.findByRole('alert')).toHaveTextContent('user is still referenced');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
