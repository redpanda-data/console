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
    Button,
    Text,
    Link,
    Flex,
    HStack,
    VStack,
    SectionHeading,
    SectionSubheading,
    Box,
    Image,
    Avatars,
    Hide
} from '@redpanda-data/ui';
import PageContent from './PageContent';


import { appGlobal } from '../../state/appGlobal';
import { observer } from 'mobx-react';
import fetchWithTimeout from '../../utils/fetchWithTimeout';
import { config } from '../../config';

const ErrorPage = observer(() => {
    fetchWithTimeout(`${config.restBasePath}/console/endpoints`, 5 * 1000).then(r => {
        if (r.ok) {
            appGlobal.history.replace('/overview');
            window.location.reload();
        }
    });

    return (
        <PageContent>
            <Flex grow={1} shrink={1} h="calc(100vh - 120px)" minH="480px" alignItems="center" justifyContent="center" textAlign="left">
                <HStack spacing={12} maxW="container.md">
                    <VStack spacing={4} display="flex" alignItems="flex-start">
                        <SectionHeading as="h1" size="xl" fontWeight="medium">
                            401 Unauthorized
                        </SectionHeading>
                        <SectionSubheading as="h2" size="md" fontWeight="medium">
                            <Text>You don't have permission to access this resource</Text>
                        </SectionSubheading>
                        <Box margin={0} padding={0}>
                            <Text>
                                You may encounter this error if your
                                user account was recently created or user permissions were recently
                                changed. It can take up to 15 minutes for user account and permission
                                changes to propagate across all clusters. Try again in 15 minutes and if
                                the error persists <Button as={Link} margin={0} padding={0} variant="link"
                                    isExternal={true}
                                    href="https://support.redpanda.com/hc/en-us/requests/new">contact
                                    support</Button>.
                            </Text>
                        </Box>
                    </VStack>
                    <Hide below="sm">
                        <Image boxSize="sm" src={Avatars.errorBananaSlipSvg} alt="error-401" />
                    </Hide>
                </HStack>
            </Flex>
        </PageContent>
    )
});

export default ErrorPage;

