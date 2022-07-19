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

import React, { CSSProperties } from 'react';
import { observer } from 'mobx-react';
import { Empty, Select, Input, Button, Alert, Modal, AutoComplete, Switch } from 'antd';
import { ColumnProps } from 'antd/lib/table';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { uiSettings } from '../../../state/ui';
import { sortField } from '../../misc/common';
import { AclOperation, AclPermission, AclRequestDefault, AclResource, AclRule, Broker } from '../../../state/restInterfaces';
import { AnimatePresence, motion } from 'framer-motion';
import { animProps } from '../../../utils/animationProps';
import { comparer, computed, makeObservable, observable } from 'mobx';
import { containsIgnoreCase } from '../../../utils/utils';
import { appGlobal } from '../../../state/appGlobal';
import Card from '../../misc/Card';
import { DefaultSkeleton, Label } from '../../../utils/tsxUtils';
import { toJson } from '../../../utils/jsonUtils';
import { KowlTable } from '../../misc/KowlTable';
import { LockIcon } from '@primer/octicons-react';
import { PencilIcon, TrashIcon, CheckIcon, XIcon, MinusIcon } from '@heroicons/react/solid';
const { Option } = Select;


type AclFlat = Omit<AclResource, 'acls' | 'principal' | 'host'> & AclRule & { eqKey: string };


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

function createEmptyTopicAcl(): TopicACLs {
    return {
        selector: '',
        all: AclPermission.Any,
        permissions: {
            Alter: AclPermission.Any,
            AlterConfigs: AclPermission.Any,
            Create: AclPermission.Any,
            DescribeConfigs: AclPermission.Any,
            Write: AclPermission.Any,
            Read: AclPermission.Any,
            Delete: AclPermission.Any,
            Describe: AclPermission.Any,
        }
    };
}
function createEmptyConsumerGroupAcl(): ConsumerGroupACLs {
    return {
        selector: '',
        all: AclPermission.Any,
        permissions: {
            Read: AclPermission.Any,
            Delete: AclPermission.Any,
            Describe: AclPermission.Any,
        }
    };
}

function createEmptyClusterAcl(): ClusterACLs {
    return {
        all: AclPermission.Any,
        permissions: {
            Alter: AclPermission.Any,
            AlterConfigs: AclPermission.Any,
            ClusterAction: AclPermission.Any,
            Create: AclPermission.Any,
            Describe: AclPermission.Any,
            DescribeConfigs: AclPermission.Any,
        }
    };
}

@observer
class AclList extends PageComponent {

    @observable creatingPrincipalGroup?: AclPrincipalGroup;

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

                {this.creatingPrincipalGroup != null
                    ? <AclPrincipalGroupEditor principalGroup={this.creatingPrincipalGroup} type='create' />
                    : undefined
                }

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

