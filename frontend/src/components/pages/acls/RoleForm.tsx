import { Box, Button, Flex, Heading, HStack, Input, isSingleValue, Select, Tag, TagCloseButton, TagLabel, Text } from '@redpanda-data/ui';
import React, { useEffect, useMemo, useState } from 'react';
import { AclPrincipalGroup, ClusterACLs, ConsumerGroupACLs, createEmptyClusterAcl, createEmptyConsumerGroupAcl, createEmptyTopicAcl, createEmptyTransactionalIdAcl, TopicACLs, TransactionalIdACLs, unpackPrincipalGroup } from './Models';
import { Label } from '../../../utils/tsxUtils';
import { observer, useLocalObservable } from 'mobx-react';
import { ResourceACLsEditor } from './PrincipalGroupEditor';
import { api, RolePrincipal, rolesApi } from '../../../state/backendApi';
import { AclStrOperation, AclStrResourceType } from '../../../state/restInterfaces';
import { useHistory } from 'react-router-dom';

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

export const RoleForm = observer(({initialData}: RoleFormProps) => {
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

    const originalUsernames = useMemo(() => initialData?.principals?.map(({name}) => name) ?? [], [])
    const currentUsernames = formState.principals.map(({name}) => name) ?? []

    const editMode: boolean = Boolean(initialData?.roleName)

    return (
        <Box>
            <form onSubmit={async (e) => {
                e.preventDefault()

                const usersToRemove = originalUsernames.filter(item => currentUsernames.indexOf(item) === -1)

                const principalType: AclStrResourceType = 'RedpandaRole'

                if(editMode) {
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
                );

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
                <Flex gap={4} flexDirection="column">
                    <HStack gap={10} alignItems="center">
                        <Label text="Role name">
                            <>
                                <Input
                                    isDisabled={editMode}
                                    isRequired
                                    value={formState.roleName}
                                    onChange={(v) => (formState.roleName = v.target.value)}
                                    width={300}
                                />
                            </>
                        </Label>

                        <Button
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
                    </HStack>

                     Permissions/Host Field
                    <Label text="Host">
                        <>
                            <Input
                                value={formState.host}
                                onChange={(v) => (formState.host = v.target.value)}
                                width={600}
                            />
                        </>
                    </Label>

                    <Heading>Topics</Heading>
                    <Flex flexDirection="column" gap={2}>
                        {formState.topicACLs.map((topicACL, index) => {
                            return (
                                <HStack key={index}>
                                    <Box flexGrow={1}>
                                        <ResourceACLsEditor resourceType="Topic" resource={topicACL} />
                                    </Box>
                                    <Box>
                                        <Button onClick={() => {
                                            formState.topicACLs.splice(index, 1);
                                        }}>
                                            Remove
                                        </Button>
                                    </Box>
                                </HStack>
                            );
                        })}


                        <Box>
                            <Button variant="outline" onClick={() => {
                                formState.topicACLs.push(createEmptyTopicAcl())
                            }}>Add Topic ACL</Button>
                        </Box>
                    </Flex>


                    <Heading>Consumer Groups</Heading>
                    <Flex flexDirection="column" gap={2}>
                        {formState.consumerGroupsACLs.map((acl, index) => {
                            return (
                                <HStack key={index}>
                                    <Box flexGrow={1}>
                                        <ResourceACLsEditor resourceType="Topic" resource={acl} />
                                    </Box>
                                    <Box>
                                        <Button
                                            onClick={() => {
                                            formState.consumerGroupsACLs.splice(index, 1);
                                        }}>
                                            Remove
                                        </Button>
                                    </Box>
                                </HStack>
                            );
                        })}


                        <Box>
                            <Button variant="outline" onClick={() => {
                                formState.consumerGroupsACLs.push(createEmptyConsumerGroupAcl())
                            }}>Add consumer group ACL</Button>
                        </Box>
                    </Flex>

                    <Heading>Transactional IDs</Heading>
                    <Flex flexDirection="column" gap={2}>
                        {formState.transactionalIDACLs.map((acl, index) => {
                            return (
                                <HStack key={index}>
                                    <Box flexGrow={1}>
                                        <ResourceACLsEditor resourceType="Topic" resource={acl} />
                                    </Box>
                                    <Box>
                                        <Button onClick={() => {
                                            formState.transactionalIDACLs.splice(index, 1);
                                        }}>
                                            Remove
                                        </Button>
                                    </Box>
                                </HStack>
                            );
                        })}


                        <Box>
                            <Button variant="outline" onClick={() => {
                                formState.transactionalIDACLs.push(createEmptyTransactionalIdAcl())
                            }}>Add Transactional ID ACL</Button>
                        </Box>
                    </Flex>

                    <Heading>Cluster</Heading>
                    <Flex flexDirection="column" gap={2}>
                        <HStack>
                            <Box flexGrow={1}>
                                <ResourceACLsEditor resourceType="Topic" resource={formState.clusterACLs}/>
                            </Box>
                        </HStack>
                    </Flex>

                    <Heading>Principals</Heading>
                    <Text>Assign this role to principals</Text>
                    <Text>This can be edited later</Text>
                    <PrincipalSelector state={formState.principals} />
                </Flex>

                <Flex gap={4} mt={8}>
                    <Button variant="link" as="a" href={`/security/roles/${initialData?.roleName}/details`}>
                        Cancel
                    </Button>
                    {editMode ?
                        <Button colorScheme="brand" type="submit" loadingText="Editing...">
                            Update
                        </Button>
                        : <Button colorScheme="brand" type="submit" loadingText="Creating...">
                            Create
                        </Button>}
                </Flex>
            </form>
        </Box>
    );
})

const PrincipalSelector = observer((p: {state: RolePrincipal[]}) => {
    const [searchValue, setSearchValue] = useState<string>('');

    useEffect(() => {
        void api.refreshServiceAccounts();
    }, []);

    const state = p.state


    return <Flex direction="column" gap={4}>
        <Box w={200}>
            <Select<string>
                inputValue={searchValue}
                onInputChange={setSearchValue}
                isMulti={false}
                options={api.serviceAccounts?.users.map((u) => ({
                    value: u,
                })) ?? []}
                onChange={(val) => {
                    if(val && isSingleValue(val) && val.value) {
                        state.push({name: val.value, principalType: 'User'});
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
