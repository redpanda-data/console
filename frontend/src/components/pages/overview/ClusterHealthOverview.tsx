import { Box, Button, Flex, Grid, Link, List, ListItem, Text } from '@redpanda-data/ui';
import React from 'react';
import { api } from '../../../state/backendApi';
import { Link as ReactRouterLink } from 'react-router-dom';
import { titleCase } from '../../../utils/utils';
import DebugBundleLink from '../../debugBundle/DebugBundleLink';
import colors from '../../../colors';
import { MdError } from 'react-icons/md';
import { UnhealthyReason } from '../../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';

const HUMAN_READABLE_UNHEALTHY_REASONS: Record<UnhealthyReason, string> = {
    [UnhealthyReason.UNSPECIFIED]: 'Unknown reason',
    [UnhealthyReason.NODES_DOWN]: 'Nodes down',
    [UnhealthyReason.LEADERLESS_PARTITIONS]: 'Leaderless partitions',
    [UnhealthyReason.UNDER_REPLICATED_PARTITIONS]: 'Under-replicated partitions',
    [UnhealthyReason.NO_ELECTED_CONTROLLER]: 'No elected controller',
    [UnhealthyReason.NO_HEALTH_REPORT]: 'No health report',
}

const ClusterHealthOverview = () => {
    return (
        <Box>
            <List spacing={3}>
                <ListItem>
                    <Grid
                        templateColumns={{sm: '1fr', md: '1fr 1fr'}} // Single column on mobile, two columns on larger screens
                        gap={4}
                    >
                        <Box fontWeight="bold">Reason</Box>
                        <Box>{titleCase(api.clusterHealth?.unhealthyReasons?.map(x => HUMAN_READABLE_UNHEALTHY_REASONS[x].toLowerCase() ?? x).join(', ') ?? '')}</Box>
                    </Grid>
                </ListItem>
                <ListItem>
                    <Grid
                        templateColumns={{sm: '1fr', md: '1fr 1fr'}}
                        gap={4}
                    >
                        <Box fontWeight="bold">Down nodes</Box>
                        <Flex gap={2}>
                            {api.clusterHealth?.nodesDown && api.clusterHealth?.nodesDown.length > 0 &&
                                <MdError color={colors.brandError} size={18} />
                            }
                            <Text>{api.clusterHealth?.nodesDown.length}</Text>
                        </Flex>
                    </Grid>
                </ListItem>
                <ListItem>
                    <Grid
                        templateColumns={{sm: '1fr', md: '1fr 1fr'}}
                        gap={4}
                    >
                        <Box fontWeight="bold">Leaderless partitions</Box>
                        <Box>{api.clusterHealth?.leaderlessCount}</Box>
                    </Grid>
                </ListItem>
                {api.clusterHealth?.unhealthyReasons.includes(UnhealthyReason.UNDER_REPLICATED_PARTITIONS) && <ListItem>
                    <Grid
                        templateColumns={{sm: '1fr', md: '1fr 1fr'}}
                        gap={4}
                    >
                        <Box fontWeight="bold">Under-replicated partitions</Box>
                        <Box>
                            <Link as={ReactRouterLink} to="/topics">View topics</Link>
                        </Box>
                    </Grid>
                </ListItem>}
                <ListItem>
                    <Grid
                        templateColumns={{sm: '1fr', md: '1fr 1fr'}}
                        gap={4}
                    >
                        <Box fontWeight="bold">Debug bundle</Box>
                        <Flex gap={2}>
                            {api.isDebugBundleInProgress && <Button px={0} as={ReactRouterLink} variant="link" to={`/admin/debug-bundle/progress/${api.debugBundleStatus?.jobId}`}>Bundle generation in progress...</Button>}
                            {api.isDebugBundleReady && <DebugBundleLink statuses={api.debugBundleStatuses} />}
                            {!api.isDebugBundleInProgress && <Button px={0} as={ReactRouterLink} variant="link" to="/admin/debug-bundle/new">Generate new</Button>}
                        </Flex>
                    </Grid>
                </ListItem>
            </List>
        </Box>
    );
};

export default ClusterHealthOverview;
