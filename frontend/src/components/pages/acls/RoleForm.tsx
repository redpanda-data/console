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

import { Box, Button, Flex, FormField, Heading, HStack, Input, isSingleValue, Select, Tag, TagCloseButton, TagLabel } from '@redpanda-data/ui';
import { useEffect, useMemo, useState } from 'react';
import { AclPrincipalGroup, ClusterACLs, ConsumerGroupACLs, createEmptyClusterAcl, createEmptyConsumerGroupAcl, createEmptyTopicAcl, createEmptyTransactionalIdAcl, TopicACLs, TransactionalIdACLs, unpackPrincipalGroup } from './Models';
import { observer, useLocalObservable } from 'mobx-react';
import { ResourceACLsEditor } from './PrincipalGroupEditor';
import { api, RolePrincipal, rolesApi } from '../../../state/backendApi';
import { AclStrOperation, AclStrResourceType } from '../../../state/restInterfaces';
import { useHistory } from 'react-router-dom'
import { appGlobal } from '../../../state/appGlobal';

type CreateRoleFormState = {
    roleName: string;
    allowAllOperations: boolean;
    host: string;
    topicACLs: TopicACLs[];
    consumerGroupsACLs: ConsumerGroupACLs[];
    transactionalIDACLs: TransactionalIdACLs[];
    clusterACLs: ClusterACLs,
    principals: RolePrincipal[]
}

type RoleFormProps = {
    initialData?: Partial<CreateRoleFormState>;
}

