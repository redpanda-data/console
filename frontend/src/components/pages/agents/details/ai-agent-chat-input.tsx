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

import { SendMessageButton } from 'components/chat/send-message-button';
import { type ChatMessage, chatDb } from 'database/chat-db';
import { useLiveQuery } from 'dexie-react-hooks';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

import { sendMessageViaA2A } from './send-message-via-a2a';

type AIAgentChatInputProps = {
  setIsTyping: (isTyping: boolean) => void;
  agentUrl: string;
  agentId: string;
  messagesEndRef: React.RefObject<HTMLDivElement>;
};

export type AIAgentChatInputRef = {
  resetContext: () => void;
};

export const AIAgentChatInput = forwardRef<AIAgentChatInputRef, AIAgentChatInputProps>(
  ({ setIsTyping, agentUrl, agentId, messagesEndRef }, ref) => {
    const [inputValue, setInputValue] = useState('');
    const [isSending, setIsSending] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // Track contextId for conversation continuity
    const contextIdRef = useRef<string | undefined>(undefined);

    // Expose reset function to parent component
    useImperativeHandle(ref, () => ({
      resetContext: () => {
        contextIdRef.current = undefined;
      },
    }));

    // Use live query to listen for message changes in the database
    const messages =
      useLiveQuery(async () => {
        const storedMessages = await chatDb.getAllMessages(agentId);
        return storedMessages;
      }, [agentId]) || [];

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!inputValue.trim() || isSending) {
        return;
      }

      // Create user message
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        agentId,
        content: inputValue,
        sender: 'user',
        timestamp: new Date(),
        failure: false,
      };

      // Create system message ID upfront for streaming updates
      const systemMessageId = (Date.now() + 1).toString();

      try {
        setIsSending(true);

        // Add user message to database
        await chatDb.addMessage(userMessage);
        setInputValue('');

        // Maintain focus on the textarea
        textareaRef.current?.focus();

        // Show typing indicator while waiting for response
        setIsTyping(true);

        // Create initial system message (will be updated during streaming)
        const systemMessage: ChatMessage = {
          id: systemMessageId,
          agentId,
          content: '', // Start with empty content
          sender: 'system',
          timestamp: new Date(),
          failure: false,
          isStreaming: true, // Mark as streaming
        };

        // Add system message to database
        await chatDb.addMessage(systemMessage);

        // Hide typing indicator immediately since we'll show streaming content
        setIsTyping(false);

        // Send message to agent via A2A protocol with streaming callback
        const apiResponse = await sendMessageViaA2A({
          message: userMessage.content,
          chatHistory: messages.filter((message) => !message.failure),
          agentUrl,
          contextId: contextIdRef.current,
          onStreamUpdate: async (partialContent: string, reasoning?: string) => {
            // Update the system message with partial content and reasoning during streaming
            await chatDb.updateMessage(systemMessageId, {
              content: partialContent,
              reasoning,
              isStreaming: true, // Keep streaming flag active
            });

            // Don't auto-scroll during streaming to avoid interrupting user reading
            // Only scroll if user is already near the bottom (within 100px)
            const messagesContainer = messagesEndRef?.current?.parentElement;
            if (messagesContainer) {
              const isNearBottom =
                messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
              if (isNearBottom) {
                messagesEndRef?.current?.scrollIntoView({ behavior: 'smooth' });
              }
            }
          },
        });

        // Update with final content and mark streaming as complete
        if (apiResponse.message) {
          // Update contextId for conversation continuity
          if (apiResponse.contextId) {
            contextIdRef.current = apiResponse.contextId;
          }

          await chatDb.updateMessage(systemMessageId, {
            content: apiResponse.success
              ? apiResponse.message
              : 'Sorry, there was an error processing your request. Please try again later.',
            failure: !apiResponse.success,
            isStreaming: false, // Streaming complete
            taskId: apiResponse.taskId,
            contextId: apiResponse.contextId,
            reasoning: apiResponse.reasoning,
            artifacts: apiResponse.artifacts,
          });
        }

        // If there's a completion message, create a separate message for it
        if (apiResponse.completionMessage) {
          const completionMessageId = (Date.now() + 2).toString();
          const completionMessage: ChatMessage = {
            id: completionMessageId,
            agentId,
            content: apiResponse.completionMessage,
            sender: 'system',
            timestamp: new Date(),
            failure: false,
            isStreaming: false,
            taskId: apiResponse.taskId,
            contextId: apiResponse.contextId,
            artifacts: apiResponse.artifacts,
          };

          // Add completion message to database
          await chatDb.addMessage(completionMessage);
        }

        // Final scroll to the bottom (only if user is near bottom)
        const messagesContainer = messagesEndRef?.current?.parentElement;
        if (messagesContainer) {
          const isNearBottom =
            messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
          if (isNearBottom) {
            messagesEndRef?.current?.scrollIntoView({ behavior: 'smooth' });
          }
        }
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: error logging for debugging message send failures
        console.error('Error sending message:', error);

        // Hide typing indicator
        setIsTyping(false);

        // Update the system message with error and stop streaming
        await chatDb.updateMessage(systemMessageId, {
          content: 'Sorry, there was an error sending your message. Please try again later.',
          failure: true,
          isStreaming: false, // Stop streaming on error
        });
      } finally {
        setIsSending(false);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
        handleSendMessage(e).catch(console.error);
      }
    };

    return (
      <div className="border border-slate-200 bg-white p-4 shadow-sm backdrop-blur-sm">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            if (agentUrl) {
              // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
              handleSendMessage(e).catch(console.error);
            }
          }}
        >
          <div className="relative">
            <textarea
              aria-label="Type your message"
              autoCapitalize="off"
              autoCorrect="off"
              className="min-h-[80px] w-full resize-none rounded-md border-none text-sm outline-none focus:outline-none focus:ring-0"
              id="chat-input"
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type your message here..."
              ref={textareaRef}
              spellCheck="false"
              style={{
                resize: 'none',
              }}
              value={inputValue}
            />
            <SendMessageButton inputValue={inputValue} isSending={isSending} onClick={handleSendMessage} />
          </div>
        </form>
        <p className="mt-2 text-slate-500 text-xs">Press Enter to send, Shift+Enter for a new line</p>
      </div>
    );
  }
);

AIAgentChatInput.displayName = 'AIAgentChatInput';
