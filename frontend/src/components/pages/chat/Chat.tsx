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

import { Box, Flex, Heading, Text, VStack } from '@redpanda-data/ui';
import React from 'react';
import { PageComponent, type PageInitHelper } from '../Page';
import PageContent from '../../misc/PageContent';
import { Section } from '../../misc/common';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'system';
  timestamp: Date;
}

class ChatPage extends PageComponent {
  messages: Message[] = [
    {
      id: '1',
      content: 'Welcome to the Chat! This is a placeholder for the actual chat functionality.',
      sender: 'system',
      timestamp: new Date(),
    },
  ];

  initPage(p: PageInitHelper): void {
    p.title = 'Chat';
  }

  render() {
    return (
      <PageContent>
        <Section title="Chat">
          <Flex direction="column" h="calc(100vh - 200px)" maxW="1200px" mx="auto">
            <Box flex="1" overflowY="auto" bg="gray.50" borderRadius="md" p={4} mb={4}>
              <VStack spacing={4} align="stretch">
                {this.messages.map((message) => (
                  <Flex key={message.id} justify={message.sender === 'user' ? 'flex-end' : 'flex-start'}>
                    <Box bg={message.sender === 'user' ? 'blue.100' : 'gray.100'} p={3} borderRadius="lg" maxW="80%">
                      <Text>{message.content}</Text>
                      <Text fontSize="xs" color="gray.500" mt={1}>
                        {message.timestamp.toLocaleTimeString()}
                      </Text>
                    </Box>
                  </Flex>
                ))}
              </VStack>
            </Box>

            <Box>
              <Heading size="sm" mb={2}>
                Chat Input (Placeholder)
              </Heading>
              <Text fontSize="sm" color="gray.600">
                This is a placeholder for the chat interface. Implement actual chat functionality here.
              </Text>
            </Box>
          </Flex>
        </Section>
      </PageContent>
    );
  }
}

export default ChatPage;
