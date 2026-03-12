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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import type { TopicMessage } from '../../state/rest-interfaces';

// Track messages returned by convertListMessageData
let convertCallIndex = 0;
const fakeMessages: TopicMessage[] = [];

vi.mock('../../utils/message-converters', () => ({
  convertListMessageData: () => {
    const msg = fakeMessages[convertCallIndex];
    convertCallIndex++;
    return msg;
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock config with a fake consoleClient
const mockListMessages = vi.fn();
vi.mock('../../config', () => ({
  config: {
    get consoleClient() {
      return { listMessages: mockListMessages };
    },
  },
}));

import { useLogSearch } from './logs';

function makeMessage(id: number, keyJson = 'pipeline-1'): TopicMessage {
  return {
    partitionID: 0,
    offset: id,
    timestamp: Date.now() + id,
    compression: 'uncompressed',
    isTransactional: false,
    headers: [],
    key: { payload: keyJson, isPayloadNull: false, encoding: 'text', schemaId: 0, size: 0 },
    value: { payload: { message: `msg-${id}` }, isPayloadNull: false, encoding: 'json', schemaId: 0, size: 10 },
    valueJson: JSON.stringify({ message: `msg-${id}` }),
    valueBinHexPreview: '',
    keyJson,
    keyBinHexPreview: '',
  } as TopicMessage;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useLogSearch live mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    convertCallIndex = 0;
    fakeMessages.length = 0;
  });

  test('prepends new messages in live mode (newest first)', async () => {
    const msg1 = makeMessage(1);
    const msg2 = makeMessage(2);
    const msg3 = makeMessage(3);
    fakeMessages.push(msg1, msg2, msg3);

    mockListMessages.mockImplementation(async function* () {
      for (const _msg of fakeMessages) {
        yield {
          controlMessage: {
            case: 'data' as const,
            value: {}, // passed to convertListMessageData mock which uses fakeMessages by index
          },
        };
      }
      yield {
        controlMessage: {
          case: 'done' as const,
          value: {},
        },
      };
    });

    const { result } = renderHook(
      () =>
        useLogSearch({
          pipelineId: 'pipeline-1',
          live: true,
          enabled: true,
          serverless: false,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(3);
    });

    // Newest message (msg3) should be first, oldest (msg1) last
    expect(result.current.messages[0].offset).toBe(3);
    expect(result.current.messages[1].offset).toBe(2);
    expect(result.current.messages[2].offset).toBe(1);
  });
});
