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

import { render, screen } from '@testing-library/react';

const mockRouter = { invalidate: rs.fn() };

rs.mock('@tanstack/react-router', () => ({
  useRouter: () => mockRouter,
}));

import { RouteError } from './route-error';

describe('RouteError', () => {
  test('shows a real Error message', () => {
    render(<RouteError error={new Error('boom')} />);

    expect(screen.getByText('boom')).toBeVisible();
  });

  // Regression test: clicking away (e.g. a breadcrumb) while a request is in flight
  // can unmount the page and leave a non-Error rejection reason behind. The boundary
  // must never render the literal text "undefined".
  test('falls back to a generic message for a non-Error value', () => {
    render(<RouteError error={undefined} />);

    expect(screen.getByText('An unexpected error occurred.')).toBeVisible();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  test('falls back to a generic message for an Error with no message', () => {
    render(<RouteError error={new Error()} />);

    expect(screen.getByText('An unexpected error occurred.')).toBeVisible();
  });
});
