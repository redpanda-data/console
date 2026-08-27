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
    [TaskState.UNSPECIFIED]: { text: 'Unknown', tone: 'default' as const },
    [TaskState.ACTIVE]: { text: 'Active', tone: 'success' as const },
    [TaskState.PAUSED]: { text: 'Paused', tone: 'warning' as const },
    [TaskState.LINK_UNAVAILABLE]: { text: 'Link Unavailable', tone: 'warning' as const },
    [TaskState.NOT_RUNNING]: { text: 'Not Running', tone: 'default' as const },
    [TaskState.FAULTED]: { text: 'Faulted', tone: 'destructive' as const },
  }[state] || { text: 'Unknown', tone: 'default' as const };

  return (
    <Badge data-testid={`task-status-badge-${taskId}`} tone={stateInfo.tone} variant="subtle">
      {stateInfo.text}
    </Badge>
  );
};
