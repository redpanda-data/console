import { describe, expect, test } from '@rstest/core';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { ModalContainer, openModal } from './modal-container';

type ModalProps = { label: string; closeModal: () => void };
const ContractModal = ({ label, closeModal }: ModalProps) => (
  <button onClick={closeModal} type="button">
    {label}
  </button>
);

describe('modal injected-prop contract', () => {
  test('adds the real close callback while preserving caller props', () => {
    render(<ModalContainer />);
    act(() => openModal<ModalProps>(ContractModal, { label: 'Close contract modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close contract modal' }));
    expect(screen.queryByRole('button', { name: 'Close contract modal' })).toBeNull();
  });
});
