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
import { SqlWorkspace } from 'components/pages/sql/sql-workspace';
import { Database } from 'lucide-react';
import { useLayoutEffect } from 'react';

import { uiState } from '../state/ui-state';

export const Route = createFileRoute('/sql')({
  staticData: {
    title: 'SQL',
    icon: Database,
    fullscreen: true,
  },
  component: SqlRouteWrapper,
});

function SqlRouteWrapper() {
  useLayoutEffect(() => {
    uiState.pageBreadcrumbs = [{ title: 'SQL', linkTo: '' }];
    uiState.pageTitle = 'SQL';
  }, []);

  return <SqlWorkspace />;
}
