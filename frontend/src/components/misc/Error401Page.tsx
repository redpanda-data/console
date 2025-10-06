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
  Avatars,
  Box,
  Button,
  Flex,
  Hide,
  HStack,
  Image,
  Link,
  SectionHeading,
  SectionSubheading,
  Text,
  VStack,
} from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { useEffect } from 'react';

import PageContent from './PageContent';
import { config } from '../../config';
import { appGlobal } from '../../state/appGlobal';
import fetchWithTimeout from '../../utils/fetchWithTimeout';

const ErrorPage = observer(() => {
  useEffect(() => {
    fetchWithTimeout(`${config.restBasePath}/console/endpoints`, 5 * 1000)
      .then((r) => {
        if (r.ok) {
          appGlobal.historyReplace('/overview');
          window.location.reload();
        }
      })
      .catch(console.error);
  }, []);

  return (
    <PageContent>
      <Flex
        alignItems="center"
        grow={1}
        h="calc(100vh - 120px)"
        justifyContent="center"
        minH="480px"
        shrink={1}
        textAlign="left"
      >
        <HStack maxW="container.md" spacing={12}>
          <VStack alignItems="flex-start" display="flex" spacing={4}>
            <SectionHeading as="h1" fontWeight="medium" size="xl">
              401 Unauthorized
            </SectionHeading>
            <SectionSubheading as="h2" fontWeight="medium" size="md">
              <Text>You don't have permission to access this resource</Text>
            </SectionSubheading>
            <Box margin={0} padding={0}>
              <Text>
                You may encounter this error if your user account was recently created or user permissions were recently
                changed. It can take up to 15 minutes for user account and permission changes to propagate across all
                clusters. Try again in 15 minutes and if the error persists{' '}
                <Button
                  as={Link}
                  href="https://support.redpanda.com/hc/en-us/requests/new"
                  isExternal={true}
                  margin={0}
                  padding={0}
                  variant="link"
                >
                  contact support
                </Button>
                .
              </Text>
            </Box>
          </VStack>
          <Hide below="sm">
            <Image alt="error-401" boxSize="sm" src={Avatars.errorBananaSlipSvg} />
          </Hide>
        </HStack>
      </Flex>
    </PageContent>
  );
});

export default ErrorPage;
