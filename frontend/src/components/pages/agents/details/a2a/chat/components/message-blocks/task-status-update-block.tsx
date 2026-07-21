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
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, MoveRightIcon } from 'lucide-react';
import { formatTokenCount } from 'utils/format-token-count';

type TaskStatusUpdateBlockProps = {
  taskState?: string;
  previousState?: string;
  text?: string;
  messageId?: string;
  timestamp: Date;
  inputTokens?: number;
  outputTokens?: number;
  isLastBlock?: boolean;
};

/**
 * Unified component for task status updates and agent messages
 * Shows state badge (only if actual state change), collapsible message text (if present)
 */
export const TaskStatusUpdateBlock = ({
  taskState,
  previousState,
  text,
  messageId,
  timestamp,
  inputTokens,
  outputTokens,
  isLastBlock = false,
}: TaskStatusUpdateBlockProps) => {
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

  const isErrorState = validState === 'failed' || validState === 'rejected';
  const hasTokens = (inputTokens && inputTokens > 0) || (outputTokens && outputTokens > 0);

  // Metadata component (reused in both cases)
  const metadata = (
    <div className="border-t bg-muted/30 px-4 py-2 text-muted-foreground text-xs">
      <div className="flex flex-col gap-0.5">
        {Boolean(messageId) && (
          <div className="flex gap-1.5">
            <span className="font-bold text-body-sm">message_id:</span>
            <span className="font-mono text-body-sm text-muted-foreground">{messageId}</span>
          </div>
        )}
        {Boolean(hasTokens) && (
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-body-sm">tokens:</span>
            <div className="flex items-center gap-2">
              {inputTokens && inputTokens > 0 && (
                <span className="flex items-center gap-1 text-body-sm text-muted-foreground">
                  <ArrowUpIcon className="size-3" />
                  {formatTokenCount(inputTokens)}
                </span>
              )}
              {outputTokens && outputTokens > 0 && (
                <span className="flex items-center gap-1 text-body-sm text-muted-foreground">
                  <ArrowDownIcon className="size-3" />
                  {formatTokenCount(outputTokens)}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-1.5">
          <span className="font-bold text-body-sm">time:</span>
          <span className="text-body-sm text-muted-foreground">{time}</span>
        </div>
      </div>
    </div>
  );

  // State transition display
  // Previous state should never animate (it's in the past)
  // Current state only animates if this is the last block and state is 'working'
  const stateTransition = showBadge && (
    <div className="flex items-center gap-2">
      {Boolean(hasPreviousState) && (
        <>
          <TaskState animate={false} state={previousState as typeof validState} />
          <MoveRightIcon className="size-4 text-muted-foreground" />
        </>
      )}
      <TaskState animate={isLastBlock && validState === 'working'} state={validState} />
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
    <Collapsible defaultOpen={isErrorState}>
      <Artifact className="mb-4">
        <CollapsibleTrigger
          render={
            <ArtifactHeader className="cursor-pointer hover:bg-muted/50">
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArtifactTitle>TaskStatusUpdate</ArtifactTitle>
                  {stateTransition}
                </div>
                <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
              </div>
            </ArtifactHeader>
          }
        />
        <CollapsibleContent>
          <ArtifactContent>
            <Response>{text}</Response>
          </ArtifactContent>
        </CollapsibleContent>
        {metadata}
      </Artifact>
    </Collapsible>
  );
};
