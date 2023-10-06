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
import { Route as AntBreadcrumbRoute } from 'antd/lib/breadcrumb/Breadcrumb';
import { PageHeader } from 'antd';
import { observer } from 'mobx-react';
import { NavLink, useRouteMatch } from 'react-router-dom';
import { isEmbedded } from '../../config';
import { uiState } from '../../state/uiState';
import { MotionDiv } from '../../utils/animationProps';
import { ZeroSizeWrapper } from '../../utils/tsxUtils';
import { UserPreferencesButton } from '../misc/UserPreferences';
import DataRefreshButton from '../misc/buttons/data-refresh/Component';
import { IsDev } from '../../utils/env';
import { ColorModeSwitch, Flex } from '@redpanda-data/ui';

const AppPageHeader = observer(() => {

    const breadcrumbs = uiState.pageBreadcrumbs.map(v => ({ path: v.linkTo, breadcrumbName: v.title }));
    const selectedClusterName = uiState.selectedClusterName;
    if (selectedClusterName) {
        //const rootBreadcrumb: AntBreadcrumbRoute = { path: '', breadcrumbName: selectedClusterName };
        const rootBreadcrumb: AntBreadcrumbRoute = { path: '', breadcrumbName: 'Cluster' };
        breadcrumbs.unshift(rootBreadcrumb);
    }

    if (isEmbedded())
        breadcrumbs.splice(0, breadcrumbs.length - 1);

    const showRefresh = useShouldShowRefresh();

    const breadcrumbRender = (r: AntBreadcrumbRoute, params: any) => (r.breadcrumbName === params.breadcrumbName && r.path === params.path)
        ? <>
            <div className="breadcrumbLast">{r.breadcrumbName}</div>
            {showRefresh &&
                <ZeroSizeWrapper justifyContent="start">
                    <DataRefreshButton />
                </ZeroSizeWrapper>
            }
        </>
        : <NavLink to={r.path}>{r.breadcrumbName}</NavLink>;

    return <MotionDiv identityKey={uiState.pageTitle} className="pageTitle" style={{ display: 'flex', paddingRight: '16px', alignItems: 'center', marginBottom: '10px' }}>
        <PageHeader
            breadcrumb={{
                routes: breadcrumbs,
                separator: <ZeroSizeWrapper width="10px"><ChevronRightIcon size={14} verticalAlign="unset" /></ZeroSizeWrapper>,
                params: breadcrumbs.last(),
                itemRender: breadcrumbRender
            }}
            title={null}
        />

        <Flex ml="auto" alignItems="center" gap={3}>
            <UserPreferencesButton />
            {(IsDev && !isEmbedded()) && <ColorModeSwitch />}
        </Flex>
    </MotionDiv>;
});

export default AppPageHeader;


function useShouldShowRefresh() {

    const match = useRouteMatch<{ clusterName: string, connectorName: string }>({
        path: '/connect-clusters/:clusterName/:connectorName',
        strict: true,
        sensitive: true,
        exact: true
    });

    if (match) {
        // console.log('useRouteMatch found a route where showing the refresh button does not make sense', match);
        if (match.params.connectorName == 'create-connector')
            return false;
    }

    return true;
}
