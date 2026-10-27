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

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { act, fireEvent, renderWithFileRoutes, screen, waitFor } from 'test-utils';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockMutateAsync = rs.fn();
const TOPIC_NAME_LABEL = /topic name/i;

rs.mock('../../../react-query/api/topic', () => {
  const actual = rs.requireActual<typeof import('../../../react-query/api/topic')>('../../../react-query/api/topic');
  return {
    ...actual,
    useCreateTopicMutation: rs.fn(() => ({
      mutateAsync: mockMutateAsync,
      isPending: false,
    })),
  };
});

rs.mock('../../../state/backend-api', () => {
  const actual = rs.requireActual<typeof import('../../../state/backend-api')>('../../../state/backend-api');
  return {
    ...actual,
    api: {
      ...actual.api,
      isRedpanda: false,
      clusterOverview: null,
      clusterInfo: undefined,
      refreshCluster: rs.fn(),
      refreshClusterOverview: rs.fn(),
      refreshClusterHealth: rs.fn().mockResolvedValue(undefined),
    },
  };
});

rs.mock('../../../config', () => {
  const actual = rs.requireActual<typeof import('../../../config')>('../../../config');
  return {
    ...actual,
    isServerless: rs.fn(() => false),
    config: {
      ...actual.config,
      isServerless: false,
    },
  };
});

rs.mock('sonner', () => ({
  toast: {
    success: rs.fn(),
    error: rs.fn(),
  },
}));

// ── Component import (after mocks) ────────────────────────────────────────────

import { CreateTopicDialog } from './create-topic-dialog';

// ── Helpers ───────────────────────────────────────────────────────────────────

Element.prototype.scrollIntoView = rs.fn();

function renderDialog(isOpen = true, onClose = rs.fn()) {
  return renderWithFileRoutes(<CreateTopicDialog isOpen={isOpen} onClose={onClose} />, {
    initialLocation: '/topics',
  });
}

type User = ReturnType<typeof userEvent.setup>;

async function typeTopicName(user: User, name: string) {
  await user.type(screen.getByTestId('topic-name'), name);
}

/** Replaces the content of a numeric field and returns the input. */
async function replaceNumber(user: User, testId: string, value: string) {
  const input = screen.getByTestId(testId);
  await user.clear(input);
  await user.type(input, value);
  return input;
}

async function fillCreateForm(
  user: User,
  values: { topicName: string; partitions?: string; replicationFactor?: string }
) {
  await typeTopicName(user, values.topicName);
  if (values.partitions !== undefined) {
    await replaceNumber(user, 'topic-partitions', values.partitions);
  }
  if (values.replicationFactor !== undefined) {
    await replaceNumber(user, 'topic-replication-factor', values.replicationFactor);
  }
}

async function submitWhenEnabled(user: User) {
  await waitFor(() => {
    expect(screen.getByTestId('onOk-button')).not.toBeDisabled();
  });

  await user.click(screen.getByTestId('onOk-button'));
}

/** Pastes an invalid name and leaves the field, so its error renders. */
async function enterTopicName(user: User, name: string) {
  const input = screen.getByRole('textbox', { name: TOPIC_NAME_LABEL });
  await user.click(input);
  await user.paste(name);
  await user.tab();
  return input;
}

/** Submits the form that owns `input` directly, bypassing the disabled Create button. */
async function submitOwningForm(input: HTMLElement) {
  const form = input.closest('form');
  if (!form) {
    throw new Error('Topic name must belong to the create form');
  }
  await act(() => {
    fireEvent.submit(form);
  });
}

/** Points the api at a Redpanda cluster; returns a restore for the Kafka defaults the other tests expect. */
async function simulateRedpandaCluster(clusterOverview: unknown) {
  const { api } = await import('../../../state/backend-api');
  Object.assign(api, { isRedpanda: true, clusterOverview });
  return () => {
    Object.assign(api, { isRedpanda: false, clusterOverview: null });
  };
}

