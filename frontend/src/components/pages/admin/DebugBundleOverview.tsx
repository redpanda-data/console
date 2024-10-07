import { Box, Flex, List, ListItem, Stack, Text } from '@redpanda-data/ui';
import React, { FC } from 'react';
import { MdCheckCircle } from 'react-icons/md';
import { DebugBundleStatus } from '../../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import colors from '../../../colors';

const DebugBundleOverview: FC<{ statuses: DebugBundleStatus[] }> = ({statuses}) => {
    return (
        <Box>
            <List>
                {statuses.map(((status, idx) => <ListItem key={idx}>
                    <Flex gap={2} alignItems="center">
                        <MdCheckCircle color={colors.green} />
                        <Stack spacing={1}>
                            <Text fontSize="md" fontWeight="bold">
                                Broker {status.brokerId} started at {status.createdAt?.toDate().toLocaleDateString()}
                            </Text>
                            <Text>Job ID: {status.jobId}</Text>

                        </Stack>
                    </Flex>
                </ListItem>))}
            </List>
        </Box>
    );
};

export default DebugBundleOverview;
