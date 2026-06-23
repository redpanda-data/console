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

import { createFileRoute, redirect } from '@tanstack/react-router';
import { SqlWorkspace } from 'components/pages/sql/sql-workspace';
import { Database } from 'lucide-react';
import { Feature, isSupported, useSupportedFeaturesStore } from 'state/supported-features';

// allow: error-boundary [pure redirect in beforeLoad, no data fetching]
export const Route = createFileRoute('/sql')({
  staticData: {
    title: 'SQL',
    icon: Database,
    fullscreen: true,
  },
  // Gate direct navigation to /sql on the same capability check as the sidebar.
  // isSupported() returns false both when SQLService is unsupported and when the
  // endpoint list hasn't loaded yet, so redirecting on the latter bounces a cold
  // load off /sql before the answer is known. Only redirect once it's loaded.
  beforeLoad: () => {
    const { endpointCompatibility } = useSupportedFeaturesStore.getState();
    if (endpointCompatibility !== null && !isSupported(Feature.SQLService)) {
      throw redirect({ to: '/', replace: true });
    }
  },
  component: SqlWorkspace,
});
