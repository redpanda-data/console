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
import { TaskState } from 'protogen/redpanda/api/dataplane/v1alpha3/shadowlink_pb';

type TaskStatusBadgeProps = {
  state: TaskState;
  taskId: string;
};

export const TaskStatusBadge = ({ state, taskId }: TaskStatusBadgeProps) => {
  const stateInfo = {
    [TaskState.UNSPECIFIED]: { text: 'Unknown', variant: 'gray' as const },
    [TaskState.ACTIVE]: { text: 'Active', variant: 'green' as const },
    [TaskState.PAUSED]: { text: 'Paused', variant: 'yellow' as const },
    [TaskState.LINK_UNAVAILABLE]: { text: 'Link Unavailable', variant: 'orange' as const },
    [TaskState.NOT_RUNNING]: { text: 'Not Running', variant: 'gray' as const },
    [TaskState.FAULTED]: { text: 'Faulted', variant: 'red' as const },
  }[state] || { text: 'Unknown', variant: 'gray' as const };

  return (
    <Badge data-testid={`task-status-badge-${taskId}`} variant={stateInfo.variant}>
      {stateInfo.text}
    </Badge>
  );
};
