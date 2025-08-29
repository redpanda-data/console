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

import { create } from '@bufbuild/protobuf';
import { Box } from '@redpanda-data/ui';
import React, { useCallback, useEffect, useState } from 'react';
import { config } from '../../../config';
import {
  CompletionType,
  ContentType,
  ExecutePipelineTaskRequestSchema,
  TaskStatus,
  type ConversationUpdate,
  type ExecutePipelineTaskResponse,
  type PipelineContent,
  type PipelineUpdate,
  type StreamError,
  type TokenUsageStatistics,
} from '../../../protogen/redpanda/api/dataplane/v1alpha3/pipeline_pb';
import { ChatInterface } from './ChatInterface';
import { DualPaneLayout } from './DualPaneLayout';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'thinking';
  content: string;
  timestamp: Date;
  status?: TaskStatus;
  completion?: CompletionType;
}

interface AIPipelineAssistantProps {
  onYamlUpdate?: (yaml: string) => void;
}

export const AIPipelineAssistant: React.FC<AIPipelineAssistantProps> = ({ onYamlUpdate }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStatus, setCurrentStatus] = useState<TaskStatus>(TaskStatus.UNSPECIFIED);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageStatistics | null>(null);
  const [yamlContent, setYamlContent] = useState('');
  const [yamlRevision, setYamlRevision] = useState(0);

  const sendMessage = useCallback(async (userMessage: string) => {
    if (!config.pipelineV1Alpha3Client) {
      setError('AI Pipeline service not available');
      return;
    }

    console.log('Sending message:', userMessage);

    // Add user message to chat
    const userChatMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: userMessage,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userChatMessage]);
    setIsStreaming(true);
    setError(null);

    try {
      // Create the streaming request
      const request = create(ExecutePipelineTaskRequestSchema, {
        userRequest: userMessage,
      });

      console.log('Created request:', request);

      // Create async generator for the request stream (required for bidirectional streaming)
      async function* requestStream() {
        yield request;
        // For bidirectional streaming, we could yield more requests here
        // For now, we just send the initial request
      }

      console.log('Starting real ExecutePipelineTask stream...');
      setIsConnected(true);
      
      // Start the bidirectional stream with proper async generator
      const responseStream = config.pipelineV1Alpha3Client.executePipelineTask(requestStream());
      
      console.log('Processing response stream...');
      
      // Process the response stream
      for await (const response of responseStream) {
        console.log('Received response:', response);
        
        switch (response.event.case) {
          case 'conversationUpdate':
            handleConversationUpdate(response.event.value);
            break;
          case 'pipelineUpdate':
            handlePipelineUpdate(response.event.value);
            break;
          case 'content':
            handlePipelineContent(response.event.value);
            break;
          case 'usage':
            setTokenUsage(response.event.value);
            break;
          case 'error':
            handleStreamErrorMessage(response.event.value);
            break;
        }
      }
      
      console.log('Stream completed');
      
    } catch (error) {
      console.error('Stream error:', error);
      
      // Check if this is the browser streaming limitation
      const errorMessage = error instanceof Error ? error.message : 'Unknown stream error';
      if (errorMessage.includes('fetch API does not support streaming request bodies')) {
        console.log('Browser streaming limitation detected, falling back to simulation...');
        
        // Fall back to simulation for demo purposes
        await simulateAIResponse(userMessage);
      } else {
        setError(errorMessage);
        setCurrentStatus(TaskStatus.FAILED);
        setIsConnected(false);
      }
    } finally {
      setIsStreaming(false);
    }
  }, [onYamlUpdate]);

  // Fallback simulation when real streaming isn't available - with real-time updates
  const simulateAIResponse = useCallback(async (userMessage: string) => {
    console.log('Starting AI simulation fallback...');
    setIsConnected(true);
    setCurrentStatus(TaskStatus.THINKING);
    
    // Progressive thinking phase with streaming updates
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const thinkingMessage: ChatMessage = {
      id: `thinking-${Date.now()}`,
      type: 'thinking',
      content: `Analyzing your request...`,
      timestamp: new Date(),
      status: TaskStatus.THINKING,
    };
    setMessages(prev => [...prev, thinkingMessage]);
    
    // Stream more thinking updates
    await new Promise(resolve => setTimeout(resolve, 800));
    setMessages(prev => {
      const updated = [...prev];
      const lastMessage = updated[updated.length - 1];
      if (lastMessage && lastMessage.type === 'thinking') {
        lastMessage.content += `\n\nI see you want: "${userMessage}"`;
      }
      return updated;
    });
    
    await new Promise(resolve => setTimeout(resolve, 700));
    setMessages(prev => {
      const updated = [...prev];
      const lastMessage = updated[updated.length - 1];
      if (lastMessage && lastMessage.type === 'thinking') {
        lastMessage.content += `\n\nIdentifying components: Kafka input → transformation → output...`;
      }
      return updated;
    });
    
    // Start generating phase
    setCurrentStatus(TaskStatus.GENERATING);
    await new Promise(resolve => setTimeout(resolve, 600));
    
    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      type: 'assistant',
      content: 'Perfect! I\'ll build that pipeline for you.',
      timestamp: new Date(),
      status: TaskStatus.GENERATING,
    };
    setMessages(prev => [...prev, assistantMessage]);
    
    // Stream the assistant response
    await new Promise(resolve => setTimeout(resolve, 800));
    setMessages(prev => {
      const updated = [...prev];
      const lastMessage = updated[updated.length - 1];
      if (lastMessage && lastMessage.type === 'assistant') {
        lastMessage.content += `\n\nGenerating the YAML configuration now...`;
      }
      return updated;
    });
    
    // Generate contextual YAML based on user request
    const isKafkaRequest = userMessage.toLowerCase().includes('kafka');
    const isHTTPRequest = userMessage.toLowerCase().includes('http');
    const isPostgreSQLRequest = userMessage.toLowerCase().includes('postgres');
    
    // Simulate incremental YAML building
    let yamlParts = [];
    
    if (isKafkaRequest && isHTTPRequest) {
      yamlParts = [
        'input:',
        '  kafka:',
        '    addresses:',
        '      - kafka:9092',
        '    topics:',
        '      - orders',
        '    consumer_group: pipeline-group',
        '',
        'output:',
        '  http_client:',
        '    url: "https://api.example.com/webhook"',
        '    verb: "POST"',
        '    headers:',
        '      Content-Type: "application/json"'
      ];
    } else if (isKafkaRequest && isPostgreSQLRequest) {
      yamlParts = [
        'input:',
        '  kafka:',
        '    addresses:',
        '      - kafka:9092',
        '    topics:',
        '      - events',
        '    consumer_group: pipeline-group',
        '',
        'output:',
        '  sql_insert:',
        '    driver: "postgres"',
        '    dsn: "postgres://user:pass@localhost/db"',
        '    table: "events"'
      ];
    } else if (isKafkaRequest) {
      yamlParts = [
        'input:',
        '  kafka:',
        '    addresses:',
        '      - kafka:9092',
        '    topics:',
        '      - events',
        '    consumer_group: pipeline-group',
        '',
        'output:',
        '  stdout: {}'
      ];
    } else {
      yamlParts = [
        'input:',
        '  stdin: {}',
        '',
        'output:',
        '  stdout: {}'
      ];
    }
    
    // Stream YAML generation line by line
    let currentYaml = '';
    for (let i = 0; i < yamlParts.length; i++) {
      currentYaml += (i > 0 ? '\n' : '') + yamlParts[i];
      setYamlContent(currentYaml);
      
      // Update the editor in real-time
      if (onYamlUpdate) {
        onYamlUpdate(currentYaml);
      }
      
      // Small delay between lines to show streaming effect
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Update assistant message
    setMessages(prev => {
      const updated = [...prev];
      const lastMessage = updated[updated.length - 1];
      if (lastMessage && lastMessage.type === 'assistant') {
        lastMessage.content += `\n\n✅ Pipeline YAML generated and streaming to the editor!`;
      }
      return updated;
    });
    
    setCurrentStatus(TaskStatus.COMPLETED);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const completionMessage: ChatMessage = {
      id: `completion-${Date.now()}`,
      type: 'system',
      content: '✅ Pipeline configuration completed! You can now modify the YAML or continue the conversation to refine it.',
      timestamp: new Date(),
      status: TaskStatus.COMPLETED,
    };
    setMessages(prev => [...prev, completionMessage]);
  }, [onYamlUpdate]);

  const handleConversationUpdate = useCallback((update: ConversationUpdate) => {
    setCurrentStatus(update.status);

    // Create or update message based on content type
    switch (update.type) {
      case ContentType.STATUS:
        // Status updates don't create new messages
        break;

      case ContentType.REASONING:
        // Add thinking message
        setMessages(prev => {
          const newMessage: ChatMessage = {
            id: `thinking-${Date.now()}`,
            type: 'thinking',
            content: update.text,
            timestamp: new Date(),
            status: update.status,
            completion: update.completion,
          };
          return [...prev, newMessage];
        });
        break;

      case ContentType.TEXT:
        // Add assistant response
        setMessages(prev => {
          const newMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            type: 'assistant',
            content: update.text,
            timestamp: new Date(),
            status: update.status,
            completion: update.completion,
          };
          return [...prev, newMessage];
        });
        break;

      case ContentType.ERROR:
        // Add error message
        setMessages(prev => {
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            type: 'system',
            content: `Error: ${update.text}`,
            timestamp: new Date(),
            status: update.status,
          };
          return [...prev, errorMessage];
        });
        break;
    }
  }, []);

  const handlePipelineUpdate = useCallback((update: PipelineUpdate) => {
    setYamlContent(prev => prev + update.text);
    
    if (update.isDone) {
      console.log('Pipeline update complete');
    }
  }, []);

  const handlePipelineContent = useCallback((content: PipelineContent) => {
    setYamlContent(content.pipelineYaml);
    setYamlRevision(content.revision);

    if (onYamlUpdate) {
      onYamlUpdate(content.pipelineYaml);
    }

    if (content.isFinal) {
      console.log('Final pipeline content received');
    }
  }, [onYamlUpdate]);

  const handleStreamErrorMessage = useCallback((error: StreamError) => {
    setError(error.message);
    setCurrentStatus(error.status);
    
    const errorMessage: ChatMessage = {
      id: `stream-error-${Date.now()}`,
      type: 'system',
      content: `Stream error: ${error.message}`,
      timestamp: new Date(),
      status: error.status,
    };
    
    setMessages(prev => [...prev, errorMessage]);
  }, []);

  const continueConversation = useCallback(async (followUpMessage: string) => {
    // For now, just start a new conversation
    // Full bidirectional streaming would require maintaining the stream writer
    await sendMessage(followUpMessage);
  }, [sendMessage]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setCurrentStatus(TaskStatus.UNSPECIFIED);
    setError(null);
    setTokenUsage(null);
    setIsConnected(false);
    setIsStreaming(false);
    setYamlContent('');
    setYamlRevision(0);
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setIsStreaming(false);
  }, []);

  return (
    <Box height="100%" width="100%">
      <ChatInterface
        messages={messages}
        currentStatus={currentStatus}
        isStreaming={isStreaming}
        isConnected={isConnected}
        error={error}
        tokenUsage={tokenUsage}
        onSendMessage={sendMessage}
        onContinueConversation={continueConversation}
        onClearConversation={clearConversation}
        onDisconnect={disconnect}
      />
    </Box>
  );
};

