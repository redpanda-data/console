/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { AI_AGENT_SECRET_TEXT, SecretSelector } from './secret-selector';

const mockCreateSecret = vi.fn().mockResolvedValue({});

// Mock the secret mutation hook - SecretSelector uses it for the "Create secret" dialog
vi.mock('react-query/api/secret', () => ({
  useCreateSecretMutation: () => ({
    mutateAsync: mockCreateSecret,
    isPending: false,
  }),
}));

const availableSecrets = [
  { id: 'OPENAI_API_KEY', name: 'OPENAI_API_KEY' },
  { id: 'COHERE_API_KEY', name: 'COHERE_API_KEY' },
];

const defaultProps = {
  onChange: vi.fn(),
  availableSecrets,
  scopes: [],
  customText: AI_AGENT_SECRET_TEXT,
} as const;

describe('SecretSelector', () => {
  test('displays secret name when value is in template format "${secrets.NAME}"', () => {
    render(<SecretSelector {...defaultProps} value="${secrets.OPENAI_API_KEY}" />);

    // The trigger should show the secret name, not the raw template string
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('OPENAI_API_KEY');
    expect(trigger).not.toHaveTextContent('${secrets.OPENAI_API_KEY}');
  });

  test('displays secret name when value is already a plain ID', () => {
    render(<SecretSelector {...defaultProps} value="COHERE_API_KEY" />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('COHERE_API_KEY');
  });

  test('shows placeholder when value is empty', () => {
    render(<SecretSelector {...defaultProps} value="" />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Select from secrets store or create new');
  });

  test('shows newly created secret in dropdown after creation from empty state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <SecretSelector {...defaultProps} availableSecrets={[]} onChange={onChange} value="" />,
    );

    // Empty state should show "Create secret" button
    const createButton = screen.getByRole('button', { name: /create secret/i });
    await user.click(createButton);

    // Fill in the dialog form
    const nameInput = screen.getByLabelText(/secret name/i);
    const valueInput = screen.getByLabelText(/secret value/i);
    await user.type(nameInput, 'MY_NEW_SECRET');
    await user.type(valueInput, 'sk-test-value-that-is-long-enough');

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /^create secret$/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('MY_NEW_SECRET');
    });

    // Simulate parent updating value and the query refetch providing the new secret
    rerender(
      <SecretSelector
        {...defaultProps}
        availableSecrets={[{ id: 'MY_NEW_SECRET', name: 'MY_NEW_SECRET' }]}
        onChange={onChange}
        value="MY_NEW_SECRET"
      />,
    );

    // The newly created secret should be selected and displayed
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('MY_NEW_SECRET');
  });
});
