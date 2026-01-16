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

import { createFileRoute } from '@tanstack/react-router';

import { AdminDebugBundle } from '../../components/pages/admin/admin-debug-bundle';

export const Route = createFileRoute('/debug-bundle/')({
  staticData: {
    title: 'Debug Bundle',
  },
  component: DebugBundleWrapper,
});

function DebugBundleWrapper() {
  return <AdminDebugBundle matchedPath="/debug-bundle" />;
}
