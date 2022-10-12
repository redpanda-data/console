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
import { NavLink } from 'react-router-dom';
import { isEmbedded } from '../../config';
import { uiState } from '../../state/uiState';
import { MotionDiv } from '../../utils/animationProps';
import { ZeroSizeWrapper } from '../../utils/tsxUtils';
import { UserPreferencesButton } from '../misc/UserPreferences';
import DataRefreshButton from '../misc/buttons/data-refresh/Component';
import { IsDev } from '../../utils/env';
import { ColorModeSwitch } from '@redpanda-data/ui';

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

    const breadcrumbRender = (r: AntBreadcrumbRoute, params: any) => (r.breadcrumbName === params.breadcrumbName && r.path === params.path)
        ? <>
            <div className="breadcrumbLast">{r.breadcrumbName}</div>
            <ZeroSizeWrapper justifyContent="start">
                <DataRefreshButton />
            </ZeroSizeWrapper>
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

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <UserPreferencesButton />
            {(IsDev && !isEmbedded()) && <ColorModeSwitch />}
        </div>
    </MotionDiv>;
});

export default AppPageHeader;
