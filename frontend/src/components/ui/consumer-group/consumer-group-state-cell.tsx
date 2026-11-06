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

import type { GroupType } from 'state/rest-interfaces';

import { groupTypeLabels } from './consumer-group-type';
import { StatusDot } from '../../redpanda-ui/components/status-dot';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../redpanda-ui/components/tooltip';
import { cn, type SemanticVariant } from '../../redpanda-ui/lib/utils';

type StateIconKey =
  | 'stable'
  | 'completingrebalance'
  | 'preparingrebalance'
  | 'assigning'
  | 'reconciling'
  | 'empty'
  | 'dead'
  | 'unknown';

const stateDotVariants: Record<StateIconKey, SemanticVariant> = {
  stable: 'success',
  completingrebalance: 'success',
  preparingrebalance: 'warning',
  assigning: 'warning',
  reconciling: 'warning',
  empty: 'warning',
  dead: 'destructive',
  unknown: 'disabled',
};

export const consumerGroupStateNames: Record<StateIconKey, string> = {
  stable: 'Stable',
  completingrebalance: 'Completing Rebalance',
  preparingrebalance: 'Preparing Rebalance',
  assigning: 'Assigning',
  reconciling: 'Reconciling',
  empty: 'Empty',
  dead: 'Dead',
  unknown: 'Unknown',
};

/**
 * All possible consumer group states, used to populate the State faceted filter so every
 * option is available even when no group is currently in that state. `value` is the raw
 * state string returned by the backend (must match `GroupDescription.state` exactly).
 * Assigning and Reconciling exist for consumer (KIP-848) groups only, the two rebalance
 * states for classic groups only.
 */
export const consumerGroupStateFilterOptions: { label: string; value: string }[] = [
  { label: 'Stable', value: 'Stable' },
  { label: 'Assigning', value: 'Assigning' },
  { label: 'Reconciling', value: 'Reconciling' },
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
  assigning: 'The broker is computing a new partition assignment for the group',
  reconciling: 'Some members have not reached their target assignment yet. Members that are not affected keep consuming',
  empty: 'Consumer group exists, but does not have any members',
  dead: 'Consumer group does not have any members and its metadata has been removed',
  unknown: 'Group state is not known',
};

/** The states a group of each type moves through, in lifecycle order. */
export const consumerGroupStatesByType: Record<GroupType, StateIconKey[]> = {
  classic: ['empty', 'preparingrebalance', 'completingrebalance', 'stable', 'dead'],
  consumer: ['empty', 'assigning', 'reconciling', 'stable', 'dead'],
};

const normalizeStateKey = (state: string): StateIconKey => {
  const key = state.toLowerCase().replace(/\s+/g, '') as StateIconKey;
  return key in stateDotVariants ? key : 'unknown';
};

/**
 * Renders a consumer group's state as a status dot + label. The tooltip lists the states a group
 * of this type can be in and highlights the current one. Shared between the consumer groups
 * list and detail pages.
 */
export const ConsumerGroupStateCell = ({ state, groupType = 'classic' }: { state: string; groupType?: GroupType }) => {
  const key = normalizeStateKey(state);
  const states = consumerGroupStatesByType[groupType] ?? consumerGroupStatesByType.classic;
  const listedStates = states.includes(key) ? states : [...states, key];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex items-center gap-2">
              <StatusDot size="sm" variant={stateDotVariants[key]} />
              <span>{consumerGroupStateNames[key]}</span>
            </span>
          }
        />
        <TooltipContent
          align="start"
          arrow={false}
          className="max-w-xl border border-border bg-card p-2 text-foreground shadow-md"
          side="bottom"
          testId="consumer-group-state-tooltip"
        >
          <div className="px-1.5 pt-0.5 pb-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            States of a {groupTypeLabels[groupType].toLowerCase()} group
          </div>
          <ul className="flex flex-col gap-0.5">
            {listedStates.map((s) => (
              <li
                aria-current={s === key ? 'true' : undefined}
                className={cn(
                  'grid grid-cols-[16px_minmax(0,10rem)_1fr] items-start gap-2.5 rounded-sm px-1.5 py-1 text-xs',
                  s === key && 'bg-muted'
                )}
                key={s}
              >
                <StatusDot className="mt-px" size="sm" variant={stateDotVariants[s]} />
                <span className="font-semibold text-foreground">{consumerGroupStateNames[s]}</span>
                <span className="text-muted-foreground">{stateDescriptions[s]}</span>
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
