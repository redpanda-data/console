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

// App-owned guard for a registry contract: v3 Alert paints its own icon by
// default, so a Chakra-style `<AlertIcon />` child would paint two. Swaps
// from Chakra must pass `icon` (or `icon={null}`), never an icon child.

import { describe, expect, test } from '@rstest/core';
import { render } from '@testing-library/react';
import { Alert, AlertTitle } from 'components/redpanda-ui/components/alert';
import { CircleAlert } from 'lucide-react';

const iconsIn = (container: HTMLElement) => container.querySelectorAll('svg').length;

describe('registry Alert icon', () => {
  test('renders one icon by default', () => {
    const { container } = render(
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
      </Alert>
    );
    expect(iconsIn(container)).toBe(1);
  });

  test('a custom icon replaces the default instead of adding to it', () => {
    const { container } = render(
      <Alert icon={<CircleAlert data-testid="custom" />}>
        <AlertTitle>Heads up</AlertTitle>
      </Alert>
    );
    expect(iconsIn(container)).toBe(1);
    expect(container.querySelector('[data-testid="custom"]')).not.toBeNull();
  });

  test('icon={null} renders no icon', () => {
    const { container } = render(
      <Alert icon={null}>
        <AlertTitle>Heads up</AlertTitle>
      </Alert>
    );
    expect(iconsIn(container)).toBe(0);
  });
});
