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

import { Button } from 'components/redpanda-ui/components/button';
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
import { ExternalLink, Plus } from 'lucide-react';
import type { Control, FieldValues } from 'react-hook-form';

import type { TopicSlot } from '../pipeline-template-types';

// Embedded mode: `/clusters/<id>/topics`. Standalone: `/topics`.
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
  // When supplied, "Create topic" delegates to the parent (e.g. the in-dialog
  // create-topic step) instead of linking out to the topic-management page.
  onRequestCreateTopic?: (slotId: string) => void;
};

export const TopicSlotField = ({ slot, control, onRequestCreateTopic }: TopicSlotFieldProps) => (
  <FormField
    control={control}
    name={slot.id}
    render={({ field }) => (
      <FormItem>
        <FormLabel className="leading-normal" required={slot.required}>
          {slot.label}
        </FormLabel>
        <FormControl>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <div className="flex-1" data-testid={`slot-${slot.id}`}>
              <TopicSelector
                onTopicsChange={(topics) => field.onChange(topics[0] ?? '')}
                selectedTopics={field.value ? [field.value] : []}
              />
            </div>
            {onRequestCreateTopic ? (
              <Button
                data-testid={`slot-${slot.id}-create`}
                onClick={() => onRequestCreateTopic(slot.id)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" /> Create topic
              </Button>
            ) : (
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
            )}
          </div>
        </FormControl>
        {slot.description ? <FormDescription className="leading-snug">{slot.description}</FormDescription> : null}
        <FormMessage />
      </FormItem>
    )}
  />
);
