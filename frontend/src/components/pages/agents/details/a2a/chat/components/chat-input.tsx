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

import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from 'components/ai-elements/prompt-input';
import { Button } from 'components/redpanda-ui/components/button';
import { Text } from 'components/redpanda-ui/components/typography';
import { Context, ContextContent, ContextContentHeader, ContextContentBody, ContextInputUsage, ContextOutputUsage, ContextTrigger } from 'components/ai-elements/context';
import { HistoryIcon } from 'lucide-react';
import type { AIAgent } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';

import { AIAgentModel } from '../../../../ai-agent-model';
import type { UsageMetadata } from '../types';

type ChatInputProps = {
  input: string;
  isLoading: boolean;
  editingMessageId: string | null;
  agent: AIAgent;
  hasMessages: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  usage?: UsageMetadata;
  onInputChange: (value: string) => void;
  onSubmit: (message: PromptInputMessage, event: React.FormEvent) => void;
  onClearHistory: () => void;
  onCancelEdit: () => void;
  onCancel?: () => void;
};

/**
 * Chat input component with prompt textarea, model selector, and controls
 */
export const ChatInput = ({
  input,
  isLoading,
  editingMessageId,
  agent,
  hasMessages,
  textareaRef,
  usage,
  onInputChange,
  onSubmit,
  onClearHistory,
  onCancelEdit,
  onCancel,
}: ChatInputProps) => {
  // Construct modelId from agent resource: provider:model (e.g., "openai:gpt-5")
  const provider = agent.provider?.provider.case || 'openai';
  const modelId = `${provider}:${agent.model}`;

  return (
    <div className="shrink-0 bg-background px-4 pt-4 pb-8">
      <PromptInput globalDrop multiple onSubmit={onSubmit}>
        <PromptInputBody>
          <PromptInputAttachments>{(attachment) => <PromptInputAttachment data={attachment} />}</PromptInputAttachments>
          <PromptInputTextarea
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={editingMessageId ? 'Edit your message...' : 'Ask the agent anything...'}
            ref={textareaRef}
            value={input}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            {agent.model && (
              <PromptInputModelSelect disabled value={agent.model}>
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue>
                    <AIAgentModel model={agent.model} size="sm" />
                  </PromptInputModelSelectValue>
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  <PromptInputModelSelectItem value={agent.model}>
                    <AIAgentModel model={agent.model} size="sm" />
                  </PromptInputModelSelectItem>
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
            )}
            <Context
              maxTokens={usage?.max_input_tokens || 272000}
              usedTokens={usage?.input_tokens || 0}
              modelId={modelId}
              usage={{
                inputTokens: usage?.cumulativeInputTokens || 0,
                outputTokens: usage?.cumulativeOutputTokens || 0,
                reasoningTokens: usage?.cumulativeReasoningTokens || 0,
                cachedInputTokens: usage?.cumulativeCachedTokens || 0,
                totalTokens: (usage?.cumulativeInputTokens || 0) + (usage?.cumulativeOutputTokens || 0),
              }}
            >
              <ContextTrigger />
              <ContextContent>
                <ContextContentHeader />
                <ContextContentBody>
                  <ContextInputUsage />
                  <ContextOutputUsage />
                </ContextContentBody>
              </ContextContent>
            </Context>
            <Button
              disabled={!hasMessages}
              onClick={() => {
                onClearHistory();
                // Refocus textarea after clearing
                setTimeout(() => textareaRef.current?.focus(), 0);
              }}
              type="button"
              variant="ghost"
            >
              <HistoryIcon className="size-3" />
              <Text as="span" className="text-sm">
                Clear history
              </Text>
            </Button>
          </PromptInputTools>
          <div className="flex items-center gap-2">
            {editingMessageId ? (
              <div className="flex gap-2">
                <Button onClick={onCancelEdit} size="sm" type="button" variant="outline">
                  Cancel
                </Button>
                <PromptInputSubmit disabled={!input} size="sm" status={isLoading ? 'streaming' : 'ready'}>
                  Send
                </PromptInputSubmit>
              </div>
            ) : (
              <PromptInputSubmit
                className="size-8"
                disabled={!(input || isLoading)}
                onClick={(e) => {
                  if (isLoading && onCancel) {
                    e.preventDefault();
                    onCancel();
                  }
                }}
                size="icon-xs"
                status={isLoading ? 'streaming' : 'ready'}
              />
            )}
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
};
