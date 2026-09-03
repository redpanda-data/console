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
import { getGrpcBasePath } from 'rp_console/config';

test('loads the public config API from the built Console remote', () => {
  expect(getGrpcBasePath('https://example.com/redpanda.api.console.v1alpha1')).toBe(
    'https://example.com/redpanda.api.console.v1alpha1'
  );
});
