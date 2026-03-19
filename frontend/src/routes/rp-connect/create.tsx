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
import { isFeatureFlagEnabled } from 'config';
import { lazy } from 'react';
import { z } from 'zod';

import RpConnectPipelinesCreate from '../../components/pages/rp-connect/pipelines-create';

const PipelinePage = lazy(() => import('../../components/pages/rp-connect/pipeline'));

const searchSchema = z.object({
  serverless: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute('/rp-connect/create')({
  staticData: {
    title: 'Create Pipeline',
  },
  validateSearch: zodValidator(searchSchema),
  component: CreatePipelineRoute,
});

function CreatePipelineRoute() {
  // Tier 1: enablePipelineDiagrams → new pipeline page directly
  // Tier 2/3: legacy wrapper (internally checks enableRpcnTiles → PipelinePage, else legacy form)
  if (isFeatureFlagEnabled('enablePipelineDiagrams')) {
    return <PipelinePage />;
  }
  return <RpConnectPipelinesCreate matchedPath="/rp-connect/create" />;
}
