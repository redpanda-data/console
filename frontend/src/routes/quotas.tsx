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
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { ScaleIcon } from 'components/icons';
import { useLayoutEffect } from 'react';
import { z } from 'zod';

import QuotasList from '../components/pages/quotas/quotas-list';
import { uiState } from '../state/ui-state';

const quotasSearchSchema = z.object({
  page: fallback(z.number().int().min(0).optional(), 0),
  pageSize: fallback(z.number().int().min(10).max(100).optional(), 50),
});

export const Route = createFileRoute('/quotas')({
  staticData: {
    title: 'Quotas',
    icon: ScaleIcon,
  },
  validateSearch: zodValidator(quotasSearchSchema),
  component: QuotasWrapper,
});

function QuotasWrapper() {
  // Set page title and breadcrumbs in route wrapper for early execution
  useLayoutEffect(() => {
    uiState.pageBreadcrumbs = [{ title: 'Quotas', linkTo: '' }];
    uiState.pageTitle = 'Quotas';
  }, []);

  return <QuotasList />;
}
