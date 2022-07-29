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

import React, { CSSProperties, useState } from 'react';
import { observer } from 'mobx-react';
import { Empty, Select, Input, Button, Alert, Modal, AutoComplete, Switch, Tag, Popconfirm } from 'antd';
import { ColumnProps } from 'antd/lib/table';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { uiSettings } from '../../../state/ui';
import { sortField } from '../../misc/common';
import { AclOperation, AclRequestDefault, AclStrOperation, AclStrPermission, AclStrResourcePatternType, AclStrResourceType } from '../../../state/restInterfaces';
import { AnimatePresence, motion } from 'framer-motion';
import { animProps } from '../../../utils/animationProps';
import { comparer, computed, makeObservable, observable } from 'mobx';
import { containsIgnoreCase } from '../../../utils/utils';
import { appGlobal } from '../../../state/appGlobal';
import Card from '../../misc/Card';
import { Code, DefaultSkeleton, Label } from '../../../utils/tsxUtils';
import { toJson } from '../../../utils/jsonUtils';
import { KowlTable } from '../../misc/KowlTable';
import { LockIcon } from '@primer/octicons-react';
import { PencilIcon, TrashIcon, CheckIcon, XIcon, MinusIcon } from '@heroicons/react/solid';
import { QuestionCircleOutlined } from '@ant-design/icons';
const { Option } = Select;


type AclFlat = {
    // AclResource
    resourceType: AclStrResourceType;
    resourceName: string;
    resourcePatternType: AclStrResourcePatternType;

    // AclRule
    principal: string;
    host: string;
    operation: AclStrOperation;
    permissionType: AclStrPermission;

    eqKey: string;
}

type AclPrincipalGroup = {
    principal: string;
    host: string;

    topicAcls: TopicACLs[];
    consumerGroupAcls: ConsumerGroupACLs[];
    clusterAcls: ClusterACLs;

    sourceEntries: AclFlat[];
};

type TopicACLs = {
    selector: string;
    all: AclStrPermission;

    permissions: {
        Alter: AclStrPermission;
        AlterConfigs: AclStrPermission;
        Create: AclStrPermission;
        Delete: AclStrPermission;
        Describe: AclStrPermission;
        DescribeConfigs: AclStrPermission;
        Read: AclStrPermission;
        Write: AclStrPermission;
    };
};

type ConsumerGroupACLs = {
    selector: string;
    all: AclStrPermission;

    permissions: {
        Delete: AclStrPermission;
        Describe: AclStrPermission;
        Read: AclStrPermission;
    };
};

type ClusterACLs = {
    all: AclStrPermission;

    permissions: {
        Alter: AclStrPermission;
        AlterConfigs: AclStrPermission;
        ClusterAction: AclStrPermission;
        Create: AclStrPermission;
        Describe: AclStrPermission;
        DescribeConfigs: AclStrPermission;
    };
};

type ResourceACLs = TopicACLs | ConsumerGroupACLs | ClusterACLs;



const columns: ColumnProps<AclPrincipalGroup>[] = [
    {
        width: 'auto', title: 'Principal', dataIndex: 'principal', sorter: sortField('principal'),
        render: (v?: string) => {
            if (!v)
                return <Tag>Any</Tag>
            const userPrefix = 'user:';
            if (v.toLowerCase().startsWith(userPrefix)) {
                const name = v.slice(userPrefix.length).trim();
                return <><Tag>User</Tag>{name}</>
            }

            return v;
        }
    },
    {
        width: 'auto', title: 'Host', dataIndex: 'host', sorter: sortField('host'),
        render: v => (!v || v == '*') ? <Tag>Any</Tag> : v
    },
    {
        width: '200px', title: 'ACL Entries',
        render: (_, record) => {
            return <>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                    <span>{record.sourceEntries.length}</span>
                    <Button className="iconButton" style={{ marginLeft: 'auto' }}><PencilIcon /></Button>
                    <Popconfirm
                        title={<>Delete all ACL entries for principal <Code>{record.principal}</Code> ?</>}
                        icon={<QuestionCircleOutlined style={{ color: 'red' }} />}
                        placement="left"
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        onConfirm={async () => {

                            await api.deleteACLs({
                                resourceType: 'Any',
                                resourceName: undefined,
                                resourcePatternType: 'Any',
                                principal: record.principal,
                                host: record.host,
                                operation: 'Any',
                                permissionType: 'Any',
                            });
                        }}
                    >
                        <Button className="iconButton" style={{ marginLeft: '-1px' }}><TrashIcon /></Button>
                    </Popconfirm>
                </span>
            </>
        },
        sorter: (a, b) => a.sourceEntries.length - b.sourceEntries.length,
    },
];

