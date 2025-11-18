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
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { AnimatePresence, motion } from 'framer-motion';
import { useScrollToBottom } from 'hooks/use-scroll-to-bottom';
import { ArrowDownIcon, HistoryIcon, ArrowDownToLineIcon } from 'lucide-react';
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
      scrollToBottom('instant');
    }
  }, [isLoading, scrollToBottom]);

  return (
    <div className="bg-background px-4 pt-4">
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="size-8"
                  onClick={() => onAutoScrollChange(!autoScrollEnabled)}
                  size="icon"
                  type="button"
                  variant={autoScrollEnabled ? 'default' : 'ghost'}
                >
                  <ArrowDownToLineIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <Text as="span" className="text-xs">
                  {autoScrollEnabled ? 'Auto scroll enabled' : 'Auto scroll disabled'}
                </Text>
              </TooltipContent>
            </Tooltip>
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
              <PromptInputSubmit className="size-8" disabled={!(input || isLoading)} size="icon-xs" status={isLoading ? 'streaming' : 'ready'} />
            )}
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
};
