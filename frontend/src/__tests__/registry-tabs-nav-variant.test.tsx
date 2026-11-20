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

// App-owned guard for a local `[upstream]` addition to the registry's tabs.tsx: the `nav` variant
// that the shadow link configuration sidebar uses. A registry pull overwrites the file, so this
// fails instead of the sidebar silently losing its styling.

import { describe, expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';

describe('registry Tabs nav variant', () => {
  test('styles the list, the active row and the triggers', () => {
    const { container } = render(
      <Tabs defaultValue="all" orientation="vertical">
        <TabsList testId="nav-list" variant="nav">
          <TabsTrigger testId="all-tab" value="all" variant="nav">
            All
          </TabsTrigger>
          <TabsTrigger testId="source-tab" value="source" variant="nav">
            Source
          </TabsTrigger>
        </TabsList>
      </Tabs>
    );

    expect(screen.getByTestId('nav-list').className).toContain('data-[orientation=vertical]:items-stretch');
    expect(container.querySelector('[data-slot="tabs-list-highlight"]')?.className).toContain('bg-selected-wash');
    expect(screen.getByTestId('source-tab').className).toContain('data-[active]:text-selected');
  });
});
