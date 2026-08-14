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
  { label: 'INPUT', leaves: 1 },
  { label: 'PROCESSORS', leaves: 2 },
  { label: 'OUTPUT', leaves: 1 },
] as const;

export function PipelineFlowSkeleton() {
  return (
    <div className="relative h-full w-full">
      <div aria-hidden="true" className="pointer-events-none flex flex-col gap-4 p-4 pl-3">
        {SKELETON_SECTIONS.map((section) => (
          <div className="flex flex-col gap-2" key={section.label}>
            <Skeleton variant="text" width="xs" />
            {Array.from({ length: section.leaves }, (_, leafIndex) => (
              <Skeleton
                className="ml-10"
                key={`${section.label}-leaf-${leafIndex}`}
                size="lg"
                variant="rounded"
                width="md"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
