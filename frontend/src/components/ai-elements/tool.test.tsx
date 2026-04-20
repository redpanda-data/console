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

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from './tool';

describe('ToolHeader', () => {
  test('renders static tool with name derived from type', () => {
    render(
      <Tool>
        <ToolHeader state="output-available" type="tool-get-weather" />
      </Tool>
    );
    expect(screen.getByText('get-weather')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  test('renders dynamic tool using the provided toolName prop', () => {
    render(
      <Tool>
        <ToolHeader
          state="input-available"
          toolName="mcp_list_topics"
          type="dynamic-tool"
        />
      </Tool>
    );
    // The dynamic tool's runtime name should be shown verbatim, not derived
    // from the constant `dynamic-tool` type.
    expect(screen.getByText('mcp_list_topics')).toBeInTheDocument();
    expect(screen.getByText('Working')).toBeInTheDocument();
  });

  test('shows "Awaiting Approval" badge for approval-requested state', () => {
    render(
      <Tool>
        <ToolHeader
          state="approval-requested"
          toolName="mcp_delete_topic"
          type="dynamic-tool"
        />
      </Tool>
    );
    expect(screen.getByText('Awaiting Approval')).toBeInTheDocument();
  });

  test('shows "Responded" badge for approval-responded state', () => {
    render(
      <Tool>
        <ToolHeader
          state="approval-responded"
          toolName="mcp_delete_topic"
          type="dynamic-tool"
        />
      </Tool>
    );
    expect(screen.getByText('Responded')).toBeInTheDocument();
  });

  test('shows "Denied" badge for output-denied state', () => {
    render(
      <Tool>
        <ToolHeader
          state="output-denied"
          toolName="mcp_delete_topic"
          type="dynamic-tool"
        />
      </Tool>
    );
    expect(screen.getByText('Denied')).toBeInTheDocument();
  });

  test('explicit title overrides derived name', () => {
    render(
      <Tool>
        <ToolHeader
          state="output-available"
          title="Custom Title"
          type="tool-get-weather"
        />
      </Tool>
    );
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.queryByText('get-weather')).not.toBeInTheDocument();
  });

  test('renders duration when output is available', () => {
    render(
      <Tool>
        <ToolHeader
          durationMs={1234}
          state="output-available"
          type="tool-get-weather"
        />
      </Tool>
    );
    expect(screen.getByText('1.23s')).toBeInTheDocument();
  });

  test('renders sub-second duration as ms', () => {
    render(
      <Tool>
        <ToolHeader
          durationMs={850}
          state="output-available"
          type="tool-get-weather"
        />
      </Tool>
    );
    expect(screen.getByText('850ms')).toBeInTheDocument();
  });

  test('renders toolCallId when provided', () => {
    render(
      <Tool>
        <ToolHeader
          state="output-available"
          toolCallId="call-xyz-123"
          type="tool-get-weather"
        />
      </Tool>
    );
    expect(screen.getByText('call-xyz-123')).toBeInTheDocument();
  });

  test('copy button title uses derived name for static tools', () => {
    render(
      <Tool>
        <ToolHeader
          state="output-available"
          toolCallId="call-xyz-123"
          type="tool-get-weather"
        />
      </Tool>
    );
    // Regression guard: previously used `toolName` which is undefined for
    // static tools, producing "Copy: undefined".
    expect(screen.getByTitle('Copy: get-weather (call-xyz-123)')).toBeInTheDocument();
  });

  test('copy button title uses toolName for dynamic tools', () => {
    render(
      <Tool>
        <ToolHeader
          state="output-available"
          toolName="mcp_list_topics"
          type="dynamic-tool"
        />
      </Tool>
    );
    expect(screen.getByTitle('Copy: mcp_list_topics')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Additional state-coverage cases (added under a2a/mcp/ai-elements bump)
  // These exercise the approval flow beyond the happy path and guard against
  // regression of badge rendering for error / streaming states.
  // ---------------------------------------------------------------------------

  test('shows "Pending" badge for input-streaming state', () => {
    render(
      <Tool>
        <ToolHeader
          state="input-streaming"
          toolName="mcp_list_topics"
          type="dynamic-tool"
        />
      </Tool>
    );
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  test('shows "Error" badge and duration for output-error state', () => {
    render(
      <Tool>
        <ToolHeader
          durationMs={500}
          state="output-error"
          type="tool-get-weather"
        />
      </Tool>
    );
    expect(screen.getByText('Error')).toBeInTheDocument();
    // Duration should render for both output-available and output-error — gating
    // on only one would hide execution time when users most need it.
    expect(screen.getByText('500ms')).toBeInTheDocument();
  });

  test('suppresses duration for in-flight states even when durationMs is set', () => {
    render(
      <Tool>
        <ToolHeader
          durationMs={2345}
          state="input-available"
          type="tool-get-weather"
        />
      </Tool>
    );
    // Duration should not leak into the header for in-flight (`input-available`)
    // tool executions — showing a duration mid-flight would be misleading.
    expect(screen.queryByText('2.35s')).not.toBeInTheDocument();
  });

  test('approval-requested → output-denied transition swaps badges correctly', () => {
    const { rerender } = render(
      <Tool>
        <ToolHeader
          state="approval-requested"
          toolName="mcp_delete_topic"
          type="dynamic-tool"
        />
      </Tool>
    );
    expect(screen.getByText('Awaiting Approval')).toBeInTheDocument();

    rerender(
      <Tool>
        <ToolHeader
          state="output-denied"
          toolName="mcp_delete_topic"
          type="dynamic-tool"
        />
      </Tool>
    );
    // After denial, the approval-requested badge must be gone and the denied
    // state must surface — otherwise users might not realise the tool was
    // cancelled.
    expect(screen.queryByText('Awaiting Approval')).not.toBeInTheDocument();
    expect(screen.getByText('Denied')).toBeInTheDocument();
  });

  test('renders no badge for an unknown tool state', () => {
    // `getStatusBadge` returns null for anything outside the known set. The
    // header should still render the tool name without throwing. We narrow
    // via `unknown` cast to avoid polluting this guard test with a wider
    // type-escape hatch.
    const unknownState = 'stale-unknown' as unknown as 'output-available';
    render(
      <Tool>
        <ToolHeader state={unknownState} type="tool-get-weather" />
      </Tool>
    );
    expect(screen.getByText('get-weather')).toBeInTheDocument();
    // None of the known status labels should have leaked in.
    for (const label of [
      'Completed',
      'Working',
      'Error',
      'Pending',
      'Awaiting Approval',
      'Responded',
      'Denied',
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});

describe('ToolInput / ToolOutput', () => {
  test('ToolInput renders nothing for an empty object', () => {
    const { container } = render(
      <Tool>
        <ToolContent>
          <ToolInput input={{}} />
        </ToolContent>
      </Tool>
    );
    // An empty tool input should collapse away rather than render a bare
    // "Parameters" section that confuses readers.
    expect(container.querySelector('h4')).toBeNull();
  });

  test('ToolOutput renders the parsed JSON output for objects', () => {
    const { container } = render(
      <Tool defaultOpen>
        <ToolContent>
          <ToolOutput errorText={undefined} output={{ topics: ['a'] }} />
        </ToolContent>
      </Tool>
    );
    // The object output is pretty-printed and the code-block syntax
    // highlighter splits tokens across spans, so we assert on the concatenated
    // textContent of the rendered region.
    const text = container.textContent ?? '';
    expect(text).toContain('"topics"');
    expect(text).toContain('"a"');
    // The label should identify this as a result, not an error.
    expect(screen.getByText('Result')).toBeInTheDocument();
  });

  test('ToolOutput renders errorText when provided', () => {
    const { container } = render(
      <Tool defaultOpen>
        <ToolContent>
          <ToolOutput errorText="boom" output={undefined} />
        </ToolContent>
      </Tool>
    );
    // Heading becomes "Error" and the body contains the error text.
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Error');
    expect(container.textContent ?? '').toContain('boom');
  });
});
