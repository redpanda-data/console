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

import { CardContent } from 'components/redpanda-ui/components/card';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { InfoIcon } from 'lucide-react';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import React from 'react';

import { cpuToTasks } from '../tasks';

const DetailRow = ({
  label,
  value,
  copyable = false,
}: {
  label: React.ReactNode;
  value?: string;
  copyable?: boolean;
}) => (
  <div className="grid h-7 min-w-0 grid-cols-[minmax(0,120px)_1fr_30px] gap-1">
    {typeof label === 'string' ? <Text variant="label">{label}</Text> : (label ?? null)}
    <Text className="truncate">{value ?? ''}</Text>
    {copyable && value ? <CopyButton content={value} size="sm" variant="ghost" /> : null}
  </div>
);

export const PipelineDetailsSidebar = ({ pipeline }: { pipeline: Pipeline }) => (
  <div className="sticky top-0 right-0 max-h-fit py-6 pl-2">
    <CardContent>
      <div className="flex flex-col gap-4">
        <DetailRow copyable label="ID" value={pipeline.id} />
        <DetailRow label="Description" value={pipeline.description} />
        <div className="flex flex-col">
          <DetailRow
            label={
              <Tooltip>
                <Text className="flex items-center gap-1" variant="label">
                  Compute units
                  <TooltipTrigger>
                    <InfoIcon className="-mt-0.5 size-3 cursor-pointer text-muted-foreground" />
                  </TooltipTrigger>
                </Text>
                <TooltipContent>One compute unit = 0.1 CPU and 400 MB memory</TooltipContent>
              </Tooltip>
            }
            value={`${cpuToTasks(pipeline.resources?.cpuShares) ?? 0}`}
          />
        </div>
        <DetailRow copyable label="URL" value={pipeline.url} />
      </div>
    </CardContent>
  </div>
);
