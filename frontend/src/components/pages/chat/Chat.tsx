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

import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { PageComponent, type PageInitHelper } from '../Page';
import PageContent from '../../misc/PageContent';
import { chatDb, type ChatMessage } from '../../../database/chatDb';
import { Button } from '@redpanda-data/ui';

const ChatPageContent: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);

  // Load messages from database on component mount
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const storedMessages = await chatDb.getAllMessages();

        if (storedMessages.length === 0) {
          // Add default welcome messages if no messages exist
          const defaultMessages: ChatMessage[] = [
            {
              id: '1',
              content: 'Welcome to the Chat! How can I help you today?',
              sender: 'system',
              timestamp: new Date(),
            },
            {
              id: '2',
              content: 'Hello! I have some questions about Redpanda.',
              sender: 'user',
              timestamp: new Date(Date.now() - 60000),
            },
            {
              id: '3',
              content: "Sure, I'd be happy to answer any questions about Redpanda. What would you like to know?",
              sender: 'system',
              timestamp: new Date(Date.now() - 30000),
            },
          ];

          // Store default messages in the database
          for (const message of defaultMessages) {
            await chatDb.addMessage(message);
          }

          setMessages(defaultMessages);
        } else {
          setMessages(storedMessages);
        }
      } catch (error) {
        console.error('Error loading messages:', error);
      } finally {
        setIsLoading(false);
        shouldScrollRef.current = true;
      }
    };

    loadMessages();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    // Create user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    try {
      // Add to database
      await chatDb.addMessage(userMessage);

      // Update state
      shouldScrollRef.current = true;
      setMessages((prevMessages) => [...prevMessages, userMessage]);
      setInputValue('');

      // Simulate system response after a short delay
      setTimeout(async () => {
        const systemMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          content: `Echo: ${inputValue}`,
          sender: 'system',
          timestamp: new Date(),
        };

        // Add to database
        await chatDb.addMessage(systemMessage);

        // Update state
        shouldScrollRef.current = true;
        setMessages((prevMessages) => [...prevMessages, systemMessage]);
      }, 1000);
    } catch (error) {
      console.error('Error sending message:', error);
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
      setMessages([]);
    } catch (error) {
      console.error('Error clearing messages:', error);
    }
  };

  // Auto-scroll to bottom when messages change
  useLayoutEffect(() => {
    if (shouldScrollRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      shouldScrollRef.current = false;
    }
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-200px)]">
        <div className="animate-pulse text-slate-500">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] w-full px-4">
      {/* Header with clear button */}
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-medium text-slate-800">Chat History</h2>
        <button
          type="button"
          onClick={handleClearChat}
          className="text-xs text-red-600 hover:text-red-800 py-1 px-2 rounded border border-red-200 hover:border-red-400 transition-colors"
          aria-label="Clear chat history"
        >
          Clear History
        </button>
      </div>

      {/* Messages container with scroll */}
      <div
        className="flex-1 overflow-y-auto bg-slate-50 rounded-md p-4 mb-4 border border-slate-200 shadow-sm"
        aria-label="Chat messages"
        role="log"
      >
        <div className="flex flex-col space-y-4">
          {messages.map((message) => (
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
              isDisabled={!inputValue.trim()}
              height="auto"
              py="2"
              px="4"
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
