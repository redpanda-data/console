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

import { observer } from 'mobx-react';
import { Empty, Input, Button, Alert, Tag, message, Dropdown, Menu, Tooltip } from 'antd';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { uiSettings } from '../../../state/ui';
import { sortField } from '../../misc/common';
import { AclRequestDefault, CreateUserRequest } from '../../../state/restInterfaces';
import { comparer, computed, makeObservable, observable } from 'mobx';
import { appGlobal } from '../../../state/appGlobal';
import { Code, DefaultSkeleton } from '../../../utils/tsxUtils';
import { clone } from '../../../utils/jsonUtils';
import { KowlColumnType, KowlTable } from '../../misc/KowlTable';
import { LockIcon, QuestionIcon } from '@primer/octicons-react';
import { TrashIcon } from '@heroicons/react/outline';
import { AclFlat, AclPrincipalGroup, collectClusterAcls, collectConsumerGroupAcls, collectTopicAcls, createEmptyClusterAcl, createEmptyConsumerGroupAcl, createEmptyTopicAcl } from './Models';
import { AclPrincipalGroupEditor } from './PrincipalGroupEditor';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import createAutoModal from '../../../utils/createAutoModal';
import { CreateServiceAccountEditor, generatePassword } from './CreateServiceAccountEditor';
import { Features } from '../../../state/supportedFeatures';


@observer
class AclList extends PageComponent {

    columns: KowlColumnType<AclPrincipalGroup>[] = [
        {
            width: 'auto', title: 'Principal', dataIndex: 'principal', sorter: sortField('principalName'),
            render: (_value: string, record: AclPrincipalGroup) => {
                const userExists = api.serviceAccounts?.users.includes(record.principalName);
                const showWarning = !userExists && !record.principalName.includes('*');
                return <>
                    <Tag>{record.principalType}</Tag>
                    <span>{record.principalName}</span>
                    {showWarning && <Tooltip overlay="User / ServiceAccount does not exist">
                        <span style={{ marginLeft: '4px' }}>
                            <QuestionIcon fill="orange" size={16} />
                        </span>
                    </Tooltip>}
                </>
            },
            defaultSortOrder: 'ascend'
        },
        {
            width: 'auto', title: 'Host', dataIndex: 'host', sorter: sortField('host'),
            render: v => (!v || v == '*') ? <Tag>Any</Tag> : v
        },
        {
            width: '60px', title: '',
            render: (_, record) => {
                const userExists = api.serviceAccounts?.users.includes(record.principalName);

                const onDelete = async (user: boolean, acls: boolean) => {
                    const promises = [];
                    if (acls)
                        promises.push(api.deleteACLs({
                            resourceType: 'Any',
                            resourceName: undefined,
                            resourcePatternType: 'Any',
                            principal: record.principalType + ':' + record.principalName,
                            host: record.host,
                            operation: 'Any',
                            permissionType: 'Any',
                        }));
                    if (user)
                        promises.push(api.deleteServiceAccount(record.principalName));

                    await Promise.allSettled(promises);
                    await this.refreshData(true);
                }


                return <Dropdown trigger={['click']} overlay={
                    <Menu>
                        <Menu.Item key="1" disabled={!userExists || !Features.deleteUser} onClick={async () => {
                            onDelete(true, true);
                            message.success(<>Deleted ACLs and user <Code>{record.principalName}</Code></>);
                        }}>
                            Delete (User and ACLs)
                        </Menu.Item>

                        <Menu.Item key="2" disabled={!userExists || !Features.deleteUser} onClick={async () => {
                            onDelete(true, false);
                            message.success(<>Deleted user <Code>{record.principalName}</Code></>);
                        }}>
                            Delete (User only)
                        </Menu.Item>

                        <Menu.Item key="3" onClick={async () => {
                            onDelete(false, true);
                            message.success(<>Deleted ACLs for <Code>{record.principalName}</Code></>);
                        }}>
                            Delete (ACLs only)
                        </Menu.Item>
                    </Menu>}>
                    <Button type="text" className="iconButton" style={{ marginLeft: 'auto' }}
                        onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                    >
                        <TrashIcon />
                    </Button>
                </Dropdown>


            }
        },
    ];

    editorType: 'create' | 'edit' = 'create';
    @observable edittingPrincipalGroup?: AclPrincipalGroup;

    CreateServiceAccountModal;
    showCreateServiceAccountModal;

