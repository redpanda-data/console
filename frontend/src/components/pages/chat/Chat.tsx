/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { PageComponent, type PageInitHelper } from '../Page';
import PageContent from '../../misc/PageContent';
import { chatDb, type ChatMessage } from '../../../database/chatDb';
import { Button } from '@redpanda-data/ui';
import fetchWithTimeout from '../../../utils/fetchWithTimeout';
import { useLiveQuery } from 'dexie-react-hooks';

// API endpoint for chat, this is a proxy to the Redpanda Cloud API for now
const CHAT_API_ENDPOINT = 'http://localhost:8010/proxy/post/chat';
const API_TIMEOUT = 15000; // 15 seconds

interface ChatApiResponse {
  message: string;
  success: boolean;
  error?: string;
}

interface ChatApiRequest {
  message: string;
  history: {
    content: string;
    sender: 'user' | 'system';
    timestamp: string;
  }[];
}

const ChatPageContent: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use live query to listen for message changes in the database
  const messages =
    useLiveQuery(async () => {
      const storedMessages = await chatDb.getAllMessages();
      setShouldScroll(true);
      return storedMessages;
    }, []) || [];

  // Update scroll position when shouldScroll changes
  useEffect(() => {
    if (shouldScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setShouldScroll(false);
    }
  }, [shouldScroll]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
  };

  const sendMessageToApi = async (message: string, chatHistory: ChatMessage[]): Promise<ChatApiResponse> => {
    try {
      // Limit chat history to last 30 messages
      const recentHistory = chatHistory.slice(-30);

      // Format chat history for the API request
      const formattedHistory = recentHistory.map((msg) => ({
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.timestamp.toISOString(),
      }));

      const payload: ChatApiRequest = {
        message,
        history: formattedHistory,
      };

      const response = await fetchWithTimeout(CHAT_API_ENDPOINT, API_TIMEOUT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      return (await response.json()) as ChatApiResponse;
    } catch (error) {
      console.error('Error sending message to API:', error);
      return {
        success: false,
        message: 'Failed to send message to server. Please try again later.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim() || isSending) return;

    // Create user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    try {
      setIsSending(true);

      // Add to database
      await chatDb.addMessage(userMessage);
      setInputValue('');
      setShouldScroll(true);

      // Show typing indicator while waiting for response
      setIsTyping(true);

      // Send message to API along with chat history
      const apiResponse = await sendMessageToApi(userMessage.content, [...messages, userMessage]);

      // Hide typing indicator
      setIsTyping(false);

      // Create system message from API response
      const systemMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: apiResponse.success
          ? apiResponse.message
          : 'Sorry, there was an error processing your request. Please try again later.',
        sender: 'system',
        timestamp: new Date(),
      };

      // Add to database
      await chatDb.addMessage(systemMessage);
      setShouldScroll(true);
    } catch (error) {
      console.error('Error sending message:', error);

      // Hide typing indicator
      setIsTyping(false);

      // Create error message
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, there was an error sending your message. Please try again later.',
        sender: 'system',
        timestamp: new Date(),
      };

      // Add to database
      await chatDb.addMessage(errorMessage);
      setShouldScroll(true);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const handleClearChat = async () => {
    try {
      await chatDb.clearAllMessages();
    } catch (error) {
      console.error('Error clearing messages:', error);
    }
  };

  if (!messages) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-200px)]">
        <div className="animate-pulse text-slate-500">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] w-full px-4">
      {/* Clear button */}
      <div className="flex justify-end mb-2">
        <Button size="xs" colorScheme="red" variant="outline" onClick={handleClearChat} aria-label="Clear chat history">
          Clear History
        </Button>
      </div>

      {/* Messages container with scroll */}
      <div
        className="flex-1 overflow-y-auto bg-slate-50 rounded-md p-4 mb-4 border border-slate-200 shadow-sm"
        aria-label="Chat messages"
        role="log"
      >
        <div className="flex flex-col space-y-4">
          {messages.map((message: ChatMessage) => (
            <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`p-3 rounded-lg max-w-[80%] ${
                  message.sender === 'user'
                    ? 'bg-blue-100 text-blue-900'
                    : 'bg-white text-slate-900 border border-slate-200'
                }`}
                role="article"
                aria-label={`${message.sender} message`}
              >
                <p className="text-sm">{message.content}</p>
                <p className="text-xs text-slate-500 mt-1">{message.timestamp.toLocaleTimeString()}</p>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="p-3 rounded-lg bg-white text-slate-900 border border-slate-200 max-w-[80%]">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-75" />
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-150" />
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-300" />
                  <span className="text-xs text-slate-500 ml-2">System is typing...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat input */}
      <div className="border border-slate-200 rounded-md p-4 bg-white shadow-sm">
        <form className="space-y-2" onSubmit={handleSendMessage}>
          <div className="relative">
            <textarea
              id="chat-input"
              className="w-full rounded-md outline-none focus:outline-none focus:ring-0 border-none resize-none min-h-[80px] text-sm"
              placeholder="Type your message here..."
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              aria-label="Type your message"
              spellCheck="false"
              autoCorrect="off"
              autoCapitalize="off"
              disabled={isSending}
            />
            <Button
              variant="ghost"
              position="absolute"
              bottom="3"
              right="3"
              colorScheme="blue"
              size="sm"
              type="submit"
              aria-label="Send message"
              isDisabled={!inputValue.trim() || isSending}
              height="auto"
              py="2"
              px="4"
              isLoading={isSending}
              loadingText="Sending"
            >
              Send
            </Button>
          </div>
        </form>
        <p className="text-xs text-slate-500 mt-2">Press Enter to send, Shift+Enter for a new line</p>
      </div>
    </div>
  );
};

class ChatPage extends PageComponent {
  initPage(p: PageInitHelper): void {
    p.title = 'Chat';
  }

  render() {
    return (
      <PageContent>
        <ChatPageContent />
      </PageContent>
    );
  }
}

export default ChatPage;
