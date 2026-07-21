/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import userEvent from '@testing-library/user-event';
import { fireEvent, renderWithFileRoutes, screen, waitFor } from 'test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockMutateAsync = vi.fn();

vi.mock('../../../react-query/api/topic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../react-query/api/topic')>();
  return {
    ...actual,
    useCreateTopicMutation: vi.fn(() => ({
      mutateAsync: mockMutateAsync,
      isPending: false,
    })),
  };
});

vi.mock('../../../state/backend-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../state/backend-api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      isRedpanda: false,
      clusterOverview: null,
      clusterInfo: undefined,
      refreshCluster: vi.fn(),
      refreshClusterOverview: vi.fn(),
      refreshClusterHealth: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('../../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config')>();
  return {
    ...actual,
    isServerless: vi.fn(() => false),
    config: {
      ...actual.config,
      isServerless: false,
    },
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Component import (after mocks) ────────────────────────────────────────────

import { CreateTopicDialog } from './create-topic-dialog';

// ── Helpers ───────────────────────────────────────────────────────────────────

Element.prototype.scrollIntoView = vi.fn();

function renderDialog(isOpen = true, onClose = vi.fn()) {
  return renderWithFileRoutes(<CreateTopicDialog isOpen={isOpen} onClose={onClose} />, {
    initialLocation: '/topics',
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CreateTopicDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({
      topicName: 'my-topic',
      partitionCount: 1,
      replicationFactor: 1,
    });
  });

  test('Create button is disabled when topic name is empty', async () => {
    renderDialog();

    const createButton = screen.getByTestId('onOk-button');
    expect(createButton).toBeDisabled();
  });

  test('Shows inline validation error when topic name contains spaces', async () => {
    const user = userEvent.setup();
    renderDialog();

    const topicNameInput = screen.getByTestId('topic-name');
    await user.type(topicNameInput, 'topic with spaces');

    await waitFor(() => {
      expect(screen.getByText(/topic name cannot contain spaces/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId('onOk-button')).toBeDisabled();
  });

  test('Create button is enabled when topic name is valid', async () => {
    const user = userEvent.setup();
    renderDialog();

    const topicNameInput = screen.getByTestId('topic-name');
    await user.type(topicNameInput, 'valid-topic-name');

    await waitFor(() => {
      expect(screen.getByTestId('onOk-button')).not.toBeDisabled();
    });
  });

  test('Partitions field shows validation error for values less than 1', async () => {
    const user = userEvent.setup();
    renderDialog();

    // Type a valid topic name first so form is otherwise valid
    const topicNameInput = screen.getByTestId('topic-name');
    await user.type(topicNameInput, 'valid-topic');

    const partitionsInput = screen.getByTestId('topic-partitions');
    await user.clear(partitionsInput);
    // Type 0 — Zod's min(1) rule rejects it
    await user.type(partitionsInput, '0');
    // fireEvent.blur explicitly marks the field as touched so RHF renders the FieldError
    fireEvent.blur(partitionsInput);

    await waitFor(() => {
      expect(screen.getByText(/must be at least 1/i)).toBeInTheDocument();
    });
  });

  test('Replication factor validation error from validateReplicationFactor (even number on Redpanda)', async () => {
    // Override api to simulate a Redpanda cluster so superRefine runs the odd-number check
    const { api } = await import('../../../state/backend-api');
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (api as any).isRedpanda = true;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (api as any).clusterOverview = { kafka: { version: '3.0' } };

    const user = userEvent.setup();
    renderDialog();

    const topicNameInput = screen.getByTestId('topic-name');
    await user.type(topicNameInput, 'valid-topic');

    const replicationFactorInput = screen.getByTestId('topic-replication-factor');
    await user.clear(replicationFactorInput);
    await user.type(replicationFactorInput, '2');
    fireEvent.blur(replicationFactorInput);

    await waitFor(() => {
      expect(screen.getByText(/replication factor must be an odd number/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId('onOk-button')).toBeDisabled();

    // Restore api defaults so other tests are not affected
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    (api as any).isRedpanda = false;
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    (api as any).clusterOverview = null;
  });

  test('Successful submission shows success state with topic name and stats', async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockResolvedValue({
      topicName: 'my-new-topic',
      partitionCount: 3,
      replicationFactor: 1,
    });

    renderDialog();

    const topicNameInput = screen.getByTestId('topic-name');
    await user.type(topicNameInput, 'my-new-topic');

    await waitFor(() => {
      expect(screen.getByTestId('onOk-button')).not.toBeDisabled();
    });

    await user.click(screen.getByTestId('onOk-button'));

    await waitFor(() => {
      // "Topic created" appears in both the dialog title and the success body paragraph
      const topicCreatedElements = screen.getAllByText('Topic created');
      expect(topicCreatedElements.length).toBeGreaterThanOrEqual(1);
    });

    // Shows the topic name in the success view
    expect(screen.getByText('my-new-topic')).toBeInTheDocument();

    // Shows partition count and label
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Partitions')).toBeInTheDocument();

    // Shows replication factor label
    expect(screen.getByText('Replication factor')).toBeInTheDocument();
  });

  test('API error shows inline Alert and form stays open', async () => {
    const user = userEvent.setup();
    const apiError = new Error('topic already exists');
    apiError.name = 'ConnectError';
    mockMutateAsync.mockRejectedValue(apiError);

    renderDialog();

    const topicNameInput = screen.getByTestId('topic-name');
    await user.type(topicNameInput, 'duplicate-topic');

    await waitFor(() => {
      expect(screen.getByTestId('onOk-button')).not.toBeDisabled();
    });

    await user.click(screen.getByTestId('onOk-button'));

    await waitFor(() => {
      // Alert title shows the error name
      expect(screen.getByText('ConnectError')).toBeInTheDocument();
      // Alert description shows the error message
      expect(screen.getByText('topic already exists')).toBeInTheDocument();
    });

    // Form is still visible — not replaced by the success state
    expect(screen.getByTestId('topic-name')).toBeInTheDocument();
    expect(screen.getByTestId('onOk-button')).toBeInTheDocument();
  });

  test('Additional config rows can be added and removed', async () => {
    const user = userEvent.setup();
    renderDialog();

    // Initially one empty row is rendered (from defaultValues)
    const initialRows = screen.getAllByPlaceholderText('Property Name...');
    expect(initialRows).toHaveLength(1);

    // Add a second row
    const addEntryButton = screen.getByRole('button', { name: /add entry/i });
    await user.click(addEntryButton);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Property Name...')).toHaveLength(2);
    });

    // Add a third row
    await user.click(addEntryButton);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Property Name...')).toHaveLength(3);
    });

    // Remove buttons are ghost buttons that contain only an svg XIcon (no text label)
    const removeButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.querySelector('svg') !== null && !btn.textContent?.trim());

    expect(removeButtons.length).toBeGreaterThanOrEqual(1);
    await user.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Property Name...')).toHaveLength(2);
    });
  });
});
