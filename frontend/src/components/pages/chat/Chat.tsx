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

import React, { useState, useRef, useLayoutEffect } from 'react';
import { PageComponent, type PageInitHelper } from '../Page';
import PageContent from '../../misc/PageContent';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'system';
  timestamp: Date;
}

const ChatPageContent: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([
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
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    shouldScrollRef.current = true;
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInputValue('');

    // Simulate system response after a short delay
    setTimeout(() => {
      const systemMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Echo: ${inputValue}`,
        sender: 'system',
        timestamp: new Date(),
      };

      shouldScrollRef.current = true;
      setMessages((prevMessages) => [...prevMessages, systemMessage]);
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  // Auto-scroll to bottom when messages change
  useLayoutEffect(() => {
    if (shouldScrollRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      shouldScrollRef.current = false;
    }
  });

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] w-full px-4">
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
            />
            <button
              className="absolute bottom-3 right-3 bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-white rounded-md px-4 py-2 text-sm transition-colors disabled:opacity-50 disabled:pointer-events-none"
              type="submit"
              aria-label="Send message"
              disabled={!inputValue.trim()}
            >
              Send
            </button>
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
