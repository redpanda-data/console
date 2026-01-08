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

import { create } from '@bufbuild/protobuf';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnyValueSchema, KeyValueSchema } from 'protogen/redpanda/otel/v1/common_pb';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import { SpanSchema } from 'protogen/redpanda/otel/v1/trace_pb';
import { describe, expect, test } from 'vitest';

import { LLMIOTab } from './llm-io-tab';

// Test regex patterns - extracted to top level for performance (Biome lint requirement)
const CONVERSATION_HISTORY_PATTERN = /conversation history/i;
const TEMPERATURE_PATTERN = /"temperature":\s*65/;
const CONDITION_PATTERN = /"condition":\s*"cloudy"/;
const FIRST_PART_PATTERN = /First part/;
const FIRST_PART_SECOND_PART_PATTERN = /First part\s+Second part/;
const INPUT_PATTERN = /Input:/;
const OUTPUT_PATTERN = /Output:/;
const TOTAL_150_PATTERN = /150 total/;
const THREE_MESSAGES_PATTERN = /3 messages/;

// Helper: Create span with given attributes
function createSpan(attributes: Array<{ key: string; value: string }>): Span {
  return create(SpanSchema, {
    attributes: attributes.map((attr) =>
      create(KeyValueSchema, {
        key: attr.key,
        value: create(AnyValueSchema, {
          value: {
            case: 'stringValue',
            value: attr.value,
          },
        }),
      })
    ),
  });
}

// Helper: Create span with OpenTelemetry input messages
function createSpanWithInputMessages(messages: unknown[]): Span {
  return createSpan([
    {
      key: 'gen_ai.input.messages',
      value: JSON.stringify(messages),
    },
    {
      key: 'gen_ai.request.model',
      value: 'test-model',
    },
  ]);
}

// Helper: Create span with both input and output messages
function createSpanWithInputOutput(input: unknown[], output: unknown[]): Span {
  return createSpan([
    {
      key: 'gen_ai.input.messages',
      value: JSON.stringify(input),
    },
    {
      key: 'gen_ai.output.messages',
      value: JSON.stringify(output),
    },
    {
      key: 'gen_ai.request.model',
      value: 'test-model',
    },
  ]);
}

// Helper: Create span with indexed format
function createSpanWithIndexedMessages(): Span {
  return createSpan([
    {
      key: 'gen_ai.prompt.0.role',
      value: 'user',
    },
    {
      key: 'gen_ai.prompt.0.content',
      value: 'Indexed message',
    },
    {
      key: 'gen_ai.request.model',
      value: 'test-model',
    },
  ]);
}

