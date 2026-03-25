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

import { createFileRoute, useParams } from '@tanstack/react-router';
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { DEFAULT_TABLE_PAGE_SIZE } from 'components/constants';
import { isEmbedded, isFeatureFlagEnabled } from 'config';
import { lazy } from 'react';
import { z } from 'zod';

import RpConnectPipelinesDetails from '../../../components/pages/rp-connect/pipelines-details';

const PipelinePage = lazy(() => import('../../../components/pages/rp-connect/pipeline'));

const searchSchema = z.object({
  pageSize: fallback(z.number().int().positive().optional(), DEFAULT_TABLE_PAGE_SIZE),
  page: fallback(z.number().int().nonnegative().optional(), 0),
});

export const Route = createFileRoute('/rp-connect/$pipelineId/')({
  staticData: {
    title: 'Pipeline Details',
  },
  validateSearch: zodValidator(searchSchema),
  component: PipelineDetailsRoute,
});

function PipelineDetailsRoute() {
  const { pipelineId } = useParams({ from: '/rp-connect/$pipelineId/' });
  // Tier 1: enablePipelineDiagrams → new pipeline page directly
  // Tier 2/3: legacy wrapper (internally checks enableRpcnTiles → PipelinePage, else legacy form)
  if (isFeatureFlagEnabled('enablePipelineDiagrams') && isEmbedded()) {
    return <PipelinePage />;
  }
  return <RpConnectPipelinesDetails matchedPath={`/rp-connect/${pipelineId}`} pipelineId={pipelineId} />;
}
