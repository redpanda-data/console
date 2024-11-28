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

import { Box, Breadcrumbs, ColorModeSwitch, CopyButton, Flex, Text } from '@redpanda-data/ui';
import { computed } from 'mobx';
import { observer } from 'mobx-react';
import { useRouteMatch } from 'react-router-dom';
import { isEmbedded } from '../../config';
import { type BreadcrumbEntry, uiState } from '../../state/uiState';
import { IsDev } from '../../utils/env';
import { UserPreferencesButton } from '../misc/UserPreferences';
import DataRefreshButton from '../misc/buttons/data-refresh/Component';

const AppPageHeader = observer(() => {
  const showRefresh = useShouldShowRefresh();

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

  return (
    <Box>
      {/* we need to refactor out #mainLayout > div rule, for now I've added this box as a workaround */}
      <Flex mb={5} alignItems="center" justifyContent="space-between">
        {!isEmbedded() && (
          <Breadcrumbs
            showHomeIcon={false}
            items={breadcrumbItems.map((x) => ({
              name: x.title,
              heading: x.heading,
              to: x.linkTo,
            }))}
          />
        )}
      </Flex>

      <Flex pb={2} alignItems="center" justifyContent="space-between">
        <Flex alignItems="center">
          {lastBreadcrumb && (
            <Text
              fontWeight={700}
              as="span"
              fontSize="xl"
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
        <Flex alignItems="center" gap={1}>
          <UserPreferencesButton />
          {IsDev && !isEmbedded() && <ColorModeSwitch />}
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
  const connectClusterMatch = useRouteMatch<{ clusterName: string; connectorName: string }>({
    path: '/connect-clusters/:clusterName/:connectorName',
    strict: false,
    sensitive: true,
    exact: true,
  });

  const schemaCreateMatch = useRouteMatch({
    path: '/schema-registry/create',
    strict: false,
    sensitive: true,
    exact: true,
  });

  const topicProduceRecordMatch = useRouteMatch({
    path: '/topics/:topicName/produce-record',
    strict: false,
    sensitive: true,
    exact: true,
  });

  if (connectClusterMatch && connectClusterMatch.params.connectorName === 'create-connector') return false;

  if (schemaCreateMatch) return false;

  if (topicProduceRecordMatch) return false;

  return true;
}
