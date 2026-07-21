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

import type { UIMessage } from 'ai';
import { describe, expect, test } from 'vitest';

import { messagesToMarkdown } from './conversation';

const makeMessage = (
  role: UIMessage['role'],
  text: string
): UIMessage => ({
  id: `msg-${role}-${text}`,
  role,
  parts: [{ type: 'text', text }],
});

describe('messagesToMarkdown', () => {
  test('formats a single user message with a capitalised role label', () => {
    const md = messagesToMarkdown([makeMessage('user', 'hello')]);
    expect(md).toBe('**User:** hello');
  });

  test('formats assistant message and joins multiple messages with blank lines', () => {
    const md = messagesToMarkdown([
      makeMessage('user', 'ping'),
      makeMessage('assistant', 'pong'),
    ]);
    expect(md).toBe('**User:** ping\n\n**Assistant:** pong');
  });

  test('concatenates multiple text parts within a single message', () => {
    const message: UIMessage = {
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'part-a ' },
        { type: 'text', text: 'part-b' },
      ],
    };
    const md = messagesToMarkdown([message]);
    expect(md).toBe('**Assistant:** part-a part-b');
  });

  test('ignores non-text message parts', () => {
    const message: UIMessage = {
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'visible' },
        { type: 'step-start' },
      ],
    };
    const md = messagesToMarkdown([message]);
    expect(md).toBe('**Assistant:** visible');
  });

  test('uses a caller-supplied formatter when given', () => {
    const md = messagesToMarkdown(
      [makeMessage('user', 'hi'), makeMessage('assistant', 'yo')],
      (msg, i) =>
        `${i + 1}. <${msg.role}> ${msg.parts
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('')}`
    );
    expect(md).toBe('1. <user> hi\n\n2. <assistant> yo');
  });

  test('returns an empty string for an empty message list', () => {
    expect(messagesToMarkdown([])).toBe('');
  });
});
