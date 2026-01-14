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
import { Link, useLocation, useMatchRoute } from '@tanstack/react-router';
import { computed } from 'mobx';
import { observer } from 'mobx-react';

import { isEmbedded } from '../../config';
import { api } from '../../state/backend-api';
import { type BreadcrumbEntry, uiState } from '../../state/ui-state';
import { IsDev } from '../../utils/env';
import DataRefreshButton from '../misc/buttons/data-refresh/component';
import { UserPreferencesButton } from '../misc/user-preferences';
import { Separator } from '../redpanda-ui/components/separator';
import { SidebarTrigger } from '../redpanda-ui/components/sidebar';

type BreadcrumbHeaderRowProps = {
  useNewSidebar: boolean;
  breadcrumbItems: BreadcrumbEntry[];
};

function BreadcrumbHeaderRow({ useNewSidebar, breadcrumbItems }: BreadcrumbHeaderRowProps) {
  return (
    <Flex alignItems="center" justifyContent="space-between" mb={5}>
      <Flex alignItems="center" gap={2}>
        {useNewSidebar ? (
          <>
            <SidebarTrigger />
            <Separator className="mr-2 h-4" orientation="vertical" />
          </>
        ) : null}
        {isEmbedded() ? null : (
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
    </Flex>
  );
}

const AppPageHeader = observer(() => {
  const showRefresh = useShouldShowRefresh();

  const shouldHideHeader = useShouldHideHeader();
  const useNewSidebar = !isEmbedded();

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

  if (shouldHideHeader || uiState.shouldHidePageHeader) {
    return null;
  }

  return (
    <Box>
      {/* we need to refactor out #mainLayout > div rule, for now I've added this box as a workaround */}
      <BreadcrumbHeaderRow breadcrumbItems={breadcrumbItems} useNewSidebar={useNewSidebar} />

      <Flex alignItems="center" justifyContent="space-between" pb={2}>
        <Flex alignItems="center">
          {lastBreadcrumb ? (
            <Text
              as="span"
              fontSize="xl"
              fontWeight={700}
              mr={2}
              role="heading"
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
          ) : null}
          {lastBreadcrumb ? (
            <Box>
              {lastBreadcrumb.options?.canBeCopied ? (
                <CopyButton content={lastBreadcrumb.title} variant="ghost" />
              ) : null}
            </Box>
          ) : null}
          {Boolean(showRefresh) && <DataRefreshButton />}
        </Flex>
        <Flex alignItems="center" gap={2}>
          {!isEmbedded() && api.isRedpanda && (
            <Link to="/debug-bundle">
              <Button
                isDisabled={!api.userData?.canViewDebugBundle}
                tooltip={
                  api.userData?.canViewDebugBundle ? null : 'You need RedpandaCapability.MANAGE_DEBUG_BUNDLE permission'
                }
                variant="ghost"
              >
                Debug bundle
              </Button>
            </Link>
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
  const matchRoute = useMatchRoute();

  const connectClusterMatch = matchRoute({ to: '/connect-clusters/$clusterName/$connector' });
  const schemaCreateMatch = matchRoute({ to: '/schema-registry/create' });
  const topicProduceRecordMatch = matchRoute({ to: '/topics/$topicName/produce-record' });
  const secretsMatch = matchRoute({ to: '/secrets', fuzzy: false });
  const connectWizardPagesMatch = matchRoute({ to: '/rp-connect/wizard' });
  const getStartedApiMatch = matchRoute({ to: '/get-started/api' });

  // matches acls
  const aclCreateMatch = matchRoute({ to: '/security/acls/create' });
  const aclUpdateMatch = matchRoute({ to: '/security/acls/$aclName/update' });
  const aclDetailMatch = matchRoute({ to: '/security/acls/$aclName/details' });
  const isACLRelated = aclCreateMatch || aclUpdateMatch || aclDetailMatch;

  // matches roles
  const roleCreateMatch = matchRoute({ to: '/security/roles/create' });
  const roleUpdateMatch = matchRoute({ to: '/security/roles/$roleName/update' });
  const roleDetailMatch = matchRoute({ to: '/security/roles/$roleName/details' });
  const isRoleRelated = roleCreateMatch || roleUpdateMatch || roleDetailMatch;

  if (connectClusterMatch && connectClusterMatch.connector === 'create-connector') {
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
  if (connectWizardPagesMatch) {
    return false;
  }
  if (getStartedApiMatch) {
    return false;
  }

  return true;
}
function useShouldHideHeader() {
  const { pathname } = useLocation();

  // Only hide header in embedded mode for pages that have their own headers
  if (!isEmbedded()) {
    return false;
  }

  // Pages that have their own header components - hide AppPageHeader for these
  const pagesWithOwnHeaders = ['/mcp-servers', '/agents', '/knowledgebases', '/secrets'];

  // Check if current path starts with any of the pages that have their own headers
  return pagesWithOwnHeaders.some((page) => pathname.startsWith(page));
}
