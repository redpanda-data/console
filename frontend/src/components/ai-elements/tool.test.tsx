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

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Tool, ToolHeader } from './tool';

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
});
