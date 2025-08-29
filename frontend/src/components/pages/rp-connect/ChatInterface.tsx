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

import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Input,
  Progress,
  Spinner,
  Text,
  Textarea,
  VStack,
  useColorModeValue,
} from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  CompletionType,
  TaskStatus,
  type TokenUsageStatistics,
} from '../../../protogen/redpanda/api/dataplane/v1alpha3/pipeline_pb';
import type { ChatMessage } from './AIPipelineAssistant';
import { StreamingIndicators } from './StreamingIndicators';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  currentStatus: TaskStatus;
  isStreaming: boolean;
  isConnected: boolean;
  error: string | null;
  tokenUsage: TokenUsageStatistics | null;
  onSendMessage: (message: string) => Promise<void>;
  onContinueConversation: (message: string) => Promise<void>;
  onClearConversation: () => void;
  onDisconnect: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = observer(({
  messages,
  currentStatus,
  isStreaming,
  isConnected,
  error,
  tokenUsage,
  onSendMessage,
  onContinueConversation,
  onClearConversation,
  onDisconnect,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const bgColor = useColorModeValue('gray.50', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const userBubbleColor = useColorModeValue('blue.500', 'blue.300');
  const assistantBubbleColor = useColorModeValue('gray.100', 'gray.700');
  const systemBubbleColor = useColorModeValue('orange.100', 'orange.800');
  const thinkingBubbleColor = useColorModeValue('purple.50', 'purple.900');

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      const scrollHeight = inputRef.current.scrollHeight;
      inputRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isStreaming) return;

    const messageToSend = inputValue.trim();
    setInputValue('');

    try {
      if (isConnected && messages.length > 0) {
        await onContinueConversation(messageToSend);
      } else {
        await onSendMessage(messageToSend);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const getStatusText = (status: TaskStatus): string => {
    switch (status) {
      case TaskStatus.STARTED:
        return 'Starting conversation...';
      case TaskStatus.THINKING:
        return 'AI is thinking...';
      case TaskStatus.GENERATING:
        return 'Generating pipeline...';
      case TaskStatus.COMPLETED:
        return 'Completed';
      case TaskStatus.FAILED:
        return 'Failed';
      default:
        return 'Ready';
    }
  };

  const getBubbleColor = (message: ChatMessage): string => {
    switch (message.type) {
      case 'user':
        return userBubbleColor;
      case 'assistant':
        return assistantBubbleColor;
      case 'thinking':
        return thinkingBubbleColor;
      case 'system':
        return systemBubbleColor;
      default:
        return assistantBubbleColor;
    }
  };

  const getTextColor = (message: ChatMessage): string => {
    if (message.type === 'user') {
      return 'white';
    }
    return useColorModeValue('gray.800', 'gray.100');
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.type === 'user';
    const isThinking = message.type === 'thinking';
    const isSystem = message.type === 'system';

    return (
      <Flex
        key={message.id}
        justify={isUser ? 'flex-end' : 'flex-start'}
        mb={3}
        w="100%"
      >
        <Box
          maxW="80%"
          bg={getBubbleColor(message)}
          color={getTextColor(message)}
          px={4}
          py={2}
          borderRadius="lg"
          border={isSystem ? '1px solid' : 'none'}
          borderColor={isSystem ? 'orange.300' : 'transparent'}
          position="relative"
        >
          {isThinking && (
            <Flex align="center" mb={2}>
              <Spinner size="xs" mr={2} />
              <Text fontSize="xs" fontWeight="bold" opacity={0.8}>
                AI Thinking
              </Text>
            </Flex>
          )}
          
          <Text fontSize="sm" whiteSpace="pre-wrap">
            {message.content}
          </Text>
          
          {message.completion === CompletionType.PART_DONE && (
            <Box
              position="absolute"
              bottom="-2px"
              right="8px"
              w="6px"
              h="6px"
              bg="green.400"
              borderRadius="full"
            />
          )}
          
          <Text fontSize="xs" opacity={0.6} mt={1}>
            {message.timestamp.toLocaleTimeString()}
          </Text>
        </Box>
      </Flex>
    );
  };

  return (
    <Flex direction="column" height="100%" bg={bgColor}>
      {/* Header */}
      <Flex
        px={4}
        py={3}
        borderBottom="1px solid"
        borderColor={borderColor}
        align="center"
        justify="space-between"
      >
        <Heading size="sm">AI Pipeline Assistant</Heading>
        <Flex align="center" gap={2}>
          {tokenUsage && (
            <Text fontSize="xs" color="gray.500">
              {tokenUsage.totalTokens} tokens
            </Text>
          )}
          
          <StreamingIndicators
            currentStatus={currentStatus}
            isStreaming={isStreaming}
            isConnected={isConnected}
          />
          
          {messages.length > 0 && (
            <>
              <IconButton
                aria-label="Clear conversation"
                icon={<Text fontSize="sm">🗑️</Text>}
                size="xs"
                variant="ghost"
                onClick={onClearConversation}
                isDisabled={isStreaming}
              />
              
              {isConnected && (
                <IconButton
                  aria-label="Disconnect"
                  icon={<Text fontSize="sm">🔌</Text>}
                  size="xs"
                  variant="ghost"
                  onClick={onDisconnect}
                  isDisabled={isStreaming}
                />
              )}
            </>
          )}
        </Flex>
      </Flex>

      {/* Error Alert */}
      {error && (
        <Alert status="error" mx={4} mt={3}>
          <AlertIcon />
          <Text fontSize="sm">{error}</Text>
        </Alert>
      )}

      {/* Status Indicator */}
      {isStreaming && (
        <Box px={4} py={2}>
          <Flex align="center" gap={2} mb={2}>
            <Spinner size="sm" />
            <Text fontSize="sm" color="gray.600">
              {getStatusText(currentStatus)}
            </Text>
          </Flex>
          
          {(currentStatus === TaskStatus.THINKING || currentStatus === TaskStatus.GENERATING) && (
            <Progress
              size="sm"
              isIndeterminate
              colorScheme={currentStatus === TaskStatus.THINKING ? 'purple' : 'blue'}
            />
          )}
        </Box>
      )}

      {/* Messages */}
      <Box flex={1} overflow="auto" px={4} py={3}>
        <VStack spacing={0} align="stretch">
          {messages.length === 0 && !isStreaming && (
            <Box
              textAlign="center"
              py={8}
              color="gray.500"
            >
              <Text fontSize="sm" mb={2}>
                👋 Welcome to the AI Pipeline Assistant
              </Text>
              <Text fontSize="xs">
                Describe what you want your Redpanda Connect pipeline to do, and I'll help you build it!
              </Text>
            </Box>
          )}
          
          {messages.map(renderMessage)}
          <div ref={messagesEndRef} />
        </VStack>
      </Box>

      {/* Input Area */}
      <Box
        borderTop="1px solid"
        borderColor={borderColor}
        p={4}
        bg="white"
        _dark={{ bg: 'gray.900' }}
      >
        <Flex gap={2}>
          <Box flex={1}>
            <Textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                messages.length === 0
                  ? "Describe your pipeline (e.g., 'Read from a Kafka topic and send to HTTP endpoint')"
                  : "Continue the conversation..."
              }
              resize="none"
              minH="40px"
              maxH="120px"
              fontSize="sm"
              isDisabled={isStreaming}
            />
          </Box>
          
          <Button
            onClick={handleSendMessage}
            isDisabled={!inputValue.trim() || isStreaming}
            isLoading={isStreaming}
            loadingText="Sending"
            colorScheme="blue"
            size="sm"
            height="40px"
          >
            Send
          </Button>
        </Flex>
        
        {messages.length === 0 && (
          <Text fontSize="xs" color="gray.500" mt={2}>
            💡 Try: "Create a pipeline that reads from Kafka topic 'events' and writes to PostgreSQL"
          </Text>
        )}
      </Box>
    </Flex>
  );
});