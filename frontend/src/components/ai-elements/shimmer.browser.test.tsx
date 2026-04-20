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

import { afterEach, describe, test } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { ScreenshotFrame } from '../../__tests__/browser-test-utils';
import { Shimmer } from './shimmer';

const SCREENSHOT_DIR = '../../../docs/pr-screenshots';

afterEach(() => {
  cleanup();
});

const shot = (name: string) =>
  page.getByTestId('screenshot-frame').screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });

describe('Shimmer screenshots', () => {
  test('loading shimmer — frozen frame (reduced motion disables the animation)', async () => {
    render(
      <ScreenshotFrame width={420}>
        <div style={{ fontSize: '20px' }}>
          <Shimmer>Generating response…</Shimmer>
        </div>
      </ScreenshotFrame>
    );
    await shot('shimmer-loading');
  });
});
