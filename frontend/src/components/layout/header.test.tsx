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

import { expect, test } from '@rstest/core';
import { screen } from '@testing-library/react';

import { renderHeader } from './header-test-helpers';

test('a route that owns its title still shows breadcrumbs, but hides the unavailable theme switch', async () => {
  renderHeader(false);

  const topics = await screen.findByRole('link', { name: 'Topics' });
  expect(topics).toHaveAttribute('href', '/topics');
  expect(screen.queryByRole('link', { name: 'my-topic' })).not.toBeInTheDocument();
  expect(screen.getByText('my-topic')).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('heading', { name: 'Cluster details' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Dark' })).not.toBeInTheDocument();
});