function createEmptyTopicAcl(): TopicACLs {
    return {
        selector: '',
        all: 'Any',
        permissions: {
            Alter: 'Any',
            AlterConfigs: 'Any',
            Create: 'Any',
            DescribeConfigs: 'Any',
            Write: 'Any',
            Read: 'Any',
            Delete: 'Any',
            Describe: 'Any',
        }
    };
}

function createEmptyConsumerGroupAcl(): ConsumerGroupACLs {
    return {
        selector: '',
        all: 'Any',
        permissions: {
            Read: 'Any',
            Delete: 'Any',
            Describe: 'Any',
        }
    };
}

function createEmptyClusterAcl(): ClusterACLs {
    return {
        all: 'Any',
        permissions: {
            Alter: 'Any',
            AlterConfigs: 'Any',
            ClusterAction: 'Any',
            Create: 'Any',
            Describe: 'Any',
            DescribeConfigs: 'Any',
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

        const groups = this.principalGroups;

        return <>
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>

                {this.creatingPrincipalGroup != null
                    ? <AclPrincipalGroupEditor
                        principalGroup={this.creatingPrincipalGroup}
                        type="create"
                        onClose={() => {
                            this.creatingPrincipalGroup = undefined;
                            this.refreshData(true);
                        }}
                    />
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

                        rowKey={x => x.principal + x.host}
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

                const flattenedEntry: AclFlat = {
                    resourceType: res.resourceType,
                    resourceName: res.resourceName,
                    resourcePatternType: res.resourcePatternType,

                    principal: rule.principal,
                    host: rule.host,
                    operation: rule.operation,
                    permissionType: rule.permissionType,

                    eqKey: ''
                };

                const eqKey = toJson(flattenedEntry);
                flattenedEntry.eqKey = eqKey;

                flattened.push(flattenedEntry);
            }
        }

        return flattened;
    }


    @computed({ equals: comparer.structural }) get principalGroups(): AclPrincipalGroup[] {
        const flat = this.flatAcls;

        const g = flat.groupInto(f => {
            const groupingKey = (f.principal ?? 'Any') + ' ' + (f.host ?? 'Any');
            return groupingKey;
        });

        const result: AclPrincipalGroup[] = [];

        for (const { items } of g) {
            const { principal, host } = items[0];

            const principalGroup: AclPrincipalGroup = {
                principal,
                host,

                topicAcls: collectTopicAcls(items),
                consumerGroupAcls: collectConsumerGroupAcls(items),
                clusterAcls: collectClusterAcls(items),

                sourceEntries: items,
            };
            result.push(principalGroup);
        }

        return result;
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
                        sourceEntries: []
                    };
                }}>Create ACL</Button>

            </div>
        );
    })
}

function collectTopicAcls(acls: AclFlat[]): TopicACLs[] {
    const topics = acls
        .filter(x => x.resourceType == 'Topic')
        .groupInto(x => `${x.resourcePatternType}: ${x.resourceName}`);

    const topicAcls: TopicACLs[] = [];
    for (const { items } of topics) {
        const first = items[0];
        let selector = first.resourceName;
        if (first.resourcePatternType != 'Literal')
            if (first.resourcePatternType == 'Prefixed')
                selector += '*';
            else
                selector += ` (unsupported pattern type "${first.resourcePatternType}")`;

        const topicOperations = [
            'Alter',
            'AlterConfigs',
            'Create',
            'Delete',
            'Describe',
            'DescribeConfigs',
            'Read',
            'Write',
        ] as const;

        const topicPermissions: { [key in typeof topicOperations[number]]: AclStrPermission } = {
            Alter: 'Any',
            AlterConfigs: 'Any',
            Create: 'Any',
            Delete: 'Any',
            Describe: 'Any',
            DescribeConfigs: 'Any',
            Read: 'Any',
            Write: 'Any',
        };

        for (const op of topicOperations) {
            const entryForOp = items.find(x => x.operation === op);
            if (entryForOp) {
                topicPermissions[op] = entryForOp.permissionType;
            }
        }

        let all: AclStrPermission = 'Any';
        if (Object.values(topicPermissions).all(p => p == 'Allow'))
            all = 'Allow';
        if (Object.values(topicPermissions).all(p => p == 'Deny'))
            all = 'Deny';

        const topicAcl: TopicACLs = {
            selector,
            permissions: topicPermissions,
            all,
        };

        topicAcls.push(topicAcl);
    }

    return topicAcls;
};

