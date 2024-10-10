import { Box, Button, Flex, Grid, Link, List, ListItem } from '@redpanda-data/ui';
import React from 'react';
import { api } from '../../../state/backendApi';
import { Link as ReactRouterLink } from 'react-router-dom';
import { titleCase } from '../../../utils/utils';
import DebugBundleLink from '../../debugBundle/DebugBundleLink';

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
                        <Box>{titleCase(api.clusterHealth?.unhealthyReasons?.map(x => ({
                            leaderless_partitions: 'leaderless partitions',
                            nodes_down: 'nodes down',
                            under_replicated_partitions: 'under-replicated partitions',
                        })[x] ?? x).join(', ') ?? '')}</Box>
                    </Grid>
                </ListItem>
                <ListItem>
                    <Grid
                        templateColumns={{sm: '1fr', md: '1fr 1fr'}}
                        gap={4}
                    >
                        <Box fontWeight="bold">Down nodes</Box>
                        <Box>{api.clusterHealth?.nodesDown.length}</Box>
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
                {api.clusterHealth?.unhealthyReasons.includes('under_replicated_partitions') && <ListItem>
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
                            {api.isDebugBundleInProgress && <Button px={0} as={ReactRouterLink} variant="link" to={`/admin/debug-bundle/progress/${api.debugBundleJobId}`}>Bundle generation in progress...</Button>}
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
