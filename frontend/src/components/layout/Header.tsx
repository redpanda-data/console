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

import { ChevronRightIcon } from '@primer/octicons-react';
import { observer } from 'mobx-react';
import { Link, useRouteMatch } from 'react-router-dom';
import { isEmbedded } from '../../config';
import { uiState } from '../../state/uiState';
import { UserPreferencesButton } from '../misc/UserPreferences';
import DataRefreshButton from '../misc/buttons/data-refresh/Component';
import { IsDev } from '../../utils/env';
import { Box, Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbLinkProps, ColorModeSwitch, Flex } from '@redpanda-data/ui';

const AppPageHeader = observer(() => {
    const showRefresh = useShouldShowRefresh();

    return <Box> {/* we need to refactor out #mainLayout > div rule, for now I've added this box as a workaround */}
        <Flex mb={5} alignItems="center" justifyContent="space-between">
            <Breadcrumb spacing="8px" separator={<ChevronRightIcon/>}>
                {!isEmbedded() && uiState.selectedClusterName &&
                    <BreadcrumbItem>
                        <BreadcrumbLink as={Link} to="/">
                            Cluster
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                }
                {uiState.pageBreadcrumbs.filter((_, i, arr) => {
                    const isCurrentPage = arr.length - 1 === i;
                    return !isEmbedded() || isCurrentPage;
                }).map((entry, i, arr) => {
                        const isCurrentPage = arr.length - 1 === i;
                        const currentBreadcrumbProps: BreadcrumbLinkProps = isCurrentPage ? {
                            as: 'span',
                            fontWeight: 700,
                            fontSize: 'xl',
                            wordBreak: 'break-all',
                            whiteSpace: 'break-spaces',
                        } : {
                            whiteSpace: 'nowrap'
                        };

                        return (
                            <BreadcrumbItem key={entry.linkTo} isCurrentPage={isCurrentPage}>
                                <BreadcrumbLink
                                    to={entry.linkTo}
                                    as={isCurrentPage ? 'span' : Link}
                                    noOfLines={1}
                                    {...currentBreadcrumbProps}
                                >
                                    {entry.title}
                                </BreadcrumbLink>

                                {isCurrentPage && showRefresh && (
                                    <Box minW={250}>
                                        <DataRefreshButton/>
                                    </Box>
                                )}
                            </BreadcrumbItem>
                        );
                    }
                )}
            </Breadcrumb>

            <Flex alignItems="center" gap={1}>
                <UserPreferencesButton/>
                {(IsDev && !isEmbedded()) && <ColorModeSwitch/>}
            </Flex>
        </Flex>
    </Box>;
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
    const connectClusterMatch = useRouteMatch<{ clusterName: string, connectorName: string }>({
        path: '/connect-clusters/:clusterName/:connectorName',
        strict: false,
        sensitive: true,
        exact: true
    });

    const schemaCreateMatch = useRouteMatch({
        path: '/schema-registry/create',
        strict: false,
        sensitive: true,
        exact: true
    });

    const topicProduceRecordMatch = useRouteMatch({
        path: '/topics/:topicName/produce-record',
        strict: false,
        sensitive: true,
        exact: true
    });

    if (connectClusterMatch && connectClusterMatch.params.connectorName == 'create-connector')
        return false;

    if (schemaCreateMatch)
        return false

    if (topicProduceRecordMatch)
        return false

    return true;
}