                <Button onClick={() => {
                    this.creatingPrincipalGroup = {
                        host: '',
                        principal: '',
                        topicAcls: [
                            createEmptyTopicAcl()
                        ],
                        consumerGroupAcls: [
                            createEmptyConsumerGroupAcl()
                        ],
                        clusterAcls: createEmptyClusterAcl(),
                    };
                }}>Create ACL</Button>

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

const AclPrincipalGroupEditor = observer((p: { principalGroup: AclPrincipalGroup, type: 'create' | 'edit' }) => {
    const group = p.principalGroup;

    const existingPrincipals: string[] = [];
    const principalOptions = existingPrincipals.map(p => ({ value: p }));

    return <Modal
        title={p.type == 'create' ? 'Create ACL' : 'Edit ACL'}
        style={{ top: '50px' }}
        width="1100px"
        visible={true} closable={false} maskClosable={false}
    >

        <div style={{ display: 'flex', gap: '1.5em', flexDirection: 'column' }}>

            <div style={{ display: 'flex', gap: '2.5em', alignItems: 'flex-end' }}>
                <Label text="Principal / Service Account">
                    <AutoComplete
                        style={{ width: 260 }}
                        options={principalOptions}
                        filterOption={(inputValue, option) => containsIgnoreCase(option!.value, inputValue)}
                        value={group.principal}
                        onChange={v => group.principal = v}
                    />
                </Label>

                <Label text="Host">
                    <Input
                        style={{ width: 200 }}
                        value={group.host}
                        onChange={e => group.host = e.target.value}
                    />
                </Label>

                <Label text="Allow all operations">
                    <Switch />
                </Label>
            </div>

            <div style={{
                display: 'flex', gap: '1em', flexDirection: 'column',
                maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', paddingRight: '8px'
            }}>

                <section style={{ width: '100%' }}>
                    <span style={{ marginBottom: '4px', fontWeight: 500, fontSize: '13px' }}>Topics</span>
                    <div style={{ display: 'flex', gap: '1em', flexDirection: 'column' }}>
                        {group.topicAcls.map((t, i) =>
                            <ResourceACLsEditor
                                key={i}
                                resource={t}
                                onDelete={group.topicAcls.length <= 1
                                    ? undefined
                                    : () => group.topicAcls.remove(t)
                                }
                            />
                        )}
                        <Button
                            block
                            onClick={() => group.topicAcls.push(createEmptyTopicAcl())}
                        >Add Topic ACL
                        </Button>
                    </div>
                </section>

                <section style={{ width: '100%' }}>
                    <span style={{ marginBottom: '4px', fontWeight: 500, fontSize: '13px' }}>Consumer Groups</span>
                    <div style={{ display: 'flex', gap: '1em', flexDirection: 'column' }}>
                        {group.consumerGroupAcls.map((t, i) =>
                            <ResourceACLsEditor
                                key={i}
                                resource={t}
                                onDelete={group.consumerGroupAcls.length <= 1
                                    ? undefined
                                    : () => group.consumerGroupAcls.remove(t)
                                }
                            />
                        )}
                        <Button
                            block
                            onClick={() => group.consumerGroupAcls.push(createEmptyTopicAcl())}
                        >Add Topic ACL
                        </Button>
                    </div>
                </section>

                <section style={{ width: '100%' }}>
                    <span style={{ marginBottom: '4px', fontWeight: 500, fontSize: '13px' }}>Cluster</span>
                    <div style={{ display: 'flex', gap: '1em', flexDirection: 'column' }}>
                        <ResourceACLsEditor resource={group.clusterAcls} />
                    </div>
                </section>
            </div>

        </div>


    </Modal>
});

const ResourceACLsEditor = observer((p: {
    resource: ResourceACLs,
    onDelete?: () => void
}) => {
    const res = p.resource;
    const isCluster = !('selector' in res);

    const isAllSet = res.all == AclPermission.Allow || res.all == AclPermission.Deny;

    return <div style={{
        position: 'relative',
        display: 'flex', flexDirection: 'row',
        gap: '2.5em', padding: '1.5em',
        background: 'hsl(0deg 0% 97%)',
    }}>
        {isCluster
            ? <div style={{ width: '300px' }}>
                <b>Applies to whole cluster</b>
            </div>
            : <Label text='Selector (supports wildcard)' style={{ width: '300px' }}>
                <>
                    <Input placeholder='*' value={res.selector} onChange={e => res.selector = e.target.value} />
                    <span style={{ opacity: '0.5', fontSize: '10px', marginLeft: '2px' }}>
                        {res.selector.endsWith('*') ? "Prefix Selector" : "Literal Selector"}
                    </span>
                </>
            </Label>
        }


        <Label text="Operations">
            <div style={{
                display: 'flex', flexDirection: 'column',
                rowGap: '8px', columnGap: '20px',
                flexWrap: 'wrap', width: '100%', maxHeight: '60px',
                alignItems: 'flex-start',
            }}>
                <Operation
                    style={{
                        marginBottom: '30px', // force 'all' to appear separate
                        marginRight: '16px'
                    }}
                    operation={AclOperation.All}
                    value={res.all}
                    onChange={p => res.all = p}
                />

                {Object.entries(res.permissions).map(([operation, permission]) =>
                    <Operation
                        key={operation}
                        operation={operation}
                        value={isAllSet ? res.all : permission}
                        onChange={p => (res.permissions as any)[operation] = p}
                        disabled={isAllSet}
                    />
                )}
            </div>

        </Label>

        {p.onDelete &&
            <AnimatePresence>
                <Button
                    type='text'
                    style={{ position: 'absolute', right: '8px', top: '8px', padding: '4px', color: 'rgb(0, 0, 0, 0.35)' }}
                    onClick={p.onDelete}
                >
                    <TrashIcon />
                </Button>
            </AnimatePresence>
        }
    </div>
});


type AclPrincipalGroup = {
    principal: string;
    host: string;

    topicAcls: TopicACLs[];
    consumerGroupAcls: ConsumerGroupACLs[];
    clusterAcls: ClusterACLs;
};

type TopicACLs = {
    selector: string;
    all: AclPermission;

    permissions: {
        Alter: AclPermission;
        AlterConfigs: AclPermission;
        Create: AclPermission;
        Delete: AclPermission;
        Describe: AclPermission;
        DescribeConfigs: AclPermission;
        Read: AclPermission;
        Write: AclPermission;
    };
};

type ConsumerGroupACLs = {
    selector: string;
    all: AclPermission;

    permissions: {
        Delete: AclPermission;
        Describe: AclPermission;
        Read: AclPermission;
    };
};

type ClusterACLs = {
    all: AclPermission;

    permissions: {
        Alter: AclPermission;
        AlterConfigs: AclPermission;
        ClusterAction: AclPermission;
        Create: AclPermission;
        Describe: AclPermission;
        DescribeConfigs: AclPermission;
    };
};

type ResourceACLs = TopicACLs | ConsumerGroupACLs | ClusterACLs;


const icons = {
    minus: <MinusIcon color='grey' />,
    check: <CheckIcon color='green' />,
    cross: <XIcon color='red' />,
}


const Operation = observer((p: {
    operation: string | AclOperation,
    value: AclPermission,
    disabled?: boolean,
    onChange?: (v: AclPermission) => void,
    style?: CSSProperties
}) => {
    const disabled = p.disabled ?? false;

    const operationName = typeof p.operation == 'string'
        ? p.operation
        : AclOperation[p.operation];

    const optionContent = (icon: JSX.Element, text: string) => <>
        <div className='iconSelectOption'>
            {icon}
            <span>{text}</span>
        </div>
    </>

    return <Select
        className='aclOperationSelect'
        style={Object.assign({}, p.style, { pointerEvents: disabled ? 'none' : undefined })}
        bordered={!disabled}
        disabled={disabled}

        size='middle'
        showArrow={false}
        value={p.value}
        onChange={p.onChange}
        virtual={false}
        defaultValue={AclPermission.Any}

        dropdownMatchSelectWidth={false}

        optionLabelProp='label'

    >
        <Option value={AclPermission.Any} label={optionContent(icons.minus, operationName)}>
            {optionContent(icons.minus, 'Not set')}
        </Option>
        <Option value={AclPermission.Allow} label={optionContent(icons.check, operationName)}>
            {optionContent(icons.check, 'Allow')}
        </Option>
        <Option value={AclPermission.Deny} label={optionContent(icons.cross, operationName)}>
            {optionContent(icons.cross, 'Deny')}
        </Option>
    </Select>
});


