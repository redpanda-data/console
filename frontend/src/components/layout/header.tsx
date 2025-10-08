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

import { Box, Breadcrumbs, Button, ColorModeSwitch, CopyButton, Flex, Text } from '@redpanda-data/ui';
import { computed } from 'mobx';
import { observer } from 'mobx-react';
import { Link as ReactRouterLink, useMatch } from 'react-router-dom';

import { isEmbedded } from '../../config';
import { api } from '../../state/backend-api';
import { type BreadcrumbEntry, uiState } from '../../state/ui-state';
import { IsDev } from '../../utils/env';
import DataRefreshButton from '../misc/buttons/data-refresh/component';
import { UserPreferencesButton } from '../misc/user-preferences';

const AppPageHeader = observer(() => {
  const showRefresh = useShouldShowRefresh();

  const shouldHideHeader = useShouldHideHeader();

  const breadcrumbItems = computed(() => {
    const items: BreadcrumbEntry[] = [...uiState.pageBreadcrumbs];

    if (!isEmbedded() && uiState.selectedClusterName) {
      items.unshift({
        heading: '',
        title: 'Cluster',
        linkTo: '/',
      });
    }

    return items;
  }).get();

  const lastBreadcrumb = breadcrumbItems.pop();

  if (shouldHideHeader) {
    return null;
  }

  return (
    <Box>
      {/* we need to refactor out #mainLayout > div rule, for now I've added this box as a workaround */}
      <Flex alignItems="center" justifyContent="space-between" mb={5}>
        {!isEmbedded() && (
          <Breadcrumbs
            items={breadcrumbItems.map((x) => ({
              name: x.title,
              heading: x.heading,
              to: x.linkTo,
            }))}
            showHomeIcon={false}
          />
        )}
      </Flex>

      <Flex alignItems="center" justifyContent="space-between" pb={2}>
        <Flex alignItems="center">
          {lastBreadcrumb && (
            <Text
              as="span"
              fontSize="xl"
              fontWeight={700}
              mr={2}
              {...(lastBreadcrumb.options?.canBeTruncated
                ? {
                    wordBreak: 'break-all',
                    whiteSpace: 'break-spaces',
                  }
                : {
                    whiteSpace: 'nowrap',
                  })}
            >
              {lastBreadcrumb.title}
            </Text>
          )}
          {lastBreadcrumb && (
            <Box>
              {lastBreadcrumb.options?.canBeCopied && <CopyButton content={lastBreadcrumb.title} variant="ghost" />}
            </Box>
          )}
          {showRefresh && <DataRefreshButton />}
        </Flex>
        <Flex alignItems="center" gap={2}>
          {!isEmbedded() && api.isRedpanda && (
            <Button
              as={ReactRouterLink}
              isDisabled={!api.userData?.canViewDebugBundle}
              to={api.userData?.canViewDebugBundle ? '/debug-bundle' : undefined}
              tooltip={
                api.userData?.canViewDebugBundle ? null : 'You need RedpandaCapability.MANAGE_DEBUG_BUNDLE permission'
              }
              variant="ghost"
            >
              Debug bundle
            </Button>
          )}
          <UserPreferencesButton />
          {IsDev && !isEmbedded() && <ColorModeSwitch m={0} p={0} variant="ghost" />}
        </Flex>
      </Flex>
    </Box>
  );
});

export default AppPageHeader;

/**
 * Custom React Hook: Determines whether to show the refresh button based on route matches.
 * It checks various routes and conditions to decide if the refresh button should be displayed
 * in the header next to the breadcrumb.
 *
 * @returns {boolean} Indicates whether the refresh button should be shown (true/false).
 */
function useShouldShowRefresh() {
  const connectClusterMatch = useMatch({
    path: '/connect-clusters/:clusterName/:connectorName',
    end: false,
  });

  const schemaCreateMatch = useMatch({
    path: '/schema-registry/create',
    end: false,
  });

  const topicProduceRecordMatch = useMatch({
    path: '/topics/:topicName/produce-record',
    end: false,
  });

  const secretsMatch = useMatch({
    path: '/secrets',
    end: true,
  });

  // matches acls
  const aclCreateMatch = useMatch('/security/acls/create');
  const aclUpdateMatch = useMatch('/security/acls/:id/update');
  const aclDetailMatch = useMatch('/security/acls/:id/details');
  const isACLRelated = aclCreateMatch || aclUpdateMatch || aclDetailMatch;

  // matches roles
  const roleCreateMatch = useMatch('/security/roles/create');
  const roleUpdateMatch = useMatch('/security/roles/:id/update');
  const roleDetailMatch = useMatch('/security/roles/:id/details');
  const isRoleRelated = roleCreateMatch || roleUpdateMatch || roleDetailMatch;

  if (connectClusterMatch && connectClusterMatch.params.connectorName === 'create-connector') {
    return false;
  }
  if (schemaCreateMatch) {
    return false;
  }
  if (topicProduceRecordMatch) {
    return false;
  }
  if (secretsMatch) {
    return false;
  }
  if (isACLRelated) {
    return false;
  }
  if (isRoleRelated) {
    return false;
  }

  return true;
}

function useShouldHideHeader() {
  const remoteMcpDetailsMatch = useMatch({
    path: '/mcp-servers/:id',
    end: false,
  });

  return remoteMcpDetailsMatch !== null;
}