function collectConsumerGroupAcls(acls: AclFlat[]): ConsumerGroupACLs[] {
    const consumerGroups = acls
        .filter(x => x.resourceType == 'Group')
        .groupInto(x => `${x.resourcePatternType}: ${x.resourceName}`);

    const consumerGroupAcls: ConsumerGroupACLs[] = [];
    for (const { items } of consumerGroups) {
        const first = items[0];
        let selector = first.resourceName;
        if (first.resourcePatternType != 'Literal')
            if (first.resourcePatternType == 'Prefixed')
                selector += '*';
            else
                selector += ` (unsupported pattern type "${first.resourcePatternType}")`;

        const groupOperations = [
            'Delete',
            'Describe',
            'Read',
        ] as const;

        const groupPermissions: { [key in typeof groupOperations[number]]: AclStrPermission } = {
            Delete: 'Any',
            Describe: 'Any',
            Read: 'Any',
        };

        for (const op of groupOperations) {
            const entryForOp = items.find(x => x.operation === op);
            if (entryForOp) {
                groupPermissions[op] = entryForOp.permissionType;
            }
        }

        let all: AclStrPermission = 'Any';
        if (Object.values(groupPermissions).all(p => p == 'Allow'))
            all = 'Allow';
        if (Object.values(groupPermissions).all(p => p == 'Deny'))
            all = 'Deny';

        const groupAcl: ConsumerGroupACLs = {
            selector,
            permissions: groupPermissions,
            all,
        };

        consumerGroupAcls.push(groupAcl);
    }

    return consumerGroupAcls;
};

function collectClusterAcls(acls: AclFlat[]): ClusterACLs {
    const flatClusterAcls = acls.filter(x => x.resourceType == 'Cluster');

    const clusterOperations = [
        'Alter',
        'AlterConfigs',
        'ClusterAction',
        'Create',
        'Describe',
        'DescribeConfigs',
    ] as const;

    const clusterPermissions: { [key in typeof clusterOperations[number]]: AclStrPermission } = {
        Alter: 'Any',
        AlterConfigs: 'Any',
        ClusterAction: 'Any',
        Create: 'Any',
        Describe: 'Any',
        DescribeConfigs: 'Any',
    };

    for (const op of clusterOperations) {
        const entryForOp = flatClusterAcls.find(x => x.operation === op);
        if (entryForOp) {
            clusterPermissions[op] = entryForOp.permissionType;
        }
    }

    let all: AclStrPermission = 'Any';
    if (Object.values(clusterPermissions).all(p => p == 'Allow'))
        all = 'Allow';
    if (Object.values(clusterPermissions).all(p => p == 'Deny'))
        all = 'Deny';

    const clusterAcls: ClusterACLs = {
        permissions: clusterPermissions,
        all,
    };


    return clusterAcls;
};


function unpackPrincipalGroup(group: AclPrincipalGroup): AclFlat[] {
    const flat: AclFlat[] = [];

    group.principal = group.principal.removePrefix('User: ');
    if (!group.host)
        group.host = '*';

    for (const topic of group.topicAcls) {
        const name = topic.selector.removeSuffix('*');
        const isPrefix = topic.selector.endsWith('*');

        if (topic.all == 'Allow' || topic.all == 'Deny') {
            const e: AclFlat = {
                principal: 'User: ' + group.principal,
                host: group.host,

                resourceType: 'Topic',
                resourceName: name,
                resourcePatternType: isPrefix ? 'Prefixed' : 'Literal',

                operation: 'All',
                permissionType: topic.all,

                eqKey: '',
            };
            e.eqKey = toJson(e);
            flat.push(e);
            continue;
        }

        for (const [key, permission] of Object.entries(topic.permissions)) {
            const operation = key as AclStrOperation;

            if (permission != 'Allow' && permission != 'Deny')
                continue;

            const e: AclFlat = {
                principal: 'User: ' + group.principal,
                host: group.host,

                resourceType: 'Topic',
                resourceName: name,
                resourcePatternType: isPrefix ? 'Prefixed' : 'Literal',

                operation: operation,
                permissionType: permission,

                eqKey: '',
            };
            e.eqKey = toJson(e);
            flat.push(e);
        }
    }

    if (group.clusterAcls.all == 'Allow' || group.clusterAcls.all == 'Deny') {
        const e: AclFlat = {
            principal: group.principal,
            host: group.host,

            resourceType: 'Cluster',
            resourceName: 'kafka-cluster',
            resourcePatternType: 'Literal',

            operation: 'All',
            permissionType: group.clusterAcls.all,

            eqKey: '',
        };
        e.eqKey = toJson(e);
        flat.push(e);
    } else {
        for (const [key, permission] of Object.entries(group.clusterAcls.permissions)) {
            const operation = key as AclStrOperation;
            if (permission != 'Allow' && permission != 'Deny')
                continue;

            const e: AclFlat = {
                principal: 'User: ' + group.principal,
                host: group.host,

                resourceType: 'Cluster',
                resourceName: 'kafka-cluster',
                resourcePatternType: 'Literal',

                operation: operation,
                permissionType: permission,

                eqKey: '',
            };
            e.eqKey = toJson(e);
            flat.push(e);
        }
    }



    return flat;
}


