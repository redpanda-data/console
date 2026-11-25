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

import { describe, expect, test } from '@rstest/core';
import { render, screen } from 'test-utils';

import { InvalidConfigNotice } from './invalid-config-notice';

describe('the InvalidConfigNotice', () => {
  test('renders its message inside a warning alert', () => {
    render(<InvalidConfigNotice>Can't visualize the latest YAML.</InvalidConfigNotice>);
    expect(screen.getByRole('alert')).toHaveTextContent("Can't visualize the latest YAML.");
  });

  test('keeps the warning content accessible in the floated variant', () => {
    render(
      <InvalidConfigNotice className="absolute top-3 left-1/2" variant="floating">
        Invalid pipeline YAML
      </InvalidConfigNotice>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid pipeline YAML');
  });
});
