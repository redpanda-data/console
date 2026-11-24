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

/** Redirect unsupported clusters only after capability discovery; a cold load must stay on the SQL route. */
export const Route = createFileRoute('/sql')({
  staticData: {
    title: 'SQL',
    icon: Database,
    // The studio has its own title bar; otherwise a normal in-flow page.
    breadcrumbOnlyHeader: true,
  },
  beforeLoad: () => {
    const { endpointCompatibility } = useSupportedFeaturesStore.getState();
    if (endpointCompatibility !== null && !isSupported(Feature.SQLService)) {
      throw redirect({ to: '/', replace: true });
    }
  },
  component: SqlWorkspace,
});
