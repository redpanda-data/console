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
import { Switch } from 'components/redpanda-ui/components/switch';
import { Text } from 'components/redpanda-ui/components/typography';
import { AnimatePresence, motion } from 'framer-motion';
import { useScrollToBottom } from 'hooks/use-scroll-to-bottom';
import { ArrowDownIcon, HistoryIcon } from 'lucide-react';
import { useEffect } from 'react';

import { AIAgentModel } from '../../../../ai-agent-model';

type ChatInputProps = {
  input: string;
  isLoading: boolean;
  editingMessageId: string | null;
  model: string | undefined;
  hasMessages: boolean;
  autoScrollEnabled: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onInputChange: (value: string) => void;
  onSubmit: (message: PromptInputMessage, event: React.FormEvent) => void;
  onClearHistory: () => void;
  onCancelEdit: () => void;
  onAutoScrollChange: (enabled: boolean) => void;
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
  autoScrollEnabled,
  textareaRef,
  onInputChange,
  onSubmit,
  onClearHistory,
  onCancelEdit,
  onAutoScrollChange,
}: ChatInputProps) => {
  const { isAtBottom, scrollToBottom } = useScrollToBottom();

  // Auto-scroll to bottom when message is submitted (isLoading becomes true)
  useEffect(() => {
    if (isLoading) {
      scrollToBottom('smooth');
    }
  }, [isLoading, scrollToBottom]);

  return (
    <div className="sticky bottom-0 z-10 border-t bg-background p-4">
      {/* Scroll to bottom button - appears when not at bottom */}
      <AnimatePresence>
        {!isAtBottom && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="-translate-x-1/2 absolute bottom-28 left-1/2 z-50"
            exit={{ opacity: 0, y: 10 }}
            initial={{ opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <Button
              onClick={(event) => {
                event.preventDefault();
                scrollToBottom('instant');
              }}
              size="icon"
              type="button"
              variant="outline"
            >
              <ArrowDownIcon className="size-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

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
              <Text as="span" className="text-sm">
                Clear history
              </Text>
            </Button>
          </PromptInputTools>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Switch checked={autoScrollEnabled} onCheckedChange={onAutoScrollChange} testId="auto-scroll-switch" />
              <Text as="span" className="text-sm">
                Auto scroll
              </Text>
            </div>
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
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
};
