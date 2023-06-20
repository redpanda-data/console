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

import React from 'react';
import { observer } from 'mobx-react';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { toJson } from '../../../utils/jsonUtils';
import { appGlobal } from '../../../state/appGlobal';
import { AdminUsers } from './Admin.Users';
import { AdminRoles } from './Admin.Roles';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { Alert, AlertIcon, Tabs } from '@redpanda-data/ui';


@observer
export default class AdminPage extends PageComponent {


    initPage(p: PageInitHelper): void {
        p.title = 'Admin';
        p.addBreadcrumb('Admin', '/admin');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);

    }

    refreshData(force: boolean) {
        api.refreshAdminInfo(force);
    }

    render() {
        if (api.adminInfo === undefined) return DefaultSkeleton;
        const hasAdminPermissions = api.adminInfo !== null;

        return <PageContent>
            <Section>
                {hasAdminPermissions ?
                    <Tabs size="lg" items={[
                        {
                            key: 'users',
                            name: 'Users',
                            component: <AdminUsers />
                        },
                        {
                            key: 'roles',
                            name: 'Roles',
                            component: <AdminRoles />
                        },
                        {
                            key: 'debug',
                            name: 'Debug',
                            component: <code><pre>{toJson(api.adminInfo, 4)}</pre></code>
                        },
                    ]} />

                    : <div>
                        <Alert status="error">
                            <AlertIcon />
                            You do not have the neccesary permissions to view this page.
                        </Alert>
                    </div>
                }
            </Section>
        </PageContent>

    }
}
