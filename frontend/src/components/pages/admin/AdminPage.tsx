import React, { ReactNode } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Statistic, Row, Skeleton, Checkbox, Tooltip, Tabs } from "antd";
import { ColumnProps } from "antd/lib/table";
import { PageComponent, PageInitHelper } from "../Page";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig } from "../../misc/common";
import { Broker } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import { observable } from "mobx";
import prettyBytes from "pretty-bytes";
import { prettyBytesOrNA, ToJson } from "../../../utils/utils";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import { AdminUsers } from "./Admin.Users";
import { AdminRoles } from "./Admin.Roles";
import { Route, Link } from "react-router-dom";
import { AdminRoleBindings } from "./Admin.RoleBindings";
import { DefaultSkeleton } from "../../../utils/tsxUtils";


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
        if (!api.AdminInfo) return DefaultSkeleton;

        return <motion.div {...animProps} style={{ margin: '0 1rem' }}>
            <Card>
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
                        <code><pre>{ToJson(api.AdminInfo, 4)}</pre></code>
                    </Tabs.TabPane>

                </Tabs>
            </Card>
        </motion.div>

    }
}
