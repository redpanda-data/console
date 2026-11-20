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

import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { isNotFound } from '@tanstack/react-router';

rs.mock('config', () => ({
  isEmbedded: rs.fn(),
}));

import { isEmbedded } from 'config';

import { Route } from './index';

const mockIsEmbedded = rs.mocked(isEmbedded);

const runBeforeLoad = (): unknown => {
  try {
    Route.options.beforeLoad?.({ params: {}, search: {} } as never);
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('rp-connect index route', () => {
  afterEach(() => {
    mockIsEmbedded.mockReset();
  });

  test('redirects to the pipeline list on the Connect page', () => {
    mockIsEmbedded.mockReturnValue(false);

    const redirect = runBeforeLoad() as Response & {
      options: { replace: boolean; search: Record<string, string>; to: string };
    };

    expect(redirect.status).toBe(307);
    expect(redirect.options.to).toBe('/connect-clusters');
    expect(redirect.options.search).toEqual({ defaultTab: 'redpanda-connect' });
    expect(redirect.options.replace).toBe(true);
  });

  test('keeps the not-found page when embedded', () => {
    mockIsEmbedded.mockReturnValue(true);

    expect(isNotFound(runBeforeLoad())).toBe(true);
  });
});
