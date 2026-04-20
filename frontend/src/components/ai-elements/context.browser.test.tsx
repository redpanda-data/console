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

import type { LanguageModelUsage } from 'ai';
import { useRef, useState, useEffect, type ReactNode } from 'react';
import { afterEach, describe, test } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { captureScreenshotFrame, ScreenshotFrame } from '../../__tests__/browser-test-utils';
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from './context';

afterEach(() => {
  cleanup();
});

// Render the HoverCardContent portal inside the screenshot frame so the whole
// card (trigger + popup body) is captured by a single element screenshot.
const PortalWithinFrame = ({
  children,
  open,
}: {
  children: (container: Element | undefined) => ReactNode;
  open: boolean;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [container, setContainer] = useState<Element | undefined>(undefined);
  useEffect(() => {
    if (ref.current) {
      setContainer(ref.current);
    }
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {open ? children(container) : children(undefined)}
    </div>
  );
};

const ContextPanel = ({
  usedTokens,
  maxTokens,
  usage,
  modelId,
}: {
  usedTokens: number;
  maxTokens: number;
  usage?: LanguageModelUsage;
  modelId?: string;
}) => (
  <ScreenshotFrame width={520}>
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <PortalWithinFrame open={true}>
        {(container) => (
          <Context
            maxTokens={maxTokens}
            modelId={modelId}
            open={true}
            usage={usage}
            usedTokens={usedTokens}
          >
            <ContextTrigger />
            <ContextContent align="start" container={container} side="bottom" sideOffset={8}>
              <ContextContentHeader />
              <ContextContentBody>
                <ContextInputUsage />
                <ContextOutputUsage />
                <ContextReasoningUsage />
                <ContextCacheUsage />
              </ContextContentBody>
              <ContextContentFooter />
            </ContextContent>
          </Context>
        )}
      </PortalWithinFrame>
    </div>
  </ScreenshotFrame>
);

const shot = (name: string) =>
  captureScreenshotFrame(page.getByTestId('screenshot-frame'), name);

describe('Context hover-card screenshots', () => {
  test('zero tokens (guards hide sub-rows)', async () => {
    render(<ContextPanel maxTokens={200_000} usedTokens={0} />);
    await shot('context-zero-tokens');
  });

  test('populated usage with all sub-objects', async () => {
    render(
      <ContextPanel
        maxTokens={200_000}
        modelId="anthropic/claude-3-5-sonnet"
        usage={{
          inputTokens: 18_420,
          outputTokens: 2_316,
          reasoningTokens: 412,
          cachedInputTokens: 5_800,
          totalTokens: 21_148,
          inputTokenDetails: {
            noCacheTokens: 12_620,
            cacheReadTokens: 5_800,
            cacheWriteTokens: 0,
          },
          outputTokenDetails: {
            textTokens: 1_904,
            reasoningTokens: 412,
          },
        }}
        usedTokens={21_148}
      />
    );
    await shot('context-populated');
  });
});
