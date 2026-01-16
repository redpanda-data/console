/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useLocation, useParams } from '@tanstack/react-router';

export type PipelineMode = 'create' | 'edit' | 'view';

export function usePipelineMode(): { mode: PipelineMode; pipelineId?: string } {
  const { pipelineId } = useParams({ strict: false });
  const location = useLocation();

  if (location.pathname.includes('/wizard')) {
    return { mode: 'create' };
  }

  if (pipelineId && location.pathname.includes('/edit')) {
    return { mode: 'edit', pipelineId };
  }

  if (pipelineId) {
    return { mode: 'view', pipelineId };
  }

  return { mode: 'create' };
}
