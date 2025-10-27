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
import { HistoryIcon } from 'lucide-react';

import { AIAgentModel } from '../../../../ai-agent-model';

type ChatInputProps = {
  input: string;
  isLoading: boolean;
  editingMessageId: string | null;
  model: string | undefined;
  hasMessages: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onInputChange: (value: string) => void;
  onSubmit: (message: PromptInputMessage, event: React.FormEvent) => void;
  onClearHistory: () => void;
  onCancelEdit: () => void;
};

/**
 * Chat input component with prompt textarea, model selector, and controls
 */
export const ChatInput = ({
  input,
  isLoading,
  editingMessageId,
  model,
  hasMessages,
  textareaRef,
  onInputChange,
  onSubmit,
  onClearHistory,
  onCancelEdit,
}: ChatInputProps) => (
  <div className="border-t p-4">
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
          {model && (
            <PromptInputModelSelect disabled value={model}>
              <PromptInputModelSelectTrigger>
                <PromptInputModelSelectValue>
                  <AIAgentModel model={model} size="sm" />
                </PromptInputModelSelectValue>
              </PromptInputModelSelectTrigger>
              <PromptInputModelSelectContent>
                <PromptInputModelSelectItem value={model}>
                  <AIAgentModel model={model} size="sm" />
                </PromptInputModelSelectItem>
              </PromptInputModelSelectContent>
            </PromptInputModelSelect>
          )}
          <Button disabled={!hasMessages} onClick={onClearHistory} type="button" variant="ghost">
            <HistoryIcon className="size-3" />
            <span>Clear history</span>
          </Button>
        </PromptInputTools>
        {editingMessageId ? (
          <div className="flex gap-2">
            <Button onClick={onCancelEdit} type="button" variant="outline">
              Cancel
            </Button>
            <PromptInputSubmit disabled={!input} size="sm" status={isLoading ? 'streaming' : 'ready'}>
              Send
            </PromptInputSubmit>
          </div>
        ) : (
          <PromptInputSubmit disabled={!(input || isLoading)} status={isLoading ? 'streaming' : 'ready'} />
        )}
      </PromptInputFooter>
    </PromptInput>
  </div>
);
