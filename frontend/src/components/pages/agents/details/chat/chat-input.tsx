import { type ChatMessage, chatDb } from 'database/chat-db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { SendMessageButton } from './send-message-button';
import { sendMessageToApi } from './send-message-to-api';

interface ChatInputProps {
  setIsTyping: (isTyping: boolean) => void;
  agentUrl?: string;
  agentId: string;
  initialValue?: string;
  onInputChange?: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export const ChatInput = ({
  setIsTyping,
  agentUrl,
  agentId,
  messagesEndRef,
  initialValue,
  onInputChange,
}: ChatInputProps) => {
  const [inputValue, setInputValue] = useState(initialValue || '');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update input value when initialValue prop changes
  useEffect(() => {
    if (initialValue) {
      setInputValue(initialValue);
      // Focus the textarea when a question is selected
      textareaRef.current?.focus();
    }
  }, [initialValue]);

  // Use live query to listen for message changes in the database
  const messages =
    useLiveQuery(async () => {
      const storedMessages = await chatDb.getAllMessages(agentId);
      return storedMessages;
    }, [agentId]) || [];

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    if (onInputChange) {
      onInputChange();
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim() || isSending) return;

    // Create user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      agentId,
      content: inputValue,
      sender: 'user',
      timestamp: new Date(),
      failure: false,
    };

    try {
      setIsSending(true);

      // Add to database
      await chatDb.addMessage(userMessage);
      setInputValue('');

      // Maintain focus on the textarea
      textareaRef.current?.focus();

      // Show typing indicator while waiting for response
      setIsTyping(true);

      // Send message to API along with chat history
      const apiResponse = await sendMessageToApi({
        message: userMessage.content,
        chatHistory: messages.filter((message) => !message.failure),
        agentUrl,
      });

      // Hide typing indicator
      setIsTyping(false);

      // Scroll to the bottom of the chat messages when response is received
      messagesEndRef?.current?.scrollIntoView({ behavior: 'smooth' });

      // Create system message from API response
      const systemMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        agentId,
        content: apiResponse.success
          ? apiResponse.message
          : 'Sorry, there was an error processing your request. Please try again later.',
        sender: 'system',
        timestamp: new Date(),
        failure: !apiResponse.success,
      };

      // Add to database
      await chatDb.addMessage(systemMessage);
    } catch (error) {
      console.error('Error sending message:', error);

      // Hide typing indicator
      setIsTyping(false);

      // Create error message
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        agentId,
        content: 'Sorry, there was an error sending your message. Please try again later.',
        sender: 'system',
        timestamp: new Date(),
        failure: true,
      };

      // Add to database
      await chatDb.addMessage(errorMessage);
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

  return (
    <div className="border border-slate-200 p-4 bg-white shadow-sm backdrop-blur-sm">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          if (agentUrl) {
            handleSendMessage(e);
          }
        }}
      >
        <div className="relative">
          <textarea
            ref={textareaRef}
            id="chat-input"
            className="w-full rounded-md outline-none focus:outline-none focus:ring-0 border-none resize-none min-h-[80px] text-sm"
            style={{
              resize: 'none',
            }}
            placeholder="Type your message here..."
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            aria-label="Type your message"
            spellCheck="false"
            autoCorrect="off"
            autoCapitalize="off"
          />
          <SendMessageButton inputValue={inputValue} isSending={isSending} onClick={handleSendMessage} />
        </div>
      </form>
      <p className="text-xs text-slate-500 mt-2">Press Enter to send, Shift+Enter for a new line</p>
    </div>
  );
};
