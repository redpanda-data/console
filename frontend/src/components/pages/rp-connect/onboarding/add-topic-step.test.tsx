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

import { create } from '@bufbuild/protobuf';
import { ConnectError, createRouterTransport } from '@connectrpc/connect';
import userEvent from '@testing-library/user-event';
import { CreateTopicResponseSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { createTopic } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import type { ComponentProps } from 'react';
import { useRef } from 'react';
import { render, screen, waitFor } from 'test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AddTopicFormData, BaseStepRef } from '../types/wizard';

// ── Mocks ──────────────────────────────────────────────────────────────

// 1. Mock config module with a controllable fetch
const mockFetch = vi.fn();
vi.mock('config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('config')>();
  return {
    ...actual,
    config: {
      ...actual.config,
      jwt: 'test-jwt',
      restBasePath: '/api',
      fetch: (...args: unknown[]) => mockFetch(...args),
    },
  };
});

// 2. Mock backend-api (used by useCreateTopicMutation onSuccess + useTopicConfigQuery)
vi.mock('state/backend-api', () => ({
  api: {
    refreshTopics: vi.fn(() => Promise.resolve()),
    refreshTopicConfig: vi.fn(() => Promise.resolve()),
    topicConfig: new Map(),
  },
}));

// 3. Mock AdvancedTopicSettings sub-component (not under test)
vi.mock('./advanced-topic-settings', () => ({
  AdvancedTopicSettings: () => <div data-testid="advanced-topic-settings" />,
}));

// 4. Polyfill scrollIntoView (not available in JSDOM, used by cmdk)
Element.prototype.scrollIntoView = vi.fn();

// Import component after mocks
import { AddTopicStep } from './add-topic-step';

// ── Helpers ────────────────────────────────────────────────────────────

/** REST response for useLegacyListTopicsQuery */
function createTopicsResponse(topicNames: string[]) {
  return {
    topics: topicNames.map((name) => ({
      topicName: name,
      isInternal: false,
      partitionCount: 1,
      replicationFactor: 3,
      cleanupPolicy: 'delete',
      documentation: 'UNKNOWN' as const,
      logDirSummary: { totalSizeBytes: 0, partitionCount: 0, replicaErrors: [] },
      allowedActions: undefined,
    })),
  };
}

function createTransport(overrides?: { createTopicMock?: ReturnType<typeof vi.fn> }) {
  return createRouterTransport(({ rpc }) => {
    rpc(
      createTopic,
      overrides?.createTopicMock ??
        vi.fn().mockReturnValue(
          create(CreateTopicResponseSchema, {
            topicName: 'new-topic',
            partitionCount: 1,
            replicationFactor: 3,
          })
        )
    );
  });
}

type HarnessProps = {
  onResult: (r: unknown) => void;
} & Partial<ComponentProps<typeof AddTopicStep>>;

