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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from 'components/redpanda-ui/components/accordion';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { SkeletonCard } from 'components/redpanda-ui/components/skeleton';
import { Slider } from 'components/redpanda-ui/components/slider';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { InfoIcon } from 'lucide-react';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import React from 'react';
import { useFormContext } from 'react-hook-form';

import { cpuToTasks, MAX_TASKS, MIN_TASKS } from '../tasks';

type DetailsProps = {
  readonly?: boolean;
  pipeline?: Pipeline;
};

const DetailRow = ({
  label,
  value,
  copyable = false,
}: {
  label: React.ReactNode;
  value?: string;
  copyable?: boolean;
}) => (
  <div className="grid h-7 min-w-0 grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_30px] gap-1">
    {typeof label === 'string' ? <Text variant="label">{label}</Text> : (label ?? null)}
    <Text className="truncate">{value ?? ''}</Text>
    {copyable && value ? <CopyButton content={value} size="sm" variant="ghost" /> : null}
  </div>
);

export function Details({ readonly = false, pipeline }: DetailsProps) {
  const { control } = useFormContext();

  if (readonly) {
    if (!pipeline) {
      return <SkeletonCard />;
    }
    return (
      <Card size="full">
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
      </Card>
    );
  }

  return (
    <Card size="full">
      <CardContent>
        <FormField
          control={control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Pipeline name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter pipeline name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Accordion collapsible type="single">
          <AccordionItem value="advanced" variant="contained">
            <AccordionTrigger>Advanced settings</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <FormField
                control={control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Optional description for this pipeline" rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="computeUnits"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compute units</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Slider
                          max={MAX_TASKS}
                          min={MIN_TASKS}
                          onValueChange={(values) => field.onChange(values[0])}
                          step={1}
                          value={[field.value]}
                        />
                        <Input
                          className="w-12"
                          max={MAX_TASKS}
                          min={MIN_TASKS}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            if (!Number.isNaN(value) && value >= MIN_TASKS && value <= MAX_TASKS) {
                              field.onChange(value);
                            }
                          }}
                          showStepControls
                          step={1}
                          type="number"
                          value={field.value}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-muted-foreground text-sm">
                      One compute unit = 0.1 CPU and 400 MB memory
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
