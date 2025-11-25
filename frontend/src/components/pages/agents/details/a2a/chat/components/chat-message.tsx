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

import { Message, MessageBody, MessageContent, MessageMetadata } from 'components/ai-elements/message';

import { ChatMessageActions } from './chat-message-actions';
import { ArtifactBlock } from './message-blocks/artifact-block';
import { TaskStatusUpdateBlock } from './message-blocks/task-status-update-block';
import { ToolBlock } from './message-blocks/tool-block';
import { UserMessageContent } from './message-content/user-message-content';
import { TaskMessageWrapper } from './task-message/task-message-wrapper';
import type { ChatMessage as ChatMessageType, ContentBlock } from '../types';

type ChatMessageProps = {
  message: ChatMessageType;
  isLoading: boolean;
};

/**
 * Individual chat message component with Jupyter-style interleaved rendering
 */
export const ChatMessage = ({ message, isLoading: _isLoading }: ChatMessageProps) => {
  const isTaskMessage = message.taskId && message.role === 'assistant';

  // User message rendering
  if (message.role === 'user') {
    const firstBlock = message.contentBlocks[0];
    const text = firstBlock?.type === 'task-status-update' ? firstBlock.text || '' : '';

    return (
      <div>
        <Message from={message.role}>
          <MessageContent variant="flat">
            <MessageBody>
              <UserMessageContent text={text} timestamp={message.timestamp} />
            </MessageBody>
            <MessageMetadata from="user" messageId={message.id} timestamp={message.timestamp} />
          </MessageContent>
        </Message>
        <ChatMessageActions role={message.role} text={text} />
      </div>
    );
  }

  // Assistant message with content blocks (new Jupyter-style rendering)
  if (message.role === 'assistant') {
    // Check if this message only contains tool calls (no text/artifacts)
    const hasOnlyToolCalls = message.contentBlocks.every((block) => block.type === 'tool');
    const shouldShowTokens = message.role === 'assistant';

    // Helper function to render a single content block
    const renderContentBlock = (block: ContentBlock, index: number) => {
      switch (block.type) {
        case 'tool':
          return (
            <div className="mb-4" key={`${message.id}-tool-${block.toolCallId}`}>
              <ToolBlock
                endTimestamp={block.endTimestamp}
                errorText={block.errorText}
                input={block.input}
                isLastBlock={index === message.contentBlocks.length - 1}
                messageId={block.messageId}
                output={block.output}
                state={block.state}
                timestamp={block.timestamp}
                toolCallId={block.toolCallId}
                toolName={block.toolName}
              />
            </div>
          );
        case 'artifact':
          return (
            <div className="mb-4" key={`${message.id}-artifact-${block.artifactId}`}>
              <ArtifactBlock
                artifactId={block.artifactId}
                description={block.description}
                name={block.name}
                parts={block.parts}
                timestamp={block.timestamp}
              />
            </div>
          );
        case 'task-status-update':
          return (
            <TaskStatusUpdateBlock
              key={`${message.id}-status-${index}`}
              inputTokens={block.usage?.input_tokens}
              messageId={block.messageId}
              outputTokens={block.usage?.output_tokens}
              previousState={block.previousState}
              taskState={block.taskState}
              text={block.text}
              timestamp={block.timestamp}
            />
          );
        default:
          return null;
      }
    };

    // Split content blocks into pre-task and task-related
    const taskStartIndex = message.taskStartIndex ?? message.contentBlocks.length;
    const preTaskBlocks = message.contentBlocks.slice(0, taskStartIndex);
    const taskBlocks = message.contentBlocks.slice(taskStartIndex);

    // Render pre-task content blocks
    const preTaskElements = preTaskBlocks.map((block, index) => renderContentBlock(block, index));

    // Render task-related content blocks
    const taskElements = taskBlocks.map((block, index) => renderContentBlock(block, taskStartIndex + index));

    // Wrap in task UI if this is a task message
    if (isTaskMessage && message.taskId) {
      return (
        <div>
          {/* Always render pre-task content first (messages that arrived before task event) */}
          {preTaskElements}
          {/* Task wrapper contains task-related content blocks */}
          <TaskMessageWrapper messageId={message.id} taskId={message.taskId} taskState={message.taskState}>
            {taskElements}
          </TaskMessageWrapper>
        </div>
      );
    }

    // Non-task assistant message
    // If message only contains tool calls, wrap in message box to show metadata
    if (hasOnlyToolCalls && message.contentBlocks.length > 0) {
      return (
        <div>
          <Message from={message.role}>
            <MessageContent>
              <MessageBody>{preTaskElements}{taskElements}</MessageBody>
              <MessageMetadata
                contextId={message.contextId}
                from={message.role}
                inputTokens={shouldShowTokens ? message.usage?.input_tokens : undefined}
                messageId={message.id}
                outputTokens={shouldShowTokens ? message.usage?.output_tokens : undefined}
                taskId={message.taskId}
                timestamp={message.timestamp}
              />
            </MessageContent>
          </Message>
        </div>
      );
    }

    // Message with text/artifacts - wrap in message box to show metadata
    const hasTextOrArtifacts = message.contentBlocks.some(
      (block) => block.type === 'artifact' || block.type === 'task-status-update'
    );

    if (hasTextOrArtifacts) {
      return (
        <div>
          <Message from={message.role}>
            <MessageContent>
              <MessageBody>
                {preTaskElements}
                {taskElements}
              </MessageBody>
              <MessageMetadata
                contextId={message.contextId}
                from={message.role}
                inputTokens={shouldShowTokens ? message.usage?.input_tokens : undefined}
                messageId={message.id}
                outputTokens={shouldShowTokens ? message.usage?.output_tokens : undefined}
                taskId={message.taskId}
                timestamp={message.timestamp}
              />
            </MessageContent>
          </Message>
          <ChatMessageActions
            role={message.role}
            text={(() => {
              const textBlock = message.contentBlocks.find((b) => b.type === 'task-status-update');
              return textBlock?.type === 'task-status-update' ? textBlock.text || '' : '';
            })()}
          />
        </div>
      );
    }

    // Fallback for other types
    return (
      <div>
        {preTaskElements}
        {taskElements}
      </div>
    );
  }

  return null;
};