export const RoleForm = observer(({ initialData }: RoleFormProps) => {
    const history = useHistory()
    const formState = useLocalObservable<CreateRoleFormState>(() => ({
        roleName: '',
        allowAllOperations: false,
        host: '',
        topicACLs: [createEmptyTopicAcl()],
        consumerGroupsACLs: [createEmptyConsumerGroupAcl()],
        transactionalIDACLs: [createEmptyTransactionalIdAcl()],
        clusterACLs: createEmptyClusterAcl(),
        principals: [],
        ...initialData,
    }))

    if (!formState.clusterACLs)
        formState.clusterACLs = createEmptyClusterAcl();


    const [isFormValid, setIsFormValid] = useState(true);

    const originalUsernames = useMemo(() => initialData?.principals?.map(({ name }) => name) ?? [], [
        initialData?.principals
    ])
    const currentUsernames = formState.principals.map(({ name }) => name) ?? []
    const editMode: boolean = Boolean(initialData?.roleName)

    const roleNameAlreadyExist = rolesApi.roles.includes(formState.roleName) && !editMode;

    return (
        <Box>
            <form onSubmit={async (e) => {
                e.preventDefault()

                const usersToRemove = originalUsernames.filter(item => currentUsernames.indexOf(item) === -1)

                const principalType: AclStrResourceType = 'RedpandaRole'

                if (editMode) {
                    await api.deleteACLs({
                        resourceType: 'Any',
                        resourceName: undefined,
                        principal: `${principalType}:${formState.roleName}`,
                        resourcePatternType: 'Any',
                        operation: 'Any',
                        permissionType: 'Any'
                    })
                }

                const aclPrincipalGroup: AclPrincipalGroup = {
                    principalType: 'RedpandaRole',
                    principalName: formState.roleName,

                    host: formState.host,

                    topicAcls: formState.topicACLs,
                    consumerGroupAcls: formState.consumerGroupsACLs,
                    transactionalIdAcls: formState.transactionalIDACLs,
                    clusterAcls: formState.clusterACLs,
                    sourceEntries: []
                }

                const newRole = await rolesApi.updateRoleMembership(
                    formState.roleName,
                    formState.principals.map(x => x.name), usersToRemove, true
                )

                unpackPrincipalGroup(aclPrincipalGroup).forEach((async x => {
                    await api.createACL({
                        host: x.host,
                        principal: x.principal,
                        resourceType: x.resourceType,
                        resourceName: x.resourceName,
                        resourcePatternType: x.resourcePatternType as unknown as 'Literal' | 'Prefixed',
                        operation: x.operation as unknown as Exclude<AclStrOperation, 'Unknown' | 'Any'>,
                        permissionType: x.permissionType as unknown as 'Allow' | 'Deny'
                    })
                }))

                void history.push(`/security/roles/${newRole.roleName}/details`);
            }}>
                <Flex gap={10} flexDirection="column">
                    <Flex flexDirection="row" gap={20}>
                        <Box>
                            <FormField label="Role name" isInvalid={roleNameAlreadyExist} errorText="Role name already exist">
                                <Input
                                    pattern="[a-zA-Z0-9_\-]+"
                                    isDisabled={editMode}
                                    isRequired
                                    value={formState.roleName}
                                    onChange={(v) => (formState.roleName = v.target.value)}
                                    width={300}
                                />
                            </FormField>
                        </Box>

                        <Button
                            alignSelf="self-end"
                            variant="outline"
                            onClick={() => {
                                if (formState.topicACLs.length == 0) formState.topicACLs.push(createEmptyTopicAcl());
                                formState.topicACLs[0].selector = '*';
                                formState.topicACLs[0].all = 'Allow';

                                if (formState.consumerGroupsACLs.length == 0) formState.consumerGroupsACLs.push(createEmptyConsumerGroupAcl());
                                formState.consumerGroupsACLs[0].selector = '*';
                                formState.consumerGroupsACLs[0].all = 'Allow';

                                if (formState.transactionalIDACLs.length == 0) formState.transactionalIDACLs.push(createEmptyTransactionalIdAcl());
                                formState.transactionalIDACLs[0].selector = '*';
                                formState.transactionalIDACLs[0].all = 'Allow';

                                formState.clusterACLs.all = 'Allow';
                            }}
                        >
                            Allow all operations
                        </Button>
                    </Flex>

                    <FormField label="Host" description="The host the user needs to connect from in order for the permissions to apply.">
                        <Input
                            value={formState.host}
                            onChange={(v) => (formState.host = v.target.value)}
                            width={600}
                        />
                    </FormField>

                    <Flex flexDirection="column" gap={4}>
                        <Heading>Topics</Heading>
                        {formState.topicACLs.map((topicACL, index) =>
                            <ResourceACLsEditor key={index} resourceType="Topic" resource={topicACL} setIsFormValid={setIsFormValid} onDelete={() => {
                                formState.topicACLs.splice(index, 1);
                            }} />
                        )}


                        <Box>
                            <Button variant="outline" onClick={() => {
                                formState.topicACLs.push(createEmptyTopicAcl())
                            }}>Add Topic ACL</Button>
                        </Box>
                    </Flex>


                    <Flex flexDirection="column" gap={4}>
                        <Heading>Consumer Groups</Heading>
                        {formState.consumerGroupsACLs.map((acl, index) =>
                            <ResourceACLsEditor key={index} resourceType="Topic" resource={acl} setIsFormValid={setIsFormValid} onDelete={() => {
                                formState.consumerGroupsACLs.splice(index, 1);
                            }} />
                        )}

                        <Box>
                            <Button variant="outline" onClick={() => {
                                formState.consumerGroupsACLs.push(createEmptyConsumerGroupAcl())
                            }}>Add consumer group ACL</Button>
                        </Box>
                    </Flex>

                    <Flex flexDirection="column" gap={4}>
                        <Heading>Transactional IDs</Heading>
                        {formState.transactionalIDACLs.map((acl, index) =>
                            <ResourceACLsEditor key={index} resourceType="Topic" resource={acl} setIsFormValid={setIsFormValid} onDelete={() => {
                                formState.transactionalIDACLs.splice(index, 1);
                            }} />
                        )}

                        <Box>
                            <Button variant="outline" onClick={() => {
                                formState.transactionalIDACLs.push(createEmptyTransactionalIdAcl())
                            }}>Add Transactional ID ACL</Button>
                        </Box>
                    </Flex>

                    <Flex flexDirection="column" gap={4}>
                        <Heading>Cluster</Heading>
                        <HStack>
                            <Box flexGrow={1}>
                                <ResourceACLsEditor resourceType="Topic" resource={formState.clusterACLs} setIsFormValid={setIsFormValid} />
                            </Box>
                        </HStack>
                    </Flex>

                    <Flex flexDirection="column" gap={4}>
                        <Heading>Principals</Heading>
                        <FormField label="Assign this role to principals" description="This can be edited later">
                            <PrincipalSelector state={formState.principals} />
                        </FormField>
                    </Flex>
                </Flex>

                <Flex gap={4} mt={8}>
                    {editMode ?
                        <Button colorScheme="brand" type="submit" loadingText="Editing..." isDisabled={roleNameAlreadyExist || !isFormValid}>
                            Update
                        </Button>
                        : <Button colorScheme="brand" type="submit" loadingText="Creating..." isDisabled={roleNameAlreadyExist || !isFormValid}>
                            Create
                        </Button>}
                    {editMode ? <Button variant="link" onClick={() => {
                        appGlobal.history.push(`/security/roles/${initialData?.roleName}/details`);
                    }}>
                        Go back
                    </Button> :
                        <Button variant="link" onClick={() => {
                            appGlobal.history.push('/security/roles/');
                        }}>
                            Go back
                        </Button>
                    }
                </Flex>
            </form>
        </Box>
    );
})

const PrincipalSelector = observer((p: { state: RolePrincipal[] }) => {
    const [searchValue, setSearchValue] = useState<string>('');

    useEffect(() => {
        void api.refreshServiceAccounts();
    }, []);

    const state = p.state


    return <Flex direction="column" gap={4}>
        <Box w={200}>
            <Select<string>
                placeholder="Find users"
                inputValue={searchValue}
                onInputChange={setSearchValue}
                isMulti={false}
                options={api.serviceAccounts?.users.map((u) => ({
                    value: u,
                })) ?? []}

                creatable={true}

                onChange={(val) => {
                    if (val && isSingleValue(val) && val.value) {
                        state.push({ name: val.value, principalType: 'User' });
                        setSearchValue('')
                    }
                }}
            />
        </Box>

        <Flex gap={2}>
            {state.map((principal, idx) =>
                <Tag key={idx} cursor="pointer">
                    <TagLabel>{principal.name}</TagLabel>
                    <TagCloseButton onClick={() => state.remove(principal)} />
                </Tag>
            )}
        </Flex>
    </Flex>
})
