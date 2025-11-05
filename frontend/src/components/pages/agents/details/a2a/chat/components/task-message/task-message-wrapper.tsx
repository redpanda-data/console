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

import { Loader } from 'components/ai-elements/loader';
import { Task, TaskContent, TaskTrigger } from 'components/ai-elements/task';
import type { ReactNode } from 'react';

import { TaskTriggerContent } from './task-trigger-content';

type TaskMessageWrapperProps = {
  taskId: string;
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
  messageId: string;
  children: ReactNode;
};

/**
 * Wraps message content in a collapsible Task UI
 * Content blocks (text, tools, artifacts) are already interleaved in children
 */
export const TaskMessageWrapper = ({ taskId, taskState, children }: TaskMessageWrapperProps) => {
  const messagePreview = `Task ${taskId}`;
  const isWorking = taskState === 'working' || taskState === 'submitted';

  return (
    <Task defaultOpen={true}>
      <TaskTrigger title={messagePreview}>
        <TaskTriggerContent taskState={taskState} title={messagePreview} />
      </TaskTrigger>
      <TaskContent>
        {children}
        {isWorking && (
          <div className="my-4 flex items-center">
            <Loader size={24} />
          </div>
        )}
      </TaskContent>
    </Task>
  );
};
