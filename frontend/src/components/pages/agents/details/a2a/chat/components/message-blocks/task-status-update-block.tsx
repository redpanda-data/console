/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Artifact, ArtifactContent, ArtifactHeader, ArtifactTitle } from 'components/ai-elements/artifact';
import { Response } from 'components/ai-elements/response';
import { TaskState } from 'components/ai-elements/task';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { ChevronDownIcon, MoveRightIcon } from 'lucide-react';

type TaskStatusUpdateBlockProps = {
  taskState?: string;
  previousState?: string;
  text?: string;
  messageId?: string;
  timestamp: Date;
};

/**
 * Unified component for task status updates and agent messages
 * Shows state badge (only if actual state change), collapsible message text (if present)
 */
export const TaskStatusUpdateBlock = ({ taskState, previousState, text, messageId, timestamp }: TaskStatusUpdateBlockProps) => {
  const validState = taskState as
    | 'submitted'
    | 'working'
    | 'input-required'
    | 'completed'
    | 'canceled'
    | 'failed'
    | 'rejected'
    | 'auth-required'
    | 'unknown'
    | undefined;

  const time = timestamp.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

  const hasMessage = text && text.length > 0;
  // Show badge only if state actually changed (taskState different from previousState)
  const showBadge = validState && taskState !== previousState;
  const hasPreviousState = previousState && previousState !== taskState;

  // Metadata component (reused in both cases)
  const metadata = (
    <div className="border-t bg-muted/30 px-4 py-2 text-muted-foreground text-xs">
      <div className="flex flex-col gap-0.5">
        {messageId && (
          <div className="flex gap-1.5">
            <span className="font-medium">message_id:</span>
            <span className="font-mono">{messageId}</span>
          </div>
        )}
        <div className="flex gap-1.5">
          <span className="font-medium">time:</span>
          <span>{time}</span>
        </div>
      </div>
    </div>
  );

  // State transition display
  const stateTransition = showBadge && (
    <div className="flex items-center gap-2">
      {hasPreviousState && (
        <>
          <TaskState state={previousState as typeof validState} />
          <MoveRightIcon className="size-4 text-muted-foreground" />
        </>
      )}
      <TaskState state={validState} />
    </div>
  );

  if (!hasMessage) {
    return (
      <div className="mb-4 rounded-md border bg-muted/30">
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="font-medium text-sm">TaskStatusUpdate</span>
          {stateTransition}
        </div>
        {metadata}
      </div>
    );
  }

  return (
    <Collapsible defaultOpen={false}>
      <Artifact className="mb-4">
        <CollapsibleTrigger asChild>
          <ArtifactHeader className="cursor-pointer hover:bg-muted/50">
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <ArtifactTitle>TaskStatusUpdate</ArtifactTitle>
                {stateTransition}
              </div>
              <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </div>
          </ArtifactHeader>
        </CollapsibleTrigger>
        <CollapsibleContent transition={{ duration: 0 }}>
          <ArtifactContent>
            <Response>{text}</Response>
          </ArtifactContent>
        </CollapsibleContent>
        {metadata}
      </Artifact>
    </Collapsible>
  );
};
