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
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { CreateTopicResponseSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { createTopic } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import type { ComponentProps } from 'react';
import { useRef } from 'react';
import { render, screen, waitFor } from 'test-utils';
import { asyncEvent } from 'utils/async-event';
import { reportActionError } from 'utils/toast.utils';

// Import component after mocks
import { AddTopicStep } from './add-topic-step';
import type { GetTopicsResponse } from '../../../../state/rest-interfaces';
import type { AddTopicFormData, BaseStepRef, StepSubmissionResult } from '../types/wizard';

// ── Mocks ──────────────────────────────────────────────────────────────

// 1. Mock config module with a controllable fetch
const mockFetch = rs.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
rs.mock('runtime-config', () => {
  const actual = rs.requireActual<typeof import('runtime-config')>('runtime-config');
  return {
    ...actual,
    config: {
      ...actual.config,
      jwt: 'test-jwt',
      restBasePath: '/api',
      fetch: (input: RequestInfo | URL, init?: RequestInit) => mockFetch(input, init),
    },
  };
});

// 2. Mock backend-api (used by useCreateTopicMutation onSuccess + useTopicConfigQuery)
rs.mock('state/backend-api', () => {
  const actual = rs.requireActual<typeof import('state/backend-api')>('state/backend-api');
  return {
    ...actual,
    api: {
      ...actual.api,
      refreshTopics: rs.fn(() => Promise.resolve()),
      refreshTopicConfig: rs.fn(() => Promise.resolve()),
      topicConfig: new Map(),
    },
  };
});

// 3. Mock AdvancedTopicSettings sub-component (not under test)
function MockAdvancedTopicSettings() {
  return <div data-testid="advanced-topic-settings" />;
}

rs.mock('./advanced-topic-settings', () => ({
  AdvancedTopicSettings: MockAdvancedTopicSettings,
}));

// 4. Polyfill scrollIntoView (not available in JSDOM, used by cmdk)
Element.prototype.scrollIntoView = rs.fn();

// ── Helpers ────────────────────────────────────────────────────────────

/** REST response for useLegacyListTopicsQuery */
function createTopicsResponse(topicNames: string[]): GetTopicsResponse {
  return {
    topics: topicNames.map((name) => ({
      topicName: name,
      isInternal: false,
      partitionCount: 1,
      replicationFactor: 3,
      cleanupPolicy: 'delete',
      documentation: 'UNKNOWN',
      logDirSummary: { totalSizeBytes: 0, replicaErrors: [], hint: null },
      allowedActions: undefined,
    })),
  };
}

/** Each invalidation gets a fresh, readable body, just like separate HTTP responses. */
function replyWithTopics(topicNames: string[]) {
  mockFetch.mockImplementation((input) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, window.location.href);
    if (url.pathname !== '/api/topics') {
      return Promise.reject(new Error(`Unexpected topic fixture request: ${url.pathname}`));
    }
    return Promise.resolve(Response.json(createTopicsResponse(topicNames)));
  });
}