function TestHarness({ onResult, ...props }: HarnessProps) {
  const ref = useRef<BaseStepRef<AddTopicFormData>>(null);
  return (
    <>
      <AddTopicStep hideTitle ref={ref} selectionMode="new" {...props} />
      <button data-testid="submit" onClick={async () => onResult(await ref.current!.triggerSubmit())} type="button">
        Submit
      </button>
    </>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('AddTopicStep', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Default: return empty topic list
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve(createTopicsResponse([])),
    });
  });

  it('existing topic returns name via triggerSubmit', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve(createTopicsResponse(['my-topic', 'other-topic'])),
    });

    let result: unknown;
    const transport = createTransport();

    render(
      <TestHarness
        onResult={(r) => {
          result = r;
        }}
        selectionMode="both"
      />,
      { transport }
    );

    // Wait for topics to load so the combobox has options
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // The component starts in "Existing" mode when topics exist.
    // Open the combobox, type to filter, then select with Enter (autocomplete)
    const comboboxInput = await screen.findByPlaceholderText('Select a topic');
    await user.click(comboboxInput);
    await user.type(comboboxInput, 'my-topic');

    // Use Enter to autocomplete select the best match
    await user.keyboard('{Enter}');

    // Submit
    const submitBtn = screen.getByTestId('submit');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ topicName: 'my-topic' }),
        })
      );
    });
  });

  it('new topic calls createTopic RPC', async () => {
    const user = userEvent.setup();
    const createTopicMock = vi.fn().mockReturnValue(
      create(CreateTopicResponseSchema, {
        topicName: 'new-topic',
        partitionCount: 1,
        replicationFactor: 3,
      })
    );
    const transport = createTransport({ createTopicMock });

    render(<TestHarness onResult={() => {}} selectionMode="new" />, { transport });

    const input = screen.getByPlaceholderText('Enter a topic name');
    await user.type(input, 'new-topic');

    const submitBtn = screen.getByTestId('submit');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createTopicMock).toHaveBeenCalled();
    });
  });

  it('new topic returns success result', async () => {
    const user = userEvent.setup();
    const transport = createTransport();

    let result: unknown;
    render(
      <TestHarness
        onResult={(r) => {
          result = r;
        }}
        selectionMode="new"
      />,
      { transport }
    );

    const input = screen.getByPlaceholderText('Enter a topic name');
    await user.type(input, 'new-topic');

    const submitBtn = screen.getByTestId('submit');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          message: expect.stringMatching(/Topic ".*" created/),
        })
      );
    });
  });

  it('empty topic name rejected', async () => {
    const user = userEvent.setup();
    const transport = createTransport();

    let result: unknown;
    render(
      <TestHarness
        onResult={(r) => {
          result = r;
        }}
        selectionMode="new"
      />,
      { transport }
    );

    // Do not type anything — leave topic name empty
    const submitBtn = screen.getByTestId('submit');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(result).toEqual(expect.objectContaining({ success: false }));
    });
  });

  it('invalid characters rejected', async () => {
    const user = userEvent.setup();
    const transport = createTransport();

    let result: unknown;
    render(
      <TestHarness
        onResult={(r) => {
          result = r;
        }}
        selectionMode="new"
      />,
      { transport }
    );

    const input = screen.getByPlaceholderText('Enter a topic name');
    await user.type(input, 'bad topic name');

    const submitBtn = screen.getByTestId('submit');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(result).toEqual(expect.objectContaining({ success: false }));
    });
  });

  it('selectionMode=new hides existing/new toggle', async () => {
    const transport = createTransport();

    render(<TestHarness onResult={() => {}} selectionMode="new" />, { transport });

    // The ToggleGroup with "Existing" / "New" buttons should NOT be present
    expect(screen.queryByRole('button', { name: 'Existing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
  });

  it('selectionMode=existing shows combobox', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve(createTopicsResponse(['topic-a'])),
    });
    const transport = createTransport();

    render(<TestHarness onResult={() => {}} selectionMode="existing" />, { transport });

    const combobox = await screen.findByPlaceholderText('Select a topic');
    expect(combobox).toBeInTheDocument();
  });

  it('existing topic alert shown in create mode when name matches', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve(createTopicsResponse(['existing-topic'])),
    });
    const transport = createTransport();

    render(<TestHarness onResult={() => {}} selectionMode="both" />, { transport });

    // Wait for topics to load
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Switch to "New" tab (ToggleGroupItem renders as role="radio")
    const newButton = await screen.findByRole('radio', { name: 'New' });
    await user.click(newButton);

    // Type a name matching an existing topic
    const input = screen.getByPlaceholderText('Enter a topic name');
    await user.type(input, 'existing-topic');

    // Assert alert about existing topic appears
    await waitFor(() => {
      expect(screen.getByText(/already exists/)).toBeInTheDocument();
    });
  });

  it('createTopic error returns failure result', async () => {
    const user = userEvent.setup();
    const createTopicMock = vi.fn().mockRejectedValue(new ConnectError('topic creation failed', 13));
    const transport = createTransport({ createTopicMock });

    let result: unknown;
    render(
      <TestHarness
        onResult={(r) => {
          result = r;
        }}
        selectionMode="new"
      />,
      { transport }
    );

    const input = screen.getByPlaceholderText('Enter a topic name');
    await user.type(input, 'valid-topic');

    const submitBtn = screen.getByTestId('submit');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          message: 'Failed to save topic configuration',
        })
      );
    });
  });

  it('selectionMode=both renders toggle group', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve(createTopicsResponse(['t1'])),
    });
    const transport = createTransport();

    render(<TestHarness onResult={() => {}} selectionMode="both" />, { transport });

    // ToggleGroupItem renders as role="radio"
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Existing' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'New' })).toBeInTheDocument();
    });
  });
});
