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

// Development remotes need this share even when the test host uses production JSX.
import 'react/jsx-dev-runtime';

import { expect, rs, test } from '@rstest/core';
import { cleanup, render } from '@testing-library/react';

test('renders the built ReactApp with the host React 19 renderer', async () => {
  const { default: ConsoleApp } = await import('rp_console_react19/ReactApp');
  const getAccessToken = rs.fn(
    () =>
      new Promise<string>(() => {
        // Keep backend initialization pending while exercising the real renderer.
      })
  );

  try {
    render(<ConsoleApp clusterId="federation-test" config={{}} getAccessToken={getAccessToken} />);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  } finally {
    cleanup();
  }
});
