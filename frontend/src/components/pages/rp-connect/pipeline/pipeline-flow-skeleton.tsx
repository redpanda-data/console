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

import { Banner, BannerClose, BannerContent } from 'components/redpanda-ui/components/banner';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { cn } from 'components/redpanda-ui/lib/utils';

const SKELETON_SECTIONS = [
  { label: 'INPUT', leaves: 1 },
  { label: 'PROCESSORS', leaves: 2 },
  { label: 'OUTPUT', leaves: 1 },
] as const;

type PipelineFlowSkeletonProps = {
  error?: string;
};

export function PipelineFlowSkeleton({ error }: PipelineFlowSkeletonProps) {
  return (
    <div className="relative h-full w-full">
      {error ? (
        <Banner height="2rem" variant="accent">
          <BannerContent>Unable to visualize pipeline.</BannerContent>
          <BannerClose variant="ghost" />
        </Banner>
      ) : null}
      <div aria-hidden="true" className="pointer-events-none flex flex-col gap-4 p-4 pl-3">
        {SKELETON_SECTIONS.map((section) => (
          <div className="flex flex-col gap-2" key={section.label}>
            <Skeleton className={error ? 'animate-none! opacity-40' : ''} variant="text" width="xs" />
            {Array.from({ length: section.leaves }, (_, leafIndex) => (
              <Skeleton
                className={cn('ml-10', error ? 'animate-none! opacity-40' : '')}
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
