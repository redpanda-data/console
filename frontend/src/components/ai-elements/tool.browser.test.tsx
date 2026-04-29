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

import type { ReactNode } from 'react';
import { afterEach, describe, test } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { captureScreenshotFrame, ScreenshotFrame } from '../../__tests__/browser-test-utils';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from './tool';

afterEach(() => {
  cleanup();
});

// Force the collapsible open so the inner input/output panels are visible in
// the screenshots. `Tool` is a Radix Collapsible; we control it via `open`.
const OpenTool = ({ children }: { children: ReactNode }) => (
  <ScreenshotFrame width={720}>
    <Tool open={true}>{children}</Tool>
  </ScreenshotFrame>
);

const shot = (name: string) =>
  captureScreenshotFrame(page.getByTestId('screenshot-frame'), name);

describe('Tool card screenshots', () => {
  test('input-streaming', async () => {
    render(
      <OpenTool>
        <ToolHeader state="input-streaming" toolCallId="call-abc-001" type="tool-get-weather" />
        <ToolContent>
          <ToolInput input={{ city: 'Berlin' }} />
        </ToolContent>
      </OpenTool>
    );
    await shot('tool-input-streaming');
  });

  test('input-available', async () => {
    render(
      <OpenTool>
        <ToolHeader state="input-available" toolCallId="call-abc-002" type="tool-get-weather" />
        <ToolContent>
          <ToolInput input={{ city: 'Berlin', unit: 'celsius' }} />
        </ToolContent>
      </OpenTool>
    );
    await shot('tool-input-available');
  });

  test('output-available', async () => {
    render(
      <OpenTool>
        <ToolHeader
          durationMs={1234}
          state="output-available"
          toolCallId="call-abc-003"
          type="tool-get-weather"
        />
        <ToolContent>
          <ToolInput input={{ city: 'Berlin', unit: 'celsius' }} />
          <ToolOutput
            errorText={undefined}
            output={{ temperature: 14, conditions: 'partly-cloudy', humidity: 0.62 }}
          />
        </ToolContent>
      </OpenTool>
    );
    await shot('tool-output-available');
  });

  test('output-error', async () => {
    render(
      <OpenTool>
        <ToolHeader
          durationMs={820}
          state="output-error"
          toolCallId="call-abc-004"
          type="tool-get-weather"
        />
        <ToolContent>
          <ToolInput input={{ city: 'Atlantis' }} />
          <ToolOutput errorText="Location not found: 'Atlantis'" output={undefined} />
        </ToolContent>
      </OpenTool>
    );
    await shot('tool-output-error');
  });

  test('approval-requested (newly adopted)', async () => {
    render(
      <OpenTool>
        <ToolHeader
          state="approval-requested"
          toolCallId="call-mcp-101"
          toolName="mcp_delete_topic"
          type="dynamic-tool"
        />
        <ToolContent>
          <ToolInput input={{ topic: 'orders-prod' }} />
        </ToolContent>
      </OpenTool>
    );
    await shot('tool-approval-requested');
  });

  test('approval-responded (newly adopted)', async () => {
    render(
      <OpenTool>
        <ToolHeader
          state="approval-responded"
          toolCallId="call-mcp-102"
          toolName="mcp_delete_topic"
          type="dynamic-tool"
        />
        <ToolContent>
          <ToolInput input={{ topic: 'orders-prod', approved: true }} />
        </ToolContent>
      </OpenTool>
    );
    await shot('tool-approval-responded');
  });

  test('output-denied (newly adopted)', async () => {
    render(
      <OpenTool>
        <ToolHeader
          state="output-denied"
          toolCallId="call-mcp-103"
          toolName="mcp_delete_topic"
          type="dynamic-tool"
        />
        <ToolContent>
          <ToolInput input={{ topic: 'orders-prod' }} />
          <ToolOutput errorText="User denied approval for this tool call." output={undefined} />
        </ToolContent>
      </OpenTool>
    );
    await shot('tool-output-denied');
  });

  test('dynamic-tool with runtime toolName override (newly adopted)', async () => {
    render(
      <OpenTool>
        <ToolHeader
          durationMs={432}
          state="output-available"
          toolCallId="call-mcp-200"
          toolName="mcp_list_topics"
          type="dynamic-tool"
        />
        <ToolContent>
          <ToolInput input={{ cluster: 'redpanda-prod' }} />
          <ToolOutput
            errorText={undefined}
            output={{ topics: ['orders', 'payments', 'audit-log'] }}
          />
        </ToolContent>
      </OpenTool>
    );
    await shot('tool-dynamic-toolname');
  });
});
