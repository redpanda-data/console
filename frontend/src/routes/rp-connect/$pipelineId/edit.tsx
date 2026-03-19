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
import { isFeatureFlagEnabled } from 'config';
import { lazy } from 'react';

import RpConnectPipelinesEdit from '../../../components/pages/rp-connect/pipelines-edit';

const PipelinePage = lazy(() => import('../../../components/pages/rp-connect/pipeline'));

export const Route = createFileRoute('/rp-connect/$pipelineId/edit')({
  staticData: {
    title: 'Edit Pipeline',
  },
  component: PipelineEditRoute,
});

function PipelineEditRoute() {
  const { pipelineId } = useParams({ from: '/rp-connect/$pipelineId/edit' });
  // Tier 1: enablePipelineDiagrams → new pipeline page directly
  // Tier 2/3: legacy wrapper (internally checks enableRpcnTiles → PipelinePage, else legacy form)
  if (isFeatureFlagEnabled('enablePipelineDiagrams')) {
    return <PipelinePage />;
  }
  return <RpConnectPipelinesEdit matchedPath={`/rp-connect/${pipelineId}/edit`} pipelineId={pipelineId} />;
}