    constructor(p: any) {
        super(p);
        makeObservable(this);

        const m = createAutoModal({
            modalProps: {
                title: 'Create User',
                width: '80%',
                style: { minWidth: '400px', maxWidth: '600px', top: '50px' },
                bodyStyle: { paddingTop: '1em' },

                okText: 'Create',
                successTitle: 'User Created',

                closable: false,
                keyboard: false,
                maskClosable: false,
            },

            onCreate: () => observable({
                username: '',
                password: generatePassword(30),
                mechanism: 'SCRAM-SHA-256',
            } as CreateUserRequest),

            isOkEnabled: state => {
                const noWhitespaceRegex = /^\S+$/;
                if (!noWhitespaceRegex.test(state.username))
                    return false;
                return true;
            },
            onOk: async state => {
                await api.createServiceAccount({
                    username: state.username,
                    password: state.password,
                    mechanism: state.mechanism,
                });

                return <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto auto',
                    justifyContent: 'center',
                    justifyItems: 'end',
                    alignItems: 'center',
                    columnGap: '8px',
                    rowGap: '4px'
                }}>
                    <span>Username:</span><span style={{ justifySelf: 'start' }}>
                        <Code>{state.username}</Code>
                    </span>
                    <span>Password:</span><span style={{ justifySelf: 'start' }}>
                        <Input.Password value={state.password} readOnly />
                    </span>
                    <span>Mechanism:</span><span style={{ justifySelf: 'start' }}>
                        <Code>{state.mechanism}</Code>
                    </span>
                </div>
            },
            onSuccess: (_state, _result) => {
                this.refreshData(true);
            },
            content: (state) => <CreateServiceAccountEditor state={state} />,
        });
        this.CreateServiceAccountModal = m.Component;
        this.showCreateServiceAccountModal = m.show;
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Kafka Access Control';
        p.addBreadcrumb('Kafka Access Control', '/acls');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    async refreshData(force: boolean) {
        if (api.userData != null && !api.userData.canListAcls) return;

        await Promise.allSettled([
            api.refreshAcls(AclRequestDefault, force),
            api.refreshServiceAccounts(true)
        ]);
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
            <PageContent>

                {this.edittingPrincipalGroup &&
                    <AclPrincipalGroupEditor
                        principalGroup={this.edittingPrincipalGroup}
                        type={this.editorType}
                        onClose={() => {
                            this.edittingPrincipalGroup = undefined;
                            this.refreshData(true);
                        }}
                    />}

                <this.CreateServiceAccountModal />

                <Section>
                    <this.SearchControls />

                    {warning}
                    {noAclAuthorizer}

                    <KowlTable
                        dataSource={groups}
                        columns={this.columns}

                        observableSettings={uiSettings.aclList.configTable}

                        rowKey={x => x.principalType + ' :: ' + x.principalName + ' :: ' + x.host}

                        rowClassName="hoverLink"
                        onRow={(record) => ({
                            onClick: () => {
                                this.editorType = 'edit';
                                this.edittingPrincipalGroup = clone(record);
                            },
                        })}

                        search={{
                            searchColumnIndex: 0,
                            isRowMatch
                        }}
                    />
                </Section>
            </PageContent>
        </>
    }

    @computed({ equals: comparer.structural }) get flatAcls() {
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
                    permissionType: rule.permissionType
                };

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

            let principalType: string;
            let principalName: string;
            if (principal.includes(':')) {
                const split = principal.split(':', 2);
                principalType = split[0];
                principalName = split[1];
            } else {
                principalType = 'User';
                principalName = principal;
            }

            const principalGroup: AclPrincipalGroup = {
                principalType,
                principalName,
                host,

                topicAcls: collectTopicAcls(items),
                consumerGroupAcls: collectConsumerGroupAcls(items),
                clusterAcls: collectClusterAcls(items),

                sourceEntries: items,
            };
            result.push(principalGroup);
        }

        // Add service accounts that exist but have no associated acl rules
        const serviceAccounts = api.serviceAccounts?.users;
        if (serviceAccounts) {
            for (const acc of serviceAccounts) {
                if (!result.any(g => g.principalName == acc)) {
                    // Doesn't have a group yet, create one
                    result.push({
                        principalType: 'User',
                        host: '',
                        principalName: acc,
                        topicAcls: [createEmptyTopicAcl()],
                        consumerGroupAcls: [createEmptyConsumerGroupAcl()],
                        clusterAcls: createEmptyClusterAcl(),
                        sourceEntries: [],
                    });
                }
            }
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

                <Tooltip trigger={!Features.createUser ? 'hover' : 'none'} overlay="The cluster does not support this feature" >
                    <Button disabled={!Features.createUser} onClick={this.showCreateServiceAccountModal}>
                        Create User
                    </Button>
                </Tooltip>

                <Button onClick={() => {
                    this.editorType = 'create';
                    this.edittingPrincipalGroup = {
                        host: '',
                        principalType: 'User',
                        principalName: '',
                        topicAcls: [
                            createEmptyTopicAcl()
                        ],
                        consumerGroupAcls: [
                            createEmptyConsumerGroupAcl()
                        ],
                        clusterAcls: createEmptyClusterAcl(),
                        sourceEntries: []
                    };
                }}>Create ACLs</Button>

            </div>
        );
    })
}


export default AclList;

function isRowMatch(entry: AclPrincipalGroup, regex: RegExp): boolean {
    if (regex.test(entry.host)) return true;
    if (regex.test(entry.principalName)) return true;

    for (const e of entry.sourceEntries) {
        if (regex.test(e.operation)) return true;
        if (regex.test(e.resourceType)) return true;
        if (regex.test(e.resourceName)) return true;
    }

    return false;
}


const PermissionDenied = <>
    <PageContent key="aclNoPerms">
        <Section>
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
        </Section>
    </PageContent>
</>


