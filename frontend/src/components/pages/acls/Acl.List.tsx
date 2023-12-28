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
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { uiSettings } from '../../../state/ui';
import { sortField } from '../../misc/common';
import { AclRequestDefault } from '../../../state/restInterfaces';
import { comparer, computed, makeObservable, observable } from 'mobx';
import { appGlobal } from '../../../state/appGlobal';
import { Code, DefaultSkeleton } from '../../../utils/tsxUtils';
import { clone, toJson } from '../../../utils/jsonUtils';
import { KowlColumnType, KowlTable } from '../../misc/KowlTable';
import { QuestionIcon } from '@primer/octicons-react';
import { TrashIcon } from '@heroicons/react/outline';
import { AclFlat, AclPrincipalGroup, collectClusterAcls, collectConsumerGroupAcls, collectTopicAcls, collectTransactionalIdAcls, createEmptyClusterAcl, createEmptyConsumerGroupAcl, createEmptyTopicAcl, createEmptyTransactionalIdAcl } from './Models';
import { AclPrincipalGroupEditor } from './PrincipalGroupEditor';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { Features } from '../../../state/supportedFeatures';
import { Alert, AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertIcon, Badge, Button, createStandaloneToast, Icon, redpandaToastOptions, SearchField, Tooltip, Text, redpandaTheme, Menu, MenuButton, MenuItem, MenuList, Result } from '@redpanda-data/ui';
import React, { FC, useRef } from 'react';
import { openCreateUserModal } from './CreateServiceAccountModal';

// TODO - once AclList is migrated to FC, we could should move this code to use useToast()
const { ToastContainer, toast } = createStandaloneToast({
    theme: redpandaTheme,
    defaultOptions: {
        ...redpandaToastOptions.defaultOptions,
        isClosable: false,
        duration: 2000
    }
})

@observer
class AclList extends PageComponent {
    columns: KowlColumnType<AclPrincipalGroup>[] = [
        {
            width: 'auto',
            title: 'Principal',
            dataIndex: 'principal',
            sorter: sortField('principalName'),
            render: (_value: string, record: AclPrincipalGroup) => {
                const userExists = api.serviceAccounts?.users.includes(record.principalName);
                const isComplete = api.serviceAccounts?.isComplete === true;
                const showWarning = isComplete && !userExists && !record.principalName.includes('*');
                const principalType = record.principalType == 'User' && record.principalName.endsWith('*')
                    ? 'User Group'
                    : record.principalType;
                return (
                    <div className="hoverLink">
                        <Badge variant="subtle" mr="2">{principalType}</Badge>
                        <span>{record.principalName}</span>
                        {showWarning && (
                            <Tooltip label="User / ServiceAccount does not exist" placement="top" hasArrow>
                                <span style={{ marginLeft: '4px' }}>
                                    <QuestionIcon fill="orange" size={16} />
                                </span>
                            </Tooltip>
                        )}
                    </div>
                );
            },
            defaultSortOrder: 'ascend'
        },
        {
            width: 'auto', title: 'Host', dataIndex: 'host', sorter: sortField('host'),
            render: v => (!v || v == '*') ? <Badge variant="subtle">Any</Badge> : v
        },
        {
            width: '60px',
            title: '',
            render: (_, record) => {
                const userExists = api.serviceAccounts?.users.includes(record.principalName);
                const hasAcls = record.sourceEntries.length > 0;

                const onDelete = async (user: boolean, acls: boolean) => {
                    if (acls) {
                        try {
                            await api.deleteACLs({
                                resourceType: 'Any',
                                resourceName: undefined,
                                resourcePatternType: 'Any',
                                principal: record.principalType + ':' + record.principalName,
                                host: record.host,
                                operation: 'Any',
                                permissionType: 'Any',
                            });
                            toast({
                                status: 'success',
                                description: <Text as="span">Deleted ACLs for <Code>{record.principalName}</Code></Text>
                            });
                        } catch (err: unknown) {
                            console.error('failed to delete acls', { error: err });

                            this.aclFailed = {
                                err,
                            }
                        }
                    }

                    if (user) {
                        try {
                            await api.deleteServiceAccount(record.principalName);
                            toast({
                                status: 'success',
                                description: <Text as="span">Deleted user <Code>{record.principalName}</Code></Text>
                            });
                        } catch (err: unknown) {
                            console.error('failed to delete acls', { error: err });

                            this.aclFailed = {
                                err,
                            }
                        }
                    }

                    await this.refreshData(true);
                }


                return <Menu>
                    <MenuButton as={Button} variant="ghost" className="iconButton deleteButton" style={{ marginLeft: 'auto' }}>
                        <Icon as={TrashIcon} />
                    </MenuButton>
                    <MenuList>
                        <MenuItem
                            isDisabled={!userExists || !Features.deleteUser || !hasAcls}
                            onClick={(e) => {
                                void onDelete(true, true);
                                e.stopPropagation()
                            }}
                        >
                            Delete (User and ACLs)
                        </MenuItem>
                        <MenuItem
                            isDisabled={!userExists || !Features.deleteUser}
                            onClick={(e) => {
                                void onDelete(true, false);
                                e.stopPropagation()
                            }}
                        >
                            Delete (User only)
                        </MenuItem>
                        <MenuItem
                            isDisabled={!hasAcls}
                            onClick={(e) => {
                                void onDelete(false, true);
                                e.stopPropagation()
                            }}
                        >
                            Delete (ACLs only)
                        </MenuItem>
                    </MenuList>
                </Menu>
            }
        },
    ];

