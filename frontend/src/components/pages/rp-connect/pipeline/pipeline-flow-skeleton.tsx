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

import { Skeleton } from 'components/redpanda-ui/components/skeleton';

const SKELETON_SECTIONS = [
  { label: 'INPUT', leaves: ['component'] },
  { label: 'PROCESSORS', leaves: ['first-processor', 'second-processor'] },
  { label: 'OUTPUT', leaves: ['component'] },
] as const;

export function PipelineFlowSkeleton() {
  return (
    <div className="relative size-full">
      <div aria-hidden="true" className="pointer-events-none flex flex-col gap-4 p-4 pl-3">
        {SKELETON_SECTIONS.map((section) => (
          <div className="flex flex-col gap-2" key={section.label}>
            <Skeleton variant="text" width="xs" />
            {section.leaves.map((leaf) => (
              <Skeleton className="ml-10" key={`${section.label}-${leaf}`} size="lg" variant="rounded" width="md" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
