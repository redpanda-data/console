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
import { Feature, isSupported } from 'state/supported-features';

// allow: error-boundary [pure redirect in beforeLoad, no data fetching]
export const Route = createFileRoute('/sql')({
  staticData: {
    title: 'SQL',
    icon: Database,
    fullscreen: true,
  },
  // Gate direct navigation to /sql on the same capability check as the sidebar:
  // the SQLService is reported as supported only when SQL is enabled on the
  // backend (cfg.API.SQL.Enabled), for both embedded and self-hosted.
  beforeLoad: () => {
    if (!isSupported(Feature.SQLService)) {
      throw redirect({ to: '/', replace: true });
    }
  },
  component: SqlWorkspace,
});