async function clickAndExpectPropertyRows(user: User, button: HTMLElement, count: number) {
  await user.click(button);

  await waitFor(() => {
    expect(screen.getAllByPlaceholderText('Property Name...')).toHaveLength(count);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('the CreateTopicDialog', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mockMutateAsync.mockResolvedValue({
      topicName: 'my-topic',
      partitionCount: 1,
      replicationFactor: 1,
    });
  });

  describe('topic name', () => {
    test('create button is disabled when topic name is empty', () => {
      renderDialog();

      const createButton = screen.getByTestId('onOk-button');
      expect(createButton).toBeDisabled();
    });

    test.each([
      ['topic with spaces', 'Topic name cannot contain spaces'],
      ['orders/', 'Use only letters, numbers, dots, underscores, and hyphens'],
      ['orders-消費者', 'Use only letters, numbers, dots, underscores, and hyphens'],
      ['.', 'Topic name cannot be . or ..'],
      ['..', 'Topic name cannot be . or ..'],
      ['a'.repeat(250), 'Topic name must be 249 characters or fewer'],
    ])('rejects invalid topic name %s without sending a request', async (name, message) => {
      const user = userEvent.setup();
      renderDialog();

      const input = await enterTopicName(user, name);

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAccessibleDescription(message);
      expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();

      await submitOwningForm(input);
      await waitFor(() => expect(mockMutateAsync).not.toHaveBeenCalled());
    });

    test('accepts a 249-character topic name and submits it unchanged', async () => {
      const user = userEvent.setup();
      const name = `orders.${'a'.repeat(239)}_-9`;
      renderDialog();

      await user.click(screen.getByRole('textbox', { name: TOPIC_NAME_LABEL }));
      await user.paste(name);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() =>
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            topic: expect.objectContaining({ name }),
          })
        )
      );
    });

    test('create button is enabled when topic name is valid', async () => {
      const user = userEvent.setup();
      renderDialog();

      const topicNameInput = screen.getByTestId('topic-name');
      await user.type(topicNameInput, 'valid-topic-name');

      await waitFor(() => {
        expect(screen.getByTestId('onOk-button')).not.toBeDisabled();
      });
    });
  });

  describe('numeric fields', () => {
    test('partitions field shows validation error for values less than 1', async () => {
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

    test('replication factor validation error from validateReplicationFactor (even number on Redpanda)', async () => {
      // Simulate a Redpanda cluster so superRefine runs the odd-number check
      const restoreApi = await simulateRedpandaCluster({ kafka: { version: '3.0' } });

      const user = userEvent.setup();
      renderDialog();

      await typeTopicName(user, 'valid-topic');

      const replicationFactorInput = await replaceNumber(user, 'topic-replication-factor', '2');
      fireEvent.blur(replicationFactorInput);

      await waitFor(() => {
        expect(screen.getByText(/replication factor must be an odd number/i)).toBeInTheDocument();
      });

      expect(screen.getByTestId('onOk-button')).toBeDisabled();

      // Restore api defaults so other tests are not affected
      restoreApi();
    });
  });

  describe('submission', () => {
    test('successful submission shows success state with topic name and stats', async () => {
      const user = userEvent.setup();
      mockMutateAsync.mockResolvedValue({
        topicName: 'my-new-topic',
        partitionCount: 3,
        replicationFactor: 1,
      });

      renderDialog();

      await typeTopicName(user, 'my-new-topic');
      await submitWhenEnabled(user);

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

    test('success state falls back to the requested counts when the broker reports -1', async () => {
      const user = userEvent.setup();
      // Brokers on CreateTopics response versions < 5 return -1 even for explicit requests
      mockMutateAsync.mockResolvedValue({
        topicName: 'my-new-topic',
        partitionCount: -1,
        replicationFactor: -1,
      });

      renderDialog();

      await fillCreateForm(user, { topicName: 'my-new-topic', partitions: '5', replicationFactor: '3' });
      await submitWhenEnabled(user);

      await waitFor(() => {
        expect(screen.getAllByText('Topic created').length).toBeGreaterThanOrEqual(1);
      });

      // The values the user asked for, not the broker's -1 placeholders
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.queryByText('—')).not.toBeInTheDocument();
    });

    test('the API error shows inline Alert and form stays open', async () => {
      const user = userEvent.setup();
      const apiError = new Error('topic already exists');
      apiError.name = 'ConnectError';
      mockMutateAsync.mockRejectedValue(apiError);

      renderDialog();

      await typeTopicName(user, 'duplicate-topic');
      await submitWhenEnabled(user);

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
  });

  describe('cluster-specific fields', () => {
    test('shows "Min in-sync replicas" field for Kafka clusters (UX-1460)', () => {
      renderDialog();

      expect(screen.getByTestId('topic-min-insync-replicas')).toBeInTheDocument();
    });

    test('hides "Min in-sync replicas" field for Redpanda clusters (UX-1460)', async () => {
      const restoreApi = await simulateRedpandaCluster({ kafka: { distribution: 'REDPANDA' } });

      renderDialog();

      expect(screen.queryByTestId('topic-min-insync-replicas')).not.toBeInTheDocument();

      // Restore api defaults so other tests are not affected
      restoreApi();
    });

    test('refreshes cluster overview whenever the dialog opens, so isRedpanda is never stale (UX-1460)', async () => {
      const { api } = await import('../../../state/backend-api');
      const onClose = rs.fn();

      // Dialog mounts closed: the unconditional mount effect still fires once.
      const { rerender } = renderDialog(false, onClose);

      await waitFor(() => {
        expect(api.refreshClusterOverview).toHaveBeenCalled();
      });

      (api.refreshClusterOverview as ReturnType<typeof rs.fn>).mockClear();

      // Reopening the dialog (e.g. after closing it without a page refresh) must
      // re-fetch the cluster overview rather than relying on a stale cached value.
      rerender(<CreateTopicDialog isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(api.refreshClusterOverview).toHaveBeenCalled();
      });
    });
  });

  describe('additional configuration', () => {
    test('additional config rows can be added and removed', async () => {
      const user = userEvent.setup();
      renderDialog();

      // Initially one empty row is rendered (from defaultValues)
      const initialRows = screen.getAllByPlaceholderText('Property Name...');
      expect(initialRows).toHaveLength(1);

      // Add a second row, then a third
      const addEntryButton = screen.getByRole('button', { name: /add entry/i });
      await clickAndExpectPropertyRows(user, addEntryButton, 2);
      await clickAndExpectPropertyRows(user, addEntryButton, 3);

      // Remove buttons are ghost buttons that contain only an svg XIcon (no text label)
      const removeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.querySelector('svg') !== null && !btn.textContent?.trim());

      expect(removeButtons.length).toBeGreaterThanOrEqual(1);
      await clickAndExpectPropertyRows(user, removeButtons[0], 2);
    });
  });
});
