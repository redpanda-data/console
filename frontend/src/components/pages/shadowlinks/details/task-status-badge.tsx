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

import { Badge } from 'components/redpanda-ui/components/badge';
import { TaskState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

type TaskStatusBadgeProps = {
  state: TaskState;
  taskId: string;
};

export const TaskStatusBadge = ({ state, taskId }: TaskStatusBadgeProps) => {
  const stateInfo = {
    [TaskState.UNSPECIFIED]: { text: 'Unknown', variant: 'neutral-inverted' as const },
    [TaskState.ACTIVE]: { text: 'Active', variant: 'success-inverted' as const },
    [TaskState.PAUSED]: { text: 'Paused', variant: 'warning-inverted' as const },
    [TaskState.LINK_UNAVAILABLE]: { text: 'Link Unavailable', variant: 'warning-inverted' as const },
    [TaskState.NOT_RUNNING]: { text: 'Not Running', variant: 'neutral-inverted' as const },
    [TaskState.FAULTED]: { text: 'Faulted', variant: 'destructive-inverted' as const },
  }[state] || { text: 'Unknown', variant: 'neutral-inverted' as const };

  return (
    <Badge data-testid={`task-status-badge-${taskId}`} variant={stateInfo.variant}>
      {stateInfo.text}
    </Badge>
  );
};