function createTransport(overrides?: { createTopicMock?: ReturnType<typeof rs.fn> }) {
  return createRouterTransport(({ rpc }) => {
    rpc(
      createTopic,
      overrides?.createTopicMock ??
        rs.fn().mockReturnValue(
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
  onResult: (r: StepSubmissionResult<AddTopicFormData>) => void;
} & Partial<ComponentProps<typeof AddTopicStep>>;

function TestHarness({ onResult, ...props }: HarnessProps) {
  const ref = useRef<BaseStepRef<AddTopicFormData>>(null);
  return (
    <>
      <AddTopicStep hideTitle ref={ref} selectionMode="new" {...props} />
      <button
        data-testid="submit"
        onClick={asyncEvent(async () => {
          const step = ref.current;
          if (step === null) {
            throw new Error('Expected the mounted topic step');
          }
          onResult(await step.triggerSubmit());
        }, reportActionError)}
        type="button"
      >
        Submit
      </button>
    </>
  );
}

/** Opens the combobox, filters it to `optionName`, and clicks the matching option. */
async function selectComboboxOption(user: ReturnType<typeof userEvent.setup>, placeholder: string, optionName: string) {
  const comboboxInput = await screen.findByPlaceholderText(placeholder);
  await user.click(comboboxInput);
  await user.type(comboboxInput, optionName);

  const option = await screen.findByRole('option', { name: optionName });
  await user.click(option);
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('the AddTopicStep', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Default: return empty topic list
    replyWithTopics([]);
  });

  describe('submitting the step', () => {
    test('existing topic returns name via triggerSubmit', async () => {
      const user = userEvent.setup();
      replyWithTopics(['my-topic', 'other-topic']);

      let result: StepSubmissionResult<AddTopicFormData> | undefined;
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
        expect(mockFetch).toHaveBeenCalledWith('/api/topics', {
          method: 'GET',
          headers: { Authorization: 'Bearer test-jwt' },
        });
      });

      // The component starts in "Existing" mode when topics exist.
      // Open the combobox, type to filter, then click the matching option.
      // (Pressing Enter races cmdk's highlighted-value bookkeeping in CI under
      // load — clicking the rendered option is deterministic.)
      await selectComboboxOption(user, 'Select a topic', 'my-topic');

      // Submit
      const submitBtn = screen.getByTestId('submit');
      await user.click(submitBtn);

      await waitFor(() => {
        expect(result).toMatchObject({
          success: true,
          data: { topicName: 'my-topic' },
        });
      });
    });

    test('new topic calls createTopic RPC', async () => {
      const user = userEvent.setup();
      const createTopicMock = rs.fn().mockReturnValue(
        create(CreateTopicResponseSchema, {
          topicName: 'new-topic',
          partitionCount: 1,
          replicationFactor: 3,
        })
      );
      const transport = createTransport({ createTopicMock });

      render(<TestHarness onResult={() => undefined} selectionMode="new" />, { transport });

      const input = screen.getByPlaceholderText('Enter a topic name');
      await user.type(input, 'new-topic');

      const submitBtn = screen.getByTestId('submit');
      await user.click(submitBtn);

      await waitFor(() => {
        expect(createTopicMock.mock.calls[0]?.[0]).toMatchObject({
          topic: {
            name: 'new-topic',
            partitionCount: 1,
            replicationFactor: 3,
            configs: [{ name: 'cleanup.policy', value: 'delete' }],
          },
        });
      });
    });

    test('new topic returns success result', async () => {
      const user = userEvent.setup();
      const transport = createTransport();

      let result: StepSubmissionResult<AddTopicFormData> | undefined;
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
        expect(result?.success).toBe(true);
        expect(result?.message).toMatch(/Topic ".*" created/);
      });
    });

    test('empty topic name rejected', async () => {
      const user = userEvent.setup();
      const transport = createTransport();

      let result: StepSubmissionResult<AddTopicFormData> | undefined;
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
        expect(result).toMatchObject({ success: false });
      });
    });

    test('invalid characters rejected', async () => {
      const user = userEvent.setup();
      const transport = createTransport();

      let result: StepSubmissionResult<AddTopicFormData> | undefined;
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
        expect(result).toMatchObject({ success: false });
      });
    });

    test('createTopic error returns failure result', async () => {
      const user = userEvent.setup();
      const createTopicMock = rs.fn().mockRejectedValue(new ConnectError('topic creation failed', Code.Internal));
      const transport = createTransport({ createTopicMock });

      let result: StepSubmissionResult<AddTopicFormData> | undefined;
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
        expect(result).toMatchObject({
          success: false,
          message: 'Failed to save topic configuration',
        });
      });
    });
  });

  describe('topic selection modes', () => {
    test('selectionMode=new hides existing/new toggle', () => {
      const transport = createTransport();

      render(<TestHarness onResult={() => undefined} selectionMode="new" />, { transport });

      expect(screen.queryByRole('button', { name: 'Existing' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
    });

    test('selectionMode=existing shows combobox', async () => {
      replyWithTopics(['topic-a']);
      const transport = createTransport();

      render(<TestHarness onResult={() => undefined} selectionMode="existing" />, { transport });

      const combobox = await screen.findByPlaceholderText('Select a topic');
      expect(combobox).toBeInTheDocument();
    });

    test('existing topic alert shown in create mode when name matches', async () => {
      const user = userEvent.setup();
      replyWithTopics(['existing-topic']);
      const transport = createTransport();

      render(<TestHarness onResult={() => undefined} selectionMode="both" />, { transport });

      await selectComboboxOption(user, 'Select a topic', 'existing-topic');
      expect(mockFetch).toHaveBeenCalledWith('/api/topics', {
        method: 'GET',
        headers: { Authorization: 'Bearer test-jwt' },
      });

      // Switch to "New" tab (single-select ToggleGroupItem renders as a Base UI toggle button (aria-pressed))
      await user.click(await screen.findByRole('button', { name: 'New' }));

      // Type a name matching an existing topic
      const input = screen.getByPlaceholderText('Enter a topic name');
      await user.type(input, 'existing-topic');

      // Assert alert about existing topic appears
      await waitFor(() => {
        expect(screen.getByText(/already exists/)).toBeInTheDocument();
      });
    });

    test('selectionMode=both renders toggle group', async () => {
      replyWithTopics(['t1']);
      const transport = createTransport();

      render(<TestHarness onResult={() => undefined} selectionMode="both" />, { transport });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Existing' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
      });
    });
  });
});