    editorType: 'create' | 'edit' = 'create';
    @observable aclFailed: { err: unknown } | null = null;
    @observable edittingPrincipalGroup?: AclPrincipalGroup;

    constructor(p: any) {
        super(p);
        makeObservable(this);
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
        if (!api.serviceAccounts || !api.serviceAccounts.users) return DefaultSkeleton;

        const warning = api.ACLs === null
            ? <Alert status="warning" style={{ marginBottom: '1em' }}>
                <AlertIcon />
                You do not have the necessary permissions to view ACLs
            </Alert>
            : null;

        const noAclAuthorizer = !api.ACLs?.isAuthorizerEnabled
            ? <Alert status="warning" style={{ marginBottom: '1em' }}>
                <AlertIcon />
                There's no authorizer configured in your Kafka cluster
            </Alert>
            : null;

        const groups = this.principalGroups;

        return <>
            <AlertDeleteFailed aclFailed={this.aclFailed} onClose={() => {
                this.aclFailed = null
            }}/>
            <ToastContainer />
            <PageContent>

                {this.edittingPrincipalGroup &&
                    <AclPrincipalGroupEditor
                        // @ts-ignore
                        principalGroup={this.edittingPrincipalGroup}
                        type={this.editorType}
                        onClose={() => {
                            this.edittingPrincipalGroup = undefined;
                            this.refreshData(true);
                        }}
                    />}

                <Section>
                    <this.SearchControls />

                    {warning}
                    {noAclAuthorizer}

                    <KowlTable
                        dataSource={groups}
                        columns={this.columns}

                        observableSettings={uiSettings.aclList.configTable}

                        rowKey={x => x.principalType + ' :: ' + x.principalName + ' :: ' + x.host}

                        onRow={r => ({
                            onClick: e => {
                                // iterate upwards from 'target' (svg or btn) to 'currentTarget' (tr)
                                // if there is a 'deleteButton' class anywhere, don't handle the event
                                let cur = e.target as HTMLElement;
                                while (cur && cur != e.currentTarget && e.currentTarget.contains(cur)) {
                                    if (cur.classList.contains('deleteButton')) {
                                        // clicked on delete btn
                                        return;
                                    }
                                    cur = cur.parentElement!;
                                }

                                if (e.target != e.currentTarget && !e.currentTarget.contains(e.target as HTMLElement)) {
                                    // aborting because target is not inside the row
                                    return;
                                }

                                this.editorType = 'edit';
                                this.edittingPrincipalGroup = clone(r);
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
                transactionalIdAcls: collectTransactionalIdAcls(items),

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
                        transactionalIdAcls: [createEmptyTransactionalIdAcl()],
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
                <SearchField width="300px" searchText={uiSettings.aclList.configTable.quickSearch} setSearchText={x => (uiSettings.aclList.configTable.quickSearch = x)} />

                <span style={{ marginLeft: 'auto' }}> </span>

                <Tooltip isDisabled={Features.createUser} label="The cluster does not support this feature" placement="top" hasArrow>
                    <Button variant="outline"
                            isDisabled={!Features.createUser}
                            onClick={() => openCreateUserModal()}>
                        Create user
                    </Button>
                </Tooltip>

                <Button
                    variant="outline"
                    onClick={() => {
                        this.editorType = 'create';
                        this.edittingPrincipalGroup = {
                            host: '',
                            principalType: 'User',
                            principalName: '',
                            topicAcls: [createEmptyTopicAcl()],
                            consumerGroupAcls: [createEmptyConsumerGroupAcl()],
                            transactionalIdAcls: [createEmptyTransactionalIdAcl()],
                            clusterAcls: createEmptyClusterAcl(),
                            sourceEntries: []
                        };
                    }}
                >
                    Create ACLs
                </Button>
            </div>
        );
    });
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

const AlertDeleteFailed: FC<{ aclFailed: { err: unknown } | null, onClose: () => void }> = ({aclFailed, onClose}) => {
    const ref = useRef(null)
    return (
        <AlertDialog isOpen={aclFailed !== null} onClose={onClose} leastDestructiveRef={ref}>
            <AlertDialogOverlay>
                <AlertDialogContent>
                    <AlertDialogHeader>Delete ACLs failed</AlertDialogHeader>
                    <AlertDialogBody>
                        <div className="codeBox">{aclFailed !== null && toJson(aclFailed.err)}</div>
                    </AlertDialogBody>
                    <AlertDialogFooter>
                        <Button ref={ref} onClick={onClose}>
                            Cancel
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialogOverlay>
        </AlertDialog>
    )
}


const PermissionDenied = <>
    <PageContent key="aclNoPerms">
        <Section>
            <Result
                title="Permission Denied"
                status={403}
                userMessage={<Text>
                    You are not allowed to view this page.
                    <br/>
                    Contact the administrator if you think this is an error.
                </Text>
                }
                extra={<a target="_blank" rel="noopener noreferrer" href="https://docs.redpanda.com/docs/manage/console/">
                    <Button>Redpanda Console documentation</Button>
                </a>}
            />
        </Section>
    </PageContent>
</>


