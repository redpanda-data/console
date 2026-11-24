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
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { CreateTopicResponseSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { createTopic } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import type { ComponentProps } from 'react';
import { useRef } from 'react';
import { render, screen, waitFor } from 'test-utils';

import { AddTopicStep } from './add-topic-step';
import type { AddTopicFormData, BaseStepRef } from '../types/wizard';

const mockFetch = rs.fn();
rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
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

rs.mock('state/backend-api', () => ({
  api: {
    refreshTopics: rs.fn(() => Promise.resolve()),
    refreshTopicConfig: rs.fn(() => Promise.resolve()),
    topicConfig: new Map(),
  },
}));

function MockAdvancedTopicSettings() {
  return <div data-testid="advanced-topic-settings" />;
}

rs.mock('./advanced-topic-settings', () => ({
  AdvancedTopicSettings: MockAdvancedTopicSettings,
}));

Element.prototype.scrollIntoView = rs.fn();

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

async function selectComboboxOption(user: ReturnType<typeof userEvent.setup>, placeholder: string, optionName: string) {
  const comboboxInput = await screen.findByPlaceholderText(placeholder);
  await user.click(comboboxInput);
  await user.type(comboboxInput, optionName);

  const option = await screen.findByRole('option', { name: optionName });
  await user.click(option);
}

describe('the AddTopicStep', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createTopicsResponse([])),
    });
  });

  describe('submitting the step', () => {
    it('existing topic returns name via triggerSubmit', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue({
        ok: true,
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

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      await selectComboboxOption(user, 'Select a topic', 'my-topic');

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
      const createTopicMock = rs.fn().mockReturnValue(
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
            message: expect.stringMatching(/Topic ".*" created/u),
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

    it('createTopic error returns failure result', async () => {
      const user = userEvent.setup();
      const createTopicMock = rs.fn().mockRejectedValue(new ConnectError('topic creation failed', 13));
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
  });

  describe('topic selection modes', () => {
    it('selectionMode=new hides existing/new toggle', () => {
      const transport = createTransport();

      render(<TestHarness onResult={() => {}} selectionMode="new" />, { transport });

      expect(screen.queryByRole('button', { name: 'Existing' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
    });

    it('selectionMode=existing shows combobox', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
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
        ok: true,
        json: () => Promise.resolve(createTopicsResponse(['existing-topic'])),
      });
      const transport = createTransport();

      render(<TestHarness onResult={() => {}} selectionMode="both" />, { transport });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const newButton = await screen.findByRole('button', { name: 'New' });
      await user.click(newButton);

      const input = screen.getByPlaceholderText('Enter a topic name');
      await user.type(input, 'existing-topic');

      await waitFor(() => {
        expect(screen.getByText(/already exists/u)).toBeInTheDocument();
      });
    });

    it('selectionMode=both renders toggle group', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createTopicsResponse(['t1'])),
      });
      const transport = createTransport();

      render(<TestHarness onResult={() => {}} selectionMode="both" />, { transport });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Existing' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
      });
    });
  });
});
