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

import React, { } from 'react';
import { observer } from 'mobx-react';
import { Empty, Select, Input, Button, Alert } from 'antd';
import { ColumnProps } from 'antd/lib/table';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { uiSettings } from '../../../state/ui';
import { sortField } from '../../misc/common';
import { AclRequestDefault, AclResource, AclRule, Broker } from '../../../state/restInterfaces';
import { motion } from 'framer-motion';
import { animProps } from '../../../utils/animationProps';
import { comparer, computed, makeObservable, observable } from 'mobx';
import { containsIgnoreCase } from '../../../utils/utils';
import { appGlobal } from '../../../state/appGlobal';
import Card from '../../misc/Card';
import { DefaultSkeleton, Label } from '../../../utils/tsxUtils';
import { toJson } from '../../../utils/jsonUtils';
import { KowlTable } from '../../misc/KowlTable';
import { LockIcon } from '@primer/octicons-react';
import { PencilIcon, TrashIcon } from '@heroicons/react/solid';

type AclFlat = Omit<AclResource, 'acls'> & AclRule & { eqKey: string };

type AclGroup = {
    groupingKey: string;

    principal: string;
    host: string;

    entries: AclFlat[];
};

const columns: ColumnProps<AclGroup>[] = [
    {
        width: 'auto', title: 'Principal', dataIndex: 'principal', sorter: sortField('principal'),
        render: v => v ? v : 'Any'
    },
    {
        width: 'auto', title: 'Host', dataIndex: 'host', sorter: sortField('host'),
        render: v => v ? v : 'Any'
    },
    {
        width: '170px', title: 'ACL Entries',
        render: (_, record) => {
            return <>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                    <span>{record.entries.length}</span>
                    <Button className='iconButton' style={{ marginLeft: 'auto' }}><PencilIcon /></Button>
                    <Button className='iconButton'><TrashIcon /></Button>
                </span>
            </>
        },
        sorter: (a, b) => a.entries.length - b.entries.length,
    },
];


@observer
class AclList extends PageComponent {

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

    async refreshData(force: boolean) {
        if (api.userData != null && !api.userData.canListAcls) return;
        await api.refreshAcls(AclRequestDefault, force);
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

        const groups = this.aclGroups;

        return <>
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>

                <Card>
                    <this.SearchControls />

                    {warning}
                    {noAclAuthorizer}

                    <KowlTable
                        dataSource={groups}
                        columns={columns}

                        observableSettings={uiSettings.aclList.configTable}

                        rowKey={x => x.groupingKey}
                        rowClassName={() => 'pureDisplayRow'}

                        search={{
                            searchColumnIndex: 0,
                            isRowMatch
                        }}
                    />
                </Card>
            </motion.div>
        </>
    }

    @computed({ equals: aclFlatEquals }) get flatAcls() {
        const acls = api.ACLs;
        if (!acls || !acls.aclResources || acls.aclResources.length == 0)
            return [];

        const flattened: AclFlat[] = [];
        for (const res of acls.aclResources) {
            for (const rule of res.acls) {
                const eqKey = (rule.principal ?? 'Any') + ' ' + (rule.host ?? 'Any');
                flattened.push({ ...res, ...rule, eqKey });
            }
        }

        return flattened;
    }

    @computed({ equals: comparer.structural }) get aclGroups(): AclGroup[] {
        const flat = this.flatAcls;

        const simpleGroups = flat.groupInto(f => {
            const groupingKey = (f.principal ?? 'Any') + ' ' + (f.host ?? 'Any');
            return groupingKey;
        });

        const groups: AclGroup[] = [];
        for (const g of simpleGroups) {
            const principal = g.items[0].principal;
            const host = g.items[0].host;
            groups.push({
                groupingKey: g.key,

                principal,
                host,
                entries: g.items,
            })
        }

        return groups;
    }

    SearchControls = observer(() => {

        return (
            <div style={{ margin: '0 1px', marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Input allowClear={true} placeholder="Quick Search" style={{ width: '250px' }}
                    onChange={x => uiSettings.aclList.configTable.quickSearch = x.target.value}
                    value={uiSettings.aclList.configTable.quickSearch}
                />

                <span style={{ marginLeft: 'auto' }} >{' '}</span>

                {/* <Button>Create Service Account</Button> */}
                <Button disabled>Create ACL</Button>
            </div>
        );
    })
}


export default AclList;

function aclFlatEquals(a: AclFlat, b: AclFlat) {
    return a.eqKey === b.eqKey;
}

function isRowMatch(entry: AclGroup, regex: RegExp): boolean {
    if (regex.test(entry.host)) return true;
    if (regex.test(entry.principal)) return true;

    for (const e of entry.entries) {
        if (regex.test(e.operation)) return true;
        if (regex.test(e.resourceType)) return true;
        if (regex.test(e.resourceName)) return true;
    }

    return false;
}


const PermissionDenied = <>
    <motion.div {...animProps} key={'aclNoPerms'} style={{ margin: '0 1rem' }}>
        <Card style={{ padding: '2rem 2rem', paddingBottom: '3rem' }}>
            <Empty description={null}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <h2><span><LockIcon verticalAlign="middle" size={20} /></span> Permission Denied</h2>
                    <p>
                        You are not allowed to view this page.
                        <br />
                        Contact the administrator if you think this is an error.
                    </p>
                </div>

                <a target="_blank" rel="noopener noreferrer" href="https://github.com/redpanda-data/console/blob/master/docs/authorization/roles.md">
                    <Button type="primary">Redpanda Console documentation for roles and permissions</Button>
                </a>
            </Empty>
        </Card>
    </motion.div>
</>
