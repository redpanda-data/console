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

import { Message, MessageContent, MessageMetadata } from 'components/ai-elements/message';
import { SparklesIcon } from 'lucide-react';

import { ChatMessageActions } from './chat-message-actions';
import { ArtifactBlock } from './message-blocks/artifact-block';
import { StatusUpdateBlock } from './message-blocks/status-update-block';
import { TextBlock } from './message-blocks/text-block';
import { ToolBlock } from './message-blocks/tool-block';
import { LoadingMessageContent } from './message-content/loading-message-content';
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
export const ChatMessage = ({ message, isLoading }: ChatMessageProps) => {
  const isTaskMessage = message.taskId && message.role === 'assistant';

  // User message rendering (unchanged)
  if (message.role === 'user') {
    const firstBlock = message.contentBlocks[0];
    const text = firstBlock?.type === 'text' ? firstBlock.text : '';

    return (
      <div>
        <Message from={message.role}>
          <MessageContent from={message.role} variant="flat">
            <UserMessageContent text={text} timestamp={message.timestamp} />
          </MessageContent>
        </Message>
        <ChatMessageActions role={message.role} text={text} />
      </div>
    );
  }

  // Assistant message with content blocks (new Jupyter-style rendering)
  if (message.role === 'assistant') {
    // Helper function to render a single content block
    const renderContentBlock = (block: ContentBlock, index: number) => {
      switch (block.type) {
        case 'text':
          return (
            <div className="mb-4" key={`${message.id}-text-${index}`}>
              <Message from={message.role}>
                <SparklesIcon className="size-4" />
                <MessageContent from={message.role} variant="flat">
                  <TextBlock text={block.text} timestamp={block.timestamp} />
                  <MessageMetadata
                    contextId={message.contextId}
                    from="assistant"
                    messageId={message.id}
                    taskId={message.taskId}
                    timestamp={message.timestamp}
                  />
                </MessageContent>
              </Message>
            </div>
          );
        case 'tool':
          return (
            <div className="mb-4" key={`${message.id}-tool-${block.toolCallId}`}>
              <ToolBlock
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
        case 'status-update':
          return (
            <div className="mb-4" key={`${message.id}-status-${index}`}>
              <StatusUpdateBlock taskState={block.taskState} timestamp={block.timestamp} />
            </div>
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

    // Show loading indicator during streaming
    // For task messages, show loading AFTER pre-task content but BEFORE task wrapper
    // For non-task messages, show loading AFTER all content
    const loadingElement = isLoading ? (
      <div className="mb-4">
        <Message from={message.role}>
          <SparklesIcon className="size-4" />
          <MessageContent from={message.role} variant="flat">
            <LoadingMessageContent />
          </MessageContent>
        </Message>
      </div>
    ) : null;

    // Wrap in task UI if this is a task message
    if (isTaskMessage && message.taskId) {
      return (
        <div>
          {/* Always render pre-task content first (messages that arrived before task event) */}
          {preTaskElements}
          {/* Show loading indicator after pre-task content but before task wrapper */}
          {loadingElement}
          {/* Task wrapper contains task-related content blocks */}
          <TaskMessageWrapper messageId={message.id} taskId={message.taskId} taskState={message.taskState}>
            {taskElements}
          </TaskMessageWrapper>
          <ChatMessageActions
            role={message.role}
            text={(() => {
              const textBlock = message.contentBlocks.find((b) => b.type === 'text');
              return textBlock?.type === 'text' ? textBlock.text : '';
            })()}
          />
        </div>
      );
    }

    // Non-task assistant message
    return (
      <div>
        {preTaskElements}
        {taskElements}
        {loadingElement}
        <ChatMessageActions
          role={message.role}
          text={(() => {
            const textBlock = message.contentBlocks.find((b) => b.type === 'text');
            return textBlock?.type === 'text' ? textBlock.text : '';
          })()}
        />
      </div>
    );
  }

  return null;
};
