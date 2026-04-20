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

import type { MessageSendParams, SendMessageResponse } from '@a2a-js/sdk';
import { describe, expect, test, vi } from 'vitest';

import { type A2ATransport, chooseA2ASourceStream } from './a2a-chat-language-model';

// Regression guards for the doStream transport-selection fix: the branches
// for streaming-capable vs. non-streaming agents must be mutually exclusive,
// and sendMessage errors must propagate instead of silently falling through
// to a second sendMessageStream dispatch.

const PARAMS: MessageSendParams = {
  message: {
    role: 'user',
    parts: [{ kind: 'text', text: 'hi' }],
    messageId: 'm1',
    kind: 'message',
  },
};

async function collect<T>(stream: ReadableStream<T>): Promise<T[]> {
  const out: T[] = [];
  const reader = stream.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (value !== undefined) {
      out.push(value);
    }
  }
  return out;
}

describe('chooseA2ASourceStream', () => {
  test('streaming-capable agent: only sendMessageStream is called', async () => {
    const sendMessage = vi.fn();
    const sendMessageStream = vi.fn(() => {
      async function* gen() {
        yield { kind: 'task', id: 't1' } as never;
      }
      return gen();
    });
    const client: A2ATransport = {
      getAgentCard: async () => ({ capabilities: { streaming: true } }),
      sendMessage,
      sendMessageStream,
    };

    const stream = await chooseA2ASourceStream(client, PARAMS);
    await collect(stream);

    expect(sendMessageStream).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('non-streaming agent: sendMessage fires once, result is replayed as single-event stream', async () => {
    const result = { kind: 'task', id: 't2', contextId: 'c1', status: { state: 'completed' } };
    const sendMessage = vi.fn(async () => ({ result } as unknown as SendMessageResponse));
    const sendMessageStream = vi.fn();
    const client: A2ATransport = {
      getAgentCard: async () => ({ capabilities: { streaming: false } }),
      sendMessage,
      sendMessageStream,
    };

    const stream = await chooseA2ASourceStream(client, PARAMS);
    const events = await collect(stream);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessageStream).not.toHaveBeenCalled();
    expect(events).toEqual([result]);
  });

  test('non-streaming agent: sendMessage error surfaces instead of falling through to stream', async () => {
    const sendMessage = vi.fn(async () => ({
      error: { code: -32603, message: 'upstream down' },
    } as unknown as SendMessageResponse));
    const sendMessageStream = vi.fn();
    const client: A2ATransport = {
      getAgentCard: async () => ({ capabilities: { streaming: false } }),
      sendMessage,
      sendMessageStream,
    };

    await expect(chooseA2ASourceStream(client, PARAMS)).rejects.toThrow(
      /A2A sendMessage failed: upstream down/
    );
    expect(sendMessageStream).not.toHaveBeenCalled();
  });

  test('undefined streaming capability is treated as non-streaming', async () => {
    const result = { kind: 'message', messageId: 'm-out' };
    const sendMessage = vi.fn(async () => ({ result } as unknown as SendMessageResponse));
    const sendMessageStream = vi.fn();
    const client: A2ATransport = {
      getAgentCard: async () => ({ capabilities: {} }),
      sendMessage,
      sendMessageStream,
    };

    await collect(await chooseA2ASourceStream(client, PARAMS));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessageStream).not.toHaveBeenCalled();
  });
});