describe('LLMIOTab - OpenTelemetry Message Support', () => {
  test('should parse messages with parts array structure', () => {
    const span = createSpanWithInputOutput(
      [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What is the weather?' }],
        },
      ],
      [
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Let me check that for you.' }],
        },
      ]
    );

    render(<LLMIOTab span={span} />);

    // INPUT shows last message from input array
    expect(screen.getByText('What is the weather?')).toBeInTheDocument();
    // OUTPUT shows last message from output array
    expect(screen.getByText('Let me check that for you.')).toBeInTheDocument();
  });

  test('should parse both gen_ai.input.messages and gen_ai.output.messages', () => {
    const span = createSpanWithInputOutput(
      [{ role: 'user', parts: [{ type: 'text', content: 'Input message' }] }],
      [{ role: 'assistant', parts: [{ type: 'text', content: 'Output message' }] }]
    );

    render(<LLMIOTab span={span} />);

    expect(screen.getByText('Input message')).toBeInTheDocument();
    expect(screen.getByText('Output message')).toBeInTheDocument();
  });

  test('should display tool calls from message parts', async () => {
    const user = userEvent.setup();
    const span = createSpanWithInputOutput(
      [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Previous question' }],
        },
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Previous answer' }],
        },
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What is the weather in SF?' }],
        },
      ],
      [
        {
          role: 'assistant',
          parts: [
            { type: 'text', content: 'I will check the weather.' },
            {
              type: 'tool_call',
              name: 'get_weather',
              arguments: { location: 'San Francisco' },
            },
          ],
        },
      ]
    );

    render(<LLMIOTab span={span} />);

    // INPUT shows last message from input array
    expect(screen.getByText('What is the weather in SF?')).toBeInTheDocument();

    // OUTPUT shows last message from output array with tool call
    expect(screen.getByText('I will check the weather.')).toBeInTheDocument();

    // Previous messages are in history
    expect(screen.getByRole('button', { name: CONVERSATION_HISTORY_PATTERN })).toBeInTheDocument();

    // Expand conversation history
    await user.click(screen.getByRole('button', { name: CONVERSATION_HISTORY_PATTERN }));

    // Check history messages
    expect(screen.getByText('Previous question')).toBeInTheDocument();
    expect(screen.getByText('Previous answer')).toBeInTheDocument();
  });

  test('should display tool responses from message parts', async () => {
    const user = userEvent.setup();
    const span = createSpanWithInputOutput(
      [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What is the weather?' }],
        },
        {
          role: 'tool',
          parts: [
            { type: 'text', content: 'Previous tool result' },
            {
              type: 'tool_call_response',
              response: { temperature: 65, condition: 'cloudy' },
            },
          ],
        },
        {
          role: 'user',
          parts: [{ type: 'text', content: 'How about tomorrow?' }],
        },
      ],
      [
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Tomorrow will be warmer.' }],
        },
      ]
    );

    render(<LLMIOTab span={span} />);

    // INPUT shows last message from input array (second user message)
    expect(screen.getByText('How about tomorrow?')).toBeInTheDocument();

    // OUTPUT shows last message from output array
    expect(screen.getByText('Tomorrow will be warmer.')).toBeInTheDocument();

    // Previous messages are in history (first user message and tool message)
    expect(screen.getByRole('button', { name: CONVERSATION_HISTORY_PATTERN })).toBeInTheDocument();

    // Expand conversation history to see tool response
    await user.click(screen.getByRole('button', { name: CONVERSATION_HISTORY_PATTERN }));

    expect(screen.getByText('Tool Response')).toBeInTheDocument();
    expect(screen.getByText(TEMPERATURE_PATTERN)).toBeInTheDocument();
    expect(screen.getByText(CONDITION_PATTERN)).toBeInTheDocument();
  });

  test('should support simple {role, content} format for backward compatibility', () => {
    const span = createSpanWithInputMessages([{ role: 'user', content: 'Simple message' }]);

    render(<LLMIOTab span={span} />);

    expect(screen.getByText('Simple message')).toBeInTheDocument();
  });

  test('should fallback to indexed format pattern', async () => {
    const user = userEvent.setup();
    const span = createSpanWithIndexedMessages();

    render(<LLMIOTab span={span} />);

    // Single message goes to conversation history
    expect(screen.getByRole('button', { name: CONVERSATION_HISTORY_PATTERN })).toBeInTheDocument();

    // Expand to see the message
    await user.click(screen.getByRole('button', { name: CONVERSATION_HISTORY_PATTERN }));

    expect(screen.getByText('Indexed message')).toBeInTheDocument();
  });

  test('should join multiple text parts with newlines', () => {
    const span = createSpanWithInputOutput(
      [
        {
          role: 'user',
          parts: [
            { type: 'text', content: 'First part' },
            { type: 'text', content: 'Second part' },
          ],
        },
      ],
      []
    );

    render(<LLMIOTab span={span} />);

    const textElement = screen.getByText(FIRST_PART_PATTERN);
    expect(textElement.textContent).toMatch(FIRST_PART_SECOND_PART_PATTERN);
  });

  test('should handle malformed JSON gracefully', () => {
    const span = createSpan([
      {
        key: 'gen_ai.input.messages',
        value: 'invalid json {{',
      },
      {
        key: 'gen_ai.request.model',
        value: 'test-model',
      },
    ]);

    render(<LLMIOTab span={span} />);

    // Should not crash when JSON is malformed
    // Model is present, so component renders but without messages
    expect(screen.getByText('Model:')).toBeInTheDocument();
    expect(screen.getByText('test-model')).toBeInTheDocument();

    // No INPUT/OUTPUT sections should be shown since no valid messages
    expect(screen.queryByText('INPUT')).not.toBeInTheDocument();
    expect(screen.queryByText('OUTPUT')).not.toBeInTheDocument();
  });

  test('should show last input message as INPUT and last output message as OUTPUT', () => {
    const span = createSpanWithInputOutput(
      [
        { role: 'system', parts: [{ type: 'text', content: 'System prompt' }] },
        { role: 'user', parts: [{ type: 'text', content: 'User request' }] },
      ],
      [{ role: 'assistant', parts: [{ type: 'text', content: 'Assistant response' }] }]
    );

    render(<LLMIOTab span={span} />);

    // Check INPUT section - shows last message from input array
    expect(screen.getByText('INPUT')).toBeInTheDocument();
    expect(screen.getByText('User request')).toBeInTheDocument();

    // Check OUTPUT section - shows last message from output array
    expect(screen.getByText('OUTPUT')).toBeInTheDocument();
    expect(screen.getByText('Assistant response')).toBeInTheDocument();
  });

  test('should show last message from each array separately', () => {
    const span = createSpanWithInputOutput(
      [
        { role: 'user', parts: [{ type: 'text', content: 'User message' }] },
        { role: 'assistant', parts: [{ type: 'text', content: 'Input assistant message' }] },
      ],
      [{ role: 'assistant', parts: [{ type: 'text', content: 'Output assistant message' }] }]
    );

    render(<LLMIOTab span={span} />);

    // INPUT section shows last message from input array (assistant message)
    expect(screen.getByText('INPUT')).toBeInTheDocument();
    expect(screen.getByText('Input assistant message')).toBeInTheDocument();

    // OUTPUT section shows last message from output array
    expect(screen.getByText('OUTPUT')).toBeInTheDocument();
    expect(screen.getByText('Output assistant message')).toBeInTheDocument();

    // User message should be in history
    expect(screen.getByRole('button', { name: CONVERSATION_HISTORY_PATTERN })).toBeInTheDocument();
  });

  test('should handle messages with empty parts array', () => {
    const span = createSpanWithInputOutput(
      [{ role: 'user', parts: [] }],
      [{ role: 'assistant', parts: [{ type: 'text', content: 'Response' }] }]
    );

    render(<LLMIOTab span={span} />);

    // Should not crash, OUTPUT message should be displayed
    expect(screen.getByText('Response')).toBeInTheDocument();
  });

  test('should display model information', () => {
    const span = createSpanWithInputMessages([{ role: 'user', parts: [{ type: 'text', content: 'Test' }] }]);

    render(<LLMIOTab span={span} />);

    expect(screen.getByText('Model:')).toBeInTheDocument();
    expect(screen.getByText('test-model')).toBeInTheDocument();
  });

  test('should display token counts when available', () => {
    const span = createSpan([
      {
        key: 'gen_ai.input.messages',
        value: JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: 'Test' }] }]),
      },
      {
        key: 'gen_ai.usage.input_tokens',
        value: '100',
      },
      {
        key: 'gen_ai.usage.output_tokens',
        value: '50',
      },
      {
        key: 'gen_ai.request.model',
        value: 'test-model',
      },
    ]);

    render(<LLMIOTab span={span} />);

    // Check for input token display
    expect(screen.getByText(INPUT_PATTERN)).toBeInTheDocument();
    const inputTokenDisplay = screen.getByText('100');
    expect(inputTokenDisplay).toBeInTheDocument();

    // Check for output token display
    expect(screen.getByText(OUTPUT_PATTERN)).toBeInTheDocument();
    const outputTokenDisplay = screen.getByText('50');
    expect(outputTokenDisplay).toBeInTheDocument();

    // Check for total
    expect(screen.getByText(TOTAL_150_PATTERN)).toBeInTheDocument();
  });

  test('should show conversation history with correct message count', async () => {
    const user = userEvent.setup();
    const span = createSpanWithInputOutput(
      [
        { role: 'system', parts: [{ type: 'text', content: 'System' }] },
        { role: 'user', parts: [{ type: 'text', content: 'User 1' }] },
        { role: 'assistant', parts: [{ type: 'text', content: 'Assistant 1' }] },
        { role: 'user', parts: [{ type: 'text', content: 'User 2' }] },
      ],
      [{ role: 'assistant', parts: [{ type: 'text', content: 'Assistant 2' }] }]
    );

    render(<LLMIOTab span={span} />);

    // INPUT shows last message from input array (User 2)
    const inputSections = screen.getAllByText('INPUT');
    expect(inputSections.length).toBeGreaterThan(0);
    expect(screen.getByText('User 2')).toBeInTheDocument();

    // OUTPUT shows last message from output array (Assistant 2)
    const outputSections = screen.getAllByText('OUTPUT');
    expect(outputSections.length).toBeGreaterThan(0);
    expect(screen.getByText('Assistant 2')).toBeInTheDocument();

    // History should exclude last input and output messages
    // System + User 1 + Assistant 1 = 3 messages
    expect(screen.getByText(THREE_MESSAGES_PATTERN)).toBeInTheDocument();

    // Expand to see history
    await user.click(screen.getByRole('button', { name: CONVERSATION_HISTORY_PATTERN }));

    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('User 1')).toBeInTheDocument();
    expect(screen.getByText('Assistant 1')).toBeInTheDocument();
  });
});
