/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { expect, onTestFinished, test } from '@rstest/core';
import { render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { scrollToElement } from 'utils/utils';

import Section from './section';

function mountSection() {
  const layout = document.createElement('main');
  layout.id = 'mainLayout';
  document.body.append(layout);
  onTestFinished(() => layout.remove());
  const target = createRef<HTMLDivElement>();
  const { unmount } = render(<Section ref={target}>Reassignment wizard</Section>, { container: layout });
  return { layout, target, unmount };
}

test('scrolls to the mounted section without a global section ID', async () => {
  const { layout, target, unmount } = mountSection();
  layout.scrollTop = 100;

  scrollToElement(target.current, -20);
  await waitFor(() => expect(layout.scrollTop).toBe(80));

  unmount();
  expect(target.current).toBeNull();
});
