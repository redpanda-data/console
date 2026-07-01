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

import { CheckCircleIcon, FlameIcon, HelpIcon, HourglassIcon, WarningIcon } from 'components/icons';
import type { ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../redpanda-ui/components/tooltip';

type StateIconKey = 'stable' | 'completingrebalance' | 'preparingrebalance' | 'empty' | 'dead' | 'unknown';

const stateIcons: Record<StateIconKey, ReactNode> = {
  stable: <CheckCircleIcon className="text-success" size={16} />,
  completingrebalance: <HourglassIcon className="text-success" size={16} />,
  preparingrebalance: <HourglassIcon className="text-warning" size={16} />,
  empty: <WarningIcon className="text-warning" size={16} />,
  dead: <FlameIcon className="text-destructive" size={16} />,
  unknown: <HelpIcon size={16} />,
};

export const consumerGroupStateNames: Record<StateIconKey, string> = {
  stable: 'Stable',
  completingrebalance: 'Completing Rebalance',
  preparingrebalance: 'Preparing Rebalance',
  empty: 'Empty',
  dead: 'Dead',
  unknown: 'Unknown',
};

/**
 * All possible consumer group states, used to populate the State faceted filter so every
 * option is available even when no group is currently in that state. `value` is the raw
 * state string returned by the backend (must match `GroupDescription.state` exactly).
 */
export const consumerGroupStateFilterOptions: { label: string; value: string }[] = [
  { label: 'Stable', value: 'Stable' },
  { label: 'Completing Rebalance', value: 'CompletingRebalance' },
  { label: 'Preparing Rebalance', value: 'PreparingRebalance' },
  { label: 'Empty', value: 'Empty' },
  { label: 'Dead', value: 'Dead' },
  { label: 'Unknown', value: 'Unknown' },
];

const stateDescriptions: Record<StateIconKey, string> = {
  stable: 'Consumer group has members which have been assigned partitions',
  completingrebalance: 'Kafka is assigning partitions to group members',
  preparingrebalance: 'A reassignment of partitions is required, members have been asked to stop consuming',
  empty: 'Consumer group exists, but does not have any members',
  dead: 'Consumer group does not have any members and its metadata has been removed',
  unknown: 'Group state is not known',
};

const normalizeStateKey = (state: string): StateIconKey => {
  const key = state.toLowerCase().replace(/\s+/g, '') as StateIconKey;
  return key in stateIcons ? key : 'unknown';
};

/**
 * Renders a consumer group's state as an icon + label, with a tooltip describing what
 * the state means. Shared between the consumer groups list and detail pages.
 */
export const ConsumerGroupStateCell = ({ state }: { state: string }) => {
  const key = normalizeStateKey(state);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex items-center gap-2">
              {stateIcons[key]}
              <span>{state}</span>
            </span>
          }
        />
        <TooltipContent>{stateDescriptions[key]}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