export default AclList;

function aclFlatEquals(a: AclFlat, b: AclFlat) {
    return a.eqKey === b.eqKey;
}

function isRowMatch(entry: AclPrincipalGroup, regex: RegExp): boolean {
    if (regex.test(entry.host)) return true;
    if (regex.test(entry.principal)) return true;

    for (const e of entry.sourceEntries) {
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

const AclPrincipalGroupEditor = observer((p: {
    principalGroup: AclPrincipalGroup,
    type: 'create' | 'edit',
    onClose: () => void
}) => {
    const group = p.principalGroup;

    const existingPrincipals: string[] = [];
    const principalOptions = existingPrincipals.map(p => ({ value: p }));
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(undefined as string | undefined);

    return <Modal
        title={p.type == 'create' ? 'Create ACL' : 'Edit ACL'}
        style={{ top: '50px' }}
        width="1100px"
        visible={true} closable={false} maskClosable={false}
        confirmLoading={isLoading}
        onOk={async () => {
            setError(undefined);
            setIsLoading(true);
            try {
                const allToCreate = unpackPrincipalGroup(group);
                console.log('acls needed to create', allToCreate);

                const requests = allToCreate.map(x => api.createACL({
                    host: x.host,
                    principal: x.principal,
                    resourceType: x.resourceType,
                    resourceName: x.resourceName,
                    resourcePatternType: x.resourcePatternType as unknown as 'Literal' | 'Prefixed',
                    operation: x.operation as unknown as Exclude<AclStrOperation, 'Unknown' | 'Any'>,
                    permissionType: x.permissionType as unknown as 'Allow' | 'Deny',
                }))

                const results = await Promise.allSettled(requests);
                const rejected = results.filter(x => x.status == 'rejected');
                if (rejected.length) {
                    console.error('some create acl requests failed', { results, rejected });
                    throw new Error(rejected.length + ' requests failed');
                }
            } catch (err) {
                setError(String(err));
            }
            setIsLoading(false);
            p.onClose();
        }}
        onCancel={p.onClose}
    >

        <div style={{ display: 'flex', gap: '1.5em', flexDirection: 'column' }}>
            {error && <div>Error: {error}</div>}

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

    const isAllSet = res.all == 'Allow' || res.all == 'Deny';

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
            : <Label text="Selector (supports wildcard)" style={{ width: '300px' }}>
                <>
                    <Input placeholder="*" value={res.selector} onChange={e => res.selector = e.target.value} />
                    <span style={{ opacity: '0.5', fontSize: '10px', marginLeft: '2px' }}>
                        {res.selector.endsWith('*') ? 'Prefix Selector' : 'Literal Selector'}
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
                    type="text"
                    style={{ position: 'absolute', right: '8px', top: '8px', padding: '4px', color: 'rgb(0, 0, 0, 0.35)' }}
                    onClick={p.onDelete}
                >
                    <TrashIcon />
                </Button>
            </AnimatePresence>
        }
    </div>
});



const icons = {
    minus: <MinusIcon color="grey" />,
    check: <CheckIcon color="green" />,
    cross: <XIcon color="red" />,
}


const Operation = observer((p: {
    operation: string | AclOperation,
    value: AclStrPermission,
    disabled?: boolean,
    onChange?: (v: AclStrPermission) => void,
    style?: CSSProperties
}) => {
    const disabled = p.disabled ?? false;

    const operationName = typeof p.operation == 'string'
        ? p.operation
        : AclOperation[p.operation];

    const optionContent = (icon: JSX.Element, text: string) => <>
        <div className="iconSelectOption">
            {icon}
            <span>{text}</span>
        </div>
    </>

    return <Select
        className="aclOperationSelect"
        style={Object.assign({}, p.style, { pointerEvents: disabled ? 'none' : undefined })}
        bordered={!disabled}
        disabled={disabled}

        size="middle"
        showArrow={false}
        value={p.value}
        onChange={p.onChange}
        virtual={false}
        defaultValue="Any"

        dropdownMatchSelectWidth={false}

        optionLabelProp="label"

    >
        <Option value="Any" label={optionContent(icons.minus, operationName)}>
            {optionContent(icons.minus, 'Not set')}
        </Option>
        <Option value="Allow" label={optionContent(icons.check, operationName)}>
            {optionContent(icons.check, 'Allow')}
        </Option>
        <Option value="Deny" label={optionContent(icons.cross, operationName)}>
            {optionContent(icons.cross, 'Deny')}
        </Option>
    </Select>
});


