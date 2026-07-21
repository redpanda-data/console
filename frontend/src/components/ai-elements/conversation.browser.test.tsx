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
import { afterEach, describe, test } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { captureScreenshotFrame, ScreenshotFrame } from '../../__tests__/browser-test-utils';
import { ConversationDownload } from './conversation';

afterEach(() => {
  cleanup();
});

const sampleMessages: UIMessage[] = [
  {
    id: 'm1',
    role: 'user',
    parts: [{ type: 'text', text: 'Summarise the last 24h of topic activity.' }],
  },
  {
    id: 'm2',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: 'Produced 1.2M messages across 14 topics; peak throughput at 09:42 UTC.',
      },
    ],
  },
];

// The real ConversationDownload is positioned absolute. For the screenshot we
// frame it inside a relative container so the trigger is shown alongside a
// short transcript.
const DownloadPanel = () => (
  <ScreenshotFrame width={520}>
    <div
      style={{
        position: 'relative',
        border: '1px solid rgb(229, 231, 235)',
        borderRadius: '8px',
        padding: '16px',
        minHeight: '140px',
        background: 'white',
      }}
    >
      <div style={{ maxWidth: '420px', fontSize: '14px', lineHeight: 1.5 }}>
        <p style={{ margin: '0 0 8px 0' }}>
          <strong>User:</strong> Summarise the last 24h of topic activity.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Assistant:</strong> Produced 1.2M messages across 14 topics; peak
          throughput at 09:42 UTC.
        </p>
      </div>
      <ConversationDownload
        aria-label="Download conversation"
        filename="sample-conversation.md"
        messages={sampleMessages}
      />
    </div>
  </ScreenshotFrame>
);

const shot = (name: string) =>
  captureScreenshotFrame(page.getByTestId('screenshot-frame'), name);

describe('ConversationDownload screenshots', () => {
  test('idle trigger rendered next to a short transcript', async () => {
    render(<DownloadPanel />);
    await shot('conversation-download-idle');
  });

  test('hover state (focus-ring / post-hover styling)', async () => {
    render(<DownloadPanel />);
    // Hover shows the secondary-ghost button focus styling. We intentionally
    // don't click — click triggers a real blob download which creates flake
    // in headless Chromium.
    await page.getByLabelText('Download conversation').hover();
    await shot('conversation-download-hover');
  });
});
