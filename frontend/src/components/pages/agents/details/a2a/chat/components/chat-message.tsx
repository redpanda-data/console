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
import { TextBlock } from './message-blocks/text-block';
import { ToolBlock } from './message-blocks/tool-block';
import { LoadingMessageContent } from './message-content/loading-message-content';
import { UserMessageContent } from './message-content/user-message-content';
import { TaskMessageWrapper } from './task-message/task-message-wrapper';
import type { ChatMessage as ChatMessageType } from '../types';

type ChatMessageProps = {
  message: ChatMessageType;
  isLastMessage: boolean;
  isLoading: boolean;
  onEdit: (messageId: string) => void;
  onRetry: () => void;
};

/**
 * Individual chat message component with Jupyter-style interleaved rendering
 */
export const ChatMessage = ({ message, isLastMessage, isLoading, onEdit, onRetry }: ChatMessageProps) => {
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
        <ChatMessageActions
          isLastMessage={isLastMessage}
          onEdit={() => onEdit(message.id)}
          onRetry={onRetry}
          role={message.role}
          text={text}
        />
      </div>
    );
  }

  // Assistant message with content blocks (new Jupyter-style rendering)
  if (message.role === 'assistant') {
    // Loading state
    if (message.contentBlocks.length === 0 && isLoading) {
      return (
        <div>
          <Message from={message.role}>
            <SparklesIcon className="size-4" />
            <MessageContent from={message.role} variant="flat">
              <LoadingMessageContent />
            </MessageContent>
          </Message>
        </div>
      );
    }

    // Render interleaved content blocks
    const contentBlockElements = message.contentBlocks.map((block, index) => {
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
        default:
          return null;
      }
    });

    // Wrap in task UI if this is a task message
    if (isTaskMessage && message.taskId) {
      return (
        <div>
          <TaskMessageWrapper messageId={message.id} taskId={message.taskId} taskState={message.taskState}>
            {contentBlockElements}
          </TaskMessageWrapper>
          <ChatMessageActions
            isLastMessage={isLastMessage}
            onEdit={() => onEdit(message.id)}
            onRetry={onRetry}
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
        {contentBlockElements}
        <ChatMessageActions
          isLastMessage={isLastMessage}
          onEdit={() => onEdit(message.id)}
          onRetry={onRetry}
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