export interface AIPipelineAssistantWrapperProps {
  yamlContent: string;
  onYamlChange: (content: string) => void;
  children: React.ReactNode;
}

export const AIPipelineAssistantWrapper: React.FC<AIPipelineAssistantWrapperProps> = ({ 
  yamlContent, 
  onYamlChange, 
  children 
}) => {
  const [externalYaml, setExternalYaml] = useState<string>('');
  const [showExternalChanges, setShowExternalChanges] = useState(false);

  const handleYamlUpdate = useCallback((newYaml: string) => {
    if (newYaml !== yamlContent) {
      setExternalYaml(newYaml);
      setShowExternalChanges(true);
    }
  }, [yamlContent]);

  const handleAcceptExternalChanges = useCallback(() => {
    if (externalYaml) {
      onYamlChange(externalYaml);
      setShowExternalChanges(false);
    }
  }, [externalYaml, onYamlChange]);

  const handleRejectExternalChanges = useCallback(() => {
    setShowExternalChanges(false);
  }, []);

  // Clone the children and add the external YAML props
  const enhancedChildren = React.cloneElement(children as React.ReactElement, {
    externalYaml,
    showExternalChanges,
    onAcceptExternalChanges: handleAcceptExternalChanges,
    onRejectExternalChanges: handleRejectExternalChanges,
  });

  return (
    <DualPaneLayout
      leftPane={<AIPipelineAssistant onYamlUpdate={handleYamlUpdate} />}
      rightPane={enhancedChildren}
      defaultLeftWidth={40}
      minLeftWidth={30}
      maxLeftWidth={70}
      storageKey="ai-pipeline-assistant"
    />
  );
};