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
import { Alert, Tabs } from 'antd';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { motion } from 'framer-motion';
import { animProps } from '../../../utils/animationProps';
import { toJson } from '../../../utils/jsonUtils';
import { appGlobal } from '../../../state/appGlobal';
import Card from '../../misc/Card';
import { AdminUsers } from './Admin.Users';
import { AdminRoles } from './Admin.Roles';
import { DefaultSkeleton } from '../../../utils/tsxUtils';


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

        return <motion.div {...animProps} style={{ margin: '0 1rem' }}>
            <Card>
                {hasAdminPermissions ?
                    <Tabs style={{ overflow: 'visible' }} animated={false} >

                        <Tabs.TabPane key="users" tab="Users">
                            <AdminUsers />
                        </Tabs.TabPane>

                        <Tabs.TabPane key="roles" tab="Roles">
                            <AdminRoles />
                        </Tabs.TabPane>

                        {/* <Tabs.TabPane key="bindings" tab="Bindings">
                        <AdminRoleBindings />
                    </Tabs.TabPane> */}

                        <Tabs.TabPane key="debug" tab="Debug">
                            <code><pre>{toJson(api.adminInfo, 4)}</pre></code>
                        </Tabs.TabPane>

                    </Tabs>
                    : <div>
                        <Alert type="error" showIcon
                            message="Permission denied"
                            description="You do not have the neccesary permissions to view this page."
                        />
                    </div>
                }
            </Card>
        </motion.div>

    }
}
