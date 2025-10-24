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

import { TaskState } from 'components/ai-elements/task';
import { ChevronDownIcon, SearchIcon } from 'lucide-react';

type TaskTriggerContentProps = {
  title: string;
  taskState?:
    | 'submitted'
    | 'working'
    | 'input-required'
    | 'completed'
    | 'canceled'
    | 'failed'
    | 'rejected'
    | 'auth-required'
    | 'unknown';
};

/**
 * Custom trigger content for task collapsible with state badge
 */
export const TaskTriggerContent = ({ title, taskState }: TaskTriggerContentProps) => (
  <div className="flex w-full cursor-pointer items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
    <SearchIcon className="size-4" />
    <p className="flex-1 font-mono text-sm">{title}</p>
    {taskState && <TaskState state={taskState} />}
    <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
  </div>
);
