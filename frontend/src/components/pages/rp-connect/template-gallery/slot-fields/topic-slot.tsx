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

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { TopicSelector } from 'components/ui/topic/topic-selector';
import { config, isEmbedded } from 'config';
import { ExternalLink } from 'lucide-react';
import type { Control, FieldValues } from 'react-hook-form';

import type { TopicSlot } from '../pipeline-template-types';

/**
 * In embedded mode the Topics page lives under the host cluster (e.g.
 * `/clusters/<id>/topics`); standalone Console serves it at `/topics`. We
 * include `showInternal=true` so newly created internal topics like
 * `_consumer_offsets` are visible in case the template requires one.
 */
const buildTopicsHref = () => {
  const query = '?showInternal=true';
  if (isEmbedded() && config.clusterId) {
    return `/clusters/${config.clusterId}/topics/${query}`;
  }
  return `/topics/${query}`;
};

export type TopicSlotFieldProps = {
  slot: TopicSlot;
  control: Control<FieldValues>;
};

export const TopicSlotField = ({ slot, control }: TopicSlotFieldProps) => (
  <FormField
    control={control}
    name={slot.id}
    render={({ field }) => (
      <FormItem>
        <div className="flex items-center justify-between gap-2">
          <FormLabel className="leading-normal" required={slot.required}>
            {slot.label}
          </FormLabel>
          <a
            className="inline-flex items-center gap-1 font-medium text-primary text-xs hover:underline"
            data-testid={`slot-${slot.id}-create`}
            href={buildTopicsHref()}
            rel="noopener noreferrer"
            target="_blank"
          >
            Create a new topic
            <ExternalLink aria-hidden className="h-3 w-3" />
          </a>
        </div>
        <FormControl>
          <div data-testid={`slot-${slot.id}`}>
            <TopicSelector
              onTopicsChange={(topics) => field.onChange(topics[0] ?? '')}
              selectedTopics={field.value ? [field.value] : []}
            />
          </div>
        </FormControl>
        {slot.description ? <FormDescription className="leading-snug">{slot.description}</FormDescription> : null}
        <FormMessage />
      </FormItem>
    )}
  />
);
