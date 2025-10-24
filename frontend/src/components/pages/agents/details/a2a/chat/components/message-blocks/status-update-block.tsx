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

type StatusUpdateBlockProps = {
  taskState: string;
  timestamp: Date;
};

/**
 * Renders a status update block showing task state transition
 * Uses TaskState badges to show the current state
 */
export const StatusUpdateBlock = ({ taskState, timestamp }: StatusUpdateBlockProps) => {
  const validState = taskState as
    | 'submitted'
    | 'working'
    | 'input-required'
    | 'completed'
    | 'canceled'
    | 'failed'
    | 'rejected'
    | 'auth-required'
    | 'unknown';

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-4 py-3">
      <span className="font-medium text-muted-foreground text-sm">Task State:</span>
      <TaskState state={validState} />
      <span className="text-muted-foreground text-xs">
        {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
};
