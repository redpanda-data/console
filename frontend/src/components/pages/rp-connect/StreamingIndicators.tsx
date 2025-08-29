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

import { Badge, Box, Flex, Spinner, Text, Tooltip } from '@redpanda-data/ui';
import React from 'react';
import { TaskStatus } from '../../../protogen/redpanda/api/dataplane/v1alpha3/pipeline_pb';

interface StreamingIndicatorsProps {
  currentStatus: TaskStatus;
  isStreaming: boolean;
  isConnected: boolean;
}

export const StreamingIndicators: React.FC<StreamingIndicatorsProps> = ({
  currentStatus,
  isStreaming,
  isConnected,
}) => {
  const getStatusColor = (status: TaskStatus): string => {
    switch (status) {
      case TaskStatus.STARTED:
        return 'blue';
      case TaskStatus.THINKING:
        return 'purple';
      case TaskStatus.GENERATING:
        return 'orange';
      case TaskStatus.COMPLETED:
        return 'green';
      case TaskStatus.FAILED:
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusText = (status: TaskStatus): string => {
    switch (status) {
      case TaskStatus.STARTED:
        return 'Starting';
      case TaskStatus.THINKING:
        return 'Thinking';
      case TaskStatus.GENERATING:
        return 'Generating';
      case TaskStatus.COMPLETED:
        return 'Completed';
      case TaskStatus.FAILED:
        return 'Failed';
      default:
        return 'Ready';
    }
  };

  const getStatusIcon = (status: TaskStatus): React.ReactNode => {
    switch (status) {
      case TaskStatus.THINKING:
      case TaskStatus.GENERATING:
        return <Spinner size="xs" />;
      case TaskStatus.COMPLETED:
        return <Text fontSize="xs">✓</Text>;
      case TaskStatus.FAILED:
        return <Text fontSize="xs">✗</Text>;
      case TaskStatus.STARTED:
        return <Text fontSize="xs">●</Text>;
      default:
        return <Text fontSize="xs">○</Text>;
    }
  };

  const getConnectionStatus = (): { color: string; text: string; icon: React.ReactNode } => {
    if (isStreaming) {
      return {
        color: 'blue',
        text: 'Streaming',
        icon: <Box as="span" w="6px" h="6px" bg="blue.400" borderRadius="full" />,
      };
    }
    
    if (isConnected) {
      return {
        color: 'green',
        text: 'Connected',
        icon: <Box as="span" w="6px" h="6px" bg="green.400" borderRadius="full" />,
      };
    }
    
    return {
      color: 'gray',
      text: 'Disconnected',
      icon: <Box as="span" w="6px" h="6px" bg="gray.400" borderRadius="full" />,
    };
  };

  const connectionStatus = getConnectionStatus();

  return (
    <Flex align="center" gap={2}>
      {/* Task Status Indicator */}
      <Tooltip label={`AI Status: ${getStatusText(currentStatus)}`}>
        <Badge colorScheme={getStatusColor(currentStatus)} variant="subtle" size="sm">
          <Flex align="center" gap={1}>
            {getStatusIcon(currentStatus)}
            <Text fontSize="xs" display={{ base: 'none', md: 'block' }}>
              {getStatusText(currentStatus)}
            </Text>
          </Flex>
        </Badge>
      </Tooltip>

      {/* Connection Status Indicator */}
      <Tooltip label={`Connection: ${connectionStatus.text}`}>
        <Badge colorScheme={connectionStatus.color} variant="subtle" size="sm">
          <Flex align="center" gap={1}>
            {connectionStatus.icon}
            <Text fontSize="xs" display={{ base: 'none', sm: 'block' }}>
              {connectionStatus.text}
            </Text>
          </Flex>
        </Badge>
      </Tooltip>

      {/* Progress Indicator for Active Tasks */}
      {(currentStatus === TaskStatus.THINKING || currentStatus === TaskStatus.GENERATING) && (
        <Box>
          <Box
            w="16px"
            h="2px"
            bg="gray.200"
            borderRadius="full"
            overflow="hidden"
            _dark={{ bg: 'gray.600' }}
          >
            <Box
              w="100%"
              h="100%"
              bg={getStatusColor(currentStatus) + '.400'}
              borderRadius="full"
              animation="slideInOut 2s ease-in-out infinite"
              sx={{
                '@keyframes slideInOut': {
                  '0%, 100%': { transform: 'translateX(-100%)' },
                  '50%': { transform: 'translateX(100%)' },
                },
              }}
            />
          </Box>
        </Box>
      )}
    </Flex>
  );
};