import { Box, Flex, List, ListItem, Spinner, Stack, Text } from '@redpanda-data/ui';
import React, { type FC, useEffect } from 'react';
import { MdCheckCircle, MdError } from 'react-icons/md';
import colors from '../../../colors';
import {
  DebugBundleStatus_Status,
  type GetDebugBundleStatusResponse_DebugBundleBrokerStatus,
} from '../../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { api } from '../../../state/backendApi';

const StatusIcons: Record<DebugBundleStatus_Status, React.ReactElement> = {
  [DebugBundleStatus_Status.UNSPECIFIED]: <MdError color={colors.green} size={16} />,
  [DebugBundleStatus_Status.SUCCESS]: <MdCheckCircle color={colors.green} size={16} />,
  [DebugBundleStatus_Status.RUNNING]: <Spinner size="sm" />,
  [DebugBundleStatus_Status.ERROR]: <MdError color={colors.debugRed} size={16} />,
  [DebugBundleStatus_Status.EXPIRED]: <MdError color={colors.debugRed} size={16} />,
};

const DebugBundleOverview: FC<{ statuses: GetDebugBundleStatusResponse_DebugBundleBrokerStatus[] }> = ({
  statuses,
}) => {
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (api.isDebugBundleInProgress) {
        void api.refreshDebugBundleStatuses();
      }
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);
  return (
    <Box my={4}>
      <List>
        {statuses.map((status, idx) => (
          <ListItem key={idx}>
            <Flex gap={3} alignItems="center" mb={3}>
              {status.value.case === 'bundleStatus' && (
                <>
                  {StatusIcons[status.value.value.status]}
                  <Stack spacing={0.5}>
                    <Box>
                      <Text fontWeight="bold" display="inline">
                        Broker {status.brokerId}
                      </Text>
                      <Text display="inline">
                        {' '}
                        started at {status.value.value.createdAt?.toDate().toLocaleString()}
                      </Text>
                    </Box>
                    <Text color="gray.500" fontSize="sm">
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
                      <Text fontWeight="bold" display="inline">
                        Broker {status.brokerId}
                      </Text>
                    </Box>
                    <Text color="gray.500" fontSize="sm">
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
