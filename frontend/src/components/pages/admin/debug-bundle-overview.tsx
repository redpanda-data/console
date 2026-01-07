import { timestampDate } from '@bufbuild/protobuf/wkt';
import { Box, Flex, List, ListItem, Spinner, Stack, Text } from '@redpanda-data/ui';
import { CheckCircleIcon, ErrorIcon } from 'components/icons';
import React, { type FC, useEffect } from 'react';

import colors from '../../../colors';
import {
  DebugBundleStatus_Status,
  type GetDebugBundleStatusResponse_DebugBundleBrokerStatus,
} from '../../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { api } from '../../../state/backend-api';

const StatusIcons: Record<DebugBundleStatus_Status, React.ReactElement> = {
  [DebugBundleStatus_Status.UNSPECIFIED]: <ErrorIcon color={colors.green} size={16} />,
  [DebugBundleStatus_Status.SUCCESS]: <CheckCircleIcon color={colors.green} size={16} />,
  [DebugBundleStatus_Status.RUNNING]: <Spinner size="sm" />,
  [DebugBundleStatus_Status.ERROR]: <ErrorIcon color={colors.debugRed} size={16} />,
  [DebugBundleStatus_Status.EXPIRED]: <ErrorIcon color={colors.debugRed} size={16} />,
};

const DebugBundleOverview: FC<{ statuses: GetDebugBundleStatusResponse_DebugBundleBrokerStatus[] }> = ({
  statuses,
}) => {
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (api.isDebugBundleInProgress) {
        api.refreshDebugBundleStatuses().catch(() => {
          // Error handling managed by API layer
        });
      }
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);
  return (
    <Box data-testid="debug-bundle-overview" my={4}>
      <List>
        {statuses.map((status) => (
          <ListItem data-testid={`debug-bundle-broker-status-${status.brokerId}`} key={status.brokerId}>
            <Flex alignItems="center" gap={3} mb={3}>
              {status.value.case === 'bundleStatus' && (
                <>
                  {StatusIcons[status.value.value.status]}
                  <Stack spacing={0.5}>
                    <Box>
                      <Text data-testid={`broker-${status.brokerId}-label`} display="inline" fontWeight="bold">
                        Broker {status.brokerId}
                      </Text>
                      {status.value.value.createdAt ? (
                        <Text display="inline">
                          {' '}
                          started at {timestampDate(status.value.value.createdAt).toLocaleString()}
                        </Text>
                      ) : null}
                    </Box>
                    <Text color="gray.500" data-testid={`broker-${status.brokerId}-job-id`} fontSize="sm">
                      {status.value.value.jobId}
                    </Text>
                  </Stack>
                </>
              )}
              {status.value.case === 'error' && (
                <>
                  {StatusIcons[DebugBundleStatus_Status.ERROR]}
                  <Stack spacing={0.5}>
                    <Box>
                      <Text data-testid={`broker-${status.brokerId}-error-label`} display="inline" fontWeight="bold">
                        Broker {status.brokerId}
                      </Text>
                    </Box>
                    <Text color="gray.500" data-testid={`broker-${status.brokerId}-error-message`} fontSize="sm">
                      {status.value.value.message}
                    </Text>
                  </Stack>
                </>
              )}
            </Flex>
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

export default DebugBundleOverview;
