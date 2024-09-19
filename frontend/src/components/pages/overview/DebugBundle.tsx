import { Box, Grid, Link, List, ListItem } from '@redpanda-data/ui';
import React, { useEffect } from 'react';
import { api } from '../../../state/backendApi';


const DebugBundle = () => {

    useEffect(() => {
        void api.getDebugBundleStatuses();
    }, []);

    return (
        <Box>
            {JSON.stringify(api.debugBundleStatuses)}
            <List spacing={3}>
                <ListItem>
                    <Grid
                        templateColumns={{sm: '1fr', md: '1fr 1fr'}} // Single column on mobile, two columns on larger screens
                        gap={4}
                    >
                        <Box fontWeight="bold">Reason</Box>
                        <Box>Under-replicated partitions</Box>
                    </Grid>
                </ListItem>
                <ListItem>
                    <Grid
                        templateColumns={{sm: '1fr', md: '1fr 1fr'}}
                        gap={4}
                    >
                        <Box fontWeight="bold">Down nodes</Box>
                        <Box>0</Box>
                    </Grid>
                </ListItem>
                <ListItem>
                    <Grid
                        templateColumns={{sm: '1fr', md: '1fr 1fr'}}
                        gap={4}
                    >
                        <Box fontWeight="bold">Leaderless partitions</Box>
                        <Box>0</Box>
                    </Grid>
                </ListItem>
                <ListItem>
                    <Grid
                        templateColumns={{sm: '1fr', md: '1fr 1fr'}}
                        gap={4}
                    >
                        <Box fontWeight="bold">Under-replicated partitions</Box>
                        <Box><Link color="blue.500" href="#">Go to Topics</Link></Box>
                    </Grid>
                </ListItem>
                <ListItem>
                    <Grid
                        templateColumns={{sm: '1fr', md: '1fr 1fr'}}
                        gap={4}
                    >
                        <Box fontWeight="bold">Debug bundle</Box>
                        <Box><Link color="blue.500" href="#">Generate</Link></Box>
                    </Grid>
                </ListItem>
            </List>
        </Box>
    );
};

export default DebugBundle;
