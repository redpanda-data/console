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

import React, { } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Select, Input, Button, Alert } from "antd";
import { ColumnProps } from "antd/lib/table";
import { PageComponent, PageInitHelper } from "../Page";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig, sortField } from "../../misc/common";
import { AclRequestDefault, AclResource, AclRule, Broker } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import { comparer, computed, makeObservable, observable } from "mobx";
import { containsIgnoreCase } from "../../../utils/utils";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import { DefaultSkeleton, Label } from "../../../utils/tsxUtils";
import { toJson } from "../../../utils/jsonUtils";
import { KowlTable } from "../../misc/KowlTable";
import { LockIcon } from "@primer/octicons-react";


type AclRuleFlat = AclResource & AclRule

// todo:
// - remove debug code
// - add filter controls
// - make each "resource" row expandable to show all the AclRules that apply

@observer
class AclList extends PageComponent {

    @observable filteredBrokers: Broker[];
    @observable resourceTypeFilter: string = "";
    @observable filterText = "";

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.title = 'ACLs';
        p.addBreadcrumb('ACLs', '/acls');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        if (api.userData != null && !api.userData.canListAcls) return;
        api.refreshAcls(AclRequestDefault, force);
    }

    render() {
        if (api.userData != null && !api.userData.canListAcls) return PermissionDenied;
        if (api.ACLs?.aclResources === undefined) return DefaultSkeleton;

        const warning = api.ACLs === null
            ? <Alert type="warning" message="You do not have the necessary permissions to view ACLs" showIcon style={{ marginBottom: '1em' }} />
            : null;

        const noAclAuthorizer = !api.ACLs?.isAuthorizerEnabled
            ? <Alert type="warning" message="There's no authorizer configured in your Kafka cluster" showIcon style={{ marginBottom: '1em' }} />
            : null;

        const resources = this.filteredResources;

        const columns: ColumnProps<typeof resources[0]>[] = [
            { width: '120px', title: 'Resource', dataIndex: 'resourceType', sorter: sortField('resourceType'), defaultSortOrder: 'ascend' },
            { width: '120px', title: 'Permission', dataIndex: 'permissionType', sorter: sortField('permissionType') },
            { width: 'auto', title: 'Principal', dataIndex: 'principal', sorter: sortField('principal') },
            { width: '160px', title: 'Operation', dataIndex: 'operation', sorter: sortField('operation') },
            { width: 'auto', title: 'PatternType', dataIndex: 'resourcePatternType', sorter: sortField('resourcePatternType') },
            { width: 'auto', title: 'Name', dataIndex: 'resourceName', sorter: sortField('resourceName') },
            { width: '120px', title: 'Host', dataIndex: 'host', sorter: sortField('host') },
        ];

        return <>
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>

                <Card>
                    <this.SearchControls />

                    {warning}
                    {noAclAuthorizer}

                    <KowlTable
                        dataSource={resources}
                        columns={columns}

                        observableSettings={uiSettings.brokerList.configTable}

                        rowKey={x => x.eqKey}
                        rowClassName={() => 'pureDisplayRow'}
                    />
                </Card>
            </motion.div>
        </>
    }

    @computed.struct get availableResourceTypes(): { value: string, label: string }[] {
        const acls = api.ACLs;
        if (acls?.aclResources == null) return [];
        // issue: we can't easily filter by 'resourceType' (because it is a string, and we have to use an enum for requests...)
        // so we have to cheat by building our own list of what types are available
        const ar = acls.aclResources.map(res => res.resourceType).distinct().map(str => ({ value: str, label: capitalize(str.toLowerCase()) }));
        ar.unshift({ label: 'Any', value: '' });
        return ar;
    }

    @computed({ equals: comparer.structural }) get filteredResources() {

        const filtered = this.flatResourceList
            // filter by category
            .filter(res => (this.resourceTypeFilter == "") || (this.resourceTypeFilter == res.resourceType))
            // filter by name
            .filter(this.isFilterMatch)
            .sort((a, b) => a.resourceName.localeCompare(b.resourceName))
            .sort((a, b) => a.operation.localeCompare(b.operation))
            .sort((a, b) => a.principal.localeCompare(b.principal));
        return filtered;
    }

    @computed get flatResourceList() {
        const acls = api.ACLs;
        if (acls?.aclResources == null) return [];
        const flatResources = acls.aclResources
            .map(res => res.acls.map(rule => ({ ...res, ...rule })))
            .flat()
            .map(x => ({ ...x, eqKey: toJson(x) }));
        return flatResources;
    }

    isFilterMatch = (item: AclRuleFlat) => {
        const text = this.filterText;
        if (containsIgnoreCase(item.host, text)) return true;
        if (containsIgnoreCase(item.operation, text)) return true;
        if (containsIgnoreCase(item.permissionType, text)) return true;
        if (containsIgnoreCase(item.principal, text)) return true;
        if (containsIgnoreCase(item.resourceName, text)) return true;
        if (containsIgnoreCase(String(item.resourcePatternType), text)) return true;
        if (containsIgnoreCase(item.resourceType, text)) return true;

        return false;
    };

    SearchControls = observer(() => {

        return (
            <div style={{ margin: '0 1px', marginBottom: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Label text='Resource Type'>
                    <Select
                        options={this.availableResourceTypes}
                        value={this.resourceTypeFilter}
                        onChange={(val) => {
                            this.resourceTypeFilter = val;
                        }}
                        style={{ width: '11em' }}
                        size='middle' />
                </Label>

                <Input allowClear={true} placeholder='Quick Search' style={{ width: '250px', marginLeft: 'auto' }}
                    onChange={x => this.filterText = x.target.value}
                    value={this.filterText}
                />
            </div>
        );
    })
}

type FlatResource = AclList["flatResourceList"][0];

export default AclList;

function capitalize(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}


//console.log('enum entries are:', resourceTypes.map(e => ({ name: e.name.replace(/([A-Z]+)/g, " $1"), value: e.value })));
// console.log('enum entries are:', OptionValues);

const PermissionDenied = <>
    <motion.div {...animProps} key={'aclNoPerms'} style={{ margin: '0 1rem' }}>
        <Card style={{ padding: '2rem 2rem', paddingBottom: '3rem' }}>
            <Empty description={null}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <h2><span><LockIcon verticalAlign='middle' size={20} /></span> Permission Denied</h2>
                    <p>
                        You are not allowed to view this page.
                        <br />
                        Contact the administrator if you think this is an error.
                    </p>
                </div>

                <a target="_blank" rel="noopener noreferrer" href="https://github.com/redpanda-data/kowl/blob/master/docs/authorization/roles.md">
                    <Button type="primary">Redpanda Console documentation for roles and permissions</Button>
                </a>
            </Empty>
        </Card>
    </motion.div>
</>
